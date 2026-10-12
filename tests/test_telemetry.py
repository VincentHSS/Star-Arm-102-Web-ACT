import unittest

from ai_service.telemetry import TelemetryHub


def sample(timestamp_ms=1000, value=0.0):
    return {
        "timestamp_ms": timestamp_ms,
        "observation_state": [value + index for index in range(7)],
        "action": [value + index + 0.5 for index in range(7)],
        "state_offset_ms": -3,
        "action_offset_ms": 4,
    }


class TelemetryHubTests(unittest.TestCase):
    def test_publish_validates_and_delivers_real_sample(self):
        hub = TelemetryHub(history_limit=3)
        subscription = hub.subscribe()

        published = hub.publish_sample(sample())

        self.assertEqual(published["observation_state"], [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
        self.assertEqual(subscription.next(timeout=0.1), published)
        self.assertEqual(hub.snapshot()["latest"], published)
        self.assertEqual(hub.snapshot()["published"], 1)

    def test_rejects_samples_without_exactly_seven_joints(self):
        hub = TelemetryHub()
        invalid = sample()
        invalid["action"] = [1, 2]

        with self.assertRaisesRegex(ValueError, "J1-J7"):
            hub.publish_sample(invalid)

        self.assertEqual(hub.snapshot()["published"], 0)
        self.assertIsNone(hub.snapshot()["latest"])

    def test_history_and_slow_subscriber_are_bounded(self):
        hub = TelemetryHub(history_limit=2, subscriber_limit=2)
        subscription = hub.subscribe()

        for index in range(4):
            hub.publish_sample(sample(1000 + index, float(index)))

        snapshot = hub.snapshot()
        self.assertEqual([item["timestamp_ms"] for item in snapshot["history"]], [1002, 1003])
        self.assertEqual(subscription.next(timeout=0.1)["timestamp_ms"], 1002)
        self.assertEqual(subscription.next(timeout=0.1)["timestamp_ms"], 1003)

    def test_close_unsubscribes_and_no_samples_are_generated_automatically(self):
        hub = TelemetryHub()
        subscription = hub.subscribe()

        self.assertEqual(hub.snapshot()["subscriber_count"], 1)
        self.assertIsNone(subscription.next(timeout=0.01))

        subscription.close()
        self.assertEqual(hub.snapshot()["subscriber_count"], 0)
        hub.publish_sample(sample())
        self.assertIsNone(subscription.next(timeout=0.01))


if __name__ == "__main__":
    unittest.main()
