import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from copy import deepcopy
from pathlib import Path

from .domain import DomainError


STAGES = (
    ("preflight", "检查硬件与磁盘空间", 5),
    ("create_environment", "创建隔离训练环境", 15),
    ("install_torch", "安装硬件加速运行时", 35),
    ("install_act", "安装 ACT / LeRobot", 70),
    ("self_test", "执行设备与 ACT 自检", 90),
    ("publish", "发布训练环境", 100),
)


def _atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _repair_entrypoint(executable, python):
    executable = Path(executable)
    python = Path(python)
    if not executable.is_file() or not python.is_file():
        return False
    try:
        content = executable.read_bytes()
    except OSError:
        return False
    first, separator, remainder = content.partition(b"\n")
    expected = f"#!{python}".encode()
    if not first.startswith(b"#!"):
        return False
    if first != expected:
        temporary = executable.with_name(f".{executable.name}-{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(expected + (b"\n" + remainder if separator else b"\n"))
            shutil.copymode(executable, temporary)
            os.replace(temporary, executable)
        finally:
            temporary.unlink(missing_ok=True)
    try:
        mode = executable.stat().st_mode
        if not mode & stat.S_IXUSR:
            executable.chmod(mode | stat.S_IXUSR)
    except OSError:
        return False
    return True


def detect_backend_candidates(which=shutil.which):
    candidates = []
    if which("nvidia-smi"):
        candidates.append("cuda")
    if which("rocminfo") or which("rocm-smi"):
        candidates.append("rocm")
    if which("xpu-smi"):
        candidates.append("xpu")
    return candidates


def _supported_python_version(version):
    return (3, 10) <= tuple(version[:2]) < (3, 13)


def detect_supported_python(_constraint=None, which=shutil.which, runner=subprocess.run):
    candidates = [sys.executable, *(which(name) for name in ("python3.12", "python3.11", "python3.10", "python3"))]
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        candidate = str(Path(candidate).resolve())
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            result = runner(
                [candidate, "-c", "import json,sys; print(json.dumps(list(sys.version_info[:3])))"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            version = json.loads(result.stdout.strip()) if result.returncode == 0 else []
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
            continue
        if _supported_python_version(version):
            return candidate
    return None


def _runtime_python_version(runtime):
    config = Path(runtime) / "pyvenv.cfg"
    try:
        for line in config.read_text(encoding="utf-8").splitlines():
            if line.lower().startswith("version") and "=" in line:
                values = line.split("=", 1)[1].strip().split(".")
                return tuple(int(value) for value in values[:3])
    except (OSError, ValueError):
        return None
    return None


def recommended_profile(memory_mb=None, backend=None):
    memory = int(memory_mb or 0)
    if memory >= 16_000:
        batch_size, workers = 16, 8
    elif memory >= 10_000:
        batch_size, workers = 8, 6
    elif memory >= 6_000:
        batch_size, workers = 4, 4
    else:
        batch_size, workers = 1, 2
    precision = "bf16" if backend in {"cuda", "xpu"} and memory >= 8_000 else "fp16" if backend in {'cuda', 'rocm', 'xpu'} else "no"
    return {"batch_size": batch_size, "num_workers": workers, "mixed_precision": precision,
            "steps": 100_000, "save_freq": 10_000}


class TrainingEnvironmentManager:
    def __init__(self, data_root, manifest_path=None, runner=None, backend_detector=None, python_detector=None,
                 platform_name=None):
        self.platform = platform_name or sys.platform
        self.data_root = Path(data_root).resolve()
        self.root = self.data_root / "training" / "environment"
        self.root.mkdir(parents=True, exist_ok=True)
        self.runtime = self.root / "runtime"
        self.state_path = self.root / "state.json"
        self.manifest_path = Path(manifest_path or Path(__file__).with_name("training_manifest.json"))
        self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self._runner = runner or subprocess.run
        self._backend_detector = backend_detector or detect_backend_candidates
        self._python_detector = python_detector or detect_supported_python
        self._lock = threading.RLock()
        self._thread = None
        self._cancel = threading.Event()
        if not self.state_path.exists():
            self._save(self._initial_state())

    def _initial_state(self):
        return {"status": "not_prepared", "job_id": None, "stage": None, "stage_label": "尚未准备",
                "progress": 0, "error": None, "backend": None, "fingerprint": None,
                "executable": None, "python": None, "training_profile": recommended_profile(),
                "lerobot_version": self.manifest["lerobot"], "platform": self.platform,
                "training_supported": self.platform != 'win32',
                "updated_at_ms": int(time.time() * 1000)}

    def _python_path(self, root):
        return root / ('Scripts/python.exe' if self.platform == 'win32' else 'bin/python')

    def _load(self):
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DomainError("训练环境状态文件无效", "invalid_training_environment") from error

    def _save(self, state):
        state["updated_at_ms"] = int(time.time() * 1000)
        _atomic_json(self.state_path, state)
        return deepcopy(state)

    def snapshot(self):
        with self._lock:
            state = self._load()
            if self.platform == 'win32' and state.get('runtime_dir'):
                directory = Path(state['runtime_dir']).resolve()
                if directory.parent != self.root:
                    raise DomainError('运行环境目录无效，请重新准备', 'invalid_training_environment')
                self.runtime = directory
            if state.get("status") == "ready":
                executable = self.runtime / "bin" / "lerobot-train"
                python = self._python_path(self.runtime)
                version = _runtime_python_version(self.runtime)
                if version and not _supported_python_version(version):
                    state.update(status="failed", error="训练环境使用了不兼容的 Python；需要 Python 3.10–3.12，请重新准备",
                                 executable=None, python=None)
                    self._save(state)
                elif not python.is_file() or (self.platform != 'win32' and not executable.is_file()):
                    state.update(status="failed", error="训练环境文件缺失，请重新准备", executable=None)
                    self._save(state)
                elif self.platform != 'win32' and not _repair_entrypoint(executable, python):
                    state.update(status="failed", error="训练入口文件无效，请重新准备", executable=None)
                    self._save(state)
                elif self.platform == 'win32' and not Path(state.get('ffmpeg_executable') or '').is_file():
                    state.update(status='failed', error='Windows 相机运行组件缺失，请重新准备', executable=None)
                    self._save(state)
                elif state.get("executable") != (None if self.platform == 'win32' else str(executable)) or state.get("python") != str(python):
                    state.update(executable=None if self.platform == 'win32' else str(executable), python=str(python), error=None)
                    self._save(state)
            state.update(platform=self.platform, training_supported=self.platform != 'win32')
            return deepcopy(state)

    def prepare(self, backend=None):
        with self._lock:
            state = self._load()
            if state["status"] == "preparing" and self._thread and self._thread.is_alive():
                return deepcopy(state)
            candidates = self._backend_detector()
            if self.platform == 'win32':
                candidates = [item for item in candidates if item == 'cuda'] + ['cpu']
            selected = backend or (candidates[0] if candidates else None)
            if selected not in self.manifest["backends"] or (self.platform == 'win32' and selected not in {'cpu', 'cuda'}) or (self.platform != 'win32' and selected == 'cpu'):
                state.update(status="failed", job_id=str(uuid.uuid4()), stage="preflight",
                             stage_label="检查硬件与磁盘空间", progress=0,
                             error="未检测到 ACT 可用的硬件加速后端", backend=None)
                return self._save(state)
            job_id = str(uuid.uuid4())
            state.update(status="preparing", job_id=job_id, stage="preflight", stage_label=STAGES[0][1],
                         progress=0, error=None, backend=selected, fingerprint=None, executable=None)
            self._save(state)
            self._cancel.clear()
            self._thread = threading.Thread(target=self._prepare, args=(job_id, selected),
                                            name=f"training-env-{job_id}", daemon=True)
            self._thread.start()
            return deepcopy(state)

    def retry(self):
        state = self.snapshot()
        if state["status"] not in {"failed", "not_prepared"}:
            raise DomainError("当前训练环境不需要重试", "training_environment_not_retryable")
        return self.prepare(state.get("backend"))

    def job(self, job_id):
        state = self.snapshot()
        if state.get("job_id") != job_id:
            raise DomainError("环境准备任务不存在", "training_environment_job_not_found")
        return state

    def _update(self, job_id, **changes):
        with self._lock:
            state = self._load()
            if state.get("job_id") != job_id:
                return state
            state.update(changes)
            return self._save(state)

    def _run(self, command, timeout=1800):
        result = self._runner(command, capture_output=True, text=True, encoding='utf-8', errors='replace',
                              timeout=timeout, check=False,
                              **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
        if result.returncode != 0:
            combined = (result.stderr or "").strip()
            if result.stdout:
                combined = f"{combined}\n{result.stdout.strip()}".strip()
            lines = [line.strip() for line in combined.splitlines() if line.strip()]
            detail = " | ".join(lines[-12:]) if lines else f"状态码 {result.returncode}"
            raise RuntimeError(f"退出码 {result.returncode}：{detail}"[:1500])
        return result.stdout

    def _prepare(self, job_id, backend):
        staging = self.root / (f'runtime-{job_id}' if self.platform == 'win32' else f'.staging-{job_id}')
        assert staging.resolve().parent == self.root
        stage_label = "preflight"
        try:
            ffmpeg_relative = None
            base_python = self._python_detector(self.manifest.get("python"))
            if not base_python:
                raise RuntimeError("未找到兼容的 Python 3.10–3.12，无法创建 ACT 训练环境")
            free = shutil.disk_usage(self.root).free
            if free < 8_000_000_000:
                raise RuntimeError("磁盘可用空间不足 8 GB")
            shutil.rmtree(staging, ignore_errors=True)
            for stage, label, progress in STAGES:
                stage_label = label
                self._update(job_id, stage=stage, stage_label=label, progress=progress)
                if stage == "create_environment":
                    self._run([base_python, "-m", "venv", str(staging)], timeout=300)
                elif stage == "install_torch":
                    config = self.manifest["backends"][backend]
                    pip = self._python_path(staging)
                    self._run([str(pip), "-m", "pip", "install", "--upgrade", "pip"], timeout=600)
                    self._run([str(pip), "-m", "pip", "install", *config["torch_packages"],
                               "--index-url", config["torch_index"]])
                elif stage == "install_act":
                    pip = self._python_path(staging)
                    self._run([str(pip), "-m", "pip", "install", *self.manifest["packages"]])
                elif stage == "self_test":
                    python = self._python_path(staging)
                    probe_output = staging / ".training-config-self-test"
                    probe = (
                        "import json,torch,lerobot; "
                        "from pathlib import Path; "
                        "from lerobot.configs.default import DatasetConfig; "
                        "from lerobot.configs.train import TrainPipelineConfig; "
                        "from lerobot.policies.act.configuration_act import ACTConfig; "
                        f"b='{backend}'; "
                        "ok=(torch.cuda.is_available() if b in ('cuda','rocm') else "
                        "True if b=='cpu' else hasattr(torch,'xpu') and torch.xpu.is_available()); "
                        "assert ok, '加速设备自检失败'; "
                        "d=('cpu' if b=='cpu' else 'xpu' if b=='xpu' else 'cuda'); "
                        "x=torch.ones(1,device=d); assert float(x.sum().cpu())==1.0; "
                        f"o=Path({str(probe_output)!r}); assert not o.exists(); "
                        "cfg=TrainPipelineConfig(dataset=DatasetConfig(repo_id='local/self-test',root='.'),"
                        "policy=ACTConfig(device=d,push_to_hub=False),output_dir=o,steps=1,save_freq=1); "
                        "cfg.validate(); assert cfg.policy.push_to_hub is False; assert cfg.policy.device==d; "
                        "print(json.dumps({'torch':torch.__version__,'lerobot':lerobot.__version__,'backend':b}))"
                    )
                    if self.platform == 'win32':
                        probe += (
                            "; from lerobot.policies.act.modeling_act import ACTPolicy; "
                            "from lerobot.processor import PolicyProcessorPipeline; "
                            "import imageio_ffmpeg, subprocess; "
                            "f=imageio_ffmpeg.get_ffmpeg_exe(); "
                            "r=subprocess.run([f,'-hide_banner','-devices'],capture_output=True,text=True,creationflags=0x08000000); "
                            "assert r.returncode==0 and 'dshow' in r.stdout+r.stderr, 'Windows 相机后端不可用'; "
                            "print(json.dumps({'ffmpeg_executable':f}))"
                        )
                    output = self._run([str(python), "-c", probe], timeout=120)
                    if self.platform == 'win32':
                        metadata = next(json.loads(line) for line in reversed(output.splitlines()) if line.startswith('{') and 'ffmpeg_executable' in line)
                        ffmpeg_relative = Path(metadata['ffmpeg_executable']).resolve().relative_to(staging.resolve())
                elif stage == "publish":
                    if self.platform == 'win32':
                        # Windows launchers/DLLs retain absolute paths and may stay locked.
                        # Publish metadata atomically; never relocate an installed venv.
                        self.runtime = staging
                    else:
                        old = self.root / ".runtime-old"
                        shutil.rmtree(old, ignore_errors=True)
                        if self.runtime.exists():
                            os.replace(self.runtime, old)
                        os.replace(staging, self.runtime)
                        shutil.rmtree(old, ignore_errors=True)
            payload = self.manifest_path.read_bytes() + backend.encode()
            fingerprint = hashlib.sha256(payload).hexdigest()
            executable = self.runtime / "bin" / "lerobot-train"
            python = self._python_path(self.runtime)
            if self.platform != 'win32' and not _repair_entrypoint(executable, python):
                raise RuntimeError("训练入口文件无效")
            self._update(job_id, status="ready", progress=100, error=None, fingerprint=fingerprint,
                         executable=None if self.platform == 'win32' else str(executable), python=str(python),
                         ffmpeg_executable=str(self.runtime / ffmpeg_relative) if ffmpeg_relative else None,
                         runtime_dir=str(self.runtime) if self.platform == 'win32' else None,
                         training_profile=recommended_profile(None, backend))
        except Exception as error:
            text = str(error)
            hint = ""
            if "ensurepip" in text or "python3-venv" in text or "python3.10-venv" in text:
                hint = ("（运行组件安装不完整：请从网页重新下载安装 Ubuntu 运行组件，"
                        "然后在训练页面点击重试）")
            shutil.rmtree(staging, ignore_errors=True)
            self._update(job_id, status="failed",
                         error=f"训练环境准备失败（{stage_label}）：{error}{hint}")

    def close(self):
        self._cancel.set()
        thread = self._thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=5)

    def wait(self, timeout=5):
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=timeout)
        return self.snapshot()
