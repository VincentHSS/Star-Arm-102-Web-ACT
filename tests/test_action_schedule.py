import math
import unittest

from ai_service.action_schedule import ActionSchedule


class ActionScheduleTests(unittest.TestCase):
    def test_late_prediction_keeps_time_alignment_instead_of_replaying_first_step(self):
        schedule = ActionSchedule()
        schedule.add(3, [[float(i)] * 7 for i in range(10)], next_tick=7)
        self.assertEqual(schedule.action(7)[0], [4.0] * 7)
        self.assertEqual(schedule.remaining(7), 6)

    def test_overlapping_chunks_use_act_exponential_weights(self):
        schedule = ActionSchedule(0.01)
        schedule.add(0, [[10.0] * 7] * 10, 0)
        schedule.add(2, [[20.0] * 7] * 10, 2)
        action, count = schedule.action(3)
        expected = (10 + 20 * math.exp(-0.01)) / (1 + math.exp(-0.01))
        self.assertEqual(count, 2)
        self.assertAlmostEqual(action[0], expected)
        self.assertEqual(schedule.action(10), ([20.0] * 7, 1))
        self.assertEqual(schedule.action(12), (None, 0))

    def test_fully_expired_result_is_rejected(self):
        schedule = ActionSchedule()
        self.assertFalse(schedule.add(0, [[1.0] * 7] * 3, 3))
        self.assertEqual(schedule.action(3), (None, 0))

    def test_invalid_chunk_does_not_replace_existing_valid_predictions(self):
        schedule = ActionSchedule()
        schedule.add(0, [[1.0] * 7] * 3, 0)
        for bad in ([], [[1.0] * 6], [[float("nan")] * 7], [[float("inf")] * 7]):
            with self.assertRaises(ValueError):
                schedule.add(1, bad, 1)
        self.assertEqual(schedule.action(1), ([1.0] * 7, 1))

    def test_long_run_prunes_expired_chunks(self):
        schedule = ActionSchedule()
        for tick in range(1000):
            schedule.add(tick, [[1.0] * 7] * 10, tick)
            schedule.action(tick)
        self.assertLessEqual(len(schedule.chunks), 10)
