import re
import shutil
import subprocess
import threading
import time
from collections import deque
from copy import deepcopy


class NativeCameraError(RuntimeError):
    pass


def parse_v4l2_device_list(output):
    devices = []
    current = None
    for raw_line in str(output).splitlines():
        line = raw_line.rstrip()
        if line and not line[0].isspace():
            if current and current["nodes"]:
                devices.append(current)
            current = {"name": line.rstrip(":"), "nodes": []}
            continue
        if current:
            value = line.strip()
            if value.startswith("/dev/video"):
                current["nodes"].append(value)
    if current and current["nodes"]:
        devices.append(current)

    result = []
    for item in devices:
        path = item["nodes"][0]
        result.append({
            "stable_id": item["name"].rsplit(" (", 1)[-1].rstrip(")") if " (" in item["name"] else path,
            "name": item["name"].rsplit(" (", 1)[0],
            "path": path,
            "nodes": item["nodes"],
        })
    return result


def parse_v4l2_formats(output):
    modes = []
    pixel_format = None
    width = height = None
    for raw_line in str(output).splitlines():
        format_match = re.search(r"\[\d+\]:\s+'([^']+)'", raw_line)
        if format_match:
            pixel_format = format_match.group(1)
            width = height = None
            continue
        size_match = re.search(r"Size\s*:\s*Discrete\s+(\d+)x(\d+)", raw_line)
        if size_match:
            width, height = map(int, size_match.groups())
            continue
        fps_match = re.search(r"\(([0-9.]+)\s+fps\)", raw_line)
        if fps_match and pixel_format and width and height:
            modes.append({
                "pixel_format": pixel_format,
                "width": width,
                "height": height,
                "fps": float(fps_match.group(1)),
            })
    return modes


def choose_mjpeg_mode(modes, width, height, fps):
    candidates = [mode for mode in modes if mode["pixel_format"] in {"MJPG", "JPEG"}]
    if not candidates:
        raise NativeCameraError("所选摄像头不支持 MJPEG，无法保证双路 USB 采集")

    requested_area = max(1, int(width) * int(height))

    def rank(mode):
        area = mode["width"] * mode["height"]
        below_minimum = mode["width"] < 640 or mode["height"] < 360
        size_distance = abs(area - requested_area) / requested_area
        aspect_distance = abs(mode["width"] / mode["height"] - int(width) / int(height))
        fps_penalty = 0 if mode["fps"] >= float(fps) else (float(fps) - mode["fps"]) / float(fps)
        return (below_minimum, size_distance + aspect_distance * 0.25 + fps_penalty, -mode["fps"])

    return dict(min(candidates, key=rank))


def build_stream_command(path, mode, executable="v4l2-ctl"):
    return [
        executable,
        "-d", str(path),
        f"--set-fmt-video=width={int(mode['width'])},height={int(mode['height'])},pixelformat=MJPG",
        f"--set-parm={int(round(float(mode['fps'])))}",
        "--stream-mmap=4",
        "--stream-count=0",
        "--stream-to=-",
    ]


def iter_jpeg_frames(data):
    frames = []
    buffer = bytes(data)
    while True:
        start = buffer.find(b"\xff\xd8")
        if start < 0:
            return frames, buffer[-1:] if buffer.endswith(b"\xff") else b""
        end = buffer.find(b"\xff\xd9", start + 2)
        if end < 0:
            return frames, buffer[start:]
        next_start = buffer.find(b"\xff\xd8", start + 2)
        if next_start >= 0 and next_start < end:
            # A new frame's SOI appears before this frame's EOI: the byte range
            # [start:end] is a truncated/partial frame merged with the next one
            # (two SOIs in one JPEG), which PIL would reject as a broken data
            # stream. Discard the corrupt prefix and restart from the next SOI.
            buffer = buffer[next_start:]
            continue
        frames.append(buffer[start:end + 2])
        buffer = buffer[end + 2:]


def probe_v4l2_devices(executable="v4l2-ctl"):
    command = shutil.which(executable)
    if not command:
        return []
    try:
        result = subprocess.run([command, "--list-devices"], capture_output=True, text=True,
                                timeout=5, check=True)
    except (OSError, subprocess.SubprocessError):
        return []
    return parse_v4l2_device_list(result.stdout)


def probe_v4l2_modes(path, executable="v4l2-ctl"):
    command = shutil.which(executable)
    if not command:
        raise NativeCameraError("Ubuntu 原生相机不可用：未安装 v4l2-ctl")
    try:
        result = subprocess.run([command, "-d", str(path), "--list-formats-ext"],
                                capture_output=True, text=True, timeout=5, check=True)
    except (OSError, subprocess.SubprocessError) as error:
        raise NativeCameraError(f"无法读取摄像头模式：{path}") from error
    return parse_v4l2_formats(result.stdout)


class V4L2CameraManager:
    def __init__(self, device_probe=None, mode_probe=None, popen=None, startup_timeout=5.0,
                 frame_stale_timeout=0.5):
        self._device_probe = device_probe or probe_v4l2_devices
        self._mode_probe = mode_probe or probe_v4l2_modes
        self._popen = popen or subprocess.Popen
        self._startup_timeout = float(startup_timeout)
        self._frame_stale_timeout = max(0.001, float(frame_stale_timeout))
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._sessions = {}
        self._status = "idle"
        self._error = None
        self._recording = None

    def available(self):
        return bool(shutil.which("v4l2-ctl"))

    def devices(self):
        return deepcopy(self._device_probe())

    def connect(self, wrist_id, world_id, profile):
        if not wrist_id or not world_id:
            raise NativeCameraError("请选择末端视角和世界视角摄像头")
        if wrist_id == world_id:
            raise NativeCameraError("两路画面必须选择不同摄像头")
        self.close()
        devices = {item["stable_id"]: item for item in self._device_probe()}
        selected = {"wrist": devices.get(wrist_id), "world": devices.get(world_id)}
        if not all(selected.values()):
            raise NativeCameraError("所选 Ubuntu 原生摄像头已离线，请重新检测")

        with self._condition:
            self._status = "connecting"
            self._error = None
        try:
            for role in ("wrist", "world"):
                device = selected[role]
                mode = choose_mjpeg_mode(self._mode_probe(device["path"]),
                                         profile["width"], profile["height"], profile["fps"])
                executable = shutil.which("v4l2-ctl") or "v4l2-ctl"
                process = self._popen(
                    build_stream_command(device["path"], mode, executable),
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0,
                )
                session = {
                    "role": role, "device": device, "mode": mode, "process": process,
                    "thread": None, "latest": None, "sequence": 0, "frames": 0,
                    "frame_times": deque(maxlen=121), "dropped": 0, "error": None,
                }
                with self._condition:
                    self._sessions[role] = session
                thread = threading.Thread(target=self._read_stream, args=(session,), daemon=True,
                                          name=f"act-camera-{role}")
                session["thread"] = thread
                thread.start()

            deadline = time.monotonic() + self._startup_timeout
            with self._condition:
                while not all(self._sessions.get(role, {}).get("latest") for role in ("wrist", "world")):
                    error = next((item.get("error") for item in self._sessions.values() if item.get("error")), None)
                    if error:
                        raise NativeCameraError(error)
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise NativeCameraError("Ubuntu 原生双摄像头启动超时，未收到两路有效 MJPEG 画面")
                    self._condition.wait(min(0.05, remaining))
                self._status = "streaming"
                return self.snapshot()
        except Exception:
            self.close()
            raise

    def _read_stream(self, session):
        process = session["process"]
        buffer = b""
        stream_error = None
        try:
            while True:
                chunk = process.stdout.read(64 * 1024)
                if not chunk:
                    if process.poll() is not None:
                        stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
                        with self._lock:
                            connecting = self._status == "connecting"
                        formatter = self._format_process_error if connecting else self._format_stream_error
                        stream_error = formatter(session["device"]["name"], stderr)
                        break
                    time.sleep(0.005)
                    continue
                frames, buffer = iter_jpeg_frames(buffer + chunk)
                for jpeg in frames:
                    now = time.monotonic()
                    with self._condition:
                        session["sequence"] += 1
                        session["frames"] += 1
                        session["frame_times"].append(now)
                        session["latest"] = (session["sequence"], jpeg, now)
                        self._condition.notify_all()
        except Exception as error:
            stream_error = f"{session['device']['name']} 原生视频读取失败：{error}"
        finally:
            with self._condition:
                current = self._sessions.get(session["role"])
                if current is session and stream_error:
                    session["error"] = stream_error
                    session["latest"] = None
                    self._status = "fault"
                    self._error = stream_error
                    if self._recording:
                        self._recording["error"] = stream_error
                        self._recording["stop"].set()
                self._condition.notify_all()

    @staticmethod
    def _format_stream_error(device_name, stderr):
        detail = stderr.strip().splitlines()[-1] if stderr.strip() else "采集进程已退出，未继续返回 MJPEG 画面"
        return f"{device_name} 视频流已停止：{detail}"

    @staticmethod
    def _format_process_error(device_name, stderr):
        if "No space left on device" in stderr:
            return f"{device_name} 启动失败：USB 视频带宽不足；请使用 MJPEG 设备或不同 USB 控制器"
        detail = stderr.strip().splitlines()[-1] if stderr.strip() else "未返回有效 MJPEG 画面"
        return f"{device_name} 启动失败：{detail}"

    def _invalidate_stale_frames_locked(self, now):
        if self._status != "streaming":
            return
        stale = []
        for role, session in self._sessions.items():
            latest = session.get("latest")
            if latest and now - latest[2] > self._frame_stale_timeout:
                stale.append((role, session, (now - latest[2]) * 1000))
        if not stale:
            return
        details = []
        for _role, session, age_ms in stale:
            detail = f"{session['device']['name']} 画面停止更新 {age_ms:.0f} ms"
            session["error"] = detail
            session["latest"] = None
            details.append(detail)
        self._status = "fault"
        self._error = "；".join(details)
        if self._recording:
            self._recording["error"] = self._error
            self._recording["stop"].set()

    def latest_frame(self, role):
        with self._lock:
            self._invalidate_stale_frames_locked(time.monotonic())
            latest = self._sessions.get(role, {}).get("latest")
            return None if latest is None else tuple(latest)

    def snapshot(self):
        with self._lock:
            now = time.monotonic()
            self._invalidate_stale_frames_locked(now)
            roles = {}
            for role, session in self._sessions.items():
                times = list(session["frame_times"])
                recent = [value for value in times if now - value <= 2.0]
                fps = None
                if len(recent) >= 2 and recent[-1] > recent[0]:
                    fps = (len(recent) - 1) / (recent[-1] - recent[0])
                roles[role] = {
                    "device_id": session["device"]["stable_id"],
                    "device_name": session["device"]["name"],
                    "path": session["device"]["path"],
                    "mode": dict(session["mode"]),
                    "actual_fps": fps,
                    "frame_age_ms": None if not times else (now - times[-1]) * 1000,
                    "frames": session["frames"],
                    "dropped": session["dropped"],
                    "error": session["error"],
                }
            return {"backend": "native", "status": self._status, "error": self._error,
                    "recording": bool(self._recording), "roles": roles}

    def start_recording(self, episode_id, fps, sink):
        if not episode_id or not callable(sink):
            raise NativeCameraError("原生相机录制参数无效")
        with self._condition:
            if self._status != "streaming" or not all(role in self._sessions for role in ("wrist", "world")):
                raise NativeCameraError("Ubuntu 原生双摄像头尚未连接")
            if self._recording:
                raise NativeCameraError("Ubuntu 原生相机已在录制")
            recording = {
                "episode_id": str(episode_id), "fps": max(1, int(fps)), "sink": sink,
                "stop": threading.Event(), "last_sequences": {"wrist": 0, "world": 0},
                "stored": {"wrist": 0, "world": 0}, "error": None, "thread": None,
            }
            self._recording = recording
        thread = threading.Thread(target=self._record_loop, args=(recording,), daemon=True,
                                  name="act-native-camera-recording")
        recording["thread"] = thread
        thread.start()
        return {"episode_id": str(episode_id), "status": "recording", "fps": recording["fps"]}

    def _record_loop(self, recording):
        interval = 1.0 / recording["fps"]
        next_tick = time.monotonic()
        while not recording["stop"].wait(max(0, next_tick - time.monotonic())):
            captured_at = time.time() * 1000
            monotonic_ms = time.monotonic() * 1000
            for role in ("wrist", "world"):
                with self._lock:
                    session = self._sessions.get(role)
                    latest = None if session is None else session.get("latest")
                    mode = None if session is None else dict(session["mode"])
                if not latest or latest[0] == recording["last_sequences"][role]:
                    continue
                recording["last_sequences"][role] = latest[0]
                sequence = recording["stored"][role] + 1
                frame = {
                    "sequence": sequence, "captured_at_ms": captured_at,
                    "monotonic_ms": monotonic_ms, "media_time": monotonic_ms / 1000,
                    "presented_frames": latest[0], "width": mode["width"], "height": mode["height"],
                    "jpeg": latest[1],
                }
                try:
                    recording["sink"](recording["episode_id"], role, [frame])
                    recording["stored"][role] = sequence
                except Exception as error:
                    recording["error"] = str(error)
                    with self._condition:
                        self._error = f"原生相机帧持久化失败：{error}"
                    recording["stop"].set()
                    break
            next_tick = max(next_tick + interval, time.monotonic())

    def stop_recording(self):
        with self._condition:
            recording = self._recording
            self._recording = None
        if not recording:
            return {"status": "idle", "stored": {"wrist": 0, "world": 0}, "error": None}
        recording["stop"].set()
        thread = recording.get("thread")
        if thread and thread is not threading.current_thread():
            thread.join(timeout=1)
        return {"status": "idle", "stored": dict(recording["stored"]), "error": recording["error"]}

    def close(self):
        self.stop_recording()
        with self._condition:
            sessions = list(self._sessions.values())
            self._sessions = {}
            self._status = "idle"
            self._error = None
            self._condition.notify_all()
        for session in sessions:
            process = session["process"]
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=1)
                except Exception:
                    process.kill()
            thread = session.get("thread")
            if thread and thread is not threading.current_thread():
                thread.join(timeout=1)
