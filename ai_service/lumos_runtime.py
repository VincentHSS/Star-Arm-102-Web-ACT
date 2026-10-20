"""Session-bound Touch R1 -> Lumos CAN control, separate from the UART FL driver.

Only connect() may construct the SDK controller (which enables motors), and it
requires explicit enable confirmation. GET snapshots never touch the SDK or
renew the input lease. The browser supplies fresh six-axis UART observations
and raw gripper ID 6 feedback; this runtime never opens a Leader port.

The adaptive filter and time-based rate/step limits follow the user's reference:
VincentHSS/stararm102-lumos-teleop, c9922364c22156bba277ff1ba904f5d0ac696079.
Calibration is valid only for this connection. It is not hardware authentication
or a substitute for manufacturer limits. SDK position arrays have no freshness
timestamp; a successful read alone cannot certify CAN feedback freshness.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import importlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import threading
import time

from .domain import DomainError


INPUT_TIMEOUT_SECONDS = 0.5
CONNECTED_TIMEOUT_SECONDS = 1.5
WATCHDOG_SECONDS = 0.1
REFERENCE_TOLERANCE_RAD = 0.15
MAX_SPEED_DEG_PER_SEC = 50.0
MAX_TARGET_STEP_DEG = 2.0
MAX_GRIPPER_RATIO_PER_SEC = 2.0
MAX_GRIPPER_RATIO_STEP = 0.04
GRIPPER_REFERENCE_TOLERANCE = 0.1
GRIPPER_ENDPOINT_TOLERANCE_DEG = 0.5
FILTER_MIN_CUTOFF_HZ = 5.0
FILTER_BETA = 0.15
_SDK_DIRECTORY_LOCK = threading.Lock()


def _error(message, code):
    return DomainError(message, f"lumos_{code}")


def _body(value):
    if not isinstance(value, dict):
        raise _error("Lumos 请求必须是 JSON 对象", "invalid_request")
    return value


def _six_numbers(value, name):
    if not isinstance(value, (list, tuple)) or len(value) != 6:
        raise _error(f"{name}必须包含六个有限数值", "invalid_angles")
    try:
        if any(isinstance(item, bool) or not isinstance(item, (int, float)) for item in value):
            raise ValueError("not numeric")
        converted = [float(item) for item in value]
        if not all(math.isfinite(item) for item in converted):
            raise ValueError("non-finite")
    except (ValueError, OverflowError):
        raise _error(f"{name}必须包含六个有限数值", "invalid_angles")
    return converted


def _finite_number(value, name):
    try:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("not numeric")
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("non-finite")
    except (ValueError, OverflowError):
        raise _error(f"{name}必须是有限数值", "invalid_gripper")
    return value


def _pair(body):
    if body.get("leader_type") != "TOUCH" or body.get("follower_type") != "LUMOS":
        raise _error("真实 LumosTouch 仅接受 Touch R1 Leader 配对", "invalid_pair")


def _connection_id(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 256:
        raise _error("需要当前 Touch R1 的连接标识", "invalid_leader_connection")
    return value


def _can_interface(value):
    if not isinstance(value, str) or re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,14}", value) is None:
        raise _error("CAN 接口名称无效", "invalid_can_interface")
    return value


def find_sdk_root(explicit=None):
    """Locate the complete SDK source; the native SDK reads relative config."""
    configured = explicit or os.environ.get("STAR_ARM_LUMOS_SDK_ROOT")
    project = Path(__file__).resolve().parent.parent
    candidates = ([Path(configured)] if configured else [
        project / ".dependencies" / "startouch_sdk",
        project / "startouch_sdk",
        Path.cwd(),
        Path.cwd() / "startouch_sdk",
    ])
    for candidate in candidates:
        root = candidate.expanduser().resolve()
        if (root / "src" / "config" / "robot_kinematics.yaml").is_file():
            return root
    raise _error("未找到 Lumos SDK 配置；请通过本地启动器准备 SDK，或设置 STAR_ARM_LUMOS_SDK_ROOT",
                 "sdk_config_missing")


def read_sdk_gripper_type(root):
    """Read the SDK's selected hardware model without constructing a controller."""
    try:
        yaml = importlib.import_module("yaml")  # Installed by the SDK requirements.
        config = yaml.safe_load((Path(root) / "src" / "config" / "robot_kinematics.yaml").read_text(encoding="utf-8"))
        section = config.get("gripper_control", {}) if isinstance(config, dict) else {}
        gripper_type = section.get("type") if isinstance(section, dict) else None
    except Exception as error:
        raise _error(f"无法读取 SDK 夹爪类型配置：{error}", "gripper_config_invalid") from error
    if gripper_type not in ("TypeFZ", "TypeLJ", "TypeNex"):
        raise _error("SDK 的 gripper_control.type 必须明确配置为 TypeFZ、TypeLJ 或 TypeNex",
                     "gripper_config_invalid")
    return gripper_type


@contextmanager
def sdk_initialization_directory(root):
    """Restore cwd even when native SDK construction fails."""
    with _SDK_DIRECTORY_LOCK:
        original = Path.cwd()
        try:
            os.chdir(root)
            yield
        finally:
            os.chdir(original)


def create_lumos_arm(*, can_interface, sdk_root=None):
    """Real Linux-only factory. Never called by snapshot or module import."""
    if not sys.platform.startswith("linux"):
        raise _error("真实 LumosTouch 需要 Ubuntu 的 CAN 服务", "unsupported_platform")
    interface = _can_interface(can_interface)
    node = Path("/sys/class/net") / interface
    try:
        if node.joinpath("type").read_text().strip() != "280":
            raise _error("所选接口不是 CAN 设备", "can_unavailable")
        if not int(node.joinpath("flags").read_text().strip(), 0) & 1:
            raise _error("CAN 接口尚未启用；请先在 Ubuntu 配置为 1 Mbps", "can_unavailable")
    except (OSError, ValueError) as error:
        if isinstance(error, DomainError):
            raise
        raise _error("未检测到可用的 CAN 接口；请先连接并配置 Ubuntu USB-CAN", "can_unavailable") from error
    try:
        result = subprocess.run(
            ["ip", "-details", "-json", "link", "show", "dev", interface],
            capture_output=True, text=True, check=True, timeout=3,
        )
        links = json.loads(result.stdout)
        link = links[0] if isinstance(links, list) and len(links) == 1 else {}
        info = link.get("linkinfo", {}) if isinstance(link, dict) else {}
        data = info.get("info_data", {}) if isinstance(info, dict) else {}
        timing = data.get("bittiming", {}) if isinstance(data, dict) else {}
        bitrate = timing.get("bitrate") if isinstance(timing, dict) else None
        if (link.get("ifname") != interface or info.get("info_kind") != "can"
                or type(bitrate) is not int or bitrate != 1_000_000):
            raise _error("CAN 接口必须已配置为 1 Mbps；当前配置未确认，不会使能 Lumos", "can_bitrate_unverified")
    except (OSError, subprocess.SubprocessError, ValueError, AttributeError) as error:
        if isinstance(error, DomainError):
            raise
        raise _error("无法通过 ip 读取 CAN 波特率；确认安装 iproute2 并将 CAN 配置为 1 Mbps",
                     "can_bitrate_unverified") from error
    root = find_sdk_root(sdk_root)
    gripper_type = read_sdk_gripper_type(root)
    arm = None
    try:
        with sdk_initialization_directory(root):
            # Official SDK test_gripper_force_control.py documents this switch.
            # Enabling the controller must not auto-close the physical gripper.
            os.environ["STARTOUCH_GRIPPER_STARTUP_CLOSE"] = "0"
            try:
                single_arm = importlib.import_module("startouchclass").SingleArm
            except (ImportError, AttributeError, OSError) as error:
                raise _error(f"Lumos SDK 不可用：{error}", "sdk_unavailable") from error
            # The constructor enables the arm and its physical gripper.
            try:
                arm = single_arm(can_interface_=interface, gripper=True, enable_fd_=False)
            except Exception as error:
                raise _error(
                    f"SDK 构造失败：{error}。构造期间可能已使能电机，且未返回可关闭对象；"
                    "请使用硬件急停检查设备，并正常关闭本机 Lumos 服务",
                    "sdk_construction_failed",
                ) from error
            arm.star_arm_gripper_type = gripper_type
        time.sleep(2.0)  # Same controller-settling interval as the reference script.
        return arm
    except Exception:
        if arm is not None:
            arm.cleanup()
        raise


class JointFilter:
    """Adaptive six-axis low-pass filter in degrees, using actual sample time."""

    def __init__(self):
        self.raw = None
        self.filtered = []
        self.speed = []

    def update(self, values, dt):
        values = _six_numbers(values, "主臂角度")
        if self.raw is None:
            self.raw = list(values)
            self.filtered = list(values)
            self.speed = [0.0] * 6
            return list(values)
        dt = max(dt, 1e-6)
        speed_alpha = dt / (dt + 1.0 / (2.0 * math.pi * 5.0))
        for index, value in enumerate(values):
            self.speed[index] += speed_alpha * ((value - self.raw[index]) / dt - self.speed[index])
            cutoff = FILTER_MIN_CUTOFF_HZ + FILTER_BETA * abs(self.speed[index])
            alpha = dt / (dt + 1.0 / (2.0 * math.pi * cutoff))
            self.filtered[index] += alpha * (value - self.filtered[index])
        self.raw = list(values)
        return _six_numbers(self.filtered, "滤波目标")


def limit_target(previous, desired, dt):
    step = math.radians(min(MAX_TARGET_STEP_DEG, MAX_SPEED_DEG_PER_SEC * max(0.0, dt)))
    return [old + max(-step, min(step, new - old)) for old, new in zip(previous, desired)]


class LumosRuntime:
    """Browser/API methods accept dicts; every session command repeats the pair.

    connect: pair, leader_connection_id, can_interface, enable_confirmed=true.
    sample: session fields + strictly increasing sequence + leader_deg[6] in
            servo ID 0..5 order and leader_gripper_deg (raw ID 6, unscaled).
            This is the only input lease renewal for all seven inputs.
    capture_reference: session fields + leader_deg, leader_gripper_deg,
                       joint_map, signs, gain, optional invert_gripper bool.
    capture_gripper: session fields + position closed/open + leader_gripper_deg.
    finish_calibration: each mapped Leader axis and gripper span need >=2 deg.
    start: session fields + confirmed=true; requires fresh input at both homes.
    stop/disconnect: session fields; cleanup and revoke, then reconnect/calibrate.
    close: internal shutdown, requires no token. No calibration persists to disk.
    """

    def __init__(self, sdk_root=None, arm_factory=None, clock=time.monotonic,
                 watchdog_interval=WATCHDOG_SECONDS, start_watchdog=True):
        self.sdk_root = sdk_root
        self._factory = arm_factory or create_lumos_arm
        self._uses_real_factory = arm_factory is None
        self._gripper_type = None
        self._gripper_config_error = None
        if self._uses_real_factory:
            try:
                self._gripper_type = read_sdk_gripper_type(find_sdk_root(sdk_root))
            except DomainError as error:
                self._gripper_config_error = str(error)
        self._clock = clock
        self._lock = threading.RLock()
        self._operation_lock = threading.Lock()
        self._command_lock = threading.Lock()
        self._watchdog_stop = threading.Event()
        self._watchdog = None
        self._closed = False
        self._generation = 0
        self._connecting = False
        self._connecting_thread = None
        self._connect_done = threading.Event()
        self._connect_done.set()
        self._unclean_construction = False
        self._cleanup_pending = False
        self._cleanup_failed_arm = None
        self._arm = None
        self._session_id = None
        self._connection_id = None
        self._leader_connection_id = None
        self._interface = None
        self._status = "idle"
        self._message = "选择 Touch R1 和真实 LumosTouch 后连接"
        self._last_error = None
        self._connected_at = None
        self._last_sample_at = None
        self._last_sequence = -1
        self._latest_submitted_sequence = -1
        self._leader_deg = None
        self._positions = None
        self._gripper_feedback = None
        self._leader_gripper_deg = None
        self._gripper_preview = None
        self._gripper_target = None
        self._preview = None
        self._target = None
        self._calibration = None
        self._filter = None
        self._last_control_at = None
        self._running_since = None
        if start_watchdog:
            if not isinstance(watchdog_interval, (int, float)) or not 0 < watchdog_interval <= 0.1:
                raise ValueError("watchdog_interval must be in (0, 0.1]")
            self._watchdog = threading.Thread(
                target=self._watchdog_loop, args=(watchdog_interval,),
                name="lumos-input-watchdog", daemon=True)
            self._watchdog.start()

    def snapshot(self):
        """Read cached status only: never enables hardware, reads it, or renews."""
        with self._lock:
            calibration = deepcopy(self._calibration) if self._calibration else {}
            calibration.update({
                "reference_set": self._calibration is not None,
                "range_ready": bool(self._calibration and self._calibration.get("range_ready")),
                "stage": ("ready" if self._calibration.get("range_ready") else "range")
                         if self._calibration else "none",
            })
            grip_calibration = calibration.get("gripper", {})
            gripper = {
                "control": True,
                "type": self._gripper_type,
                "position_ratio": self._gripper_feedback["position_ratio"] if self._gripper_feedback else None,
                "preview_ratio": self._gripper_preview,
                "target_ratio": self._gripper_target,
                "leader_deg": self._leader_gripper_deg,
                "closed_deg": grip_calibration.get("closed_deg"),
                "open_deg": grip_calibration.get("open_deg"),
                "invert": grip_calibration.get("invert", False),
                "calibrated": self._gripper_calibrated(grip_calibration),
                "feedback_valid": False, "feedback_age_ms": None,
            }
            if self._gripper_feedback:
                feedback_age = (self._gripper_feedback["feedback_age_ms"]
                                + max(0, self._clock() - self._gripper_feedback["received_at"]) * 1000)
                gripper["feedback_age_ms"] = feedback_age
                gripper["feedback_valid"] = bool(self._arm and self._session_id
                                                 and feedback_age <= INPUT_TIMEOUT_SECONDS * 1000)
            age = None if self._last_sample_at is None else max(0.0, self._clock() - self._last_sample_at) * 1000
            return {
                "status": self._status, "phase": self._status,
                "connected": self._arm is not None and self._session_id is not None,
                "running": self._status == "running",
                "session_id": self._session_id, "connection_id": self._connection_id,
                "leader_connection_id": self._leader_connection_id,
                "leader_type": "TOUCH", "follower_type": "LUMOS",
                "can_interface": self._interface,
                "positions_rad": deepcopy(self._positions),
                "leader_deg": deepcopy(self._leader_deg),
                "preview_rad": deepcopy(self._preview),
                "target_rad": deepcopy(self._target),
                "calibration": calibration, "last_sequence": self._last_sequence,
                "sample_age_ms": age, "message": self._message, "error": self._last_error,
                "feedback_freshness_verified": False,
                "gripper_control": True, "gripper": gripper, "cleanup_pending": self._cleanup_pending,
                "gripper_type": self._gripper_type, "gripper_config_error": self._gripper_config_error,
                "cleanup_failed": self._cleanup_failed_arm is not None or self._unclean_construction,
                "connecting": self._connecting,
            }

    def connect(self, body):
        body = _body(body)
        _pair(body)
        leader_id = _connection_id(body.get("leader_connection_id"))
        interface = _can_interface(body.get("can_interface"))
        if body.get("enable_confirmed") is not True:
            raise _error("连接 Lumos 会使能电机，请先确认工作区域和硬件急停", "enable_confirmation_required")
        with self._operation_lock:
            with self._lock:
                if self._closed:
                    raise _error("Lumos 服务已关闭", "closed")
                if self._arm is not None or self._connecting or self._cleanup_pending:
                    raise _error("Lumos 连接正在使用，请先停止并断开", "busy")
                if self._cleanup_failed_arm is not None:
                    raise _error("上次 SDK 关闭失败，请检查硬件并正常重启本机 Lumos 服务", "cleanup_failed")
                if self._unclean_construction:
                    raise _error("上次 SDK 构造未返回可关闭对象，请检查硬件并正常重启本机 Lumos 服务",
                                 "sdk_construction_failed")
                self._connecting = True
                self._generation += 1
                generation = self._generation
                self._connecting_thread = threading.current_thread()
                self._connect_done.clear()
                self._last_error = None
            arm = None
            try:
                arm = self._factory(can_interface=interface, sdk_root=self.sdk_root)
                with self._lock:
                    if self._closed:
                        raise _error("Lumos 服务已关闭", "closed")
                    if generation != self._generation:
                        raise _error("Lumos 连接已被紧急停止取消", "connection_cancelled")
                positions = self._read_positions(arm)
                gripper_feedback = self._initial_gripper_feedback(arm, generation)
                with self._lock:
                    if self._closed:
                        raise _error("Lumos 服务已关闭", "closed")
                    if generation != self._generation:
                        raise _error("Lumos 连接已被紧急停止取消", "connection_cancelled")
                    self._arm = arm
                    self._session_id = secrets.token_urlsafe(32)
                    self._connection_id = secrets.token_urlsafe(18)
                    self._leader_connection_id = leader_id
                    self._interface = interface
                    self._connected_at = self._clock()
                    self._last_sample_at = None
                    self._last_sequence = self._latest_submitted_sequence = -1
                    self._leader_deg = self._preview = self._target = self._calibration = None
                    self._filter = self._last_control_at = self._running_since = None
                    self._positions = positions
                    self._gripper_feedback = gripper_feedback
                    self._gripper_type = getattr(arm, "star_arm_gripper_type", None) or self._gripper_type
                    self._gripper_config_error = None
                    self._leader_gripper_deg = self._gripper_preview = self._gripper_target = None
                    self._status = "connected"
                    self._message = "Lumos 电机已使能；请持续采样并记录两臂对应参考姿态"
                    self._connecting = False
                    return self.snapshot()
            except Exception as error:
                with self._lock:
                    self._connecting = False
                    cancelled = isinstance(error, DomainError) and error.code == "lumos_connection_cancelled"
                    self._status = "stopped" if cancelled else "fault"
                    self._last_error = None if cancelled else f"Lumos 初始化失败：{error}"
                    self._message = "连接已取消并关闭 Lumos；再次执行需要重新连接并校准" if cancelled else self._last_error
                    if isinstance(error, DomainError) and error.code == "lumos_sdk_construction_failed":
                        self._unclean_construction = True
                    if arm is not None:
                        self._cleanup_pending = True
                if arm is not None:
                    self._cleanup(arm)
                if isinstance(error, DomainError):
                    raise
                raise _error(self._last_error, "connect_failed") from error
            finally:
                with self._lock:
                    self._connecting = False
                    self._connecting_thread = None
                    if arm is None:
                        self._cleanup_pending = False
                    self._connect_done.set()

    def _authenticate(self, body):
        _body(body)
        _pair(body)
        token = body.get("session_id")
        if (not isinstance(token, str) or not token.isascii() or not self._session_id
                or not secrets.compare_digest(token, self._session_id)):
            raise _error("Lumos 会话已失效，请重新连接并校准", "stale_session")
        if body.get("leader_connection_id") != self._leader_connection_id:
            raise _error("Touch R1 连接已改变，请重新连接并校准", "leader_connection_changed")
        if self._arm is None or self._closed:
            raise _error("Lumos 未连接", "not_connected")
        return self._arm, self._session_id

    def _assert_current(self, arm, session):
        with self._lock:
            if self._arm is not arm or self._session_id != session or self._closed:
                raise _error("Lumos 会话已停止，已丢弃延迟数据", "stale_session")

    def _read_positions(self, arm):
        try:
            values = arm.get_joint_positions()
            # The official SDK returns numpy.ndarray; validate the actual values.
            if hasattr(values, "tolist"):
                values = values.tolist()
            return _six_numbers(values, "Lumos 反馈")
        except DomainError:
            raise
        except Exception as error:
            raise _error(f"读取 Lumos 反馈失败：{error}", "read_failed") from error

    def _read_gripper(self, arm):
        """Use the SDK's normalized opening and its actual feedback timestamp."""
        try:
            state = arm.get_gripper_state()
            read = state.get if isinstance(state, dict) else lambda name: getattr(state, name, None)
            position = _finite_number(read("position"), "Lumos 夹爪开度")
            age = _finite_number(read("feedback_age_ms"), "Lumos 夹爪反馈年龄")
            if not 0.0 <= position <= 1.0:
                raise _error("Lumos 夹爪反馈开度不在 0–1 范围内", "gripper_feedback_invalid")
            # Official SDK gripper tests treat codes >= 0x8 as faults; code 1
            # is a normal enabled status, not an error.
            if type(read("error_code")) is not int or not 0 <= read("error_code") < 0x8:
                raise _error("Lumos 夹爪报告故障，请检查设备", "gripper_fault")
            if read("feedback_valid") is not True or not 0 <= age <= INPUT_TIMEOUT_SECONDS * 1000:
                raise _error("Lumos 夹爪反馈无效或超过 500 ms 未更新", "gripper_feedback_stale")
            if read("enabled") is not True:
                raise _error("Lumos 夹爪未使能", "gripper_disabled")
            return {"position_ratio": position, "feedback_valid": True, "feedback_age_ms": age,
                    "received_at": self._clock()}
        except DomainError:
            raise
        except Exception as error:
            raise _error(f"读取 Lumos 夹爪反馈失败：{error}；需要支持 get_gripper_state 的 SDK",
                         "gripper_read_failed") from error

    def _require_fresh_gripper_feedback(self, feedback):
        age = feedback["feedback_age_ms"] + max(0.0, self._clock() - feedback["received_at"]) * 1000
        if age > INPUT_TIMEOUT_SECONDS * 1000:
            raise _error("Lumos 夹爪反馈超过 500 ms 未更新，机械臂与夹爪执行已停止",
                         "gripper_feedback_stale")

    def _initial_gripper_feedback(self, arm, generation):
        # Constructor already settles for two seconds. Allow initial CAN
        # feedback a bounded extra interval; never send a movement to obtain it.
        deadline = time.monotonic() + (2.0 if self._uses_real_factory else 0.0)
        while True:
            with self._lock:
                if self._closed:
                    raise _error("Lumos 服务已关闭", "closed")
                if generation != self._generation:
                    raise _error("Lumos 连接已被紧急停止取消", "connection_cancelled")
            try:
                return self._read_gripper(arm)
            except DomainError as error:
                if error.code not in ("lumos_gripper_feedback_stale", "lumos_gripper_disabled") or time.monotonic() >= deadline:
                    raise
                time.sleep(0.05)

    def _session(self, body):
        self.check_watchdog()
        with self._lock:
            return self._authenticate(body)

    def sample(self, body):
        body = _body(body)
        received_at = self._clock()
        arm, session = self._session(body)
        try:
            leader = _six_numbers(body.get("leader_deg"), "Touch R1 角度")
            leader_gripper = _finite_number(body.get("leader_gripper_deg"), "Touch R1 夹爪 ID 6 角度")
        except DomainError as error:
            self._fault_current(arm, session, str(error))
            raise
        sequence = body.get("sequence")
        if type(sequence) is not int or not 0 <= sequence <= 9007199254740991:
            raise _error("采样序号必须是递增的非负整数", "invalid_sequence")
        with self._lock:
            self._assert_current(arm, session)
            if sequence <= self._latest_submitted_sequence:
                raise _error("已丢弃重复或乱序的主臂采样", "stale_sample")
            self._latest_submitted_sequence = sequence
        with self._operation_lock:
            self._assert_current(arm, session)
            self.check_watchdog()
            self._assert_current(arm, session)
            with self._lock:
                if sequence != self._latest_submitted_sequence or self._clock() - received_at > INPUT_TIMEOUT_SECONDS:
                    raise _error("已丢弃排队或过期的主臂采样", "stale_sample")
                if self._status == "running" and received_at < self._running_since:
                    raise _error("已丢弃执行开始前的主臂采样", "stale_sample")
            try:
                positions = self._read_positions(arm)
                self._assert_current(arm, session)
                gripper_feedback = self._read_gripper(arm)
                self._assert_current(arm, session)
                with self._lock:
                    if sequence != self._latest_submitted_sequence:
                        raise _error("已丢弃被新采样替代的主臂数据", "stale_sample")
                    if self._clock() - received_at > INPUT_TIMEOUT_SECONDS:
                        raise _error("主臂采样处理超过 500 ms，执行已停止", "sample_timeout")
                    calibration = self._calibration
                    mapped = [leader[index] for index in calibration["joint_map"]] if calibration else leader
                    target = None
                    gripper_target = None
                    if self._status == "calibrating":
                        calibration["range_min_deg"] = [min(a, b) for a, b in zip(calibration["range_min_deg"], mapped)]
                        calibration["range_max_deg"] = [max(a, b) for a, b in zip(calibration["range_max_deg"], mapped)]
                        calibration["samples"] += 1
                    elif self._status in ("preview", "running"):
                        in_range = all(lo - 1e-9 <= value <= hi + 1e-9 for value, lo, hi in
                                       zip(mapped, calibration["range_min_deg"], calibration["range_max_deg"]))
                        if self._status == "running" and not in_range:
                            raise _error("Touch R1 超出本次校准范围，执行已停止", "outside_calibrated_range")
                        clipped = [max(lo, min(hi, value)) for value, lo, hi in
                                   zip(mapped, calibration["range_min_deg"], calibration["range_max_deg"])]
                        if self._status == "running":
                            dt = received_at - self._last_control_at
                            clipped = self._filter.update(clipped, dt)
                            clipped = [max(lo, min(hi, value)) for value, lo, hi in
                                       zip(clipped, calibration["range_min_deg"], calibration["range_max_deg"])]
                        desired = self._mapped_target(clipped, calibration)
                        self._preview = desired
                        gripper_preview = self._mapped_gripper(
                            leader_gripper, calibration["gripper"], require_in_range=self._status == "running")
                        self._gripper_preview = gripper_preview
                        if self._status == "running":
                            target = limit_target(self._target, desired, dt)
                            self._validate_target(target, calibration)
                            step = min(MAX_GRIPPER_RATIO_STEP, MAX_GRIPPER_RATIO_PER_SEC * max(0.0, dt))
                            gripper_target = self._gripper_target + max(
                                -step, min(step, gripper_preview - self._gripper_target))
                            if not math.isfinite(gripper_target) or not 0 <= gripper_target <= 1:
                                raise _error("Lumos 夹爪目标无效", "gripper_target_invalid")
                    self._positions = positions
                    self._gripper_feedback = gripper_feedback
                if target is not None:
                    # Stop/watchdog revokes under the state lock before cleanup.
                    # This final gate also excludes a read that finished after stop.
                    with self._command_lock:
                        self._assert_current(arm, session)
                        with self._lock:
                            if sequence != self._latest_submitted_sequence:
                                raise _error("已丢弃被新采样替代的主臂数据", "stale_sample")
                        if self._clock() - received_at > INPUT_TIMEOUT_SECONDS:
                            raise _error("主臂输入已过期，执行已停止", "sample_timeout")
                        self._require_fresh_gripper_feedback(gripper_feedback)
                        arm.set_joint_raw(target, [0.0] * 6)
                        # Stop may arrive while the six-axis SDK call is in flight.
                        self._assert_current(arm, session)
                        if self._clock() - received_at > INPUT_TIMEOUT_SECONDS:
                            raise _error("主臂输入已过期，夹爪与机械臂执行已停止", "sample_timeout")
                        self._require_fresh_gripper_feedback(gripper_feedback)
                        if arm.setGripperPosition(gripper_target) is False:
                            raise _error("Lumos SDK 拒绝夹爪目标", "gripper_command_failed")
                    self._assert_current(arm, session)
                with self._lock:
                    self._assert_current(arm, session)
                    self._last_sample_at = received_at
                    self._last_sequence = sequence
                    self._leader_deg = leader
                    self._leader_gripper_deg = leader_gripper
                    if target is not None:
                        self._target = target
                        self._gripper_target = gripper_target
                        self._last_control_at = received_at
                    return self.snapshot()
            except Exception as error:
                if not isinstance(error, DomainError) or error.code not in ("lumos_stale_sample", "lumos_stale_session"):
                    self._fault_current(arm, session, str(error))
                if isinstance(error, DomainError):
                    raise
                raise _error(f"Lumos 采样或控制失败：{error}", "sample_failed") from error

    @staticmethod
    def _mapped_target(mapped, calibration):
        values = [
            home + sign * calibration["gain"] * math.radians(value - neutral)
            for home, sign, value, neutral in zip(
                calibration["lumos_home_rad"], calibration["signs"], mapped, calibration["leader_home_deg"])
        ]
        return _six_numbers(values, "Lumos 目标")

    @staticmethod
    def _validate_target(target, calibration):
        target = _six_numbers(target, "Lumos 目标")
        for value, low, high in zip(target, calibration["target_min_rad"], calibration["target_max_rad"]):
            if not low - 1e-9 <= value <= high + 1e-9:
                raise _error("目标超出本次校准对应范围，执行已停止", "target_out_of_range")

    @staticmethod
    def _gripper_calibrated(calibration):
        closed, opened = calibration.get("closed_deg"), calibration.get("open_deg")
        return (isinstance(closed, (int, float)) and isinstance(opened, (int, float))
                and math.isfinite(opened - closed) and abs(opened - closed) >= 2.0)

    @staticmethod
    def _mapped_gripper(value, calibration, require_in_range=False):
        if calibration.get("closed_deg") is None or calibration.get("open_deg") is None:
            raise _error("请先记录 Touch R1 夹爪闭合和张开端点", "gripper_calibration_missing")
        closed, opened = calibration["closed_deg"], calibration["open_deg"]
        span = opened - closed
        if not math.isfinite(span) or abs(span) < 2.0:
            raise _error("Touch R1 夹爪两端点需要相差至少 2°", "gripper_calibration_range_small")
        if require_in_range and not min(closed, opened) - GRIPPER_ENDPOINT_TOLERANCE_DEG <= value <= max(closed, opened) + GRIPPER_ENDPOINT_TOLERANCE_DEG:
            raise _error("Touch R1 夹爪超出本次校准范围，机械臂与夹爪执行已停止", "gripper_outside_calibrated_range")
        ratio = max(0.0, min(1.0, (value - closed) / span))
        return 1.0 - ratio if calibration["invert"] else ratio

    def capture_reference(self, body):
        body = _body(body)
        arm, session = self._session(body)
        leader = _six_numbers(body.get("leader_deg"), "Touch R1 参考角度")
        leader_gripper = _finite_number(body.get("leader_gripper_deg"), "Touch R1 夹爪参考角度")
        invert_gripper = body.get("invert_gripper", False)
        if type(invert_gripper) is not bool:
            raise _error("夹爪反向选项必须是布尔值", "invalid_gripper")
        joint_map = body.get("joint_map")
        if not isinstance(joint_map, list) or len(joint_map) != 6 or any(type(i) is not int for i in joint_map) or sorted(joint_map) != list(range(6)):
            raise _error("关节映射必须是 ID 0–5 的不重复排列", "invalid_joint_map")
        signs = _six_numbers(body.get("signs"), "关节方向")
        if any(sign not in (-1.0, 1.0) for sign in signs):
            raise _error("每个关节方向必须为 1 或 -1", "invalid_signs")
        gain = body.get("gain")
        # Bounds before conversion also reject arbitrarily large JSON integers.
        if isinstance(gain, bool) or not isinstance(gain, (int, float)) or not 0 < gain <= 1:
            raise _error("跟随比例必须在 0 到 1 之间且大于 0", "invalid_gain")
        with self._operation_lock:
            self._assert_current(arm, session)
            with self._lock:
                if self._status not in ("connected", "calibrating", "preview"):
                    raise _error("执行中不能更改校准", "calibration_busy")
            try:
                positions = self._read_positions(arm)
                self._assert_current(arm, session)
                gripper_feedback = self._read_gripper(arm)
                self.check_watchdog()
                self._assert_current(arm, session)
                mapped = [leader[index] for index in joint_map]
                with self._lock:
                    self._positions = positions
                    self._gripper_feedback = gripper_feedback
                    self._calibration = {
                        "joint_map": list(joint_map), "signs": signs, "gain": float(gain),
                        "leader_home_deg": mapped, "lumos_home_rad": positions,
                        "range_min_deg": list(mapped), "range_max_deg": list(mapped),
                        "range_ready": False, "samples": 1,
                        "gripper": {"closed_deg": None, "open_deg": None, "invert": invert_gripper,
                                    "leader_home_deg": leader_gripper,
                                    "lumos_home_ratio": gripper_feedback["position_ratio"]},
                    }
                    self._preview = self._target = None
                    self._gripper_preview = self._gripper_target = None
                    self._status = "calibrating"
                    self._message = "参考姿态已记录；缓慢移动 Touch R1 六轴采集范围，Lumos 不下发运动目标"
                    return self.snapshot()
            except Exception as error:
                self._fault_current(arm, session, str(error))
                if isinstance(error, DomainError):
                    raise
                raise _error(f"记录参考姿态失败：{error}", "reference_failed") from error

    def capture_gripper(self, body):
        body = _body(body)
        arm, session = self._session(body)
        value = _finite_number(body.get("leader_gripper_deg"), "Touch R1 夹爪端点角度")
        position = body.get("position")
        if position not in ("closed", "open"):
            raise _error("夹爪端点必须选择 closed 或 open", "invalid_gripper_endpoint")
        with self._operation_lock, self._lock:
            self._assert_current(arm, session)
            if self._status != "calibrating" or self._calibration is None:
                raise _error("请先记录两臂参考姿态，再记录夹爪端点", "calibration_missing")
            self._require_fresh_input()
            if abs(value - self._leader_gripper_deg) > 2.0:
                raise _error("Touch R1 夹爪已移动，请保持端点姿态并重新记录", "gripper_endpoint_changed")
            # Store the most recent validated complete seven-channel observation.
            self._calibration["gripper"][f"{position}_deg"] = self._leader_gripper_deg
            self._message = "夹爪闭合端点已记录" if position == "closed" else "夹爪张开端点已记录"
            return self.snapshot()

    def finish_calibration(self, body):
        arm, session = self._session(_body(body))
        with self._operation_lock, self._lock:
            self._assert_current(arm, session)
            calibration = self._calibration
            if self._status != "calibrating" or calibration is None:
                raise _error("请先记录参考姿态并采集六轴范围", "calibration_missing")
            spans = [high - low for low, high in zip(calibration["range_min_deg"], calibration["range_max_deg"])]
            if any(not math.isfinite(span) or span < 2.0 for span in spans):
                raise _error("每个 Touch R1 关节都需要至少 2° 的有效采集范围", "calibration_range_small")
            self._mapped_gripper(calibration["gripper"]["leader_home_deg"], calibration["gripper"])
            first = self._mapped_target(calibration["range_min_deg"], calibration)
            second = self._mapped_target(calibration["range_max_deg"], calibration)
            calibration["target_min_rad"] = [min(a, b) for a, b in zip(first, second)]
            calibration["target_max_rad"] = [max(a, b) for a, b in zip(first, second)]
            calibration["range_ready"] = True
            self._status = "preview"
            self._message = "校准已完成；先预览方向，再将两臂放回参考姿态并确认开始"
            return self.snapshot()

    def start(self, body):
        body = _body(body)
        arm, session = self._session(body)
        if body.get("confirmed") is not True:
            raise _error("请先确认关节顺序、方向、参考姿态和硬件急停", "start_confirmation_required")
        with self._operation_lock:
            self._assert_current(arm, session)
            with self._lock:
                calibration = self._calibration
                if self._status != "preview" or not calibration or not calibration.get("range_ready"):
                    raise _error("需要完成本次连接的六轴校准后才能执行", "calibration_missing")
                self._require_fresh_input()
                mapped = [self._leader_deg[index] for index in calibration["joint_map"]]
                if any(abs(math.radians(value - home)) > REFERENCE_TOLERANCE_RAD
                       for value, home in zip(mapped, calibration["leader_home_deg"])):
                    raise _error("Touch R1 偏离参考姿态超过 0.15 rad，请先放回参考姿态", "leader_not_at_reference")
                if any(not lo <= value <= hi for value, lo, hi in
                       zip(mapped, calibration["range_min_deg"], calibration["range_max_deg"])):
                    raise _error("Touch R1 不在本次校准范围内", "outside_calibrated_range")
                gripper_preview = self._mapped_gripper(self._leader_gripper_deg, calibration["gripper"], require_in_range=True)
            try:
                positions = self._read_positions(arm)
                self._assert_current(arm, session)
                gripper_feedback = self._read_gripper(arm)
            except Exception as error:
                self._fault_current(arm, session, str(error))
                raise
            self.check_watchdog()
            self._assert_current(arm, session)
            with self._lock:
                self._require_fresh_input()
                if any(abs(value - home) > REFERENCE_TOLERANCE_RAD
                       for value, home in zip(positions, calibration["lumos_home_rad"])):
                    raise _error("Lumos 偏离参考姿态超过 0.15 rad，请先放回参考姿态或重新校准", "follower_not_at_reference")
                self._validate_target(positions, calibration)
                if abs(gripper_feedback["position_ratio"] - gripper_preview) > GRIPPER_REFERENCE_TOLERANCE:
                    raise _error("主从夹爪开度相差超过 10%，请对齐后再开始", "gripper_not_aligned")
                self._filter = JointFilter()
                self._filter.update(mapped, 1.0 / 50.0)
                self._positions = self._target = list(positions)
                self._preview = self._mapped_target(mapped, calibration)
                self._gripper_feedback = gripper_feedback
                self._gripper_target = gripper_feedback["position_ratio"]
                self._gripper_preview = gripper_preview
                self._last_control_at = self._running_since = self._clock()
                self._status = "running"
                self._message = "Touch R1 → LumosTouch 六轴与夹爪遥操作运行中"
                return self.snapshot()

    def _require_fresh_input(self):
        if self._last_sample_at is None or self._clock() - self._last_sample_at > INPUT_TIMEOUT_SECONDS:
            raise _error("需要 500 ms 内的新鲜 Touch R1 采样，请保持主臂连接", "input_stale")

    def stop(self, body):
        with self._lock:
            arm, session = self._authenticate(_body(body))
        self._revoke(arm, session, "stopped", "已停止并关闭 Lumos；再次执行需要重新连接并校准")
        return self.snapshot()

    def disconnect(self, body):
        with self._lock:
            arm, session = self._authenticate(_body(body))
        self._revoke(arm, session, "disconnected", "Lumos 已断开")
        return self.snapshot()

    def emergency_stop(self, reason="紧急停止"):
        """Internal global stop; cancels an in-flight connection without closing.

        The API owns authorization for the global emergency action. A constructor
        cannot be interrupted before it returns its object; its generation is
        invalidated and connect() cleans up that late object instead of exposing
        a session. Snapshot reports cleanup_pending during that interval.
        """
        with self._lock:
            self._generation += 1
            arm, session = self._arm, self._session_id
            if arm is None and not (self._cleanup_failed_arm or self._unclean_construction):
                self._status = "stopped"
                self._last_error = None
                self._message = str(reason) + "；再次执行需要重新连接并校准"
                if self._connecting:
                    self._cleanup_pending = True
                    self._message = str(reason) + "；正在等待 SDK 初始化返回后关闭，请保持硬件急停可用"
        if arm is not None:
            self._revoke(arm, session, "stopped", str(reason) + "；再次执行需要重新连接并校准")
        return self.snapshot()

    def _fault_current(self, arm, session, message):
        self._revoke(arm, session, "fault", message)

    def _revoke(self, arm, session, status, message):
        with self._lock:
            if self._arm is not arm or self._session_id != session:
                return
            self._arm = None
            self._session_id = self._connection_id = self._leader_connection_id = None
            self._calibration = self._filter = None
            self._target = self._preview = None
            self._gripper_target = self._gripper_preview = None
            self._status = status
            self._message = message
            self._last_error = message if status == "fault" else None
            self._cleanup_pending = True
        self._cleanup(arm)

    def _cleanup(self, arm):
        try:
            # An already-entered SDK command may finish; no later command can
            # pass its revoked session. Stop returns only after cleanup.
            with self._command_lock:
                arm.cleanup()
        except Exception as error:
            with self._lock:
                self._cleanup_failed_arm = arm
                self._status = "fault"
                self._last_error = f"SDK 关闭失败：{error}；请检查硬件并正常重启本机 Lumos 服务"
                self._message = self._last_error
        finally:
            with self._lock:
                self._cleanup_pending = False

    def check_watchdog(self):
        """Independent lease check; also callable with an injected test clock."""
        with self._lock:
            if self._arm is None or self._session_id is None:
                return
            last = self._last_sample_at if self._last_sample_at is not None else self._connected_at
            threshold = INPUT_TIMEOUT_SECONDS if self._status == "running" else CONNECTED_TIMEOUT_SECONDS
            if self._clock() - last <= threshold:
                return
            arm, session = self._arm, self._session_id
            message = ("Touch R1 输入超过 500 ms 未更新，执行已停止并关闭 Lumos"
                       if self._status == "running" else
                       "网页采样超过 1.5 秒未更新，Lumos 已关闭；请重新连接")
        self._fault_current(arm, session, message)

    def _watchdog_loop(self, interval):
        while not self._watchdog_stop.wait(interval):
            self.check_watchdog()

    def close(self):
        self._watchdog_stop.set()
        with self._lock:
            self._closed = True
            arm, session = self._arm, self._session_id
            failed = self._cleanup_failed_arm
            connecting = self._connecting_thread
        if arm is not None:
            self._revoke(arm, session, "disconnected", "Lumos 服务已关闭")
        elif failed is not None:
            self._cleanup(failed)
        if connecting is not None and connecting is not threading.current_thread():
            # Do not let a daemon HTTP request disappear after it has enabled an
            # arm. Its connect() sees _closed and cleans up before signaling.
            if not self._connect_done.wait(timeout=10.0):
                with self._lock:
                    self._status = "fault"
                    self._last_error = "SDK 初始化尚未返回，无法确认电机已关闭；请使用硬件急停并检查设备"
                    self._message = self._last_error
        if self._watchdog and self._watchdog is not threading.current_thread():
            self._watchdog.join(timeout=1.0)
