import json
import base64
import os
import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from ai_service.app import create_server, resolve_data_dir


class DataDirResolutionTests(unittest.TestCase):
    def test_resolve_order_prefers_arg_then_env_then_config_then_default(self):
        config_dir = Path(tempfile.mkdtemp())
        config = config_dir / "config.json"
        config.write_text(json.dumps({"data_dir": "/from/config"}), encoding="utf-8")
        try:
            with patch("ai_service.app.CONFIG_FILE", config), \
                 patch.dict("os.environ", {}, clear=False):
                os.environ.pop("ACT_DATA_DIR", None)
                self.assertEqual(resolve_data_dir("/explicit"), "/explicit")
                self.assertEqual(resolve_data_dir(None), "/from/config")
            with patch("ai_service.app.CONFIG_FILE", config), \
                 patch.dict("os.environ", {"ACT_DATA_DIR": "/from/env"}):
                self.assertEqual(resolve_data_dir(None), "/from/env")
            with patch("ai_service.app.CONFIG_FILE", config), \
                 patch.dict("os.environ", {}, clear=True):
                self.assertEqual(resolve_data_dir(None), "/from/config")
        finally:
            shutil.rmtree(config_dir, ignore_errors=True)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = create_server(("127.0.0.1", 0), Path(self.tmp.name), Path("Browser_SDK"))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = Request(self.base + path, data=data, method=method,
                      headers={"Content-Type": "application/json"})
        try:
            with urlopen(req, timeout=2) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def request_raw(self, method, path, body=b"", content_type="application/octet-stream"):
        req = Request(self.base + path, data=body, method=method, headers={"Content-Type": content_type})
        try:
            with urlopen(req, timeout=2) as response:
                return response.status, response.headers, response.read()
        except HTTPError as error:
            return error.code, error.headers, error.read()

    def test_set_data_dir_updates_state_and_marks_explicit(self):
        config = Path(tempfile.mkdtemp()) / "config.json"
        with patch("ai_service.app.CONFIG_FILE", config):
            _, state = self.request("GET", "/api/v1/state")
            self.assertFalse(state["data_dir_explicit"])
            new_dir = str(Path(self.tmp.name) / "customer-data")
            status, body = self.request("POST", "/api/v1/settings/data-dir", {"data_dir": new_dir})
            self.assertEqual(status, 200)
            expected = str(Path(new_dir).resolve())
            self.assertEqual(body["data_dir"], expected)
            _, state = self.request("GET", "/api/v1/state")
            self.assertEqual(state["data_dir"], expected)
            self.assertTrue(state["data_dir_explicit"])

    def test_health_and_capabilities_report_real_environment(self):
        status, health = self.request("GET", "/api/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["service"], "star-arm-102-act")
        status, caps = self.request("GET", "/api/v1/capabilities")
        self.assertEqual(status, 200)
        self.assertIn("gpu", caps)
        self.assertIn("training_ready", caps)
        self.assertIn("training_blockers", caps)
        if not caps["gpu"]["available"]:
            self.assertFalse(caps["training_ready"])
            self.assertTrue(caps["training_blocker"])

    def test_training_check_returns_specific_runtime_blockers(self):
        _, dataset = self.request("POST", "/api/v1/datasets", {
            "task_name": "训练诊断", "slug": "training-diagnostics",
            "width": 640, "height": 480, "fps": 30,
        })
        caps = {
            "training_ready": False,
            "training_blockers": ["当前 Python 环境未安装 PyTorch"],
        }
        with patch("ai_service.app.detect_capabilities", return_value=caps):
            status, error = self.request("POST", "/api/v1/training/check", {"dataset_id": dataset["id"]})

        self.assertEqual(status, 409)
        self.assertIn("当前 Python 环境未安装 PyTorch", error["error"]["details"])
        self.assertNotIn("本机 NVIDIA GPU 或 ACT 运行依赖不可用", error["error"]["details"])

    def test_training_environment_api_supports_one_click_prepare_and_status(self):
        class Environment:
            def __init__(self):
                self.state = {"status": "not_prepared", "job_id": None, "error": None,
                              "training_profile": {"batch_size": 4}}

            def snapshot(self):
                return dict(self.state)

            def prepare(self, backend=None):
                if self.state["status"] != "preparing":
                    self.state.update(status="preparing", job_id="prepare-1", backend=backend,
                                      stage="install_torch", progress=35)
                return dict(self.state)

            def job(self, job_id):
                if job_id != self.state["job_id"]:
                    raise ValueError("missing")
                return dict(self.state)

            def retry(self):
                return self.prepare()

            def close(self):
                return None

        environment = Environment()
        original = self.server.training_environment
        self.server.training_environment = environment
        self.addCleanup(setattr, self.server, "training_environment", original)
        status, initial = self.request("GET", "/api/v1/training/environment")
        self.assertEqual(status, 200)
        self.assertEqual(initial["status"], "not_prepared")
        status, started = self.request("POST", "/api/v1/training/environment/prepare", {})
        self.assertEqual(status, 202)
        self.assertEqual(started["job_id"], "prepare-1")
        _, duplicate = self.request("POST", "/api/v1/training/environment/prepare", {})
        self.assertEqual(duplicate["job_id"], "prepare-1")
        status, progress = self.request("GET", "/api/v1/training/environment/prepare/prepare-1")
        self.assertEqual(status, 200)
        self.assertEqual(progress["progress"], 35)

    def test_training_model_registration_and_listing_are_exposed_over_http(self):
        class Jobs:
            def register(self, job_id):
                return {"id": "model-1", "job_id": job_id, "dataset_id": "dataset-1"}

            def list_models(self, dataset_id=None):
                items = [{"id": "model-1", "job_id": "job-1", "dataset_id": "dataset-1"}]
                return [item for item in items if dataset_id is None or item["dataset_id"] == dataset_id]

            def close(self):
                return None

        jobs = Jobs()
        original = self.server.training_jobs
        self.server.training_jobs = jobs
        self.addCleanup(setattr, self.server, "training_jobs", original)

        status, registered = self.request("POST", "/api/v1/training/jobs/job-1/register", {})
        self.assertEqual(status, 201)
        self.assertEqual(registered["id"], "model-1")
        status, listed = self.request("GET", "/api/v1/models?dataset_id=dataset-1")
        self.assertEqual(status, 200)
        self.assertEqual(listed["items"][0]["job_id"], "job-1")

    def test_dataset_persists_and_duplicate_returns_stable_error(self):
        body = {"task_name": "抓取积木", "slug": "block-v1", "width": 640, "height": 360, "fps": 30}
        status, created = self.request("POST", "/api/v1/datasets", body)
        self.assertEqual(status, 201)
        status, listed = self.request("GET", "/api/v1/datasets")
        self.assertEqual(listed["items"][0]["id"], created["id"])
        status, error = self.request("POST", "/api/v1/datasets", body)
        self.assertEqual(status, 409)
        self.assertEqual(error["error"]["code"], "dataset_exists")

    def test_dataset_api_accepts_640_by_480_at_30_fps(self):
        body = {
            "task_name": "双相机采集",
            "slug": "capture-640x480",
            "width": 640,
            "height": 480,
            "fps": 30,
        }
        status, created = self.request("POST", "/api/v1/datasets", body)
        self.assertEqual(status, 201)
        self.assertEqual(created["capture"], {"width": 640, "height": 480, "fps": 30})

    def test_episode_lifecycle_and_training_gate(self):
        _, dataset = self.request("POST", "/api/v1/datasets", {
            "task_name": "放置", "slug": "place-v1", "width": 640, "height": 360, "fps": 30
        })

        class Runtime:
            def __init__(self):
                self.episode_id = None

            def start(self, episode_id):
                self.episode_id = episode_id
                return {"status": "running", "episode_id": episode_id, "samples": 0, "error": None}

            def snapshot(self):
                return {"status": "running", "episode_id": self.episode_id, "samples": 12, "error": None}

            def stop(self):
                result = {"status": "idle", "episode_id": self.episode_id, "samples": 12, "error": None}
                self.episode_id = None
                return result

        original = self.server.teleop
        self.server.teleop = Runtime()
        self.addCleanup(setattr, self.server, "teleop", original)
        status, episode = self.request("POST", "/api/v1/episodes", {"dataset_id": dataset["id"]})
        self.assertEqual(status, 201)
        self.assertEqual(episode["runtime"]["status"], "running")
        for index in range(12):
            self.server.episode_data.append_sample({
                "episode_id": episode["id"], "timestamp_ms": 1000 + index, "interval_ms": None if index == 0 else 1,
                "action": [0] * 7, "observation_state": [0] * 7,
                "action_offset_ms": 0, "state_offset_ms": 0,
            })
        status, stopped = self.request("POST", f"/api/v1/episodes/{episode['id']}/stop",
                                       {"valid_frames": 30, "mismatch_rate": 0.0})
        self.assertEqual(status, 200)
        self.assertEqual(stopped["status"], "review")
        self.assertEqual(stopped["valid_frames"], 12)
        status, gate = self.request("POST", "/api/v1/training/check", {"dataset_id": dataset["id"]})
        self.assertEqual(status, 409)
        self.assertIn("待审核", " ".join(gate["error"]["details"]))

    def test_episode_start_failure_rolls_back_recording_metadata(self):
        _, dataset = self.request("POST", "/api/v1/datasets", {
            "task_name": "启动失败", "slug": "failed-start", "width": 640, "height": 360, "fps": 30
        })
        status, error = self.request("POST", "/api/v1/episodes", {"dataset_id": dataset["id"]})
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "serial_roles_not_connected")
        self.assertFalse(any(item["status"] == "recording" for item in self.server.workspace.snapshot()["episodes"]))

    def test_emergency_stop_revokes_inference_independently(self):
        class Inference:
            def __init__(self):
                self.reasons = []

            def emergency_stop(self, reason):
                self.reasons.append(reason)
                return {"status": "stopped", "stop_reason": f"emergency:{reason}"}

            def close(self):
                return None

        inference = Inference()
        original = self.server.inference
        self.server.inference = inference
        self.addCleanup(setattr, self.server, "inference", original)
        status, result = self.request("POST", "/api/v1/emergency-stop", {"reason": "operator"})
        self.assertEqual(status, 200)
        self.assertTrue(result["stopped"])
        self.assertEqual(result["reason"], "operator")
        self.assertEqual(inference.reasons, ["operator"])

    def test_inference_routes_validate_start_snapshot_and_stop_real_runtime(self):
        model = {"id": "model-1", "dataset_id": "dataset-1", "tasks": ["抓取积木"]}

        class Jobs:
            def list_models(self, dataset_id=None):
                return [model] if dataset_id in (None, "dataset-1") else []

            def close(self):
                return None

        class Environment:
            def snapshot(self):
                return {"status": "ready", "python": "/runtime/python", "backend": "cuda"}

            def close(self):
                return None

        class Inference:
            def __init__(self):
                self.calls = []

            def snapshot(self):
                return {"status": "idle", "metrics": {"executed_actions": 0}}

            def validate(self, selected, task, environment):
                self.calls.append(("validate", selected["id"], task, environment["backend"]))
                return {"ready": True, "blockers": [], "model_id": selected["id"], "task": task}

            def start(self, selected, task, environment):
                self.calls.append(("start", selected["id"], task, environment["backend"]))
                return {"status": "running", "model_id": selected["id"], "task": task}

            def stop(self, reason):
                self.calls.append(("stop", reason))
                return {"status": "stopped", "stop_reason": reason}

            def close(self):
                return None

        inference = Inference()
        originals = (self.server.training_jobs, self.server.training_environment, self.server.inference)
        self.server.training_jobs = Jobs()
        self.server.training_environment = Environment()
        self.server.inference = inference
        self.addCleanup(setattr, self.server, "training_jobs", originals[0])
        self.addCleanup(setattr, self.server, "training_environment", originals[1])
        self.addCleanup(setattr, self.server, "inference", originals[2])

        status, snapshot = self.request("GET", "/api/v1/inference")
        self.assertEqual(status, 200)
        self.assertEqual(snapshot["status"], "idle")
        status, gate = self.request("POST", "/api/v1/inference/validate", {
            "model_id": "model-1", "task": "抓取积木",
        })
        self.assertEqual(status, 200)
        self.assertTrue(gate["ready"])
        status, started = self.request("POST", "/api/v1/inference/start", {
            "model_id": "model-1", "task": "抓取积木", "operator_confirmed": True,
        })
        self.assertEqual(status, 200)
        self.assertEqual(started["status"], "running")
        status, stopped = self.request("POST", "/api/v1/inference/stop", {"reason": "operator"})
        self.assertEqual(status, 200)
        self.assertEqual(stopped["status"], "stopped")
        self.assertEqual([call[0] for call in inference.calls], ["validate", "start", "stop"])

    def test_inference_start_requires_explicit_operator_confirmation(self):
        status, error = self.request("POST", "/api/v1/inference/start", {
            "model_id": "missing", "task": "task", "operator_confirmed": False,
        })
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "operator_confirmation_required")

    def test_emergency_stop_finalizes_active_episode_data_for_review(self):
        _, dataset = self.request("POST", "/api/v1/datasets", {
            "task_name": "急停保留", "slug": "emergency-data", "width": 640, "height": 360, "fps": 30
        })
        episode = self.server.workspace.start_episode(dataset["id"])
        self.server.episode_data.start_episode(dataset, episode)
        self.server.episode_data.append_sample({
            "episode_id": episode["id"], "timestamp_ms": 1000, "interval_ms": None,
            "action": [0] * 7, "observation_state": [0] * 7,
            "action_offset_ms": 0, "state_offset_ms": 0,
        })

        class Runtime:
            def snapshot(self):
                return {"status": "running", "episode_id": episode["id"], "samples": 1, "error": None}

            def stop(self):
                return {"status": "idle", "episode_id": episode["id"], "samples": 1, "error": None}

        original = self.server.teleop
        self.server.teleop = Runtime()
        self.addCleanup(setattr, self.server, "teleop", original)
        status, _ = self.request("POST", "/api/v1/emergency-stop", {"reason": "operator"})
        self.assertEqual(status, 200)
        saved = next(item for item in self.server.workspace.snapshot()["episodes"] if item["id"] == episode["id"])
        self.assertEqual(saved["status"], "review")
        episode_dir = Path(self.tmp.name) / "datasets" / dataset["id"] / "episodes" / episode["id"]
        self.assertTrue((episode_dir / "episode.json").is_file())
        self.assertFalse((episode_dir.parent / f".{episode['id']}.tmp").exists())

    def test_device_binding_persists_but_does_not_claim_hardware_verification(self):
        caps = {
            "serial_ports": ["/dev/ttyUSB0", "/dev/ttyUSB1"],
            "camera_devices": [
                {"path": "/dev/video0", "stable_id": "wrist", "name": "Wrist Camera"},
                {"path": "/dev/video2", "stable_id": "world", "name": "World Camera"},
            ],
        }
        with patch("ai_service.app.detect_capabilities", return_value=caps):
            status, binding = self.request("POST", "/api/v1/devices/bind", {
                "leader_type": "HD", "leader_port": "/dev/ttyUSB0", "follower_port": "/dev/ttyUSB1",
                "wrist_camera_id": "wrist", "world_camera_id": "world",
            })
        self.assertEqual(status, 200)
        self.assertEqual(binding["status"], "bound_unverified")
        self.assertFalse(binding["capture_ready"])
        status, saved = self.request("GET", "/api/v1/devices")
        self.assertEqual(saved["binding"]["binding_id"], binding["binding_id"])

    def test_serial_connection_routes_report_missing_candidate_and_support_disconnect(self):
        status, error = self.request("POST", "/api/v1/devices/serial/connect", {
            "role": "leader", "port": "/dev/ttyUSB9", "leader_type": "HD",
        })
        self.assertEqual(status, 400)
        self.assertEqual(error["error"]["code"], "unknown_serial_candidate")
        status, result = self.request("POST", "/api/v1/devices/serial/disconnect", {"role": "leader"})
        self.assertEqual(status, 200)
        self.assertFalse(result["connected"])

    def test_telemetry_stream_emits_only_published_samples_and_releases_subscriber(self):
        response = urlopen(self.base + "/api/v1/telemetry/stream", timeout=2)
        self.assertEqual(response.status, 200)
        self.assertEqual(response.headers.get_content_type(), "text/event-stream")
        self.assertIn("event: status", response.readline().decode())
        self.assertEqual(response.readline().decode().strip(), "data: {\"state\": \"waiting\"}")
        self.assertEqual(response.readline(), b"\n")

        sample = {
            "timestamp_ms": 1234,
            "observation_state": [0, 1, 2, 3, 4, 5, 6],
            "action": [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5],
            "state_offset_ms": -2,
            "action_offset_ms": 3,
        }
        self.server.telemetry.publish_sample(sample)
        self.assertEqual(response.readline().decode().strip(), "event: sample")
        payload = json.loads(response.readline().decode().removeprefix("data: "))
        self.assertEqual(payload["timestamp_ms"], 1234)
        self.assertEqual(payload["observation_state"], [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
        self.assertEqual(response.readline(), b"\n")
        response.close()

        deadline = time.monotonic() + 1
        while self.server.telemetry.snapshot()["subscriber_count"] and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(self.server.telemetry.snapshot()["subscriber_count"], 0)

    def test_dataset_files_camera_upload_stats_export_and_import_routes(self):
        _, dataset = self.request("POST", "/api/v1/datasets", {
            "task_name": "归档测试", "slug": "archive-v1", "width": 640, "height": 360, "fps": 30
        })
        episode = self.server.workspace.start_episode(dataset["id"])
        self.server.episode_data.start_episode(dataset, episode)
        self.server.episode_data.append_sample({
            "episode_id": episode["id"], "timestamp_ms": 1000, "interval_ms": None,
            "action": [0] * 7, "observation_state": [0] * 7,
            "action_offset_ms": 0, "state_offset_ms": 0,
        })
        encoded = base64.b64encode(b"\xff\xd8real-jpeg\xff\xd9").decode()
        for role in ("wrist", "world"):
            status, uploaded = self.request("POST", f"/api/v1/episodes/{episode['id']}/camera-frames", {
                "role": role,
                "frames": [{"sequence": 1, "captured_at_ms": 1000, "monotonic_ms": 20,
                            "media_time": 0.03, "presented_frames": 1, "width": 640, "height": 360,
                            "jpeg_base64": encoded}],
            })
            self.assertEqual(status, 200)
            self.assertEqual(uploaded["stored"], 1)
        large_encoded = base64.b64encode(b"\xff\xd8" + b"x" * 1_100_000 + b"\xff\xd9").decode()
        for role in ("wrist", "world"):
            status, uploaded = self.request("POST", f"/api/v1/episodes/{episode['id']}/camera-frames", {
                "role": role,
                "frames": [{"sequence": 2, "captured_at_ms": 1033, "monotonic_ms": 53,
                            "media_time": 0.06, "presented_frames": 2, "width": 1920, "height": 1080,
                            "jpeg_base64": large_encoded}],
            })
            self.assertEqual(status, 200)
            self.assertEqual(uploaded["total"], 2)
        finalized = self.server.episode_data.finalize_episode(episode["id"], "review", 0)
        self.server.workspace.stop_episode(episode["id"], finalized["samples"], 0)
        reviewed = self.server.workspace.review_episode(episode["id"], "success", integrity_ok=True)
        self.server.episode_data.update_episode_status(episode["id"], reviewed["status"])

        status, integrity = self.request("GET", f"/api/v1/episodes/{episode['id']}/integrity")
        self.assertEqual(status, 200)
        self.assertTrue(integrity["ok"])
        status, stats = self.request("GET", f"/api/v1/datasets/{dataset['id']}/stats")
        self.assertEqual(status, 200)
        self.assertEqual(stats["totals"]["wrist"], 2)
        self.assertEqual(stats["totals"]["world"], 2)
        status, headers, archive = self.request_raw("GET", f"/api/v1/datasets/{dataset['id']}/export")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "application/zip")

        status, _, imported_body = self.request_raw("POST", "/api/v1/datasets/import", archive, "application/zip")
        self.assertEqual(status, 201)
        imported = json.loads(imported_body)
        self.assertEqual(imported["dataset"]["slug"], "archive-v1-import-2")
        self.assertNotEqual(imported["dataset"]["id"], dataset["id"])


if __name__ == "__main__":
    unittest.main()
