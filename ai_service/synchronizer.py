from collections import deque


class SampleSynchronizer:
    def __init__(self, tolerance_ms=16, buffer_limit=180):
        self.tolerance_ms = int(tolerance_ms)
        self.states = deque(maxlen=buffer_limit)
        self.actions = deque(maxlen=buffer_limit)
        self.matched = 0
        self.dropped = 0

    @staticmethod
    def _validate_joints(values):
        if not isinstance(values, (list, tuple)) or len(values) != 7:
            raise ValueError("机械臂样本必须包含 J1-J7 七个值")
        return [float(value) for value in values]

    def push_state(self, timestamp_ms, joints):
        sample = (int(timestamp_ms), self._validate_joints(joints))
        self.states.append(sample)

    def push_action(self, timestamp_ms, joints):
        sample = (int(timestamp_ms), self._validate_joints(joints))
        self.actions.append(sample)

    @staticmethod
    def _nearest(buffer, timestamp_ms):
        return min(buffer, key=lambda item: abs(item[0] - timestamp_ms), default=None)

    def match_frame_pair(self, timestamp_ms, images):
        timestamp_ms = int(timestamp_ms)
        state = self._nearest(self.states, timestamp_ms)
        action = self._nearest(self.actions, timestamp_ms)
        if (not state or not action or abs(state[0] - timestamp_ms) > self.tolerance_ms
                or abs(action[0] - timestamp_ms) > self.tolerance_ms):
            self.dropped += 1
            return None
        self.matched += 1
        return {
            "timestamp_ms": timestamp_ms,
            "observation_images": dict(images),
            "observation_state": list(state[1]),
            "action": list(action[1]),
            "state_offset_ms": state[0] - timestamp_ms,
            "action_offset_ms": action[0] - timestamp_ms,
        }

    def stats(self):
        total = self.matched + self.dropped
        return {"matched": self.matched, "dropped": self.dropped,
                "mismatch_rate": 0.0 if total == 0 else self.dropped / total}

    def buffer_sizes(self):
        return {"states": len(self.states), "actions": len(self.actions)}
