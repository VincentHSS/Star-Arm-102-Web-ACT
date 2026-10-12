import threading
import time
import unittest

from ai_service.domain import DomainError
from ai_service.teleop_runtime import EpisodeTeleopRuntime, MovingAverage


class FakeSerialConnections:
    def __init__(self):
        self.leader_reads = [[float(i) for i in range(7)], [float(i + 2) for i in range(7)]]
        self.follower_reads = [[float(i + 0.25) for i in range(7)], [float(i + 1.25) for i in range(7)]]
        self.writes = []

    def require_roles(self):
        return None

    def read_angles(self, role):
        values = self.leader_reads if role == "leader" else self.follower_reads
        return list(values.pop(0) if len(values) > 1 else values[0])

    def write_follower_angles(self, angles, interval_ms=100):
        self.writes.append((list(angles), interval_ms))


class FakeTelemetry:
    def __init__(self):
        self.samples = []

    def publish_sample(self, sample):
        self.samples.append(sample)
        return sample


class EpisodeTeleopRuntimeTests(unittest.TestCase):
    def test_default_loop_runs_at_fastest_non_blocking_interval_and_persists_real_intervals(self):
        serial = FakeSerialConnections()
        telemetry = FakeTelemetry()
        persisted = []
        runtime = EpisodeTeleopRuntime(serial, telemetry, filter_window=1, sample_sink=persisted.append)
        self.assertEqual(runtime.loop_interval_ms, 0)
        wait_calls = []
        original_wait = runtime._stop.wait

        def observed_wait(timeout=None):
            wait_calls.append(timeout)
            return original_wait(timeout)

        runtime._stop.wait = observed_wait
        ready = threading.Event()
        runtime._after_sample = lambda: ready.set() if len(persisted) >= 2 else None
        runtime.start("episode-fast")
        self.assertTrue(ready.wait(0.5))
        runtime.stop()

        self.assertEqual(wait_calls, [])
        self.assertGreaterEqual(len(persisted), 2)
        self.assertIsNone(persisted[0]["interval_ms"])
        self.assertGreater(persisted[1]["interval_ms"], 0)
        self.assertEqual(persisted[:2], telemetry.samples[:2])

    def test_filter_uses_real_window_and_validates_j1_j7(self):
        moving = MovingAverage(2)
        self.assertEqual(moving.push([0, 1, 2, 3, 4, 5, 6]), [0, 1, 2, 3, 4, 5, 6])
        self.assertEqual(moving.push([2, 3, 4, 5, 6, 7, 8]), [1, 2, 3, 4, 5, 6, 7])
        with self.assertRaisesRegex(DomainError, "J1-J7"):
            moving.push([1, 2])

    def test_start_preflights_both_arms_then_writes_and_publishes_real_sample(self):
        serial = FakeSerialConnections()
        telemetry = FakeTelemetry()
        runtime = EpisodeTeleopRuntime(serial, telemetry, loop_interval_ms=1, filter_window=2)
        ready = threading.Event()
        runtime._after_sample = ready.set

        snapshot = runtime.start("episode-1")
        self.assertEqual(snapshot["status"], "running")
        self.assertTrue(ready.wait(0.5))
        stopped = runtime.stop()

        self.assertGreaterEqual(stopped["samples"], 1)
        self.assertTrue(serial.writes)
        self.assertEqual(serial.writes[0][1], 100)
        self.assertTrue(telemetry.samples)
        sample = telemetry.samples[0]
        self.assertEqual(len(sample["action"]), 7)
        self.assertEqual(len(sample["observation_state"]), 7)
        self.assertEqual(sample["episode_id"], "episode-1")

    def test_stop_drains_loop_and_prevents_later_follower_writes(self):
        serial = FakeSerialConnections()
        runtime = EpisodeTeleopRuntime(serial, FakeTelemetry(), loop_interval_ms=1, filter_window=1)
        ready = threading.Event()
        runtime._after_sample = ready.set
        runtime.start("episode-2")
        self.assertTrue(ready.wait(0.5))
        runtime.stop()
        writes = len(serial.writes)
        time.sleep(0.03)
        self.assertEqual(len(serial.writes), writes)
        self.assertEqual(runtime.snapshot()["status"], "idle")


if __name__ == "__main__":
    unittest.main()
