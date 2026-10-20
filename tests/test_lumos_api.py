"""HTTP contract checks with a fake CAN runtime; no hardware or SDK is loaded."""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from unittest.mock import Mock

from ai_service.app import create_server
from ai_service.domain import DomainError


class LumosApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.runtime = Mock()
        self.runtime.snapshot.return_value = {"status": "idle", "session_id": None}
        self.server = create_server(("127.0.0.1", 0), Path(self.tmp.name),
                                    Path("Browser_SDK"), lumos=self.runtime)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.http = build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(2)
        self.tmp.cleanup()

    def request(self, path, body=None, headers=None):
        req = Request(self.base + path,
                      data=None if body is None else json.dumps(body).encode(),
                      headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with self.http.open(req, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_status_only_reads_snapshot(self):
        status, result = self.request("/api/v1/lumos/status")
        self.assertEqual(status, 200)
        self.assertIsNone(result["session_id"])
        self.runtime.connect.assert_not_called()
        self.runtime.sample.assert_not_called()

    def test_routes_preserve_session_payload_and_hyphenated_operations(self):
        operations = {"connect": "connect", "sample": "sample",
                      "capture-reference": "capture_reference",
                      "capture-gripper": "capture_gripper",
                      "finish-calibration": "finish_calibration",
                      "start": "start", "stop": "stop", "disconnect": "disconnect"}
        body = {"session_id": "test-session", "leader_connection_id": "test-leader"}
        for route, method in operations.items():
            with self.subTest(route=route):
                getattr(self.runtime, method).return_value = {"status": route}
                status, value = self.request("/api/v1/lumos/" + route, body,
                                             {"Origin": self.base})
                self.assertEqual((status, value), (200, {"status": route}))
                getattr(self.runtime, method).assert_called_once_with(body)

    def test_remote_origin_and_rebinding_host_cannot_enable_can(self):
        for headers in [{"Origin": "https://example.com"},
                        {"Origin": "null"}, {"Host": "attacker.example"}]:
            with self.subTest(headers=headers):
                status, result = self.request("/api/v1/lumos/connect", {}, headers)
                self.assertEqual(status, 400)
                self.assertIn(result["error"]["code"], {"lumos_origin_denied", "lumos_local_only"})
        self.runtime.connect.assert_not_called()

    def test_simple_cross_site_body_and_non_object_cannot_enable_can(self):
        status, _ = self.request("/api/v1/lumos/connect", {}, {"Content-Type": "text/plain"})
        self.assertEqual(status, 400)
        status, _ = self.request("/api/v1/lumos/connect", [])
        self.assertEqual(status, 400)
        self.runtime.connect.assert_not_called()

    def test_runtime_rejection_is_visible_without_retry(self):
        self.runtime.start.side_effect = DomainError("只允许 Touch R1", "lumos_pairing_denied")
        status, value = self.request("/api/v1/lumos/start", {})
        self.assertEqual(status, 400)
        self.assertEqual(value["error"]["code"], "lumos_pairing_denied")
        self.runtime.start.assert_called_once_with({})

    def test_no_unknown_route_and_no_remote_launcher_probe(self):
        status, _ = self.request("/api/v1/lumos/reset-factory", {})
        self.assertEqual(status, 404)
        status, _ = self.request("/api/lumos/launcher")
        self.assertEqual(status, 404)
        self.server.lumos_launcher_identity = {"service": "star-arm-lumos-local"}
        status, value = self.request("/api/lumos/launcher")
        self.assertEqual((status, value), (200, {"service": "star-arm-lumos-local"}))
        status, _ = self.request("/api/lumos/launcher", headers={"Origin": "https://example.com"})
        self.assertEqual(status, 400)

    def test_active_lumos_prevents_changing_data_directory(self):
        for field, value in (("session_id", "active"), ("connecting", True),
                             ("cleanup_pending", True), ("cleanup_failed", True)):
            self.runtime.snapshot.return_value = {field: value}
            with self.subTest(field=field), self.assertRaisesRegex(DomainError, "先断开"):
                self.server.set_data_dir(Path(self.tmp.name) / "other")
        self.runtime.close.assert_not_called()

    def test_global_emergency_stop_also_revokes_lumos(self):
        status, _ = self.request("/api/v1/emergency-stop", {"reason": "operator"})
        self.assertEqual(status, 200)
        self.runtime.emergency_stop.assert_called_once_with("operator")
        self.runtime.close.assert_not_called()

    def test_complete_http_session_uses_real_runtime_with_simulated_can(self):
        from ai_service.lumos_runtime import LumosRuntime

        class FakeArm:
            def __init__(self):
                self.commands = []
                self.gripper_commands = []
                self.gripper_position = 0.0
                self.cleaned = False

            def get_joint_positions(self):
                return [0.0] * 6

            def set_joint_raw(self, positions, velocities):
                self.commands.append((positions, velocities))

            def get_gripper_state(self):
                return SimpleNamespace(position=self.gripper_position, feedback_valid=True,
                                       feedback_age_ms=0.0, error_code=0, enabled=True)

            def setGripperPosition(self, ratio):
                self.gripper_commands.append(ratio)
                self.gripper_position = ratio

            def cleanup(self):
                self.cleaned = True

        arm = FakeArm()
        sample_time = [100.0]
        self.server.lumos = LumosRuntime(arm_factory=lambda **_: arm, start_watchdog=False,
                                         clock=lambda: sample_time[0])
        pair = {"leader_type": "TOUCH", "follower_type": "LUMOS",
                "leader_connection_id": "browser-touch-connection"}
        status, connected = self.request("/api/v1/lumos/connect",
                                         {**pair, "can_interface": "can0", "enable_confirmed": True})
        self.assertEqual(status, 200)
        session = {**pair, "session_id": connected["session_id"]}

        def post(action, fields=None):
            code, result = self.request("/api/v1/lumos/" + action, {**session, **(fields or {})})
            self.assertEqual(code, 200, result)
            return result

        post("sample", {"sequence": 0, "leader_deg": [0] * 6, "leader_gripper_deg": 0})
        post("capture-reference", {"leader_deg": [0] * 6, "leader_gripper_deg": 0, "joint_map": list(range(6)),
                                   "signs": [-1, 1, 1, 1, -1, -1], "gain": 0.3})
        post("capture-gripper", {"position": "closed", "leader_gripper_deg": 0})
        post("sample", {"sequence": 1, "leader_deg": [0] * 6, "leader_gripper_deg": 90})
        post("capture-gripper", {"position": "open", "leader_gripper_deg": 90})
        for sequence, angle in enumerate([-10, 10, 0], start=2):
            post("sample", {"sequence": sequence, "leader_deg": [angle] * 6, "leader_gripper_deg": 0})
        result = post("finish-calibration")
        self.assertEqual(result["phase"], "preview")
        self.assertEqual(arm.commands, [])
        self.assertEqual(arm.gripper_commands, [])
        post("start", {"confirmed": True})
        sample_time[0] += 0.02
        post("sample", {"sequence": 5, "leader_deg": [2] * 6, "leader_gripper_deg": 10})
        self.assertEqual(len(arm.commands), 1)
        self.assertEqual(len(arm.commands[0][0]), 6)
        self.assertEqual(arm.commands[0][1], [0.0] * 6)
        self.assertEqual(len(arm.gripper_commands), 1)
        self.assertGreater(arm.gripper_commands[0], 0.0)
        self.assertLessEqual(arm.gripper_commands[0], 0.04)
        stopped = post("stop")
        self.assertTrue(arm.cleaned)
        self.assertIsNone(stopped["session_id"])
        status, _ = self.request("/api/v1/lumos/sample",
                                 {**session, "sequence": 6, "leader_deg": [3] * 6, "leader_gripper_deg": 20})
        self.assertEqual(status, 400)
        self.assertEqual(len(arm.commands), 1)
        self.assertEqual(len(arm.gripper_commands), 1)


if __name__ == "__main__":
    unittest.main()
