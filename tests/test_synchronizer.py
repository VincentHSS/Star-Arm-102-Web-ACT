import unittest

from ai_service.synchronizer import SampleSynchronizer


class SampleSynchronizerTests(unittest.TestCase):
    def test_matches_nearest_state_and_action_within_sixteen_milliseconds(self):
        sync = SampleSynchronizer(tolerance_ms=16)
        sync.push_state(990, [1] * 7)
        sync.push_state(1008, [2] * 7)
        sync.push_action(995, [3] * 7)
        sync.push_action(1012, [4] * 7)
        sample = sync.match_frame_pair(1000, {"wrist": "w0", "world": "g0"})
        self.assertEqual(sample["observation_state"], [2] * 7)
        self.assertEqual(sample["action"], [3] * 7)
        self.assertEqual(sample["timestamp_ms"], 1000)

    def test_drops_pair_when_either_robot_sample_exceeds_tolerance(self):
        sync = SampleSynchronizer(tolerance_ms=16)
        sync.push_state(1000, [1] * 7)
        sync.push_action(1020, [2] * 7)
        self.assertIsNone(sync.match_frame_pair(1000, {"wrist": "w0", "world": "g0"}))
        self.assertEqual(sync.stats(), {"matched": 0, "dropped": 1, "mismatch_rate": 1.0})

    def test_rejects_wrong_joint_shape_without_polluting_buffers(self):
        sync = SampleSynchronizer()
        with self.assertRaisesRegex(ValueError, "J1-J7"):
            sync.push_state(10, [1] * 6)
        self.assertEqual(sync.buffer_sizes(), {"states": 0, "actions": 0})


if __name__ == "__main__":
    unittest.main()
