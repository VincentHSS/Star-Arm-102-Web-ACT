import tempfile
import unittest
from pathlib import Path

from ai_service.devices import DeviceRegistry
from ai_service.domain import DomainError
from ai_service.store import JsonStore


class DeviceRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.registry = DeviceRegistry(JsonStore(Path(self.tmp.name)))
        self.caps = {
            "serial_ports": ["/dev/ttyUSB0", "/dev/ttyUSB1"],
            "camera_devices": [
                {"path": "/dev/video0", "stable_id": "usb-wrist"},
                {"path": "/dev/video2", "stable_id": "usb-world"},
            ],
        }

    def tearDown(self):
        self.tmp.cleanup()

    def test_binds_unique_detected_devices_and_keeps_candidate_state_unverified(self):
        config = self.registry.bind({
            "leader_type": "HD",
            "leader_port": "/dev/ttyUSB0",
            "follower_port": "/dev/ttyUSB1",
            "wrist_camera_id": "usb-wrist",
            "world_camera_id": "usb-world",
        }, self.caps)
        self.assertEqual(config["leader_type"], "HD")
        self.assertEqual(config["status"], "bound_unverified")
        self.assertFalse(config["capture_ready"])

    def test_rejects_duplicate_serial_and_camera_roles(self):
        base = {
            "leader_type": "LD", "leader_port": "/dev/ttyUSB0", "follower_port": "/dev/ttyUSB0",
            "wrist_camera_id": "usb-wrist", "world_camera_id": "usb-world",
        }
        with self.assertRaisesRegex(DomainError, "不能使用同一个串口"):
            self.registry.bind(base, self.caps)
        base["follower_port"] = "/dev/ttyUSB1"
        base["world_camera_id"] = "usb-wrist"
        with self.assertRaisesRegex(DomainError, "不能绑定同一相机"):
            self.registry.bind(base, self.caps)

    def test_accepts_unique_browser_camera_session_ids(self):
        caps = {"serial_ports": self.caps["serial_ports"], "camera_devices": []}
        config = self.registry.bind({
            "leader_type": "HD",
            "leader_port": "/dev/ttyUSB0",
            "follower_port": "/dev/ttyUSB1",
            "wrist_camera_id": "browser-camera-a",
            "world_camera_id": "browser-camera-b",
        }, caps)
        self.assertEqual(config["wrist_camera_id"], "browser-camera-a")
        self.assertEqual(config["world_camera_id"], "browser-camera-b")
        self.assertFalse(config["capture_ready"])

    def test_rejects_empty_browser_camera_session_ids(self):
        request = {
            "leader_type": "HD",
            "leader_port": "/dev/ttyUSB0",
            "follower_port": "/dev/ttyUSB1",
            "wrist_camera_id": "",
            "world_camera_id": "browser-camera-b",
        }
        with self.assertRaisesRegex(DomainError, "请选择两台摄像头"):
            self.registry.bind(request, self.caps)

    def test_marks_capture_ready_only_after_all_adapters_verify_same_binding(self):
        config = self.registry.bind({
            "leader_type": "HD", "leader_port": "/dev/ttyUSB0", "follower_port": "/dev/ttyUSB1",
            "wrist_camera_id": "usb-wrist", "world_camera_id": "usb-world",
        }, self.caps)
        for role in ("leader", "follower", "wrist_camera", "world_camera"):
            config = self.registry.mark_verified(config["binding_id"], role)
        self.assertEqual(config["status"], "verified")
        self.assertTrue(config["capture_ready"])


if __name__ == "__main__":
    unittest.main()
