"""Time-indexed ACT chunks. No robot I/O or policy dependencies."""
import math


class ActionSchedule:
    def __init__(self, coefficient=0.01):
        self.coefficient = float(coefficient)
        if not math.isfinite(self.coefficient) or not 0 <= self.coefficient <= 1:
            raise ValueError("ACT 融合系数必须在 0 到 1 之间")
        self.chunks = []

    def add(self, start, actions, next_tick):
        if not isinstance(actions, (list, tuple)) or not actions:
            raise ValueError("ACT 动作块为空")
        validated = []
        for action in actions:
            if not isinstance(action, (list, tuple)) or len(action) != 7:
                raise ValueError("ACT Action 必须包含 J1-J7 七个值")
            values = [float(v) for v in action]
            if not all(math.isfinite(v) for v in values):
                raise ValueError("ACT Action 必须全部为有限值")
            validated.append(values)
        # Keep original time indices: a late result must not replay past actions.
        self.chunks = [(s, a) for s, a in self.chunks if s + len(a) > next_tick]
        if start + len(validated) <= next_tick:
            return False
        self.chunks.append((int(start), validated))
        return True

    def action(self, tick):
        self.chunks = [(s, a) for s, a in self.chunks if s + len(a) > tick]
        candidates = [a[tick - s] for s, a in self.chunks if s <= tick < s + len(a)]
        if not candidates:
            return None, 0
        # ACT weights older overlapping predictions more highly (exp(-k*i)).
        weights = [math.exp(-self.coefficient * i) for i in range(len(candidates))]
        total = sum(weights)
        return [sum(a[j] * w for a, w in zip(candidates, weights)) / total
                for j in range(7)], len(candidates)

    def remaining(self, tick):
        return max((s + len(a) - tick for s, a in self.chunks), default=0)
