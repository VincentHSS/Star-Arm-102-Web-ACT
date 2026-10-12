from collections import deque
from queue import Empty, Full, Queue
from threading import RLock


class TelemetrySubscription:
    def __init__(self, hub, queue):
        self._hub = hub
        self._queue = queue
        self._closed = False

    def next(self, timeout=None):
        if self._closed:
            return None
        try:
            return self._queue.get(timeout=timeout)
        except Empty:
            return None

    def close(self):
        if not self._closed:
            self._closed = True
            self._hub._unsubscribe(self._queue)


class TelemetryHub:
    def __init__(self, history_limit=600, subscriber_limit=60):
        self._lock = RLock()
        self._history = deque(maxlen=max(1, int(history_limit)))
        self._subscriber_limit = max(1, int(subscriber_limit))
        self._subscribers = set()
        self._published = 0

    @staticmethod
    def _joints(values):
        if not isinstance(values, (list, tuple)) or len(values) != 7:
            raise ValueError("遥测样本必须包含 J1-J7 七个值")
        return [float(value) for value in values]

    def publish_sample(self, sample):
        normalized = {
            "timestamp_ms": int(sample["timestamp_ms"]),
            "observation_state": self._joints(sample["observation_state"]),
            "action": self._joints(sample["action"]),
            "state_offset_ms": int(sample["state_offset_ms"]),
            "action_offset_ms": int(sample["action_offset_ms"]),
        }
        with self._lock:
            self._history.append(normalized)
            self._published += 1
            subscribers = tuple(self._subscribers)
        for queue in subscribers:
            try:
                queue.put_nowait(normalized)
            except Full:
                try:
                    queue.get_nowait()
                except Empty:
                    pass
                try:
                    queue.put_nowait(normalized)
                except Full:
                    pass
        return normalized

    def subscribe(self):
        queue = Queue(maxsize=self._subscriber_limit)
        with self._lock:
            self._subscribers.add(queue)
        return TelemetrySubscription(self, queue)

    def _unsubscribe(self, queue):
        with self._lock:
            self._subscribers.discard(queue)

    def snapshot(self):
        with self._lock:
            history = list(self._history)
            return {
                "latest": history[-1] if history else None,
                "history": history,
                "published": self._published,
                "subscriber_count": len(self._subscribers),
            }
