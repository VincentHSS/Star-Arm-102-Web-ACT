import json
import math
import os
import queue
import subprocess
import threading
import time
from copy import deepcopy
from pathlib import Path
from collections import deque

from .domain import DomainError
from .action_schedule import ActionSchedule


_clock = time.perf_counter  # High-resolution monotonic clock, including on Windows.


class PolicyWorkerClient:
    def __init__(self, python, checkpoint_path, worker_path=None, startup_timeout=60, device=None):
        script = Path(worker_path or Path(__file__).with_name("act_policy_worker.py")).resolve()
        self._process = subprocess.Popen(
            [str(python), str(script), "--checkpoint", str(checkpoint_path), *(['--device', device] if device else [])],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', errors='replace', bufsize=1,
            env={**os.environ, 'PYTHONUTF8': '1'},
            **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}),
        )
        self._lock = threading.Lock()
        self._responses = queue.Queue()
        self._diagnostics = deque(maxlen=20)
        self._stderr_tail = deque(maxlen=20)
        self._closed = threading.Event()
        self._readers = [
            threading.Thread(target=self._read_stdout, daemon=True),
            threading.Thread(target=self._read_stderr, daemon=True),
        ]
        for thread in self._readers:
            thread.start()
        try:
            response = self._read(startup_timeout)
            if response.get("status") != "ready":
                raise RuntimeError(response.get("error") or "ACT Policy worker 启动失败")
            self.protocol = response.get("protocol")
            self.chunk_size = response.get("chunk_size")
        except Exception:
            self.close()
            raise

    def _read(self, timeout):
        deadline = _clock() + timeout
        while True:
            remaining = deadline - _clock()
            if remaining <= 0:
                detail = self._diagnostics[-1] if self._diagnostics else "未返回消息"
                raise RuntimeError(f"ACT Policy worker 响应超时：{detail}")
            try:
                response = self._responses.get(timeout=min(remaining, 0.1))
                if response is not None:
                    return response
            except queue.Empty:
                pass
            if self._closed.is_set() or self._process.poll() is not None:
                detail = (list(self._stderr_tail) or list(self._diagnostics) or ["进程已退出"])[-1]
                raise RuntimeError(f"ACT Policy worker 启动失败：{detail}")

    def _read_stdout(self):
        try:
            for line in self._process.stdout:
                try:
                    response = json.loads(line)
                except json.JSONDecodeError:
                    self._diagnostics.append(line.strip())
                    continue
                if isinstance(response, dict):
                    self._responses.put(response)
        finally:
            self._responses.put(None)

    def _read_stderr(self):
        # Drain continuously: a full stderr pipe must never freeze inference.
        for line in self._process.stderr:
            self._stderr_tail.append(line.strip())

    def _request(self, command, observation, wrist_path, world_path, task, timeout):
        request = {
            "command": command, "observation_state": observation,
            "wrist_path": str(wrist_path), "world_path": str(world_path), "task": task,
        }
        with self._lock:
            if self._process.poll() is not None:
                raise RuntimeError("ACT Policy worker 已退出")
            self._process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
            self._process.stdin.flush()
            response = self._read(timeout)
        if response.get("error"):
            raise RuntimeError(response["error"])
        return response

    def infer(self, observation, wrist_path, world_path, task, timeout=10):
        return self._request("infer", observation, wrist_path, world_path, task, timeout).get("action")

    def predict_chunk(self, observation, wrist_path, world_path, task, timeout=10):
        if self.protocol != "act-chunk-v1":
            raise RuntimeError("ACT worker 版本不匹配，请同时更新 inference_runtime.py 和 act_policy_worker.py")
        return self._request("predict_chunk", observation, wrist_path, world_path, task, timeout).get("actions")

    def close(self):
        process = getattr(self, "_process", None)
        if not process:
            return
        self._closed.set()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1)
        for thread in self._readers:
            thread.join(timeout=1)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream:
                stream.close()


class ActInferenceRuntime:
    ACTIVE = {"loading", "running", "stopping"}

    def __init__(self, serial_connections, cameras, telemetry, data_root, worker_factory=None,
                 interval_ms=None, max_delta_degrees=15.0, max_frame_age_ms=500,
                 t_acc=50, t_dec=50, temporal_ensemble_coeff=0.01,
                 max_joint_speed_degrees_s=120.0, max_policy_age_ms=1000,
                 servo_motion_time_ms=350):
        self.serial = serial_connections
        self.cameras = cameras
        self.telemetry = telemetry
        self.root = Path(data_root).resolve() / "inference"
        self.root.mkdir(parents=True, exist_ok=True)
        self.worker_factory = worker_factory or (lambda python, checkpoint: PolicyWorkerClient(python, checkpoint,
            device={'cpu': 'cpu', 'cuda': 'cuda', 'rocm': 'cuda', 'xpu': 'xpu'}.get(self._state.get('backend'))))
        self._interval_override = None if interval_ms is None else max(30, int(interval_ms))
        self.interval_ms = self._interval_override or 1000 / 30
        self.max_delta_degrees = max(0.1, float(max_delta_degrees))
        self.max_frame_age_ms = max(50, int(max_frame_age_ms))
        self.t_acc = max(20, int(t_acc))
        self.t_dec = max(20, int(t_dec))
        self.servo_motion_time_ms = max(100, int(servo_motion_time_ms))
        self.temporal_ensemble_coeff = temporal_ensemble_coeff
        ActionSchedule(temporal_ensemble_coeff)
        self.max_joint_speed_degrees_s = float(max_joint_speed_degrees_s)
        if not math.isfinite(self.max_joint_speed_degrees_s) or self.max_joint_speed_degrees_s <= 0:
            raise ValueError("关节速度上限必须为正的有限值")
        self.max_policy_age_ms = max(100, int(max_policy_age_ms))
        self._lock = threading.RLock()
        self._thread = None
        self._planner_thread = None
        self._stop = threading.Event()
        self._worker = None
        self._generation = 0
        self._released_generation = None
        self._torque_generation = None
        self._state = self._initial_state()

    @staticmethod
    def _initial_state():
        return {
            "status": "idle", "model_id": None, "task": None, "backend": None,
            "started_at_ms": None, "stopped_at_ms": None, "error": None,
            "stop_reason": None, "observation_state": None, "raw_action": None,
            "safe_action": None, "camera_sequences": {"wrist": None, "world": None},
            "metrics": {"executed_actions": 0, "loop_hz": None, "policy_latency_ms": None,
                        "serial_latency_ms": None, "end_to_end_ms": None, "diagnostic": None,
                        "target_hz": None, "buffered_actions": 0, "predicted_chunks": 0,
                        "ensemble_predictions": 0, "missed_ticks": 0,
                        "policy_age_ms": None, "control_lateness_ms": None},
            "logs": [],
        }

    def _log(self, message, level="info"):
        entry = {"timestamp_ms": int(time.time() * 1000), "level": level, "message": str(message)}
        with self._lock:
            self._state["logs"] = (self._state["logs"] + [entry])[-200:]

    def snapshot(self):
        with self._lock:
            result = deepcopy(self._state)
        result["cameras"] = self.cameras.snapshot()
        result["serial_connections"] = self.serial.snapshot()
        return result

    def validate(self, model, task, environment):
        blockers = []
        if not model:
            blockers.append("未选择本机 ACT 模型")
        elif not model.get("execution_ready"):
            blockers.extend(model.get("blockers") or ["模型缺少实机执行元数据"])
        tasks = list((model or {}).get("tasks") or [])
        if not task or task not in tasks:
            blockers.append("所选任务不在模型支持的任务列表中")
        if environment.get("status") != "ready" or not environment.get("python"):
            blockers.append("ACT 隔离运行环境尚未准备")
        serial = self.serial.snapshot()
        if not serial.get("follower", {}).get("connected"):
            blockers.append("真实 FL 尚未连接")
        camera = self.cameras.snapshot()
        roles = camera.get("roles") or {}
        if camera.get("status") != "streaming" or not all(role in roles for role in ("wrist", "world")):
            if camera.get("status") == "fault" and camera.get("error"):
                blockers.append(f"原生双相机故障：{camera['error']}，请重新连接双相机")
            else:
                blockers.append("本机原生双相机尚未连接")
        contract = (model or {}).get("camera_contract") or {}
        required_width = int(contract.get("width", 0))
        required_height = int(contract.get("height", 0))
        for role in ("wrist", "world"):
            mode = roles.get(role, {}).get("mode") or {}
            if not mode:
                continue
            actual_width = int(mode.get("width", 0))
            actual_height = int(mode.get("height", 0))
            if (actual_width, actual_height) != (required_width, required_height):
                blockers.append(
                    f"{role} 相机分辨率 {actual_width}×{actual_height} "
                    f"与模型要求 {required_width}×{required_height} 不一致"
                )
        limits = (model or {}).get("joint_limits")
        if not isinstance(limits, list) or len(limits) != 7:
            blockers.append("模型缺少 J1-J7 安全限位")
        return {"ready": not blockers, "blockers": blockers, "model_id": (model or {}).get("id"), "task": task}

    def start(self, model, task, environment):
        gate = self.validate(model, task, environment)
        if not gate["ready"]:
            raise DomainError("；".join(gate["blockers"]), "inference_gate_blocked")
        fps = float((model.get("camera_contract") or {}).get("fps", 30))
        if not math.isfinite(fps) or not 1 <= fps <= 100:
            raise DomainError("模型采样频率无效", "invalid_model_fps")
        period_ms = self._interval_override or 1000 / fps
        if self.t_acc + self.t_dec >= self.servo_motion_time_ms:
            raise DomainError("加减速时间之和必须小于舵机运动时间", "invalid_servo_timing")
        with self._lock:
            if self._state["status"] in self.ACTIVE:
                raise DomainError("实机推理已经在运行", "inference_active")
            self._generation += 1
            generation = self._generation
            self._released_generation = None
            self._stop = threading.Event()
            state = self._initial_state()
            state.update(status="loading", model_id=model["id"], task=task,
                         backend=environment.get("backend"), started_at_ms=int(time.time() * 1000))
            self._state = state
            self.interval_ms = period_ms
            self._state["metrics"]["target_hz"] = 1000 / period_ms
            self._state["metrics"]["servo_motion_time_ms"] = self.servo_motion_time_ms
            self._state["metrics"]["servo_acc_ms"] = self.t_acc
            self._state["metrics"]["servo_dec_ms"] = self.t_dec
            self._planner_thread = None
        try:
            with self._lock:
                if generation != self._generation or self._stop.is_set():
                    raise DomainError("实机推理启动已取消", "inference_start_cancelled")
                begin_native = getattr(self.serial, "begin_native_act", None)
                if begin_native:
                    native_state = begin_native()
                    self._state["metrics"]["driver"] = native_state
                self.serial.lock_follower_torque()
                self._torque_generation = generation
        except Exception as error:
            try:
                self.serial.release_follower_torque()
            except Exception as release_error:
                error = RuntimeError(f"{error}；启动回滚卸力失败：{release_error}")
            end_native = getattr(self.serial, "end_native_act", None)
            if end_native:
                try:
                    end_native()
                except Exception as cleanup_error:
                    error = RuntimeError(f"{error}；驱动清理失败：{cleanup_error}")
            with self._lock:
                if generation == self._generation:
                    self._state.update(status="fault", error=str(error), stopped_at_ms=int(time.time() * 1000), stop_reason="torque_lock_failed")
            raise DomainError(f"真实 FL 锁力失败：{error}", "follower_torque_lock_failed") from error
        try:
            worker = self.worker_factory(environment["python"], model["checkpoint_path"])
        except Exception as error:
            try:
                self._release_once(generation)
            except Exception as release_error:
                error = RuntimeError(f"{error}；锁力回滚卸力失败：{release_error}")
            end_native = getattr(self.serial, "end_native_act", None)
            if end_native:
                try:
                    end_native()
                except Exception as cleanup_error:
                    error = RuntimeError(f"{error}；驱动清理失败：{cleanup_error}")
            with self._lock:
                if generation == self._generation:
                    self._state.update(status="fault", error=str(error), stopped_at_ms=int(time.time() * 1000))
            raise DomainError(f"ACT Policy 加载失败：{error}", "policy_load_failed") from error
        with self._lock:
            if generation != self._generation:
                worker.close()
                raise DomainError("实机推理启动已取消", "inference_start_cancelled")
            self._worker = worker
            self._state["status"] = "running"
            self._log(f"ACT 目标更新 {1000 / period_ms:.1f} Hz；舵机运动时间 {self.servo_motion_time_ms} ms，加减速 {self.t_acc}/{self.t_dec} ms（原版驱动兼容）")
            thread = threading.Thread(target=self._loop, args=(generation, model, worker, self._stop), daemon=True,
                                      name="act-real-inference")
            self._thread = thread
            thread.start()
            return deepcopy(self._state)

    def _write_frame(self, role, sequence, jpeg):
        path = self.root / f"{role}-{sequence}.jpg"
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(jpeg)
        os.replace(temporary, path)
        return path

    def _safe_action(self, raw, observation, limits):
        if not isinstance(raw, (list, tuple)) or len(raw) != 7:
            raise ValueError("ACT Action 必须包含 J1-J7 七个值")
        result = []
        for index, value in enumerate(raw):
            value = float(value)
            if not math.isfinite(value):
                raise ValueError(f"ACT Action J{index + 1} 不是有限值")
            low, high = [float(item) for item in limits[index]]
            if not math.isfinite(low) or not math.isfinite(high) or low >= high:
                raise ValueError(f"J{index + 1} 安全限位无效")
            delta_low = float(observation[index]) - self.max_delta_degrees
            delta_high = float(observation[index]) + self.max_delta_degrees
            result.append(max(low, delta_low, min(high, delta_high, value)))
        return result

    def _frames(self):
        frames = {}
        for role in ("wrist", "world"):
            latest = self.cameras.latest_frame(role)
            if not latest:
                raise RuntimeError(f"{role} 相机无有效画面")
            sequence, jpeg, captured = latest
            age_ms = (time.monotonic() - captured) * 1000
            if age_ms > self.max_frame_age_ms:
                raise RuntimeError(f"{role} 相机画面已过期 {age_ms:.0f} ms")
            frames[role] = (sequence, jpeg)
        return frames

    def _plan(self, generation, worker, stop, context, task):
        last_start = -1
        try:
            while not stop.is_set():
                context["wake"].wait(0.05)
                context["wake"].clear()
                with self._lock:
                    if generation != self._generation or stop.is_set():
                        return
                    start = context["observation_tick"]
                    observation = list(context["observation"])
                    if start <= last_start:
                        continue
                policy_started = _clock()
                frames = self._frames()
                paths = {role: self._write_frame(f"{generation}-{role}", "latest", data[1])
                         for role, data in frames.items()}
                actions = worker.predict_chunk(observation, paths["wrist"], paths["world"], task)
                now = _clock()
                with self._lock:
                    if generation != self._generation or stop.is_set():
                        return
                    if not context["schedule"].add(start, actions, context["next_tick"]):
                        raise RuntimeError("ACT 计算耗时超过整个动作块时长，请检查加速设备或增大 chunk_size")
                    context["last_prediction"] = now
                    context["ready"].set()
                    metrics = self._state["metrics"]
                    metrics["policy_latency_ms"] = (now - policy_started) * 1000
                    metrics["predicted_chunks"] += 1
                    self._state["camera_sequences"] = {role: data[0] for role, data in frames.items()}
                last_start = start
        except Exception as error:
            with self._lock:
                if generation == self._generation and not stop.is_set():
                    context["error"] = str(error)
                    context["ready"].set()

    def _loop(self, generation, model, worker, stop):
        period = self.interval_ms / 1000
        last_write = None
        previous_observation = None
        previous_safe = None
        motion_window = deque(maxlen=40)
        try:
            observation = [float(v) for v in self.serial.read_follower_angles()]
            if len(observation) != 7 or not all(math.isfinite(v) for v in observation):
                raise RuntimeError("机械臂读回的 J1-J7 角度无效")
            context = {"schedule": ActionSchedule(self.temporal_ensemble_coeff),
                       "observation": observation, "observation_tick": 0, "next_tick": 0,
                       "last_prediction": None, "error": None,
                       "ready": threading.Event(), "wake": threading.Event()}
            planner = threading.Thread(target=self._plan,
                                       args=(generation, worker, stop, context, model and self._state["task"]),
                                       name="act-chunk-predictor", daemon=True)
            with self._lock:
                if generation != self._generation or stop.is_set():
                    return
                self._planner_thread = planner
                planner.start()
            context["wake"].set()
            warmup_deadline = _clock() + 12
            while not context["ready"].wait(0.01):
                if stop.is_set():
                    return
                self._frames()
                if _clock() > warmup_deadline:
                    raise RuntimeError("ACT 首个动作块预热超时")
            if stop.is_set():
                return
            epoch = _clock()
            next_tick = 0
            while not stop.is_set():
                if stop.wait(max(0, epoch + next_tick * period - _clock())):
                    break
                cycle_started = _clock()
                self._frames()  # Cheap freshness check; no JPEG I/O on control thread.
                read_for_control = getattr(self.serial, "read_follower_angles_for_control", None)
                observation = [float(v) for v in (read_for_control(period) if read_for_control
                                                 else self.serial.read_follower_angles())]
                if len(observation) != 7 or not all(math.isfinite(float(v)) for v in observation):
                    raise RuntimeError("机械臂读回的 J1-J7 角度无效")
                # Skip missed timeline slots; never burst a backlog into the arm.
                tick = max(next_tick, int((_clock() - epoch) / period))
                with self._lock:
                    if generation != self._generation or stop.is_set():
                        break
                    if context["error"]:
                        raise RuntimeError(context["error"])
                    policy_age_ms = (_clock() - context["last_prediction"]) * 1000
                    if policy_age_ms > self.max_policy_age_ms:
                        raise RuntimeError(f"ACT 后台预测已停滞 {policy_age_ms:.0f} ms")
                    raw, contributors = context["schedule"].action(tick)
                    if raw is None:
                        raise RuntimeError("ACT 动作缓冲耗尽，模型或串口速度不足以连续控制")
                safe = self._safe_action(raw, observation, model["joint_limits"])
                # Bound commanded velocity in physical units, independent of sampling FPS.
                reference = previous_safe if previous_safe is not None else observation
                elapsed = period if last_write is None else min(period, max(0, _clock() - last_write))
                step = self.max_joint_speed_degrees_s * elapsed
                for i in range(7):
                    low, high = model["joint_limits"][i]
                    lower = max(float(low), observation[i] - self.max_delta_degrees, reference[i] - step)
                    upper = min(float(high), observation[i] + self.max_delta_degrees, reference[i] + step)
                    if lower > upper:
                        raise RuntimeError(f"J{i + 1} 跟随偏差过大，无法同时满足关节限位和速度限制")
                    safe[i] = max(lower, min(upper, safe[i]))
                actual_move = None if previous_observation is None else max(
                    abs(observation[i] - previous_observation[i]) for i in range(7))
                commanded_delta = max(abs(safe[i] - observation[i]) for i in range(7))
                follow_error = None if previous_safe is None else max(
                    abs(previous_safe[i] - observation[i]) for i in range(7))
                motion_window.append((commanded_delta > 1, actual_move is not None and actual_move >= 0.2))
                serial_started = _clock()
                with self._lock:
                    # Serialize stop invalidation with the final I/O. No write can occur after release.
                    if generation != self._generation or stop.is_set():
                        break
                    write_act = getattr(self.serial, "write_follower_angles_for_act", self.serial.write_follower_angles)
                    write_act(safe, interval_ms=self.servo_motion_time_ms,
                              power=0, t_acc=self.t_acc, t_dec=self.t_dec)
                    now = _clock()
                    serial_ms = (now - serial_started) * 1000
                    context["observation"] = list(observation)
                    context["observation_tick"] = tick
                    context["next_tick"] = tick + 1
                    context["wake"].set()
                    self._state.update(observation_state=list(observation), raw_action=list(raw), safe_action=list(safe))
                    metrics = self._state["metrics"]
                    metrics["executed_actions"] += 1
                    metrics["missed_ticks"] += tick - next_tick
                    metrics.update(loop_hz=None if last_write is None else 1 / max(1e-6, now - last_write),
                                   serial_latency_ms=serial_ms, end_to_end_ms=(now - cycle_started) * 1000,
                                   buffered_actions=max(0, context["schedule"].remaining(tick + 1)),
                                   ensemble_predictions=contributors, policy_age_ms=policy_age_ms,
                                   control_lateness_ms=max(0, (now - epoch - tick * period) * 1000))
                    metrics["diagnostic"] = {
                        "commanded_delta_deg": round(commanded_delta, 2),
                        "actual_move_deg": None if actual_move is None else round(actual_move, 2),
                        "follow_error_deg": None if follow_error is None else round(follow_error, 2),
                        "tracked_cycles": len(motion_window),
                        "attempting_move_cycles": sum(a for a, _ in motion_window),
                        "responsive_cycles": sum(a and b for a, b in motion_window),
                    }
                self.telemetry.publish_sample({
                    "timestamp_ms": int(time.time() * 1000), "observation_state": observation, "action": safe,
                    "state_offset_ms": 0, "action_offset_ms": int((now - cycle_started) * 1000),
                })
                if tick > next_tick:
                    # Resume a regular cadence after an overrun, without catch-up bursts.
                    epoch = now - tick * period
                last_write = now
                previous_observation = list(observation)
                previous_safe = list(safe)
                next_tick = tick + 1
        except Exception as error:
            self._finish(generation, "fault", "runtime_fault", str(error), from_thread=True)

    def _release_once(self, generation):
        with self._lock:
            if self._released_generation == generation or self._torque_generation != generation:
                return
            self._released_generation = generation
            self._torque_generation = None
            self.serial.release_follower_torque()

    def _finish(self, generation, status, reason, error=None, from_thread=False):
        with self._lock:
            if generation != self._generation:
                return self.snapshot()
            self._generation += 1
            self._stop.set()
            self._state.update(status="stopping", stop_reason=reason, error=error)
            thread = self._thread
            planner = self._planner_thread
            worker = self._worker
        release_error = None
        try:
            self._release_once(generation)
        except Exception as release_failure:
            release_error = str(release_failure)
        cleanup_error = None
        end_native = getattr(self.serial, "end_native_act", None)
        if end_native:
            try:
                end_native()
            except Exception as failure:
                cleanup_error = str(failure)
        if worker:
            try:
                worker.close()
            except Exception as failure:
                cleanup_error = str(failure)
        if thread and not from_thread and thread is not threading.current_thread():
            thread.join(timeout=2)
        if planner and planner is not threading.current_thread():
            planner.join(timeout=2)
        with self._lock:
            self._worker = None
            self._thread = None
            self._planner_thread = None
            final_error = error
            if release_error:
                final_error = f"{error + '；' if error else ''}卸力失败：{release_error}"
                status = "fault"
            if cleanup_error:
                final_error = f"{final_error + '；' if final_error else ''}策略进程关闭失败：{cleanup_error}"
                status = "fault"
            self._state.update(status=status, error=final_error, stopped_at_ms=int(time.time() * 1000))
            self._log(final_error if final_error else "实机推理已停止，真实 FL 已卸力",
                      "error" if final_error else "info")
            return deepcopy(self._state)

    def stop(self, reason="operator"):
        with self._lock:
            if self._state["status"] not in self.ACTIVE or self._state["status"] == "stopping":
                return deepcopy(self._state)
            generation = self._generation
        return self._finish(generation, "stopped", reason)

    def emergency_stop(self, reason="operator"):
        return self.stop(f"emergency:{reason}")

    def close(self):
        self.stop("service_close")
