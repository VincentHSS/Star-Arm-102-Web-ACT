import math
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from ai_service.domain import DomainError
from ai_service.lumos_runtime import (
    JointFilter, LumosRuntime, create_lumos_arm, find_sdk_root,
    limit_target, read_sdk_gripper_type, sdk_initialization_directory,
)


class Clock:
    def __init__(self):
        self.value = 100.0

    def __call__(self):
        return self.value

    def advance(self, seconds=0.02):
        self.value += seconds


class Arm:
    def __init__(self):
        self.positions = [0.0] * 6
        self.commands = []
        self.cleanups = 0
        self.reads = 0
        self.read_hook = None
        self.cleanup_error = None
        self.gripper_commands = []
        self.gripper = SimpleNamespace(position=0.0, feedback_valid=True, feedback_age_ms=0.0,
                                       error_code=1, enabled=True)
        self.gripper_error = None

    def get_joint_positions(self):
        self.reads += 1
        if self.read_hook:
            self.read_hook()
        return list(self.positions)

    def set_joint_raw(self, positions, velocities):
        self.commands.append((list(positions), list(velocities)))
        self.positions = list(positions)

    def get_gripper_state(self):
        return self.gripper

    def setGripperPosition(self, value):
        if self.gripper_error:
            raise self.gripper_error
        self.gripper_commands.append(value)
        self.gripper.position = value
        return True

    def cleanup(self):
        self.cleanups += 1
        if self.cleanup_error:
            raise self.cleanup_error


class LumosRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.arms = []

        def factory(**kwargs):
            arm = Arm()
            self.arms.append(arm)
            return arm

        self.runtime = LumosRuntime(arm_factory=factory, clock=self.clock, start_watchdog=False)
        self.identity = {"leader_type": "TOUCH", "follower_type": "LUMOS",
                         "leader_connection_id": "browser-leader-1"}
        self.connect_body = {**self.identity, "can_interface": "can0", "enable_confirmed": True}
        self.session = None
        self.sequence = 0

    def tearDown(self):
        self.runtime.close()

    def connect(self):
        result = self.runtime.connect(self.connect_body)
        self.session = {**self.identity, "session_id": result["session_id"]}
        return result

    def sample(self, angles=None, advance=0.02, gripper=0.0):
        self.clock.advance(advance)
        self.sequence += 1
        return self.runtime.sample({**self.session, "sequence": self.sequence,
                                    "leader_deg": [0.0] * 6 if angles is None else angles,
                                    "leader_gripper_deg": gripper})

    def calibrated(self, signs=None, joint_map=None, gain=1.0, closed=0.0, opened=90.0, invert=False):
        self.connect()
        self.sample()
        self.runtime.capture_reference({
            **self.session, "leader_deg": [0.0] * 6, "leader_gripper_deg": 0.0,
            "joint_map": list(range(6)) if joint_map is None else joint_map,
            "signs": [1.0] * 6 if signs is None else signs, "gain": gain, "invert_gripper": invert,
        })
        self.sample([-30.0] * 6, gripper=closed)
        self.runtime.capture_gripper({**self.session, "position": "closed", "leader_gripper_deg": closed})
        self.sample([30.0] * 6, gripper=opened)
        self.runtime.capture_gripper({**self.session, "position": "open", "leader_gripper_deg": opened})
        self.runtime.finish_calibration(self.session)
        self.sample(gripper=opened if invert else closed)

    def running(self):
        self.calibrated()
        return self.runtime.start({**self.session, "confirmed": True})

    def test_snapshot_and_invalid_connect_never_construct_or_enable(self):
        self.assertEqual(self.runtime.snapshot()["status"], "idle")
        invalid = [
            None, [], {}, {**self.connect_body, "leader_type": "LD"},
            {**self.connect_body, "leader_type": "HD"},
            {**self.connect_body, "leader_type": "PIPER"},
            {**self.connect_body, "follower_type": "FL"},
            {**self.connect_body, "enable_confirmed": 1},
            {**self.connect_body, "enable_confirmed": False},
            {**self.connect_body, "leader_connection_id": ""},
            {**self.connect_body, "can_interface": "../can0"},
        ]
        for body in invalid:
            with self.subTest(body=body), self.assertRaises(DomainError):
                self.runtime.connect(body)
        self.assertEqual(self.arms, [])

    def test_snapshots_do_not_read_sdk_or_renew_input(self):
        self.connect()
        reads = self.arms[0].reads
        for _ in range(20):
            self.runtime.snapshot()
        self.assertEqual(self.arms[0].reads, reads)
        self.clock.advance(1.51)
        self.runtime.snapshot()
        self.runtime.check_watchdog()
        self.assertEqual(self.runtime.snapshot()["status"], "fault")
        self.assertEqual(self.arms[0].cleanups, 1)

    def test_calibration_and_preview_do_not_send_motion(self):
        self.calibrated(signs=[-1, 1, 1, 1, -1, -1], joint_map=[5, 4, 3, 2, 1, 0], gain=0.5)
        result = self.sample([2, 4, 6, 8, 10, 12])
        self.assertEqual(result["status"], "preview")
        expected_deg = [-6, 5, 4, 3, -2, -1]
        for actual, expected in zip(result["preview_rad"], expected_deg):
            self.assertAlmostEqual(actual, math.radians(expected))
        self.assertEqual(self.arms[0].commands, [])
        self.assertEqual(self.arms[0].gripper_commands, [])
        self.assertTrue(result["calibration"]["range_ready"])
        self.assertFalse(result["feedback_freshness_verified"])

    def test_calibration_requires_valid_map_signs_gain_and_all_axes_range(self):
        self.connect()
        common = {**self.session, "leader_deg": [0] * 6, "leader_gripper_deg": 0,
                  "joint_map": list(range(6)), "signs": [1] * 6, "gain": 1}
        for extra in ({"joint_map": [0] * 6}, {"joint_map": [False, 1, 2, 3, 4, 5]},
                      {"signs": [0] * 6}, {"gain": 0}, {"gain": True},
                      {"gain": 1.1}, {"gain": float("nan")}, {"leader_deg": [1] * 7}):
            with self.subTest(extra=extra), self.assertRaises(DomainError):
                self.runtime.capture_reference({**common, **extra})
        self.runtime.capture_reference(common)
        self.sample([10] * 5 + [0])
        with self.assertRaisesRegex(DomainError, "2°"):
            self.runtime.finish_calibration(self.session)
        self.assertEqual(self.runtime.snapshot()["status"], "calibrating")
        self.assertEqual(self.arms[0].commands, [])

    def test_start_requires_confirmation_calibration_fresh_input_and_both_homes(self):
        self.connect()
        with self.assertRaises(DomainError):
            self.runtime.start({**self.session, "confirmed": True})
        self.runtime.disconnect(self.session)
        self.calibrated()
        with self.assertRaises(DomainError):
            self.runtime.start(self.session)
        self.clock.advance(0.51)
        with self.assertRaisesRegex(DomainError, "500 ms"):
            self.runtime.start({**self.session, "confirmed": True})
        self.sample([10] * 6)
        with self.assertRaisesRegex(DomainError, "Touch R1 偏离"):
            self.runtime.start({**self.session, "confirmed": True})
        self.sample()
        self.arms[-1].positions = [0.151] * 6
        with self.assertRaisesRegex(DomainError, "Lumos 偏离"):
            self.runtime.start({**self.session, "confirmed": True})
        self.assertEqual(self.arms[-1].commands, [])
        self.arms[-1].positions = [0.01] * 6
        started = self.runtime.start({**self.session, "confirmed": True})
        self.assertEqual(started["target_rad"], [0.01] * 6)
        self.assertEqual(self.arms[-1].commands, [])

    def test_running_uses_rate_limit_six_axes_and_calibrated_gripper(self):
        self.running()
        result = self.sample([30] * 6)
        first = self.arms[0].commands[-1]
        self.assertEqual(first[1], [0.0] * 6)
        self.assertEqual(len(first[0]), 6)
        self.assertEqual(self.arms[0].gripper_commands, [0.0])
        self.assertLessEqual(max(abs(value) for value in first[0]), math.radians(1.0) + 1e-12)
        previous = first[0]
        self.sample([30] * 6, advance=0.2)
        current = self.arms[0].commands[-1][0]
        self.assertLessEqual(max(abs(a-b) for a, b in zip(current, previous)), math.radians(2.0) + 1e-12)
        self.assertEqual(result["status"], "running")

    def test_wrong_pair_session_or_leader_cannot_write_or_renew(self):
        self.running()
        previous = self.runtime.snapshot()["last_sequence"]
        for changes in ({"session_id": "old-token"}, {"session_id": "无效会话"},
                        {"session_id": "\ud800"}, {"leader_type": "LD"},
                        {"follower_type": "FL"}, {"leader_connection_id": "other-leader"}):
            with self.subTest(changes=changes), self.assertRaises(DomainError):
                self.runtime.sample({**self.session, "sequence": 100, "leader_deg": [1] * 6,
                                     "leader_gripper_deg": 0, **changes})
        self.assertEqual(self.arms[0].commands, [])
        self.assertEqual(self.runtime.snapshot()["last_sequence"], previous)

    def test_repeated_and_reordered_samples_cannot_replay_or_renew(self):
        self.running()
        for sequence in (self.sequence, self.sequence - 1, -1, True, 1.5):
            with self.subTest(sequence=sequence), self.assertRaises(DomainError):
                self.runtime.sample({**self.session, "sequence": sequence, "leader_deg": [1] * 6,
                                     "leader_gripper_deg": 0})
        self.assertEqual(self.arms[0].commands, [])
        self.clock.advance(0.501)
        self.runtime.check_watchdog()
        self.assertEqual(self.arms[0].cleanups, 1)

    def test_invalid_or_out_of_range_input_closes_and_prevents_future_motion(self):
        for angles in ([float("nan")] * 6, [float("inf")] * 6, [10 ** 400] * 6,
                       [False] * 6, [31] * 6, [0] * 7):
            with self.subTest(angles=angles):
                self.runtime.close()
                self.setUp()
                self.running()
                with self.assertRaises(DomainError):
                    self.sample(angles)
                self.assertEqual(self.runtime.snapshot()["status"], "fault")
                self.assertEqual(self.arms[0].cleanups, 1)
                self.assertEqual(self.arms[0].commands, [])
                with self.assertRaises(DomainError):
                    self.sample()

    def test_watchdog_closes_during_calibration_preview_and_running(self):
        self.connect()
        self.runtime.capture_reference({**self.session, "leader_deg": [0] * 6, "leader_gripper_deg": 0,
                                        "joint_map": list(range(6)), "signs": [1] * 6, "gain": 1})
        self.clock.advance(1.501)
        self.runtime.check_watchdog()
        self.assertEqual(self.arms[0].cleanups, 1)
        self.calibrated()
        self.clock.advance(1.501)
        self.runtime.check_watchdog()
        self.assertEqual(self.arms[-1].cleanups, 1)
        self.running()
        self.clock.advance(0.501)
        self.runtime.check_watchdog()
        self.assertEqual(self.arms[-1].cleanups, 1)
        self.assertIsNone(self.runtime.snapshot()["session_id"])

    def test_stop_disconnect_and_reconnect_invalidate_token_and_calibration(self):
        self.running()
        self.sample([1] * 6)
        old_session = dict(self.session)
        old_connection = self.runtime.snapshot()["connection_id"]
        result = self.runtime.stop(self.session)
        self.assertEqual(result["status"], "stopped")
        self.assertFalse(result["calibration"]["reference_set"])
        count = len(self.arms[0].commands)
        with self.assertRaises(DomainError):
            self.sample([2] * 6)
        self.assertEqual(len(self.arms[0].commands), count)
        reconnected = self.connect()
        self.assertNotEqual(reconnected["session_id"], old_session["session_id"])
        self.assertNotEqual(reconnected["connection_id"], old_connection)
        with self.assertRaises(DomainError):
            self.runtime.stop(old_session)
        self.assertEqual(self.arms[-1].cleanups, 0)
        self.runtime.disconnect(self.session)
        self.assertEqual(self.arms[-1].cleanups, 1)

    def test_failed_sdk_read_cleans_up_even_at_connect(self):
        failing = Arm()
        failing.positions = [float("nan")] * 6
        runtime = LumosRuntime(arm_factory=lambda **kwargs: failing, start_watchdog=False)
        with self.assertRaises(DomainError):
            runtime.connect(self.connect_body)
        self.assertEqual(failing.cleanups, 1)
        self.assertIsNone(runtime.snapshot()["session_id"])
        runtime.close()
        self.running()
        self.arms[0].positions = [0] * 5
        with self.assertRaises(DomainError):
            self.sample()
        self.assertEqual(self.arms[0].cleanups, 1)
        self.assertEqual(self.arms[0].commands, [])

    def test_cleanup_failure_blocks_reconnect(self):
        self.connect()
        self.arms[0].cleanup_error = OSError("CAN shutdown failed")
        result = self.runtime.stop(self.session)
        self.assertEqual(result["status"], "fault")
        self.assertTrue(result["cleanup_failed"])
        with self.assertRaisesRegex(DomainError, "关闭失败"):
            self.connect()
        self.assertEqual(len(self.arms), 1)

    def test_watchdog_revokes_during_blocking_read_and_late_read_never_commands(self):
        self.running()
        entered, release = threading.Event(), threading.Event()
        self.arms[0].read_hook = lambda: (entered.set(), release.wait(2))
        errors = []

        def sample():
            try:
                self.sample([1] * 6)
            except DomainError as error:
                errors.append(error)

        worker = threading.Thread(target=sample)
        worker.start()
        self.assertTrue(entered.wait(1))
        self.clock.advance(0.6)
        self.runtime.check_watchdog()
        self.assertEqual(self.arms[0].cleanups, 1)
        release.set()
        worker.join(1)
        self.assertFalse(worker.is_alive())
        self.assertTrue(errors)
        self.assertEqual(self.arms[0].commands, [])

    def test_independent_watchdog_runs_without_http_requests(self):
        arm = Arm()
        runtime = LumosRuntime(arm_factory=lambda **kwargs: arm, clock=self.clock, watchdog_interval=0.01)
        try:
            runtime.connect(self.connect_body)
            self.clock.advance(2)
            deadline = time.monotonic() + 1
            while arm.cleanups == 0 and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual(arm.cleanups, 1)
            self.assertIsNone(runtime.snapshot()["session_id"])
        finally:
            runtime.close()

    def test_latest_submitted_sample_replaces_queued_samples(self):
        self.running()
        entered, release = threading.Event(), threading.Event()
        self.arms[0].read_hook = lambda: (entered.set(), release.wait(2))
        results, errors = [], []
        original_sequence = self.sequence

        def submit(sequence, value):
            try:
                results.append(self.runtime.sample({**self.session, "sequence": sequence, "leader_deg": [value] * 6,
                                                    "leader_gripper_deg": 0}))
            except DomainError as error:
                errors.append(error)

        first = threading.Thread(target=submit, args=(original_sequence + 1, 1))
        first.start()
        self.assertTrue(entered.wait(1))
        second = threading.Thread(target=submit, args=(original_sequence + 2, 2))
        second.start()
        deadline = time.monotonic() + 1
        while self.runtime._latest_submitted_sequence != original_sequence + 2 and time.monotonic() < deadline:
            time.sleep(0.001)
        release.set()
        first.join(1)
        second.join(1)
        self.assertFalse(first.is_alive() or second.is_alive())
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0].code, "lumos_stale_sample")
        self.assertEqual(results[-1]["last_sequence"], original_sequence + 2)
        self.assertEqual(len(self.arms[0].commands), 1)

    def test_gripper_uses_raw_id6_endpoints_and_supports_reversed_encoder(self):
        self.calibrated(closed=300, opened=240)
        result = self.sample(gripper=270)
        self.assertAlmostEqual(result["gripper"]["preview_ratio"], 0.5)
        self.assertEqual(result["gripper"]["closed_deg"], 300)
        self.assertEqual(result["gripper"]["open_deg"], 240)
        self.assertEqual(self.arms[0].gripper_commands, [])
        self.runtime.stop(self.session)
        self.calibrated(closed=300, opened=240, invert=True)
        result = self.sample(gripper=300)
        self.assertEqual(result["gripper"]["preview_ratio"], 1.0)
        self.assertEqual(self.arms[-1].commands, [])
        self.assertEqual(self.arms[-1].gripper_commands, [])

    def test_finish_requires_fresh_gripper_endpoints_and_nonzero_span(self):
        self.connect()
        self.runtime.capture_reference({
            **self.session, "leader_deg": [0] * 6, "leader_gripper_deg": 0,
            "joint_map": list(range(6)), "signs": [1] * 6, "gain": 1,
        })
        with self.assertRaisesRegex(DomainError, "500 ms"):
            self.runtime.capture_gripper({**self.session, "position": "closed", "leader_gripper_deg": 0})
        self.sample([-30] * 6)
        self.sample([30] * 6)
        with self.assertRaisesRegex(DomainError, "夹爪闭合和张开端点"):
            self.runtime.finish_calibration(self.session)
        self.runtime.capture_gripper({**self.session, "position": "closed", "leader_gripper_deg": 0})
        self.sample(gripper=1)
        self.runtime.capture_gripper({**self.session, "position": "open", "leader_gripper_deg": 1})
        self.assertFalse(self.runtime.snapshot()["gripper"]["calibrated"])
        with self.assertRaisesRegex(DomainError, "至少 2°"):
            self.runtime.finish_calibration(self.session)
        with self.assertRaises(DomainError):
            self.runtime.capture_gripper({**self.session, "position": "open", "leader_gripper_deg": 10})
        self.clock.advance(0.51)
        with self.assertRaises(DomainError):
            self.runtime.capture_gripper({**self.session, "position": "open", "leader_gripper_deg": 1})
        self.assertEqual(self.arms[0].commands, [])
        self.assertEqual(self.arms[0].gripper_commands, [])

    def test_gripper_start_requires_alignment_and_limits_from_actual_feedback(self):
        self.calibrated()
        self.arms[0].gripper.position = 0.25
        with self.assertRaisesRegex(DomainError, "开度相差"):
            self.runtime.start({**self.session, "confirmed": True})
        self.arms[0].gripper.position = 0.05
        started = self.runtime.start({**self.session, "confirmed": True})
        self.assertEqual(started["gripper"]["target_ratio"], 0.05)
        self.assertEqual(self.arms[0].gripper_commands, [])
        self.sample(gripper=0)
        self.assertAlmostEqual(self.arms[0].gripper_commands[-1], 0.01)
        self.sample(gripper=90, advance=0.01)
        self.assertAlmostEqual(self.arms[0].gripper_commands[-1], 0.03)
        self.sample(gripper=90, advance=0.2)
        self.assertAlmostEqual(self.arms[0].gripper_commands[-1], 0.07)

    def test_missing_invalid_or_out_of_range_id6_stops_both_outputs(self):
        for value in ("missing", None, True, float("nan"), float("inf"), 10 ** 400, 91.0):
            with self.subTest(value=value):
                self.runtime.close()
                self.setUp()
                self.running()
                body = {**self.session, "sequence": self.sequence + 1, "leader_deg": [1] * 6}
                if value != "missing":
                    body["leader_gripper_deg"] = value
                with self.assertRaises(DomainError):
                    self.runtime.sample(body)
                self.assertEqual(self.arms[0].commands, [])
                self.assertEqual(self.arms[0].gripper_commands, [])
                self.assertEqual(self.arms[0].cleanups, 1)
                self.assertIsNone(self.runtime.snapshot()["session_id"])

    def test_gripper_endpoint_tolerance_applies_to_reversed_range(self):
        for outside, accepted in ((300.5, True), (239.5, True), (300.501, False), (239.499, False)):
            with self.subTest(outside=outside):
                self.runtime.close()
                self.setUp()
                self.calibrated(closed=300, opened=240)
                self.runtime.start({**self.session, "confirmed": True})
                if accepted:
                    result = self.sample(gripper=outside)
                    self.assertEqual(result["status"], "running")
                    self.assertIn(result["gripper"]["preview_ratio"], (0.0, 1.0))
                    self.assertEqual(self.arms[0].cleanups, 0)
                else:
                    with self.assertRaisesRegex(DomainError, "夹爪超出"):
                        self.sample(gripper=outside)
                    self.assertEqual(self.arms[0].commands, [])
                    self.assertEqual(self.arms[0].gripper_commands, [])
                    self.assertEqual(self.arms[0].cleanups, 1)

    def test_stop_during_axis_write_prevents_late_gripper_write(self):
        self.running()
        entered, release = threading.Event(), threading.Event()
        original = self.arms[0].set_joint_raw
        errors = []

        def blocked_write(*args):
            original(*args)
            entered.set()
            release.wait(2)

        self.arms[0].set_joint_raw = blocked_write

        def submit():
            try:
                self.sample([1] * 6, gripper=30)
            except DomainError as error:
                errors.append(error)

        worker = threading.Thread(target=submit)
        worker.start()
        self.assertTrue(entered.wait(1))
        stopper = threading.Thread(target=lambda: self.runtime.stop(self.session))
        stopper.start()
        deadline = time.monotonic() + 1
        while self.runtime.snapshot()["session_id"] is not None and time.monotonic() < deadline:
            time.sleep(0.001)
        self.assertIsNone(self.runtime.snapshot()["session_id"])
        self.assertTrue(stopper.is_alive())
        release.set()
        worker.join(1)
        stopper.join(1)
        self.assertFalse(worker.is_alive() or stopper.is_alive())
        self.assertEqual(errors[0].code, "lumos_stale_session")
        self.assertEqual(len(self.arms[0].commands), 1)
        self.assertEqual(self.arms[0].gripper_commands, [])
        self.assertEqual(self.arms[0].cleanups, 1)

    def test_gripper_feedback_age_is_rechecked_after_axis_write(self):
        self.running()
        self.arms[0].gripper.feedback_age_ms = 490
        original = self.arms[0].set_joint_raw

        def slower_axis_write(*args):
            original(*args)
            self.clock.advance(0.02)

        self.arms[0].set_joint_raw = slower_axis_write
        with self.assertRaisesRegex(DomainError, "夹爪反馈超过"):
            self.sample([1] * 6, gripper=30)
        self.assertEqual(len(self.arms[0].commands), 1)
        self.assertEqual(self.arms[0].gripper_commands, [])
        self.assertEqual(self.arms[0].cleanups, 1)

    def test_initial_gripper_readiness_wait_is_bounded_and_sends_no_motion(self):
        arm = Arm()
        runtime = LumosRuntime(arm_factory=lambda **kwargs: arm, start_watchdog=False)
        runtime._uses_real_factory = True
        arm.gripper.feedback_valid = False
        reads = []

        def read():
            reads.append(1)
            if len(reads) == 3:
                arm.gripper.feedback_valid = True
            return arm.gripper

        arm.get_gripper_state = read
        try:
            with patch("ai_service.lumos_runtime.time.sleep") as sleep:
                self.assertEqual(runtime.connect(self.connect_body)["status"], "connected")
                self.assertEqual(sleep.call_count, 2)
            self.assertEqual(arm.commands, [])
            self.assertEqual(arm.gripper_commands, [])
        finally:
            runtime.close()

        arm = Arm()
        arm.gripper.feedback_valid = False
        arm.gripper.error_code = 8
        runtime = LumosRuntime(arm_factory=lambda **kwargs: arm, start_watchdog=False)
        runtime._uses_real_factory = True
        try:
            with patch("ai_service.lumos_runtime.time.sleep") as sleep:
                with self.assertRaisesRegex(DomainError, "报告故障"):
                    runtime.connect(self.connect_body)
                sleep.assert_not_called()
            self.assertEqual(arm.cleanups, 1)
        finally:
            runtime.close()

    def test_stale_faulted_or_disabled_gripper_stops_all_motion(self):
        for name, value in (("feedback_valid", False), ("feedback_age_ms", 501),
                            ("feedback_age_ms", -1), ("feedback_age_ms", float("nan")),
                            ("enabled", False), ("error_code", 8),
                            ("position", 1.01), ("position", float("nan"))):
            with self.subTest(name=name, value=value):
                self.runtime.close()
                self.setUp()
                self.running()
                setattr(self.arms[0].gripper, name, value)
                with self.assertRaises(DomainError):
                    self.sample([1] * 6, gripper=30)
                self.assertEqual(self.arms[0].commands, [])
                self.assertEqual(self.arms[0].gripper_commands, [])
                self.assertEqual(self.arms[0].cleanups, 1)

    def test_old_sdk_without_gripper_state_is_rejected_and_cleaned(self):
        arm = Arm()
        arm.get_gripper_state = None
        runtime = LumosRuntime(arm_factory=lambda **kwargs: arm, start_watchdog=False)
        try:
            with self.assertRaisesRegex(DomainError, "get_gripper_state"):
                runtime.connect(self.connect_body)
            self.assertEqual(arm.cleanups, 1)
            self.assertEqual(arm.commands, [])
            self.assertEqual(arm.gripper_commands, [])
        finally:
            runtime.close()

    def test_gripper_command_failure_cleans_entire_session(self):
        self.running()
        self.arms[0].gripper_error = OSError("gripper write failed")
        with self.assertRaisesRegex(DomainError, "gripper write failed"):
            self.sample([1] * 6, gripper=30)
        self.assertEqual(self.arms[0].cleanups, 1)
        self.assertIsNone(self.runtime.snapshot()["session_id"])
        count = len(self.arms[0].commands)
        with self.assertRaises(DomainError):
            self.sample()
        self.assertEqual(len(self.arms[0].commands), count)

    def test_gripper_cache_age_increases_without_polling_or_lease_extension(self):
        self.connect()
        self.assertTrue(self.runtime.snapshot()["gripper"]["feedback_valid"])
        reads = self.arms[0].reads
        self.clock.advance(0.6)
        result = self.runtime.snapshot()
        self.assertFalse(result["gripper"]["feedback_valid"])
        self.assertGreaterEqual(result["gripper"]["feedback_age_ms"], 599.9)
        self.assertEqual(self.arms[0].reads, reads)
        self.runtime.stop(self.session)
        self.assertFalse(self.runtime.snapshot()["gripper"]["feedback_valid"])

    def test_close_waits_for_pending_constructor_and_cleans_before_return(self):
        entered, release = threading.Event(), threading.Event()
        arm = Arm()
        failures = []

        def factory(**kwargs):
            entered.set()
            release.wait(2)
            return arm

        runtime = LumosRuntime(arm_factory=factory, start_watchdog=False)

        def connect():
            try:
                runtime.connect(self.connect_body)
            except DomainError as error:
                failures.append(error)

        connector = threading.Thread(target=connect)
        connector.start()
        self.assertTrue(entered.wait(1))
        closer = threading.Thread(target=runtime.close)
        closer.start()
        deadline = time.monotonic() + 1
        while not runtime._closed and time.monotonic() < deadline:
            time.sleep(0.001)
        self.assertTrue(closer.is_alive())
        release.set()
        connector.join(1)
        closer.join(1)
        self.assertFalse(connector.is_alive() or closer.is_alive())
        self.assertEqual(arm.cleanups, 1)
        self.assertEqual(arm.reads, 0)
        self.assertTrue(failures)
        self.assertIsNone(runtime.snapshot()["session_id"])

    def test_partial_constructor_failure_blocks_reconnect(self):
        calls = []

        def factory(**kwargs):
            calls.append(kwargs)
            raise DomainError("constructor failed after enable", "lumos_sdk_construction_failed")

        runtime = LumosRuntime(arm_factory=factory, start_watchdog=False)
        try:
            with self.assertRaises(DomainError):
                runtime.connect(self.connect_body)
            with self.assertRaisesRegex(DomainError, "未返回可关闭对象"):
                runtime.connect(self.connect_body)
            self.assertEqual(len(calls), 1)
            self.assertTrue(runtime.snapshot()["cleanup_failed"])
        finally:
            runtime.close()

    def test_emergency_stop_revokes_running_session_but_allows_new_connection(self):
        self.running()
        previous = dict(self.session)
        stopped = self.runtime.emergency_stop()
        self.assertEqual(stopped["status"], "stopped")
        self.assertEqual(self.arms[0].cleanups, 1)
        self.assertIsNone(stopped["session_id"])
        self.connect()
        with self.assertRaises(DomainError):
            self.runtime.stop(previous)
        self.assertEqual(self.runtime.snapshot()["status"], "connected")

    def test_emergency_stop_discards_and_cleans_late_constructor(self):
        entered, release = threading.Event(), threading.Event()
        arms, errors = [], []

        def factory(**kwargs):
            arm = Arm()
            arms.append(arm)
            if len(arms) == 1:
                entered.set()
                release.wait(2)
            return arm

        runtime = LumosRuntime(arm_factory=factory, start_watchdog=False)

        def connect():
            try:
                runtime.connect(self.connect_body)
            except DomainError as error:
                errors.append(error)

        try:
            connector = threading.Thread(target=connect)
            connector.start()
            self.assertTrue(entered.wait(1))
            pending = runtime.emergency_stop()
            self.assertTrue(pending["cleanup_pending"])
            self.assertIsNone(pending["session_id"])
            release.set()
            connector.join(1)
            self.assertFalse(connector.is_alive())
            self.assertEqual(errors[0].code, "lumos_connection_cancelled")
            self.assertEqual(arms[0].cleanups, 1)
            self.assertEqual(arms[0].reads, 0)
            self.assertFalse(runtime.snapshot()["cleanup_pending"])
            self.assertEqual(runtime.connect(self.connect_body)["status"], "connected")
            self.assertEqual(len(arms), 2)
        finally:
            release.set()
            runtime.close()


class LumosHelpersTests(unittest.TestCase):
    def test_sdk_gripper_metadata_is_read_without_constructing_hardware(self):
        fake_yaml = SimpleNamespace(safe_load=lambda text: {"gripper_control": {"type": text}})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "src" / "config" / "robot_kinematics.yaml"
            config.parent.mkdir(parents=True)
            for gripper_type in ("TypeFZ", "TypeLJ", "TypeNex"):
                config.write_text(gripper_type, encoding="utf-8")
                with patch("ai_service.lumos_runtime.importlib.import_module", return_value=fake_yaml) as imported:
                    self.assertEqual(read_sdk_gripper_type(root), gripper_type)
                    imported.assert_called_once_with("yaml")
                    runtime = LumosRuntime(sdk_root=root, start_watchdog=False)
                    try:
                        self.assertEqual(runtime.snapshot()["gripper_type"], gripper_type)
                        self.assertEqual(runtime.snapshot()["status"], "idle")
                        self.assertIsNone(runtime.snapshot()["session_id"])
                        self.assertTrue(all(call.args == ("yaml",) for call in imported.call_args_list))
                    finally:
                        runtime.close()
            config.write_text("Unknown", encoding="utf-8")
            with patch("ai_service.lumos_runtime.importlib.import_module", return_value=fake_yaml):
                with self.assertRaisesRegex(DomainError, "gripper_control.type"):
                    read_sdk_gripper_type(root)

    def test_limits_use_elapsed_time_and_bound_long_gaps(self):
        for hz in (25, 50, 100):
            position = [0.0] * 6
            for _ in range(hz):
                position = limit_target(position, [math.pi] * 6, 1.0 / hz)
            self.assertAlmostEqual(math.degrees(position[0]), 50)
        self.assertAlmostEqual(math.degrees(limit_target([0] * 6, [1] * 6, 1)[0]), 2)

    def test_adaptive_filter_reduces_stationary_noise(self):
        filt = JointFilter()
        filt.update([0] * 6, 0.02)
        values = []
        for index in range(100):
            value = filt.update([0.1 if index % 2 else -0.1] * 6, 0.02)[0]
            if index >= 50:
                values.append(value)
        self.assertLess(math.sqrt(sum(value ** 2 for value in values) / len(values)), 0.04)

    def test_sdk_location_env_and_cwd_restoration_after_failure(self):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "src" / "config" / "robot_kinematics.yaml"
            config.parent.mkdir(parents=True)
            config.write_text("test: true", encoding="utf-8")
            with patch.dict("os.environ", {"STAR_ARM_LUMOS_SDK_ROOT": str(root)}):
                self.assertEqual(find_sdk_root(), root.resolve())
            with self.assertRaisesRegex(RuntimeError, "construction failed"):
                with sdk_initialization_directory(root):
                    self.assertTrue(Path.cwd().samefile(root))
                    raise RuntimeError("construction failed")
            self.assertTrue(Path.cwd().samefile(original))

    def test_real_factory_rejects_windows_before_importing_or_constructing(self):
        with patch("ai_service.lumos_runtime.sys.platform", "win32"), \
                patch("ai_service.lumos_runtime.importlib.import_module") as import_sdk:
            with self.assertRaisesRegex(DomainError, "Ubuntu"):
                create_lumos_arm(can_interface="can0")
            import_sdk.assert_not_called()

    def test_real_factory_requires_readable_1mbps_can_before_sdk_import(self):
        valid = {"ifname": "can0", "linkinfo": {"info_kind": "can",
                 "info_data": {"bittiming": {"bitrate": 1000000}}}}
        cases = [
            "not-json", "null", "[]", "[null]",
            json.dumps([{**valid, "ifname": "can1"}]),
            json.dumps([{"ifname": "can0", "linkinfo": {"info_kind": "can",
                        "info_data": {"bittiming": {"bitrate": 500000}}}}]),
            json.dumps([{"ifname": "can0", "linkinfo": {"info_kind": "can",
                        "info_data": {"bittiming": {"bitrate": "1000000"}}}}]),
        ]
        for output in cases:
            with self.subTest(output=output), \
                    patch("ai_service.lumos_runtime.sys.platform", "linux"), \
                    patch("ai_service.lumos_runtime.Path.read_text", side_effect=["280", "0x1"]), \
                    patch("ai_service.lumos_runtime.subprocess.run", return_value=SimpleNamespace(stdout=output)), \
                    patch("ai_service.lumos_runtime.importlib.import_module") as import_sdk:
                with self.assertRaises(DomainError):
                    create_lumos_arm(can_interface="can0")
                import_sdk.assert_not_called()
        with patch("ai_service.lumos_runtime.sys.platform", "linux"), \
                patch("ai_service.lumos_runtime.Path.read_text", side_effect=["280", "0x1"]), \
                patch("ai_service.lumos_runtime.subprocess.run", side_effect=FileNotFoundError("ip")), \
                patch("ai_service.lumos_runtime.importlib.import_module") as import_sdk:
            with self.assertRaisesRegex(DomainError, "iproute2"):
                create_lumos_arm(can_interface="can0")
            import_sdk.assert_not_called()

    def test_real_factory_restores_sdk_directory_on_partial_constructor_failure(self):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "src" / "config" / "robot_kinematics.yaml"
            config.parent.mkdir(parents=True)
            config.write_text("test: true")

            def constructor(**kwargs):
                self.assertTrue(Path.cwd().samefile(root))
                self.assertTrue(kwargs["gripper"])
                self.assertEqual(os.environ["STARTOUCH_GRIPPER_STARTUP_CLOSE"], "0")
                raise RuntimeError("native constructor failed")

            output = json.dumps([{"ifname": "can0", "linkinfo": {"info_kind": "can",
                                 "info_data": {"bittiming": {"bitrate": 1000000}}}}])
            with patch("ai_service.lumos_runtime.sys.platform", "linux"), \
                    patch("ai_service.lumos_runtime.Path.read_text", side_effect=["280", "0x1"]), \
                    patch("ai_service.lumos_runtime.read_sdk_gripper_type", return_value="TypeFZ"), \
                    patch("ai_service.lumos_runtime.subprocess.run", return_value=SimpleNamespace(stdout=output)), \
                    patch("ai_service.lumos_runtime.importlib.import_module",
                          return_value=SimpleNamespace(SingleArm=constructor)):
                with self.assertRaisesRegex(DomainError, "可能已使能"):
                    create_lumos_arm(can_interface="can0", sdk_root=root)
            self.assertTrue(Path.cwd().samefile(original))


if __name__ == "__main__":
    unittest.main()
