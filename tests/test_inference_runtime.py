import tempfile
import threading
import time
import unittest
import sys
from pathlib import Path

from ai_service.domain import DomainError
from ai_service.inference_runtime import ActInferenceRuntime, PolicyWorkerClient
from ai_service.telemetry import TelemetryHub


class Serial:
    def __init__(self):
        self.angles = [0, 10, 20, 30, 40, 50, 45]
        self.writes = []
        self.locks = 0
        self.releases = 0
        self.write_times = []

    def snapshot(self):
        return {"follower": {"connected": True, "port": "/dev/ttyUSB1"}}

    def read_follower_angles(self):
        return list(self.angles)

    def write_follower_angles(self, angles, interval_ms=100, power=0, t_acc=50, t_dec=50):
        self.write_times.append(time.perf_counter())
        self.writes.append((list(angles), interval_ms))
        self.angles = list(angles)

    def lock_follower_torque(self):
        self.locks += 1
        return {"locked": True}

    def release_follower_torque(self):
        self.releases += 1
        return {"released": True}


class StuckSerial(Serial):
    """Read-back stays constant regardless of commands.

    Simulates a damped arm whose servos never follow the commanded angle,
    so that commanded_delta > 0 but actual_move_deg ~ 0 (not responding).
    """
    def write_follower_angles(self, angles, interval_ms=100, power=0, t_acc=50, t_dec=50):
        self.writes.append((list(angles), interval_ms))
        # deliberately do NOT update self.angles -> arm never follows


class Cameras:
    def __init__(self):
        self.now = time.monotonic()
        self.frames = {
            "wrist": (1, b"\xff\xd8wrist\xff\xd9", self.now),
            "world": (1, b"\xff\xd8world\xff\xd9", self.now),
        }

    def snapshot(self):
        return {"status": "streaming", "backend": "native", "roles": {
            "wrist": {"mode": {"width": 640, "height": 480, "fps": 30}},
            "world": {"mode": {"width": 640, "height": 480, "fps": 30}},
        }}

    def latest_frame(self, role):
        sequence, jpeg, _created = self.frames[role]
        return sequence, jpeg, time.monotonic()


class Worker:
    def __init__(self, action=None, error=None):
        self.action = action or [10, 20, 30, 40, 50, 60, 70]
        self.error = error
        self.calls = []
        self.closed = 0

    def infer(self, observation, wrist_path, world_path, task):
        self.calls.append((list(observation), Path(wrist_path), Path(world_path), task))
        if self.error:
            raise RuntimeError(self.error)
        return list(self.action)

    def predict_chunk(self, observation, wrist_path, world_path, task):
        return [self.infer(observation, wrist_path, world_path, task)] * 100

    def close(self):
        self.closed += 1


class InferenceRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.serial = Serial()
        self.cameras = Cameras()
        self.telemetry = TelemetryHub()
        self.worker = Worker()
        self.runtime = ActInferenceRuntime(
            self.serial, self.cameras, self.telemetry, Path(self.tmp.name),
            worker_factory=lambda _python, _checkpoint: self.worker,
            interval_ms=10, max_delta_degrees=2,
        )
        self.model = {
            "id": "model-1", "checkpoint_path": "/models/model-1/pretrained_model",
            "tasks": ["抓取积木"], "execution_ready": True,
            "camera_contract": {"width": 640, "height": 480, "fps": 30,
                                "features": ["observation.images.wrist", "observation.images.world"]},
            "joint_limits": [[-90, 90], [-90, 90], [-90, 90], [-90, 90], [-90, 90], [-90, 90], [0, 90]],
        }
        self.environment = {"status": "ready", "python": "/runtime/bin/python", "backend": "cuda"}

    def tearDown(self):
        self.runtime.close()
        self.tmp.cleanup()

    def wait_for(self, predicate, timeout=1):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(0.01)
        self.fail("condition timed out")

    def test_real_cycle_reads_two_frames_observation_and_writes_rate_limited_action(self):
        started = self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertEqual(started["status"], "running")
        self.assertEqual(self.serial.locks, 1)
        self.wait_for(lambda: bool(self.serial.writes))
        self.runtime.stop("operator")

        action, interval_ms = self.serial.writes[0]
        self.assertEqual(action, [2, 12, 22, 32, 42, 52, 47])
        self.assertGreaterEqual(interval_ms, 30)
        self.assertEqual(self.worker.calls[0][0], [0, 10, 20, 30, 40, 50, 45])
        self.assertEqual(self.worker.calls[0][3], "抓取积木")
        self.assertTrue(self.worker.calls[0][1].is_file())
        self.assertTrue(self.worker.calls[0][2].is_file())
        latest = self.telemetry.snapshot()["latest"]
        self.assertEqual(latest["observation_state"], [0, 10, 20, 30, 40, 50, 45])
        self.assertEqual(latest["action"], action)
        snapshot = self.runtime.snapshot()
        self.assertEqual(snapshot["status"], "stopped")
        self.assertGreaterEqual(snapshot["metrics"]["executed_actions"], 1)
        self.assertEqual(self.serial.releases, 1)

        self.worker = Worker()
        restarted = self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertEqual(restarted["status"], "running")
        self.assertEqual(self.serial.locks, 2)
        self.runtime.stop("operator")
        self.assertEqual(self.serial.releases, 2)

    def test_drive_diagnostic_reports_following_when_arm_moves(self):
        started = self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertEqual(started["status"], "running")
        self.wait_for(lambda: (self.runtime.snapshot().get("metrics", {}).get("diagnostic") or {}).get("tracked_cycles", 0) >= 3)
        snapshot = self.runtime.snapshot()
        diag = snapshot["metrics"]["diagnostic"]
        self.assertEqual(snapshot["status"], "running")
        self.assertGreaterEqual(diag["commanded_delta_deg"], 1.0)
        self.assertGreaterEqual(diag["attempting_move_cycles"], 1)
        self.assertGreaterEqual(diag["responsive_cycles"], 1)
        self.runtime.stop("operator")

    def test_drive_diagnostic_reports_not_following_when_arm_stuck(self):
        self.serial = StuckSerial()
        self.runtime.serial = self.serial
        started = self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertEqual(started["status"], "running")
        self.wait_for(lambda: (self.runtime.snapshot().get("metrics", {}).get("diagnostic") or {}).get("attempting_move_cycles", 0) >= 2)
        snapshot = self.runtime.snapshot()
        diag = snapshot["metrics"]["diagnostic"]
        self.assertGreaterEqual(diag["commanded_delta_deg"], 1.0)
        self.assertGreaterEqual(diag["attempting_move_cycles"], 1)
        self.assertEqual(diag["responsive_cycles"], 0)
        self.runtime.stop("operator")

    def test_production_default_interval_allows_servo_to_reach_target(self):
        # The inference loop must command targets with an interval long enough for
        # the servo to actually settle (need cruise time: t_acc + t_dec < interval),
        # and a per-step slew generous enough to not artificially slow the policy.
        runtime = ActInferenceRuntime(
            self.serial, self.cameras, self.telemetry, Path(self.tmp.name),
            worker_factory=lambda _python, _checkpoint: self.worker)
        try:
            self.assertGreaterEqual(runtime.interval_ms, 30)
            self.assertLess(runtime.t_acc + runtime.t_dec, runtime.servo_motion_time_ms,
                            "必须留出巡航时间，否则舵机永远在加速、无法到位")
            self.assertGreaterEqual(runtime.max_delta_degrees, 15.0)
        finally:
            runtime.close()

    def test_policy_fault_stops_output_and_releases_torque(self):
        self.worker.error = "policy failed"
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        count = len(self.serial.writes)
        time.sleep(0.05)
        self.assertEqual(len(self.serial.writes), count)
        self.assertEqual(self.serial.releases, 1)
        self.assertIn("policy failed", self.runtime.snapshot()["error"])
        self.assertTrue(
            any("policy failed" in entry.get("message", "") for entry in self.runtime.snapshot()["logs"]),
            "故障日志必须带上真正的错误原因，而不是只有通用总结",
        )

    def test_start_gate_reports_missing_real_inputs(self):
        broken = dict(self.model, execution_ready=False, blockers=["缺少 J1-J6 安全限位"])
        with self.assertRaisesRegex(DomainError, "J1-J6"):
            self.runtime.start(broken, "抓取积木", self.environment)
        with self.assertRaisesRegex(DomainError, "任务"):
            self.runtime.start(self.model, "其他任务", self.environment)
        self.cameras.snapshot = lambda: {"status": "idle", "roles": {}}
        with self.assertRaisesRegex(DomainError, "双相机"):
            self.runtime.start(self.model, "抓取积木", self.environment)

    def test_validation_reports_native_camera_stream_fault(self):
        self.cameras.snapshot = lambda: {
            "status": "fault",
            "error": "Camera A 画面停止更新 43624 ms",
            "roles": {
                "wrist": {"mode": {"width": 640, "height": 480, "fps": 60}},
                "world": {"mode": {"width": 640, "height": 480, "fps": 60}},
            },
        }

        gate = self.runtime.validate(self.model, "抓取积木", self.environment)

        self.assertFalse(gate["ready"])
        self.assertIn("原生双相机故障：Camera A 画面停止更新 43624 ms，请重新连接双相机", gate["blockers"])

    def test_validation_allows_source_camera_fps_above_model_sampling_fps(self):
        self.cameras.snapshot = lambda: {"status": "streaming", "backend": "native", "roles": {
            "wrist": {"mode": {"width": 640, "height": 480, "fps": 60}},
            "world": {"mode": {"width": 640, "height": 480, "fps": 60}},
        }}

        gate = self.runtime.validate(self.model, "抓取积木", self.environment)

        self.assertTrue(gate["ready"])
        self.assertEqual(gate["blockers"], [])

    def test_validation_reports_actual_and_required_camera_dimensions(self):
        self.cameras.snapshot = lambda: {"status": "streaming", "backend": "native", "roles": {
            "wrist": {"mode": {"width": 1280, "height": 720, "fps": 30}},
            "world": {"mode": {"width": 640, "height": 480, "fps": 30}},
        }}

        gate = self.runtime.validate(self.model, "抓取积木", self.environment)

        self.assertFalse(gate["ready"])
        self.assertIn("wrist 相机分辨率 1280×720 与模型要求 640×480 不一致", gate["blockers"])
        self.assertFalse(any(item.startswith("world") for item in gate["blockers"]))

    def test_stop_invalidates_generation_before_release(self):
        entered = threading.Event()
        proceed = threading.Event()

        def blocked_infer(*_args):
            entered.set()
            proceed.wait(1)
            return [1] * 7

        self.worker.predict_chunk = lambda *args: [blocked_infer(*args)] * 100
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertTrue(entered.wait(1))
        stopper = threading.Thread(target=lambda: self.runtime.stop("operator"))
        stopper.start()
        time.sleep(0.03)
        proceed.set()
        stopper.join(1)
        self.assertFalse(self.serial.writes)
        self.assertEqual(self.serial.releases, 1)

    def test_slow_policy_does_not_block_control_ticks_and_chunks_overlap(self):
        original = self.worker.predict_chunk
        def slow_policy(*args):
            time.sleep(0.12)
            return original(*args)
        self.worker.predict_chunk = slow_policy
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 16, timeout=2)
        snapshot = self.runtime.snapshot()
        self.runtime.stop()
        gaps = [b - a for a, b in zip(self.serial.write_times, self.serial.write_times[1:])]
        # Old synchronous implementation would issue every command >120 ms apart.
        self.assertLess(max(gaps), 0.095)
        self.assertLess(sum(gaps) / len(gaps), 0.045)
        self.assertGreaterEqual(snapshot["metrics"]["predicted_chunks"], 3)
        self.assertGreaterEqual(snapshot["metrics"]["ensemble_predictions"], 2)
        self.assertEqual(snapshot["status"], "running")
        self.assertEqual(len(list(self.runtime.root.glob("*.jpg"))), 2)

    def test_default_uses_model_sampling_fps_and_short_servo_command(self):
        self.runtime.close()
        self.runtime = ActInferenceRuntime(self.serial, self.cameras, self.telemetry, self.tmp.name,
                                          worker_factory=lambda *_args: self.worker)
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: bool(self.serial.writes))
        self.assertAlmostEqual(self.runtime.snapshot()["metrics"]["target_hz"], 30)
        self.assertEqual(self.serial.writes[0][1], 350)
        self.assertEqual((self.runtime.t_acc, self.runtime.t_dec), (50, 50))
        self.runtime.stop()
        self.model["camera_contract"]["fps"] = 20
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertEqual(self.runtime.snapshot()["metrics"]["target_hz"], 20)

    def test_buffer_underflow_faults_without_replaying_stale_actions(self):
        calls = 0
        original = self.worker.predict_chunk
        def insufficient_chunk(*args):
            nonlocal calls
            calls += 1
            if calls > 1:
                time.sleep(0.2)
            return original(*args)[:2]
        self.worker.predict_chunk = insufficient_chunk
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        self.assertIn("缓冲耗尽", self.runtime.snapshot()["error"])
        self.assertLessEqual(len(self.serial.writes), 2)
        self.assertEqual(self.serial.releases, 1)

    def test_camera_staleness_stops_even_when_many_actions_are_buffered(self):
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 2)
        original = self.cameras.latest_frame
        self.cameras.latest_frame = lambda role: (*original(role)[:2], time.monotonic() - 2)
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        self.assertIn("过期", self.runtime.snapshot()["error"])
        count = len(self.serial.writes)
        time.sleep(0.05)
        self.assertEqual(len(self.serial.writes), count)
        self.assertEqual(self.serial.releases, 1)

    def test_serial_overrun_skips_missed_slots_without_bursting_backlog(self):
        calls = 0
        original = self.serial.read_follower_angles
        def slow_read():
            nonlocal calls
            calls += 1
            if calls == 5:
                time.sleep(0.1)
            return original()
        self.serial.read_follower_angles = slow_read
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 10)
        self.assertGreaterEqual(self.runtime.snapshot()["metrics"]["missed_ticks"], 2)
        self.runtime.stop()
        gaps = [b - a for a, b in zip(self.serial.write_times, self.serial.write_times[1:])]
        self.assertGreater(min(gaps), 0.01)

    def test_invalid_action_in_chunk_faults_before_any_command(self):
        self.worker.predict_chunk = lambda *_args: [[0.0] * 7, [float("nan")] * 7]
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        self.assertFalse(self.serial.writes)
        self.assertEqual(self.serial.releases, 1)

    def test_stop_releases_before_waiting_for_background_policy_and_prevents_late_write(self):
        entered = threading.Event()
        proceed = threading.Event()
        original = self.worker.predict_chunk
        calls = 0
        def blocked_chunk(*args):
            nonlocal calls
            calls += 1
            if calls > 1:
                entered.set()
                proceed.wait(1)
            return original(*args)
        self.worker.predict_chunk = blocked_chunk
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.assertTrue(entered.wait(1))
        stopper = threading.Thread(target=self.runtime.stop)
        stopper.start()
        self.wait_for(lambda: self.serial.releases == 1)
        count = len(self.serial.writes)
        proceed.set()
        stopper.join(1)
        time.sleep(0.05)
        self.assertEqual(len(self.serial.writes), count)
        self.assertEqual(self.serial.releases, 1)

    def test_worker_close_error_still_releases_and_reports_fault(self):
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 2)
        def broken_close():
            raise RuntimeError("close failed")
        self.worker.close = broken_close
        self.runtime.stop()
        self.assertEqual(self.serial.releases, 1)
        self.assertEqual(self.runtime.snapshot()["status"], "fault")
        self.assertIn("close failed", self.runtime.snapshot()["error"])

    def test_command_speed_is_bounded_in_degrees_per_second(self):
        self.runtime.max_delta_degrees = 15
        self.runtime.max_joint_speed_degrees_s = 30
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 3)
        self.runtime.stop()
        previous = [0, 10, 20, 30, 40, 50, 45]
        for action, _duration in self.serial.writes:
            self.assertLessEqual(max(abs(a - b) for a, b in zip(action, previous)), 0.900001)
            previous = action

    def test_stalled_predictor_faults_instead_of_running_buffer_indefinitely(self):
        self.runtime.max_policy_age_ms = 100
        calls = 0
        original = self.worker.predict_chunk
        def stalled(*args):
            nonlocal calls
            calls += 1
            if calls > 1:
                time.sleep(0.4)
            return original(*args)
        self.worker.predict_chunk = stalled
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        self.assertIn("预测已停滞", self.runtime.snapshot()["error"])
        self.assertEqual(self.serial.releases, 1)

    def test_sudden_readback_jump_faults_instead_of_violating_command_speed(self):
        self.runtime.start(self.model, "抓取积木", self.environment)
        self.wait_for(lambda: len(self.serial.writes) >= 2)
        self.serial.angles[0] = 80
        self.wait_for(lambda: self.runtime.snapshot()["status"] == "fault")
        self.assertIn("跟随偏差过大", self.runtime.snapshot()["error"])
        self.assertEqual(self.serial.releases, 1)


    def test_official_driver_is_initialized_before_lock_and_cleaned_after_stop(self):
        events=[]
        self.serial.begin_native_act=lambda: (events.append('begin') or {'version':'1.3.6'})
        self.serial.end_native_act=lambda: events.append('end')
        original_lock=self.serial.lock_follower_torque
        original_release=self.serial.release_follower_torque
        self.serial.lock_follower_torque=lambda: (events.append('lock') or original_lock())
        self.serial.release_follower_torque=lambda: (events.append('release') or original_release())
        self.runtime.start(self.model, '抓取积木', self.environment)
        self.runtime.stop()
        self.assertEqual(events,['begin','lock','release','end'])

    def test_policy_load_failure_releases_and_removes_official_driver(self):
        events=[]
        self.serial.begin_native_act=lambda: (events.append('begin') or {'version':'1.3.6'})
        self.serial.end_native_act=lambda: events.append('end')
        self.runtime.worker_factory=lambda *_: (_ for _ in ()).throw(RuntimeError('checkpoint failed'))
        with self.assertRaisesRegex(DomainError,'checkpoint failed'):
            self.runtime.start(self.model, '抓取积木', self.environment)
        self.assertEqual(self.serial.releases,1)
        self.assertEqual(events,['begin','end'])


class PolicyWorkerClientTests(unittest.TestCase):
    def _script(self, source):
        directory = tempfile.TemporaryDirectory()
        path = Path(directory.name) / "worker.py"
        path.write_text(source, encoding="utf-8")
        self.addCleanup(directory.cleanup)
        return path

    def test_startup_ignores_non_json_diagnostics_before_ready_message(self):
        script = self._script(
            "import json\n"
            "print('Loading checkpoint shards: 100%', flush=True)\n"
            "print(json.dumps({'status': 'ready'}), flush=True)\n"
            "for _line in __import__('sys').stdin: pass\n"
        )

        worker = PolicyWorkerClient(
            sys.executable, "/tmp/checkpoint", worker_path=script, startup_timeout=2
        )
        self.addCleanup(worker.close)

        self.assertIsNone(worker._process.poll())

    def test_startup_exit_reports_worker_diagnostic_not_json_decode_error(self):
        script = self._script("print('checkpoint config is empty', flush=True)\n")

        with self.assertRaisesRegex(
            RuntimeError, "ACT Policy worker 启动失败.*checkpoint config is empty"
        ) as raised:
            PolicyWorkerClient(
                sys.executable, "/tmp/checkpoint", worker_path=script, startup_timeout=2
            )

        self.assertNotIn("Expecting value", str(raised.exception))

    def test_chunk_protocol_transports_all_actions(self):
        script = self._script(
            "import json,sys\n"
            "print(json.dumps({'status':'ready','protocol':'act-chunk-v1','chunk_size':3}),flush=True)\n"
            "for line in sys.stdin:\n"
            " r=json.loads(line)\n"
            " assert r['command']=='predict_chunk'\n"
            " print(json.dumps({'actions': [[i]*7 for i in range(3)]}),flush=True)\n"
        )
        worker = PolicyWorkerClient(sys.executable, "/checkpoint", worker_path=script, startup_timeout=2)
        self.addCleanup(worker.close)
        self.assertEqual(worker.predict_chunk([0] * 7, "w.jpg", "g.jpg", "task"), [[i] * 7 for i in range(3)])

    def test_verbose_stderr_cannot_fill_pipe_and_block_prediction(self):
        script = self._script(
            "import json,sys\n"
            "print(json.dumps({'status':'ready','protocol':'act-chunk-v1'}),flush=True)\n"
            "for line in sys.stdin:\n"
            " sys.stderr.write('diagnostic'*50000+'\\n');sys.stderr.flush()\n"
            " print(json.dumps({'actions': [[1]*7]}),flush=True)\n"
        )
        worker = PolicyWorkerClient(sys.executable, "/checkpoint", worker_path=script, startup_timeout=2)
        self.addCleanup(worker.close)
        self.assertEqual(worker.predict_chunk([0] * 7, "w.jpg", "g.jpg", "task", timeout=2), [[1] * 7])

    def test_closing_worker_interrupts_blocked_prediction(self):
        script = self._script(
            "import json,sys,time\n"
            "print(json.dumps({'status':'ready','protocol':'act-chunk-v1'}),flush=True)\n"
            "for line in sys.stdin: time.sleep(30)\n"
        )
        worker = PolicyWorkerClient(sys.executable, "/checkpoint", worker_path=script, startup_timeout=2)
        self.addCleanup(worker.close)
        errors = []
        def infer():
            try:
                worker.predict_chunk([0] * 7, "w.jpg", "g.jpg", "task")
            except Exception as error:
                errors.append(error)
        thread = threading.Thread(target=infer)
        thread.start()
        time.sleep(0.03)
        worker.close()
        thread.join(1)
        self.assertFalse(thread.is_alive())
        self.assertTrue(errors)

    def test_old_worker_protocol_is_rejected_with_upgrade_message(self):
        script = self._script("import json,time\nprint(json.dumps({'status':'ready'}),flush=True)\ntime.sleep(30)\n")
        worker = PolicyWorkerClient(sys.executable, "/checkpoint", worker_path=script, startup_timeout=2)
        self.addCleanup(worker.close)
        with self.assertRaisesRegex(RuntimeError, "同时更新"):
            worker.predict_chunk([0] * 7, "w.jpg", "g.jpg", "task")


if __name__ == "__main__":
    unittest.main()
