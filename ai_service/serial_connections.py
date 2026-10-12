import os
import select
try:
    import termios
except ImportError:  # Windows can serve the workbench without POSIX serial hardware.
    termios = None
import time
from pathlib import Path
from threading import Lock, RLock

from .domain import DomainError
from .native_act_driver import NativeActDriver, AttachedUart
from .fashionstar_protocol import (
    SERVO_IDS,
    pack_sync_angle_command,
    pack_sync_monitor_query,
    pack_stop_on_control,
    parse_monitor_frames,
)


SERIAL_ROLES = ("leader", "follower")
PRODUCT_BAUDRATE = 1_000_000


class SerialConnectionManager:
    def __init__(self, data_root: Path):
        self.data_root = Path(data_root)
        self.data_root.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._connections = {}

    def snapshot(self):
        with self._lock:
            return {
                role: self._public_state(role, connection)
                for role, connection in self._connections.items()
            }

    def connect(self, role, port, candidates, leader_type=None):
        if termios is None:
            raise DomainError("Windows 本机暂不支持此机械臂串口执行，请在 Ubuntu 启动完整实机服务", "serial_platform_unsupported")
        if role not in SERIAL_ROLES:
            raise DomainError("串口角色无效", "invalid_serial_role")
        if not port or port not in candidates:
            raise DomainError("所选串口不在本机候选列表中", "unknown_serial_candidate")
        if role == "leader" and leader_type not in ("LD", "HD"):
            raise DomainError("Leader 型号无效", "invalid_leader_type")
        with self._lock:
            current = self._connections.get(role)
            if current and current["port"] == port:
                return self._public_state(role, current)
            if any(item["port"] == port for name, item in self._connections.items() if name != role):
                raise DomainError("该串口已由另一个机械臂角色占用", "serial_port_in_use")
            if current:
                self._close(current)
                self._connections.pop(role, None)
            try:
                fd = os.open(port, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
                attrs = termios.tcgetattr(fd)
                speed = getattr(termios, "B1000000", None)
                if speed is None:
                    os.close(fd)
                    raise OSError("当前系统不支持 1 Mbps 串口常量")
                attrs[0] = 0
                attrs[1] = 0
                attrs[2] = termios.CS8 | termios.CLOCAL | termios.CREAD
                attrs[3] = 0
                attrs[4] = speed
                attrs[5] = speed
                attrs[6][termios.VMIN] = 0
                attrs[6][termios.VTIME] = 1
                termios.tcsetattr(fd, termios.TCSANOW, attrs)
                termios.tcflush(fd, termios.TCIOFLUSH)
            except OSError as error:
                raise DomainError(f"无法打开串口：{error}", "serial_open_failed") from error
            connection = {
                "fd": fd,
                "port": port,
                "baudrate": PRODUCT_BAUDRATE,
                "leader_type": leader_type if role == "leader" else None,
                "verification": "transport_open",
                "identity_verified": False,
                "io_lock": Lock(),
                "rx_buffer": b"",
            }
            self._connections[role] = connection
            return self._public_state(role, connection)

    def disconnect(self, role):
        if role not in SERIAL_ROLES:
            raise DomainError("串口角色无效", "invalid_serial_role")
        with self._lock:
            connection = self._connections.pop(role, None)
            if connection:
                self._close(connection)
            return {"role": role, "connected": False, "verification": "disconnected"}

    def require_roles(self):
        with self._lock:
            missing = [role for role in SERIAL_ROLES if role not in self._connections]
        if missing:
            names = "、".join("Leader" if role == "leader" else "真实 FL" for role in missing)
            raise DomainError(f"请先连接 {names}", "serial_roles_not_connected")

    def read_angles(self, role, timeout=0.35):
        connection = self._connection(role)
        monitor_ids = (*SERVO_IDS, 7) if role == "leader" and connection["leader_type"] == "HD" else SERVO_IDS
        with connection["io_lock"]:
            self._assert_current(role, connection)
            if role == "follower" and connection.get("act_driver"):
                try:
                    return connection["act_driver"].read(timeout)
                except OSError as error:
                    raise DomainError(str(error), "joint_read_timeout") from error
            try:
                termios.tcflush(connection["fd"], termios.TCIFLUSH)
                self._write_all(connection["fd"], pack_sync_monitor_query(monitor_ids), timeout)
                monitors = {}
                buffer = b""
                deadline = time.monotonic() + timeout
                while len(monitors) < len(monitor_ids):
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        break
                    readable, _, _ = select.select([connection["fd"]], [], [], remaining)
                    if not readable:
                        break
                    chunk = os.read(connection["fd"], 4096)
                    if not chunk:
                        raise OSError("串口数据流已结束")
                    parsed, buffer = parse_monitor_frames(buffer + chunk)
                    for monitor in parsed:
                        if monitor["id"] in monitor_ids:
                            monitors[monitor["id"]] = monitor
            except OSError as error:
                raise DomainError(f"{self._role_name(role)}读取失败：{error}", "serial_read_failed") from error
            missing = [servo_id for servo_id in monitor_ids if servo_id not in monitors]
            if missing:
                ids = "、".join(str(value) for value in missing)
                raise DomainError(f"{self._role_name(role)}缺少舵机 ID {ids} 的实时角度", "joint_read_timeout")
            if role == "leader" and connection["leader_type"] == "HD":
                self._apply_hd_hover(connection, monitors[7]["angle"], timeout)
            angles = [monitors[servo_id]["angle"] for servo_id in SERVO_IDS]
            if role == "leader":
                angles[6] = max(0.0, min(angles[6] * 1.5, 90.0))
            return angles

    def read_follower_angles(self, timeout=0.35):
        return self.read_angles("follower", timeout=timeout)

    def read_follower_angles_for_control(self, period_seconds):
        # Leave time for the next streamed command; a missing servo faults promptly
        # instead of silently stretching a 30 Hz control cycle to 350 ms.
        timeout = min(0.35, max(0.01, float(period_seconds) * 0.75))
        return self.read_follower_angles(timeout=timeout)

    def write_follower_angles(self, angles, interval_ms=100, power=0,
                              t_acc=20, t_dec=20):
        connection = self._connection("follower")
        frame = pack_sync_angle_command(angles, interval_ms=interval_ms,
                                        t_acc=t_acc, t_dec=t_dec, power=power)
        with connection["io_lock"]:
            self._assert_current("follower", connection)
            try:
                self._write_all(connection["fd"], frame, 0.35)
            except OSError as error:
                raise DomainError(f"真实 FL 目标写入失败：{error}", "serial_write_failed") from error

    def begin_native_act(self):
        connection = self._connection("follower")
        with connection["io_lock"]:
            self._assert_current("follower", connection)
            driver = NativeActDriver(AttachedUart(connection["fd"], self._write_all))
            connection["act_driver"] = driver
            try:
                driver.prepare()
            except Exception:
                try:
                    driver.release()
                finally:
                    connection.pop("act_driver", None)
                raise
        return driver.snapshot()

    def end_native_act(self):
        connection = self._connection("follower")
        with connection["io_lock"]:
            connection.pop("act_driver", None)

    def write_follower_angles_for_act(self, angles, interval_ms=350, power=0,
                                      t_acc=50, t_dec=50):
        connection = self._connection("follower")
        with connection["io_lock"]:
            self._assert_current("follower", connection)
            driver = connection.get("act_driver")
            if not driver:
                raise DomainError("官方 ACT 驱动尚未初始化", "native_act_driver_missing")
            try:
                driver.write(angles, interval_ms=interval_ms, power=power, t_acc=t_acc, t_dec=t_dec)
            except OSError as error:
                raise DomainError(f"官方驱动目标写入失败：{error}", "serial_write_failed") from error

    def follower_drive_test(self, offset_deg=5.0, power=0, interval_ms=300,
                            lock_before=False, t_acc=50, t_dec=50):
        """Send one explicit position command to the real FL and read back.

        Used to verify whether the ACT Python serial layer can actually drive
        servos, independent of the inference loop. With ``lock_before`` it first
        sends the 0x11 torque lock (as the inference loop does at start()), which
        isolates whether that lock prevents the servos from following the
        position command. Returns before/target/after angles and movement."""
        offset = max(-15.0, min(15.0, float(offset_deg)))
        power = 0 if power is None else int(power)
        interval_ms = max(30, min(2000, int(interval_ms)))
        t_acc = max(5, min(200, int(t_acc)))
        t_dec = max(5, min(200, int(t_dec)))
        lock_before = bool(lock_before)
        before = self.read_follower_angles()
        if lock_before:
            self.lock_follower_torque()
            time.sleep(0.2)
        target = [max(-90.0, min(90.0, float(value) + offset)) for value in before]
        self.write_follower_angles(target, interval_ms=interval_ms, power=power,
                                   t_acc=t_acc, t_dec=t_dec)
        time.sleep(max(0.2, interval_ms / 1000.0 * 2.0))
        after = self.read_follower_angles()
        moved = [round(after[i] - before[i], 2) for i in range(len(SERVO_IDS))]
        if lock_before:
            self.release_follower_torque()
        # Re-establish the pre-test posture so ordering remains stable.
        self.write_follower_angles(before, interval_ms=interval_ms, power=power,
                                   t_acc=t_acc, t_dec=t_dec)
        return {
            "power": power, "interval_ms": interval_ms, "offset_deg": offset,
            "lock_before": lock_before, "t_acc": t_acc, "t_dec": t_dec,
            "before": [round(float(v), 2) for v in before],
            "target": [round(float(v), 2) for v in target],
            "after": [round(float(v), 2) for v in after],
            "moved": moved,
            "max_moved": max((abs(v) for v in moved), default=0.0),
        }

    def lock_follower_torque(self):
        connection = self._connection("follower")
        locked = []
        servo_id = None
        with connection["io_lock"]:
            self._assert_current("follower", connection)
            try:
                if connection.get("act_driver"):
                    connection["act_driver"].lock()
                    return {"locked": True, "servo_ids": list(SERVO_IDS), "driver": "fashionstar_uart_sdk"}
                for servo_id in SERVO_IDS:
                    self._write_all(connection["fd"], pack_stop_on_control(servo_id, 0x11), 0.35)
                    locked.append(servo_id)
            except OSError as error:
                for servo_id in locked:
                    try:
                        self._write_all(connection["fd"], pack_stop_on_control(servo_id, 0x10), 0.35)
                    except OSError:
                        pass
                raise DomainError(
                    f"真实 FL 锁力失败：舵机 ID {servo_id}：{error}", "follower_torque_lock_failed"
                ) from error
        return {"locked": True, "servo_ids": list(SERVO_IDS)}

    def release_follower_torque(self):
        connection = self._connection("follower")
        with connection["io_lock"]:
            self._assert_current("follower", connection)
            if connection.get("act_driver"):
                connection["act_driver"].release()
                return {"released": True, "servo_ids": list(SERVO_IDS), "driver": "fashionstar_uart_sdk"}
            for servo_id in SERVO_IDS:
                try:
                    self._write_all(connection["fd"], pack_stop_on_control(servo_id, 0x10), 0.35)
                except OSError as error:
                    raise DomainError(
                        f"真实 FL 卸力失败：舵机 ID {servo_id}：{error}", "follower_torque_release_failed"
                    ) from error
        return {"released": True, "servo_ids": list(SERVO_IDS)}

    def _apply_hd_hover(self, connection, button_angle, timeout):
        should_lock = round(button_angle) == 180
        locked = connection.get("hd_hover_locked", False)
        if should_lock == locked:
            return
        frames = [pack_stop_on_control(servo_id, 0x11) for servo_id in range(6)] if should_lock else [pack_stop_on_control(0xFF, 0x10)]
        for frame in frames:
            self._write_all(connection["fd"], frame, timeout)
        connection["hd_hover_locked"] = should_lock

    def _connection(self, role):
        if role not in SERIAL_ROLES:
            raise DomainError("串口角色无效", "invalid_serial_role")
        with self._lock:
            connection = self._connections.get(role)
        if not connection:
            raise DomainError(f"{self._role_name(role)}未连接", "serial_role_not_connected")
        return connection

    def _assert_current(self, role, connection):
        with self._lock:
            if self._connections.get(role) is not connection:
                raise DomainError(f"{self._role_name(role)}连接已变化", "serial_connection_changed")

    @staticmethod
    def _write_all(fd, frame, timeout):
        view = memoryview(frame)
        deadline = time.monotonic() + timeout
        while view:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise OSError("串口写入超时")
            _, writable, _ = select.select([], [fd], [], remaining)
            if not writable:
                raise OSError("串口写入超时")
            written = os.write(fd, view)
            if written <= 0:
                raise OSError("串口写入失败")
            view = view[written:]

    @staticmethod
    def _role_name(role):
        return "Leader" if role == "leader" else "真实 FL"

    def close_all(self):
        with self._lock:
            for connection in self._connections.values():
                self._close(connection)
            self._connections.clear()

    @staticmethod
    def _close(connection):
        try:
            os.close(connection["fd"])
        except OSError:
            pass

    @staticmethod
    def _public_state(role, connection):
        return {
            "role": role,
            "connected": True,
            "port": connection["port"],
            "baudrate": connection["baudrate"],
            "leader_type": connection["leader_type"],
            "verification": connection["verification"],
            "identity_verified": connection["identity_verified"],
            "act_driver": connection["act_driver"].snapshot() if connection.get("act_driver") else None,
        }
