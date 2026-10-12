import json
import tempfile
import unittest
from unittest.mock import patch
from ai_service.follower_calibration import FollowerCalibration
from ai_service.release_adapter import ReleaseCoordinates
from ai_service.domain import DomainError


class Serial:
    def __init__(self):
        self.port = "/dev/ttyUSB1"
        self.angles = [0] * 7
        self.releases = 0
    def snapshot(self):
        return {"follower": {"connected": True, "port": self.port}}
    def release_follower_torque(self):
        self.releases += 1
    def read_follower_angles(self):
        return self.angles
    def write_follower_angles(self, *args):
        raise AssertionError("Calibration must never command positions")


class FollowerCalibrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.serial = Serial()
        self.manager = FollowerCalibration(self.tmp.name, self.serial)
    def tearDown(self):
        self.tmp.cleanup()
    def test_complete_range_saved_reloaded_and_compatible_with_release(self):
        self.manager.start(True)
        self.serial.angles = [-40] * 6 + [0]
        self.manager.sample()
        self.serial.angles = [60] * 6 + [80]
        saved = self.manager.finish(True)
        self.assertEqual(saved["status"], "saved")
        self.assertEqual(self.serial.releases, 1)
        calibration, port = self.manager.saved_calibration()
        self.assertEqual(port, self.serial.port)
        self.assertEqual(ReleaseCoordinates(calibration).action([-100] * 6 + [0]), [-40.0] * 6 + [0])
        reloaded = FollowerCalibration(self.tmp.name, self.serial)
        self.assertEqual(reloaded.snapshot()["calibration"], calibration)
    def test_confirmations_and_all_seven_joint_ranges_required(self):
        with self.assertRaises(DomainError): self.manager.start(False)
        self.assertEqual(self.serial.releases, 0)
        self.manager.start(True)
        with self.assertRaises(DomainError): self.manager.finish(False)
        self.serial.angles = [60] * 6 + [0]
        with self.assertRaisesRegex(DomainError, "J7"): self.manager.finish(True)
        self.assertTrue(self.manager.active())
        with self.assertRaises(DomainError): self.manager.saved_calibration()
    def test_connection_changes_fault_and_cancel_does_not_save(self):
        self.manager.start(True)
        self.serial.port = "/dev/ttyUSB2"
        changed = self.manager.sample()
        self.assertEqual(changed["status"], "paused")
        self.assertIn("设备已改变", changed["warning"])
        self.manager.cancel()
        self.manager.start(True)
        self.manager.cancel()
        with self.assertRaises(DomainError): self.manager.sample()
        with self.assertRaises(DomainError): self.manager.saved_calibration()
    def test_invalid_reads_rejected(self):
        self.manager.start(True)
        self.serial.angles = [float("nan")] * 7
        invalid = self.manager.sample()
        self.assertEqual(invalid["status"], "recording")
        self.assertEqual(invalid["samples"], 1)
        self.assertIn("角度数据无效", invalid["warning"])

    def test_single_timeout_is_retried_without_losing_ranges(self):
        self.manager.start(True)
        self.serial.angles = [30] * 7
        before = self.manager.sample()
        with patch.object(self.serial, "read_follower_angles", side_effect=DomainError("missing ID 6", "joint_read_timeout")):
            retry = self.manager.sample()
        self.assertEqual(retry["status"], "recording")
        self.assertEqual(retry["samples"], before["samples"])
        self.assertEqual(retry["joints"], before["joints"])
        self.serial.angles = [-20] * 7
        recovered = self.manager.sample()
        self.assertEqual(recovered["consecutive_failures"], 0)
        self.assertIsNone(recovered["warning"])
        self.assertGreater(recovered["joints"][0]["span_deg"], 49)

    def test_repeated_failure_keeps_recording_and_manual_resume_preserves_ranges(self):
        self.manager.start(True)
        self.serial.angles = [30] * 7
        before = self.manager.sample()
        with patch.object(self.serial, "read_follower_angles", side_effect=DomainError("read failed", "serial_read_failed")):
            for _ in range(100): self.manager.sample()
        self.assertEqual(self.manager.snapshot()["status"], "recording")
        self.assertEqual(self.manager.snapshot()["consecutive_failures"], 100)
        self.assertEqual(self.manager.snapshot()["joints"], before["joints"])
        self.manager.pause()
        self.assertTrue(self.manager.active())
        with self.assertRaises(DomainError): self.manager.resume(True, False)
        with self.assertRaises(DomainError): self.manager.sample()
        self.serial.angles = [-20] * 7
        resumed = self.manager.resume(True, True)
        self.assertEqual(resumed["status"], "recording")
        self.assertEqual(resumed["samples"], before["samples"] + 1)
        self.assertGreater(resumed["joints"][0]["span_deg"], 49)

    def test_read_failure_during_finish_cannot_save_stale_sample(self):
        self.manager.start(True)
        self.serial.angles = [30] * 7
        self.manager.sample()
        with patch.object(self.serial, "read_follower_angles", side_effect=DomainError("timeout", "joint_read_timeout")):
            with self.assertRaises(DomainError): self.manager.finish(True)
        with self.assertRaises(DomainError): self.manager.saved_calibration()

    def test_resume_rejects_changed_port_and_pause_can_be_cancelled(self):
        self.manager.start(True)
        self.manager.pause()
        self.serial.port = "/dev/ttyUSB2"
        with self.assertRaises(DomainError): self.manager.resume(True, True)
        self.manager.cancel()
        self.assertFalse(self.manager.active())

    def test_reported_extended_angles_are_recorded_and_match_release_driver(self):
        self.serial.angles = [0, 198.2, -199.9, 0, 0, 0, 0]
        recorded = self.manager.start(True)
        self.assertEqual(recorded["samples"], 1)
        self.assertEqual(recorded["consecutive_failures"], 0)
        self.assertEqual(recorded["joints"][1]["angle"], 198.2)
        self.assertEqual(recorded["joints"][1]["max"], 4096)
        self.assertEqual(recorded["joints"][2]["min"], 0)
        self.assertIn("截断", recorded["warning"])
        self.serial.angles = [20, 160, -170, 20, 20, 20, 20]
        saved = self.manager.finish(True)
        self.assertEqual(saved["status"], "saved")
        self.assertEqual(saved["joints"][1]["raw_span_deg"], 38.2)
        self.assertLess(saved["joints"][1]["span_deg"], 21)
        calibration, _ = self.manager.saved_calibration()
        self.assertEqual(ReleaseCoordinates(calibration).observation([0, 198.2, -199.9, 0, 0, 0, 0])[1:3], [100, -100])

    def test_entire_range_outside_driver_bounds_is_not_falsely_saved(self):
        self.serial.angles = [0, 198.2, -199.9, 0, 0, 0, 0]
        self.manager.start(True)
        self.serial.angles = [20, 220, -240, 20, 20, 20, 20]
        sampled = self.manager.sample()
        self.assertGreater(sampled["joints"][1]["raw_span_deg"], 20)
        self.assertEqual(sampled["joints"][1]["span_deg"], 0)
        with self.assertRaisesRegex(DomainError, "零位"):
            self.manager.finish(True)
        self.assertTrue(self.manager.active())


if __name__ == "__main__": unittest.main()
