import io
import json
import os
import re
import shutil
import signal
import subprocess
import time
import uuid
import zipfile
from copy import deepcopy
from pathlib import Path
from threading import RLock, Thread

from .domain import DomainError


DEFAULT_STEPS = 100_000
DEFAULT_SAVE_FREQ = 10_000
STAR_ARM_102_FL_JOINT_LIMITS = [
    [-130.0, 130.0], [-90.0, 90.0], [-90.0, 90.0], [-90.0, 90.0],
    [-130.0, 130.0], [-130.0, 130.0], [0.0, 90.0],
]
REQUIRED_EXECUTION_FILES = (
    "config.json", "model.safetensors", "policy_preprocessor.json", "policy_postprocessor.json",
)


class TrainingJobManager:
    def __init__(self, data_root, launcher=None):
        training_root = Path(data_root).resolve() / "training"
        self.training_root = training_root
        self.root = training_root / "jobs"
        self.models_root = training_root / "models"
        self.root.mkdir(parents=True, exist_ok=True)
        self.models_root.mkdir(parents=True, exist_ok=True)
        self._launch = launcher or subprocess.Popen
        self._lock = RLock()
        self._processes = {}
        self._preparations = set()
        self._closing = False

    def _job_dir(self, job_id):
        return self.root / str(job_id)

    def _path(self, job_id):
        return self._job_dir(job_id) / "job.json"

    def _load(self, job_id):
        path = self._path(job_id)
        if not path.is_file():
            raise DomainError("训练任务不存在", "training_job_not_found")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DomainError("训练任务状态文件无效", "invalid_training_job") from error

    def _save(self, job):
        path = self._path(job["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(job, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        return deepcopy(job)

    def list(self):
        with self._lock:
            jobs = []
            for path in sorted(self.root.glob("*/job.json")):
                jobs.append(self.get(path.parent.name))
            return jobs

    @staticmethod
    def _validate_parameters(parameters, defaults):
        result = {
            "batch_size": int(parameters.get("batch_size", defaults.get("batch_size", 1))),
            "steps": int(parameters.get("steps", DEFAULT_STEPS)),
            "save_freq": int(parameters.get("save_freq", DEFAULT_SAVE_FREQ)),
            "num_workers": int(parameters.get("num_workers", defaults.get("num_workers", 1))),
            "mixed_precision": str(parameters.get("mixed_precision", defaults.get("mixed_precision", "no"))),
        }
        if not 1 <= result["batch_size"] <= 256 or not 1 <= result["steps"] <= 10_000_000:
            raise DomainError("训练 batch size 或 steps 超出允许范围", "invalid_training_parameters")
        if not 1 <= result["save_freq"] <= result["steps"] or not 0 <= result["num_workers"] <= 64:
            raise DomainError("训练保存频率或 worker 数量无效", "invalid_training_parameters")
        if result["mixed_precision"] not in {"no", "fp16", "bf16"}:
            raise DomainError("混合精度配置无效", "invalid_training_parameters")
        return result

    @staticmethod
    def _command(job, executable, resume_checkpoint=None, python=None):
        parameters = job["parameters"]
        prefix = [python, executable] if python else [executable]
        if resume_checkpoint:
            config_path = Path(resume_checkpoint) / "pretrained_model" / "train_config.json"
            return [*prefix, f"--config_path={config_path}", "--resume=true",
                    f"--output_dir={job['output_dir']}"]
        device = "xpu" if job.get("backend") == "xpu" else "cuda"
        return [*prefix,
            "--policy.type=act",
            "--policy.push_to_hub=false",
            f"--policy.device={device}",
            f"--dataset.repo_id={job['dataset_id']}",
            f"--dataset.root={job['dataset_path']}",
            f"--output_dir={job['output_dir']}",
            f"--batch_size={parameters['batch_size']}",
            f"--steps={parameters['steps']}",
            f"--save_freq={parameters['save_freq']}",
            f"--num_workers={parameters['num_workers']}",
            "--wandb.enable=false",
        ]

    def _start_process(self, job, executable, resume_checkpoint=None, python=None):
        log_path = self._job_dir(job["id"]) / "train.log"
        log_handle = log_path.open("ab", buffering=0)
        executable_path = Path(executable)
        if not executable_path.is_absolute():
            executable = str(self.training_root / "environment" / "runtime" / "bin" / "lerobot-train")
        if python:
            python_path = Path(python)
            if not python_path.is_absolute():
                python = str(self.training_root / "environment" / "runtime" / "bin" / "python")
        command = self._command(job, executable, resume_checkpoint, python)
        try:
            process = self._launch(command, cwd=self._job_dir(job["id"]), stdout=log_handle,
                                   stderr=subprocess.STDOUT, shell=False, start_new_session=True)
        except Exception:
            log_handle.close()
            raise
        self._processes[job["id"]] = {"process": process, "log": log_handle}
        job.update(status="running", pid=process.pid, command=command, error=None,
                   started_at_ms=int(time.time() * 1000), stopped_at_ms=None)
        return self._save(job)

    def submit(self, environment, dataset_id, parameters, prepare, request_id=None):
        """Persist an observable job before slow dataset hashing/conversion."""
        if environment.get('training_supported') is False:
            raise DomainError('Windows 用于模型执行，请在 Ubuntu 训练', 'training_platform_unsupported')
        if environment.get('status') != 'ready' or not environment.get('executable'):
            raise DomainError('训练环境尚未就绪', 'training_environment_not_ready')
        if not isinstance(dataset_id, str) or not dataset_id:
            raise DomainError('请选择训练数据集', 'invalid_training_parameters')
        if request_id is not None and (not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{8,128}', request_id)):
            raise DomainError('训练请求编号无效', 'invalid_training_parameters')
        parameters = self._validate_parameters(parameters, environment.get('training_profile', {}))
        with self._lock:
            jobs = self.list()
            if request_id:
                existing = next((job for job in jobs if job.get('request_id') == request_id), None)
                if existing:
                    if existing['dataset_id'] != dataset_id or existing['parameters'] != parameters:
                        raise DomainError('同一请求编号不能用于不同训练参数', 'training_request_conflict')
                    return existing
            if self._closing or any(job['status'] in {'preparing', 'running', 'stopping'} for job in jobs):
                raise DomainError('已有训练任务正在准备或运行，请先查看当前任务', 'training_job_active')
            job_id = str(uuid.uuid4())
            job = {'id': job_id, 'request_id': request_id, 'dataset_id': dataset_id,
                   'parameters': parameters, 'environment_fingerprint': environment.get('fingerprint'),
                   'backend': environment.get('backend'), 'status': 'preparing', 'preparation': True,
                   'stage': '正在校验完整性并转换训练数据，完成后自动启动训练器',
                   'output_dir': str(self._job_dir(job_id) / 'output'), 'checkpoint': None,
                   'step': 0, 'loss': None, 'error': None, 'created_at_ms': int(time.time() * 1000)}
            self._preparations.add(job_id)
            try:
                snapshot = self._save(job)
                Thread(target=self._prepare_and_start, args=(job_id, deepcopy(environment), prepare), daemon=True).start()
                return snapshot
            except Exception:
                self._preparations.discard(job_id)
                job.update(status='failed', error='数据准备任务未能启动，请重新提交')
                self._save(job)
                raise

    def _prepare_and_start(self, job_id, environment, prepare):
        try:
            with self._lock:
                job = self._load(job_id)
                if self._closing or job['status'] != 'preparing':
                    job.update(status='stopped', stage='已取消启动训练', stopped_at_ms=int(time.time() * 1000))
                    self._save(job)
                    return
                dataset_id = job['dataset_id']
            dataset = prepare(dataset_id, environment)
            with self._lock:
                job = self._load(job_id)
                if self._closing or job['status'] != 'preparing':
                    job.update(status='stopped', stage='已取消启动训练', stopped_at_ms=int(time.time() * 1000))
                    self._save(job)
                    return
                self.create(environment, dataset, job['parameters'], _job_id=job_id)
        except Exception as error:
            with self._lock:
                job = self._load(job_id)
                cancelled = self._closing or job['status'] in {'stopping', 'stopped'}
                job.update(status='stopped' if cancelled else 'failed',
                           error=None if cancelled else f'数据准备或训练启动失败：{str(error)[:500]}',
                           stage='已取消启动训练' if cancelled else '数据准备或训练启动失败',
                           stopped_at_ms=int(time.time() * 1000))
                self._save(job)
        finally:
            with self._lock:
                self._preparations.discard(job_id)

    def create(self, environment, dataset, parameters, _job_id=None):
        if environment.get('training_supported') is False:
            raise DomainError('Windows 用于模型执行，请在 Ubuntu 训练', 'training_platform_unsupported')
        with self._lock:
            if environment.get("status") != "ready" or not environment.get("executable"):
                raise DomainError("训练环境尚未就绪", "training_environment_not_ready")
            if self._closing or any(item['id'] != _job_id and item["status"] in {"preparing", "running", "stopping"} for item in self.list()):
                raise DomainError("已有训练任务正在运行", "training_job_active")
            job_id = _job_id or str(uuid.uuid4())
            submitted = self._load(job_id) if _job_id else {}
            output_dir = self._job_dir(job_id) / "output"
            dataset_path = str(Path(dataset["path"]).resolve())
            job = {
                "id": job_id,
                "request_id": submitted.get('request_id'),
                "dataset_id": dataset["dataset_id"],
                "dataset_path": dataset_path,
                "dataset_fingerprint": dataset["fingerprint"],
                "tasks": list(dataset.get("tasks") or []),
                "camera_contract": deepcopy(dataset.get("camera_contract") or {}),
                "observation_features": list(dataset.get("observation_features") or []),
                "environment_fingerprint": environment["fingerprint"],
                "backend": environment.get("backend"),
                "status": "created",
                "parameters": self._validate_parameters(parameters, environment.get("training_profile", {})),
                "output_dir": str(output_dir),
                "checkpoint": None,
                "step": 0,
                "loss": None,
                "error": None,
                "created_at_ms": submitted.get('created_at_ms', int(time.time() * 1000)),
            }
            self._save(job)
            try:
                return self._start_process(job, environment["executable"], python=environment.get("python"))
            except Exception as error:
                detail = str(error).strip()[:300]
                message = f"{type(error).__name__}：{detail}" if detail else type(error).__name__
                job.update(status="failed", error=f"训练进程启动失败：{message}")
                self._save(job)
                raise DomainError(job["error"], "training_start_failed") from error

    @staticmethod
    def _find_checkpoint(job):
        checkpoints = Path(job["output_dir"]) / "checkpoints"
        candidates = [] if not checkpoints.is_dir() else [
            path for path in checkpoints.iterdir()
            if path.is_dir() and (path / "pretrained_model").is_dir()
        ]
        return str(sorted(candidates)[-1]) if candidates else None

    def _read_metrics(self, job):
        log_path = self._job_dir(job["id"]) / "train.log"
        content = ""
        if log_path.is_file():
            try:
                with log_path.open('rb') as handle:
                    handle.seek(max(0, log_path.stat().st_size - 1_000_000))
                    content = handle.read(1_000_000).decode('utf-8', errors='ignore')
            except OSError:
                content = ""
        content = re.sub(r"\x1b\[[0-9;]*m", "", content)
        matches = re.findall(
            r"\bsteps?:(\d+)\b[^\r\n]*?\bloss:([+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?)",
            content,
        )
        metrics = [{"step": int(step), "loss": float(loss)} for step, loss in matches[-120:]]
        training_lines = re.findall(r"^.*\bTraining:.*$", content, flags=re.MULTILINE)
        progress_matches = []
        speed_matches = []
        for line in training_lines:
            progress = re.findall(r"(\d+)\s*/\s*(\d+)", line)
            if progress:
                progress_matches.append(progress[-1])
            speeds = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*(it/s|s/it)", line)
            if speeds:
                value = float(speeds[-1][0])
                speed_matches.append(value if speeds[-1][1] == "it/s" else (1.0 / value if value else 0.0))
        metric_step = metrics[-1]["step"] if metrics else 0
        progress_step = int(progress_matches[-1][0]) if progress_matches else 0
        observed_step = max(int(job.get("step", 0)), metric_step, progress_step)
        changes = {"step": observed_step}
        if metrics:
            changes["loss"] = metrics[-1]["loss"]
        if speed_matches:
            changes["step_rate"] = round(speed_matches[-1], 4)
        job.update(**changes)
        target_steps = max(1, int(job.get("parameters", {}).get("steps", DEFAULT_STEPS)))
        started = job.get("started_at_ms") or (job.get('created_at_ms') if job.get('preparation') else None)
        end = job.get("stopped_at_ms") or int(time.time() * 1000)
        elapsed_ms = max(0, end - started) if started else 0
        checkpoints = []
        checkpoints_root = Path(job["output_dir"]) / "checkpoints"
        if checkpoints_root.is_dir():
            for path in sorted(checkpoints_root.iterdir()):
                if not path.is_dir() or not (path / "pretrained_model").is_dir():
                    continue
                match = re.search(r"(\d+)$", path.name)
                checkpoints.append({
                    "name": path.name,
                    "step": int(match.group(1)) if match else None,
                    "path": str(path),
                    "updated_at_ms": int(path.stat().st_mtime * 1000),
                })
        job.update(
            progress_percent=round(min(100.0, max(0.0, job.get("step", 0) * 100 / target_steps)), 1),
            elapsed_ms=elapsed_ms,
            metrics=metrics,
            log_tail="\n".join(content.splitlines()[-80:]),
            checkpoints=checkpoints[-20:],
        )
        return job

    def _refresh(self, job):
        job = self._read_metrics(job)
        if job.get('preparation') and job['status'] in {'preparing', 'stopping'} and job['id'] not in self._preparations:
            job.update(status='interrupted', error='服务退出后数据准备已中断，请重新开始训练；已有数据和模型已保留')
            return self._save(job)
        active = self._processes.get(job["id"])
        if job["status"] == "running" and not active:
            job.update(status="interrupted", checkpoint=self._find_checkpoint(job),
                       error="服务重启后未找到原训练进程，请从最近 checkpoint 恢复")
            return self._save(job)
        if job["status"] != "running":
            if job["status"] == "completed" and job.get("checkpoint"):
                model_path = self.models_root / str(job.get("model_id") or "") / "model.json"
                if not model_path.is_file():
                    try:
                        model = self._register_completed(job)
                        job.update(model_id=model["id"], registration_error=None)
                    except DomainError as error:
                        job.update(model_id=None, registration_error=str(error))
                    return self._save(job)
            return job
        returncode = active["process"].poll()
        if returncode is None:
            return job
        active["log"].close()
        del self._processes[job["id"]]
        checkpoint = self._find_checkpoint(job)
        if returncode == 0 and checkpoint:
            job.update(status="completed", checkpoint=checkpoint, error=None)
        elif returncode == 0:
            job.update(status="failed", error="训练进程已退出，但没有生成有效 checkpoint")
        elif job.get("status") != "stopped":
            job.update(status="failed", error=f"训练进程退出，状态码 {returncode}")
        job.update(returncode=returncode, stopped_at_ms=int(time.time() * 1000))
        self._save(job)
        if job["status"] == "completed":
            try:
                model = self._register_completed(job)
                job.update(model_id=model["id"], registration_error=None)
            except DomainError as error:
                job.update(model_id=None, registration_error=str(error))
        return self._save(job)

    def get(self, job_id):
        with self._lock:
            return deepcopy(self._refresh(self._load(job_id)))

    def stop(self, job_id):
        with self._lock:
            job = self._load(job_id)
            active = self._processes.get(job_id)
            if job_id in self._preparations and job['status'] in {'preparing', 'stopping'}:
                job.update(status='stopping', stage='已请求取消；当前数据转换结束后不会启动训练器')
                return self._save(job)
            if not active:
                raise DomainError("训练任务未在运行", "training_job_not_running")
            process = active["process"]
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=30)
            except (subprocess.TimeoutExpired, TimeoutError):
                process.terminate()
                process.wait(timeout=10)
            active["log"].close()
            del self._processes[job_id]
            job.update(status="stopped", returncode=process.poll(), checkpoint=self._find_checkpoint(job),
                       stopped_at_ms=int(time.time() * 1000), pid=None)
            return self._save(job)

    def resume(self, job_id, environment, dataset):
        if environment.get('training_supported') is False:
            raise DomainError('请在 Ubuntu 恢复训练', 'training_platform_unsupported')
        with self._lock:
            job = self._load(job_id)
            if job["status"] not in {"stopped", "failed", "interrupted"}:
                raise DomainError("训练任务当前不能恢复", "training_job_not_resumable")
            if environment.get("fingerprint") != job["environment_fingerprint"]:
                raise DomainError("训练环境已变化，不能恢复该任务", "training_environment_changed")
            if dataset.get("fingerprint") != job["dataset_fingerprint"]:
                raise DomainError("训练数据已变化，不能恢复该任务", "training_dataset_changed")
            checkpoint = job.get("checkpoint") or self._find_checkpoint(job)
            if not checkpoint:
                raise DomainError("训练任务没有可恢复的 checkpoint", "training_checkpoint_missing")
            return self._start_process(job, environment["executable"], checkpoint, environment.get("python"))

    def list_models(self, dataset_id=None):
        models = []
        for path in sorted(self.models_root.glob("*/model.json")):
            try:
                model = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            model = self._execution_metadata(model, path.parent)
            if dataset_id is None or model.get("dataset_id") == dataset_id:
                models.append(model)
        return models

    @staticmethod
    def _execution_metadata(model, model_root):
        model = deepcopy(model)
        pretrained = Path(model_root) / "pretrained_model"
        missing = [name for name in REQUIRED_EXECUTION_FILES if not (pretrained / name).is_file()]
        blockers = list(model.get("blockers") or [])
        if missing:
            blockers.append("checkpoint 缺少 " + "、".join(missing))
        if not model.get("tasks"):
            blockers.append("模型缺少支持任务列表")
        if not model.get("camera_contract"):
            blockers.append("模型缺少双相机训练契约")
        camera_map = model.get("camera_feature_map") or {"wrist": "wrist", "world": "world"}
        if model.get("observation_features") != [
            "observation.state", "observation.images." + camera_map["wrist"], "observation.images." + camera_map["world"],
        ]:
            blockers.append("模型 Observation Schema 与 ACT 双相机执行链不一致")
        if not model.get("joint_limits"):
            blockers.append("模型缺少 J1-J7 安全限位")
        if model.get("coordinate_contract") == "starai_0_0_4_calibrated":
            from .release_adapter import validate_calibration
            try:
                validate_calibration(json.loads((Path(model_root) / "calibration.json").read_text(encoding="utf-8")))
            except (OSError, ValueError, DomainError):
                blockers.append("请导入本台从臂的 LeRobot 校准 JSON（模型使用归一化坐标，不能直接当作角度）")
        elif model.get("coordinate_contract") not in (None, "degrees"):
            blockers.append("不支持此模型的关节坐标格式")
        model.update(
            checkpoint_path=str(pretrained.resolve()), blockers=blockers,
            execution_ready=not blockers,
        )
        return model

    def _register_completed(self, job):
            checkpoint = Path(job["checkpoint"])
            pretrained = checkpoint / "pretrained_model"
            if not pretrained.is_dir():
                raise DomainError("训练 checkpoint 无效", "training_checkpoint_missing")
            missing = [name for name in REQUIRED_EXECUTION_FILES if not (pretrained / name).is_file()]
            if missing:
                raise DomainError(
                    "训练 checkpoint 缺少实机推理文件：" + "、".join(missing),
                    "training_checkpoint_incomplete",
                )
            model_id = f"{job['dataset_id']}-{job['id'][:8]}"
            target = self.models_root / model_id
            temporary = self.models_root / f".{model_id}-{uuid.uuid4().hex}.tmp"
            shutil.copytree(checkpoint, temporary)
            model = {
                "id": model_id,
                "dataset_id": job["dataset_id"],
                "job_id": job["id"],
                "path": str(target),
                "checkpoint": checkpoint.name,
                "step": job.get("step", 0),
                "loss": job.get("loss"),
                "tasks": list(job.get("tasks") or []),
                "camera_contract": deepcopy(job.get("camera_contract") or {}),
                "observation_features": list(job.get("observation_features") or []),
                "action_feature": "action",
                "joint_limits": deepcopy(STAR_ARM_102_FL_JOINT_LIMITS),
                "joint_limits_contract": "star-arm-102-fl-v0.1.0",
                "registered_at_ms": int(time.time() * 1000),
            }
            (temporary / "model.json").write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
            if target.exists():
                shutil.rmtree(temporary, ignore_errors=True)
                return json.loads((target / "model.json").read_text(encoding="utf-8"))
            os.replace(temporary, target)
            return self._execution_metadata(model, target)

    def register(self, job_id):
        with self._lock:
            job = self._refresh(self._load(job_id))
            if job["status"] != "completed" or not job.get("checkpoint"):
                raise DomainError("只有已完成且含 checkpoint 的训练任务才能注册模型", "training_model_not_ready")
            model = self._register_completed(job)
            if job.get("model_id") != model["id"] or job.get("registration_error"):
                job.update(model_id=model["id"], registration_error=None)
                self._save(job)
            return model

    def model_root(self, model_id):
        root = self.models_root / model_id
        if not root.is_dir() or not (root / "model.json").is_file():
            raise DomainError("模型不存在", "model_not_found")
        return root

    def export_model(self, model_id):
        """Zip a registered model so it can be moved to another machine."""
        model_root = self.model_root(model_id)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(model_root.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(model_root).as_posix())
        return buffer.getvalue(), model_root.name

    def import_model(self, archive):
        from .model_import import import_model_package
        return import_model_package(self, archive)

    def close(self):
        with self._lock:
            self._closing = True
            for job_id in list(self._preparations):
                if self._load(job_id)['status'] in {'preparing', 'stopping'}:
                    self.stop(job_id)
            running = list(self._processes)
        for job_id in running:
            try:
                self.stop(job_id)
            except DomainError:
                pass
