import math
import threading
import time

from .domain import DomainError


class MovingAverage:
    def __init__(self, window_size):
        if not isinstance(window_size, int) or not 0 <= window_size <= 100:
            raise ValueError("滤波窗口必须是 0-100 的整数")
        self.window_size = window_size
        self.samples = []

    def push(self, angles):
        values = [float(value) for value in angles]
        if len(values) != 7 or not all(math.isfinite(value) for value in values):
            raise DomainError("机械臂样本必须包含 J1-J7 七个有效角度", "invalid_joint_sample")
        if self.window_size == 0:
            return values
        self.samples.append(values)
        del self.samples[:-self.window_size]
        return [sum(sample[index] for sample in self.samples) / len(self.samples) for index in range(7)]


class EpisodeTeleopRuntime:
    def __init__(self, serial_connections, telemetry, loop_interval_ms=0, filter_window=30, sample_sink=None):
        self.serial_connections = serial_connections
        self.telemetry = telemetry
        self.loop_interval_ms = loop_interval_ms
        self.filter_window = filter_window
        self.sample_sink = sample_sink or (lambda sample: None)
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._thread = None
        self._episode_id = None
        self._samples = 0
        self._error = None
        self._after_sample = lambda: None

    def snapshot(self):
        with self._lock:
            return {
                "status": "running" if self._thread and self._thread.is_alive() and not self._error else "fault" if self._error else "idle",
                "episode_id": self._episode_id,
                "samples": self._samples,
                "error": str(self._error) if self._error else None,
            }

    def start(self, episode_id):
        with self._lock:
            if self._thread and self._thread.is_alive():
                raise DomainError("Episode 控制循环已在运行", "teleop_active")
            self.serial_connections.require_roles()
            leader = self.serial_connections.read_angles("leader")
            follower = self.serial_connections.read_angles("follower")
            MovingAverage(1).push(leader)
            MovingAverage(1).push(follower)
            self._episode_id = episode_id
            self._samples = 0
            self._error = None
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name=f"episode-{episode_id}", daemon=True)
            self._thread.start()
            return self.snapshot()

    def stop(self):
        with self._lock:
            thread = self._thread
            self._stop.set()
        if thread and thread is not threading.current_thread():
            thread.join(timeout=3)
            if thread.is_alive():
                raise DomainError("Episode 控制循环未能停止", "teleop_stop_timeout")
        with self._lock:
            result = {
                "status": "fault" if self._error else "idle",
                "episode_id": self._episode_id,
                "samples": self._samples,
                "error": str(self._error) if self._error else None,
            }
            self._thread = None
            self._episode_id = None
            return result

    def _run(self):
        moving = MovingAverage(self.filter_window)
        interval_seconds = self.loop_interval_ms / 1000.0
        previous_sample_time = None
        while not self._stop.is_set():
            cycle_start = time.monotonic()
            try:
                leader_time = time.time_ns() / 1_000_000
                leader = moving.push(self.serial_connections.read_angles("leader"))
                self.serial_connections.write_follower_angles(leader, interval_ms=100)
                follower_time = time.time_ns() / 1_000_000
                follower = self.serial_connections.read_angles("follower")
                sample_time = time.time_ns() / 1_000_000
                sample_clock = time.perf_counter_ns() / 1_000_000
                sample = {
                    "episode_id": self._episode_id,
                    "timestamp_ms": sample_time,
                    "interval_ms": None if previous_sample_time is None else sample_clock - previous_sample_time,
                    "observation_state": follower,
                    "action": leader,
                    "state_offset_ms": follower_time - sample_time,
                    "action_offset_ms": leader_time - sample_time,
                }
                self.sample_sink(sample)
                self.telemetry.publish_sample(sample)
                previous_sample_time = sample_clock
                with self._lock:
                    self._samples += 1
                self._after_sample()
            except Exception as error:
                with self._lock:
                    self._error = error
                self._stop.set()
                break
            elapsed = time.monotonic() - cycle_start
            if interval_seconds > 0:
                self._stop.wait(max(0.0, interval_seconds - elapsed))
