import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
from threading import RLock
from contextlib import nullcontext
from .follower_calibration import FollowerCalibration
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .capabilities import detect_capabilities
from .domain import ActWorkspace, DomainError
from .episode_data import EpisodeDataStore
from .inference_runtime import ActInferenceRuntime
from .native_cameras import NativeCameraError, V4L2CameraManager
from .windows_cameras import WindowsCameraManager
from .browser_exports import BrowserExportManager
from .devices import DeviceRegistry
from .serial_connections import SerialConnectionManager
from .store import JsonStore
from .telemetry import TelemetryHub
from .teleop_runtime import EpisodeTeleopRuntime
from .training_environment import TrainingEnvironmentManager
from .training_dataset import TrainingDatasetAdapter
from .training_jobs import TrainingJobManager

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_FILE = PROJECT_ROOT / "config.json"


def _config_data_dir():
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        value = data.get("data_dir")
        return str(value) if value else ""
    except (OSError, json.JSONDecodeError):
        return ""


def write_config_data_dir(path):
    data = {}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    data["data_dir"] = str(path)
    CONFIG_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_data_dir(cli_value=None):
    """Data root resolution order: --data arg > env ACT_DATA_DIR > config.json > 'data'."""
    if cli_value:
        return str(cli_value)
    env_value = os.environ.get("ACT_DATA_DIR")
    if env_value:
        return env_value
    config_value = _config_data_dir()
    if config_value:
        return config_value
    return "data"


class ApiServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, handler, data_root, static_root, native_cameras=None,
                 training_environment=None, training_jobs=None, training_dataset=None, inference=None,
                 data_dir_explicit=False):
        super().__init__(address, handler)
        self.control_lock = RLock()
        self._data_dir_explicit = bool(data_dir_explicit)
        self._inject = dict(native_cameras=native_cameras, training_environment=training_environment,
                            training_jobs=training_jobs, training_dataset=training_dataset, inference=inference)
        self.static_root = static_root.resolve()
        self._bind_data_managers(data_root)

    def _bind_data_managers(self, data_root):
        self.data_root = Path(data_root).resolve()
        self.data_root.mkdir(parents=True, exist_ok=True)
        self.workspace = ActWorkspace(JsonStore(self.data_root))
        self.episode_data = EpisodeDataStore(self.data_root)
        self.devices = DeviceRegistry(JsonStore(self.data_root / "device-registry"))
        self.serial_connections = SerialConnectionManager(self.data_root / "serial-connections")
        self.calibration = FollowerCalibration(self.data_root, self.serial_connections)
        self.telemetry = TelemetryHub()
        self.teleop = EpisodeTeleopRuntime(self.serial_connections, self.telemetry,
                                           sample_sink=self.episode_data.append_sample)
        self.training_environment = self._inject.get("training_environment") or TrainingEnvironmentManager(self.data_root)
        self.native_cameras = self._inject.get("native_cameras") or (
            WindowsCameraManager(lambda: self.training_environment.snapshot().get('ffmpeg_executable'))
            if os.name == 'nt' else V4L2CameraManager())
        self.training_jobs = self._inject.get("training_jobs") or TrainingJobManager(self.data_root)
        self.browser_exports = BrowserExportManager(self.data_root,self.training_jobs,self.training_environment)
        self.training_dataset = self._inject.get("training_dataset") or TrainingDatasetAdapter(self.data_root, self.episode_data)
        self.inference = self._inject.get("inference") or ActInferenceRuntime(
            self.serial_connections, self.native_cameras, self.telemetry, self.data_root
        )

    def data_dir_explicit(self):
        return bool(self._data_dir_explicit or _config_data_dir() or os.environ.get("ACT_DATA_DIR"))

    def set_data_dir(self, new_root):
        new_root = str(Path(new_root).expanduser().resolve())
        if self.inference.snapshot().get("status") in {"loading", "running", "stopping"}:
            raise DomainError("推理正在运行，不能切换数据目录", "data_dir_busy")
        if self.calibration.active():
            raise DomainError("校准正在记录，不能切换数据目录", "calibration_active")
        if self.teleop.snapshot().get("episode_id"):
            raise DomainError("正在采集，不能切换数据目录", "data_dir_busy")
        if any(item.get("status") in {"preparing", "running", "stopping"} for item in self.training_jobs.list()):
            raise DomainError("训练正在运行，不能切换数据目录", "data_dir_busy")
        if self.browser_exports.active():
            raise DomainError("网页模型正在导出，不能切换数据目录", "data_dir_busy")
        self.native_cameras.stop_recording()
        self.teleop.stop()
        self.serial_connections.close_all()
        write_config_data_dir(new_root)
        self._bind_data_managers(new_root)
        self._data_dir_explicit = True
        return {"data_dir": str(self.data_root)}

    def server_close(self):
        # HTTPServer calls this even if binding fails before our managers exist.
        try:
            for name, method in (("inference", "close"), ("native_cameras", "close"),
                                 ("teleop", "stop"), ("episode_data", "close"),
                                 ("serial_connections", "close_all"),
                                 ("training_environment", "close"), ("training_jobs", "close")):
                manager = getattr(self, name, None)
                if manager is not None:
                    getattr(manager, method)()
        finally:
            super().server_close()


class Handler(SimpleHTTPRequestHandler):
    server_version = "StarArmACT/0.1.0"

    def handle_one_request(self):
        try:
            return super().handle_one_request()
        except ConnectionError:
            # Windows browsers may abort a keep-alive socket while changing pages.
            self.close_connection = True

    def log_message(self, format, *args):
        return

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self, limit=1_000_000):
        length = int(self.headers.get("Content-Length", "0"))
        if length > limit:
            raise DomainError("请求内容过大", "payload_too_large")
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise DomainError("JSON 请求无效", "invalid_json")

    def _raw_body(self, limit):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise DomainError("请求内容大小无效", "invalid_request") from error
        if length <= 0 or length > limit:
            raise DomainError("请求内容大小无效", "payload_too_large")
        data = self.rfile.read(length)
        if len(data) != length:
            raise DomainError("上传内容不完整，请重新选择文件上传", "invalid_request")
        return data

    def _binary(self, status, body, content_type, filename=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, error):
        conflicts = {"dataset_exists", "devices_busy", "episode_active", "duplicate_serial_role",
                     "duplicate_camera_role", "stale_device_binding"}
        missing = {"dataset_not_found", "episode_not_found", "model_not_found"}
        status = 409 if error.code in conflicts else 404 if error.code in missing else 400
        self._json(status, {"error": {"code": error.code, "message": str(error)}})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/v1/health":
                return self._json(200, {"service": "star-arm-102-act", "version": "0.1.0", "status": "ok"})
            if path == "/api/v1/capabilities":
                return self._json(200, detect_capabilities(self.server.training_environment))
            if path == "/api/v1/training/environment":
                return self._json(200, self.server.training_environment.snapshot())
            match = re.fullmatch(r"/api/v1/training/environment/prepare/([^/]+)", path)
            if match:
                return self._json(200, self.server.training_environment.job(match.group(1)))
            if path == "/api/v1/training/jobs":
                return self._json(200, {"items": self.server.training_jobs.list()})
            if path == "/api/v1/models":
                dataset_id = parse_qs(parsed.query).get("dataset_id", [None])[0]
                return self._json(200, {"items": self.server.training_jobs.list_models(dataset_id)})
            match = re.fullmatch(r"/api/v1/browser-exports/([^/]+)(/download)?", path)
            if match:
                if match.group(2):
                    return self._binary(200,self.server.browser_exports.download(match.group(1)),"application/zip","Star-Arm-102-ACT-BROWSER-MODEL.zip")
                return self._json(200,self.server.browser_exports.snapshot(match.group(1)))
            match = re.fullmatch(r"/api/v1/models/([^/]+)/export", path)
            if match:
                archive, model_name = self.server.training_jobs.export_model(match.group(1))
                return self._binary(200, archive, "application/zip", f"{model_name}.zip")
            if path == "/api/v1/follower-calibration":
                return self._json(200, self.server.calibration.snapshot())
            if path == "/api/v1/follower-calibration/export":
                calibration, _ = self.server.calibration.saved_calibration()
                return self._binary(200, json.dumps(calibration, indent=2).encode(), "application/json", "stararm102_follower_calibration.json")
            if path == "/api/v1/inference":
                return self._json(200, self.server.inference.snapshot())
            match = re.fullmatch(r"/api/v1/training/jobs/([^/]+)", path)
            if match:
                return self._json(200, self.server.training_jobs.get(match.group(1)))
            if path == "/api/v1/datasets":
                return self._json(200, {"items": self.server.workspace.snapshot()["datasets"]})
            match = re.fullmatch(r"/api/v1/datasets/([^/]+)/stats", path)
            if match:
                return self._json(200, self.server.episode_data.dataset_stats(match.group(1)))
            match = re.fullmatch(r"/api/v1/datasets/([^/]+)/export", path)
            if match:
                dataset_id = match.group(1)
                dataset = next((item for item in self.server.workspace.snapshot()["datasets"] if item["id"] == dataset_id), None)
                if not dataset:
                    raise DomainError("数据集不存在", "dataset_not_found")
                archive = self.server.episode_data.export_dataset(dataset_id)
                return self._binary(200, archive, "application/zip", f"{dataset['slug']}.zip")
            match = re.fullmatch(r"/api/v1/episodes/([^/]+)/integrity", path)
            if match:
                return self._json(200, self.server.episode_data.integrity(match.group(1)))
            if path == "/api/v1/state":
                state = self.server.workspace.snapshot()
                state["device_binding"] = self.server.devices.snapshot()
                state["data_dir"] = str(self.server.data_root)
                state["data_dir_explicit"] = self.server.data_dir_explicit()
                return self._json(200, state)
            if path == "/api/v1/telemetry":
                snapshot = self.server.telemetry.snapshot()
                snapshot["runtime"] = self.server.teleop.snapshot()
                snapshot["history"] = []
                return self._json(200, snapshot)
            if path == "/api/v1/telemetry/stream":
                return self._telemetry_stream()
            if path == "/api/v1/devices":
                return self._json(200, {
                    "binding": self.server.devices.snapshot(),
                    "serial_connections": self.server.serial_connections.snapshot(),
                })
            if path == "/api/v1/cameras/native":
                return self._json(200, {
                    "available": self.server.native_cameras.available(),
                    "devices": self.server.native_cameras.devices(),
                })
            if path == "/api/v1/cameras/native/status":
                return self._json(200, self.server.native_cameras.snapshot())
            match = re.fullmatch(r"/api/v1/cameras/native/(wrist|world)/frame", path)
            if match:
                latest = self.server.native_cameras.latest_frame(match.group(1))
                if not latest:
                    raise DomainError("原生摄像头尚无有效画面", "camera_frame_unavailable")
                return self._binary(200, latest[1], "image/jpeg")
            if path.startswith("/api/"):
                return self._json(404, {"error": {"code": "not_found", "message": "API 路由不存在"}})
            return self._static(path)
        except DomainError as error:
            self._error(error)

    def do_POST(self):
        path = urlparse(self.path).path
        serialized = (path.startswith("/api/v1/follower-calibration/") or path.startswith("/api/v1/devices/serial/")
                      or path in {"/api/v1/inference/start", "/api/v1/episodes", "/api/v1/follower/drive-test", "/api/v1/settings/data-dir", "/api/v1/emergency-stop"})
        with self.server.control_lock if serialized else nullcontext():
            self._do_POST()

    def _do_POST(self):
        path = urlparse(self.path).path
        try:
            if self.server.calibration.active() and path in {"/api/v1/inference/start", "/api/v1/episodes", "/api/v1/follower/drive-test", "/api/v1/devices/serial/connect"}:
                raise DomainError("从臂校准正在记录，请先保存或取消校准", "calibration_active")
            if path.startswith("/api/v1/follower-calibration/"):
                body = self._body()
                calibration = self.server.calibration
                operation = path.rsplit("/", 1)[-1]
                if operation == "start":
                    if self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"} or self.server.teleop.snapshot().get("episode_id"):
                        raise DomainError("请先停止推理和数据采集，再校准", "hardware_busy")
                    return self._json(200, calibration.start(body.get("operator_confirmed") is True))
                if operation == "sample":
                    return self._json(200, calibration.sample())
                if operation == "finish":
                    return self._json(200, calibration.finish(body.get("range_confirmed") is True))
                if operation == "cancel":
                    return self._json(200, calibration.cancel())
                if operation == "pause":
                    return self._json(200, calibration.pause())
                if operation == "resume":
                    if self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"} or self.server.teleop.snapshot().get("episode_id"):
                        raise DomainError("请先停止推理和数据采集，再继续校准", "hardware_busy")
                    return self._json(200, calibration.resume(body.get("operator_confirmed") is True, body.get("same_arm_confirmed") is True))
                if operation == "reconnect":
                    state = calibration.snapshot()
                    if state["status"] not in {"recording", "paused"} or body.get("operator_confirmed") is not True or body.get("same_arm_confirmed") is not True:
                        raise DomainError("请确认已扶稳且使用同一台从臂", "calibration_confirmation_required")
                    if self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"} or self.server.teleop.snapshot().get("episode_id"):
                        raise DomainError("请先停止推理和数据采集", "hardware_busy")
                    caps = detect_capabilities()
                    self.server.serial_connections.connect("follower", state["port"], caps["serial_ports"])
                    return self._json(200, calibration.resume(True, True))
                if operation == "apply":
                    if calibration.active() or self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"}:
                        raise DomainError("请先停止校准和推理", "hardware_busy")
                    data, port = calibration.saved_calibration()
                    if not body.get("same_arm_confirmed") or calibration._port() != port:
                        raise DomainError("请连接校准时的同一台从臂并确认", "calibration_device_changed")
                    from .release_adapter import install_calibration
                    return self._json(200, install_calibration(self.server.training_jobs, body.get("model_id"), data))
                raise DomainError("校准操作不存在", "not_found")
            if path == "/api/v1/datasets/import":
                archive = self._raw_body(2_000_000_000)
                state = self.server.workspace.snapshot()
                imported = self.server.episode_data.import_dataset(archive, {item["slug"] for item in state["datasets"]})
                try:
                    self.server.workspace.register_import(imported["dataset"], imported["episodes"])
                except Exception:
                    shutil.rmtree(self.server.episode_data._dataset_dir(imported["dataset"]["id"]), ignore_errors=True)
                    raise
                return self._json(201, imported)
            if path == "/api/v1/models/import":
                archive = self._raw_body(2_000_000_000)
                model = self.server.training_jobs.import_model(archive)
                return self._json(201, model)
            calibration_match = re.fullmatch(r"/api/v1/models/([^/]+)/calibration", path)
            if calibration_match:
                runtime = self.server.inference.snapshot()
                if runtime.get("status") in {"loading", "running", "stopping"}:
                    raise DomainError("请先停止推理，再导入校准文件", "inference_active")
                from .release_adapter import install_calibration
                model = install_calibration(self.server.training_jobs, calibration_match.group(1), self._body(1_000_000))
                return self._json(200, model)
            if path == "/api/v1/settings/data-dir":
                data_dir = (self._body(1_000_000) or {}).get("data_dir")
                if not data_dir or not isinstance(data_dir, str) or not data_dir.strip():
                    raise DomainError("请填写数据存储目录", "invalid_request")
                return self._json(200, self.server.set_data_dir(data_dir.strip()))
            camera_match = re.fullmatch(r"/api/v1/episodes/([^/]+)/camera-frames", path)
            body = self._body(50_000_000 if camera_match else 1_000_000)
            ws = self.server.workspace
            if path == "/api/v1/training/environment/prepare":
                if self.server.inference.snapshot().get('status') in {'loading', 'running', 'stopping'}:
                    raise DomainError('请先停止推理，再重新配置运行环境', 'environment_in_use')
                return self._json(202, self.server.training_environment.prepare(body.get("backend")))
            if path == "/api/v1/training/environment/retry":
                if self.server.inference.snapshot().get('status') in {'loading', 'running', 'stopping'}:
                    raise DomainError('请先停止推理，再重新配置运行环境', 'environment_in_use')
                return self._json(202, self.server.training_environment.retry())
            if path == "/api/v1/training/jobs":
                environment = self.server.training_environment.snapshot()
                if environment.get('training_supported') is False:
                    raise DomainError('Windows 当前用于模型执行；请在 Ubuntu 训练后导入完整模型包', 'training_platform_unsupported')
                return self._json(202, self.server.training_jobs.submit(
                    environment, body.get('dataset_id'), body.get('parameters') or {},
                    self.server.training_dataset.prepare, request_id=body.get('request_id')))
            match = re.fullmatch(r"/api/v1/training/jobs/([^/]+)/stop", path)
            if match:
                return self._json(200, self.server.training_jobs.stop(match.group(1)))
            match = re.fullmatch(r"/api/v1/training/jobs/([^/]+)/resume", path)
            if match:
                environment = self.server.training_environment.snapshot()
                if environment.get('training_supported') is False:
                    raise DomainError('请在 Ubuntu 恢复训练；Windows 用于已训练模型执行', 'training_platform_unsupported')
                job = self.server.training_jobs.get(match.group(1))
                dataset = self.server.training_dataset.prepare(job["dataset_id"], environment)
                return self._json(202, self.server.training_jobs.resume(match.group(1), environment, dataset))
            match = re.fullmatch(r"/api/v1/models/([^/]+)/browser-export", path)
            if match:
                if self.server.inference.snapshot().get("status") in {"loading","running","stopping"}:
                    raise DomainError("请先停止实机推理，再导出网页模型", "inference_active")
                return self._json(202,self.server.browser_exports.start(match.group(1)))
            match = re.fullmatch(r"/api/v1/training/jobs/([^/]+)/register", path)
            if match:
                return self._json(201, self.server.training_jobs.register(match.group(1)))
            if path == "/api/v1/datasets":
                result = ws.create_dataset(body.get("task_name"), body.get("slug"),
                                           int(body.get("width", 0)), int(body.get("height", 0)),
                                           int(body.get("fps", 0)))
                self.server.episode_data.create_dataset(result)
                return self._json(201, result)
            if path == "/api/v1/devices/bind":
                return self._json(200, self.server.devices.bind(body, detect_capabilities()))
            if path == "/api/v1/devices/serial/connect":
                caps = detect_capabilities()
                return self._json(200, self.server.serial_connections.connect(
                    body.get("role"), body.get("port"), caps["serial_ports"], body.get("leader_type")
                ))
            if path == "/api/v1/devices/serial/disconnect":
                if body.get("role") == "follower":
                    self.server.calibration.cancel()
                    self.server.inference.stop("follower_disconnect")
                self._stop_active_episode()
                return self._json(200, self.server.serial_connections.disconnect(body.get("role")))
            if path == "/api/v1/cameras/native/connect":
                return self._json(200, self.server.native_cameras.connect(
                    body.get("wrist_camera_id"), body.get("world_camera_id"),
                    {"width": int(body.get("width", 0)), "height": int(body.get("height", 0)),
                     "fps": int(body.get("fps", 0))},
                ))
            if path == "/api/v1/cameras/native/disconnect":
                self.server.inference.stop("camera_disconnect")
                self.server.native_cameras.close()
                return self._json(200, self.server.native_cameras.snapshot())
            if path == "/api/v1/episodes":
                if self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"}:
                    raise DomainError("实机推理运行时不能开始 Episode", "inference_active")
                episode = ws.start_episode(body.get("dataset_id"))
                dataset = next(item for item in ws.snapshot()["datasets"] if item["id"] == episode["dataset_id"])
                try:
                    self.server.episode_data.start_episode(dataset, episode)
                    if self.server.native_cameras.snapshot().get("status") == "streaming":
                        self.server.native_cameras.start_recording(
                            episode["id"], dataset["capture"]["fps"],
                            self.server.episode_data.append_camera_frames,
                        )
                    episode["runtime"] = self.server.teleop.start(episode["id"])
                except Exception:
                    self.server.native_cameras.stop_recording()
                    self.server.episode_data.abort_episode(episode["id"])
                    ws.abort_episode_start(episode["id"])
                    raise
                return self._json(201, episode)
            if camera_match:
                frames = []
                for frame in body.get("frames", []):
                    try:
                        jpeg = base64.b64decode(frame.get("jpeg_base64", ""), validate=True)
                    except (ValueError, TypeError) as error:
                        raise DomainError("相机 JPEG 编码无效", "invalid_jpeg") from error
                    frames.append({**frame, "jpeg": jpeg})
                return self._json(200, self.server.episode_data.append_camera_frames(camera_match.group(1), body.get("role"), frames))
            match = re.fullmatch(r"/api/v1/episodes/([^/]+)/stop", path)
            if match:
                self.server.native_cameras.stop_recording()
                runtime = self.server.teleop.snapshot()
                if runtime["episode_id"] != match.group(1):
                    raise DomainError("该 Episode 的控制循环未运行", "episode_runtime_missing")
                stopped = self.server.teleop.stop()
                persisted = self.server.episode_data.finalize_episode(match.group(1), "review",
                                                                       body.get("mismatch_rate", 0),
                                                                       runtime_error=stopped["error"])
                result = ws.stop_episode(match.group(1), persisted["samples"], body.get("mismatch_rate", 0))
                result["runtime_error"] = stopped["error"]
                result["camera_frames"] = persisted["camera_frames"]
                result["integrity"] = persisted["integrity"]
                return self._json(200, result)
            match = re.fullmatch(r"/api/v1/episodes/([^/]+)/review", path)
            if match:
                integrity = self.server.episode_data.integrity(match.group(1))
                result = ws.review_episode(match.group(1), body.get("decision"), integrity_ok=integrity["ok"])
                if result["status"] == "discarded":
                    self.server.episode_data.delete_episode(match.group(1))
                else:
                    self.server.episode_data.update_episode_status(match.group(1), result["status"])
                result["integrity"] = integrity
                return self._json(200, result)
            if path == "/api/v1/training/check":
                caps = detect_capabilities(self.server.training_environment)
                reasons = ws.training_blockers(
                    body.get("dataset_id"), caps["training_ready"], caps.get("training_blockers")
                )
                if reasons:
                    return self._json(409, {"error": {"code": "training_blocked",
                                                      "message": "训练条件未满足", "details": reasons}})
                return self._json(200, {"ready": True})
            if path in {"/api/v1/inference/validate", "/api/v1/inference/start"}:
                if path.endswith("/start") and not body.get("operator_confirmed"):
                    raise DomainError("启动真实 FL 前必须确认已扶稳机械臂", "operator_confirmation_required")
                model = self._inference_model(body.get("model_id"))
                task = str(body.get("task") or "")
                environment = self.server.training_environment.snapshot()
                if path.endswith("/validate"):
                    return self._json(200, self.server.inference.validate(model, task, environment))
                if self.server.teleop.snapshot().get("episode_id"):
                    raise DomainError("Episode 采集运行时不能启动实机推理", "episode_active")
                return self._json(200, self.server.inference.start(model, task, environment))
            if path == "/api/v1/follower/drive-test":
                if self.server.inference.snapshot().get("status") in {"loading", "running", "stopping"}:
                    raise DomainError("实机推理正在运行，请先停止再测试驱动", "inference_active")
                try:
                    offset = float(body.get("offset_deg", 5))
                except (TypeError, ValueError) as error:
                    raise DomainError("offset_deg 必须是数值", "invalid_request") from error
                try:
                    power = 0 if body.get("power") is None else int(body.get("power"))
                except (TypeError, ValueError) as error:
                    raise DomainError("power 必须是整数", "invalid_request") from error
                try:
                    interval_ms = 300 if body.get("interval_ms") is None else int(body.get("interval_ms"))
                except (TypeError, ValueError) as error:
                    raise DomainError("interval_ms 必须是整数", "invalid_request") from error
                try:
                    t_acc = 50 if body.get("t_acc") is None else int(body.get("t_acc"))
                except (TypeError, ValueError) as error:
                    raise DomainError("t_acc 必须是整数", "invalid_request") from error
                try:
                    t_dec = 50 if body.get("t_dec") is None else int(body.get("t_dec"))
                except (TypeError, ValueError) as error:
                    raise DomainError("t_dec 必须是整数", "invalid_request") from error
                lock_before = bool(body.get("lock_before", False))
                result = self.server.serial_connections.follower_drive_test(
                    offset, power=power, interval_ms=interval_ms,
                    lock_before=lock_before, t_acc=t_acc, t_dec=t_dec)
                return self._json(200, result)
            if path in {"/api/v1/inference/stop", "/api/v1/inference/revoke"}:
                return self._json(200, self.server.inference.stop(body.get("reason", "operator")))
            if path == "/api/v1/emergency-stop":
                reason = body.get("reason", "emergency_stop")
                self.server.calibration.cancel()
                self.server.inference.emergency_stop(reason)
                self._stop_active_episode()
                return self._json(200, ws.revoke_inference(reason))
            return self._json(404, {"error": {"code": "not_found", "message": "API 路由不存在"}})
        except (DomainError, NativeCameraError, TypeError, ValueError) as error:
            if not isinstance(error, DomainError):
                error = DomainError(str(error) if isinstance(error, NativeCameraError) else "请求字段无效",
                                    "native_camera_error" if isinstance(error, NativeCameraError) else "invalid_request")
            self._error(error)

    def _stop_active_episode(self):
        self.server.native_cameras.stop_recording()
        runtime = self.server.teleop.snapshot()
        episode_id = runtime.get("episode_id")
        if not episode_id:
            return None
        stopped = self.server.teleop.stop()
        persisted = self.server.episode_data.finalize_episode(
            episode_id, "review", 0, runtime_error=stopped["error"]
        )
        try:
            result = self.server.workspace.stop_episode(episode_id, persisted["samples"], 0)
            result["camera_frames"] = persisted["camera_frames"]
            result["integrity"] = persisted["integrity"]
            return result
        except DomainError as error:
            if error.code != "invalid_episode_state":
                raise
            return None

    def _inference_model(self, model_id):
        model = next(
            (item for item in self.server.training_jobs.list_models() if item.get("id") == model_id),
            None,
        )
        if not model:
            raise DomainError("本机模型不存在", "model_not_found")
        return model

    def _telemetry_stream(self):
        subscription = self.server.telemetry.subscribe()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        try:
            self.end_headers()
            self.wfile.write(b'event: status\ndata: {"state": "waiting"}\n\n')
            self.wfile.flush()
            while True:
                sample = subscription.next(timeout=0.25)
                if sample is None:
                    self.wfile.write(b": keepalive\n\n")
                else:
                    payload = json.dumps(sample, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                    self.wfile.write(b"event: sample\ndata: " + payload + b"\n\n")
                self.wfile.flush()
        except (ConnectionError, TimeoutError):
            return
        finally:
            subscription.close()

    def _static(self, request_path):
        relative = "index.html" if request_path in ("", "/") else request_path.lstrip("/")
        target = (self.server.static_root / relative).resolve()
        if self.server.static_root not in target.parents and target != self.server.static_root:
            return self._json(403, {"error": {"code": "forbidden", "message": "禁止访问"}})
        if not target.is_file():
            self.send_error(404)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def create_server(address, data_root, static_root, native_cameras=None,
                  training_environment=None, training_jobs=None, training_dataset=None, inference=None,
                  data_dir_explicit=False):
    return ApiServer(address, Handler, Path(data_root), Path(static_root), native_cameras=native_cameras,
                     training_environment=training_environment, training_jobs=training_jobs,
                     training_dataset=training_dataset, inference=inference,
                     data_dir_explicit=data_dir_explicit)


def main():
    parser = argparse.ArgumentParser(description="Star Arm 102 ACT local service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--data", default=None)
    parser.add_argument("--static", default="Browser_SDK")
    args = parser.parse_args()
    data_dir = resolve_data_dir(args.data)
    explicit = bool(args.data or os.environ.get("ACT_DATA_DIR") or _config_data_dir())
    data_root = Path(data_dir).resolve()
    server = create_server((args.host, args.port), data_root, Path(args.static),
                           data_dir_explicit=explicit)
    print(f"Star Arm 102 ACT v0.1.0: http://{args.host}:{server.server_port}/", flush=True)
    print(f"Data directory: {data_root}", flush=True)
    if not explicit:
        print("Hint: 数据目录尚未配置，首次打开页面时会引导设置数据存储位置。", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
