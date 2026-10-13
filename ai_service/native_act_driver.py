"""Official Fashion Star SDK transport used by LeRobot StarAI 0.0.4.

The immutable wheels are bundled with their licenses. The SDK is attached to
our existing, exclusively locked UART, so it never opens a second device handle.
"""
import math
import os
import sys
import time
from pathlib import Path

SDK_VERSION = "1.3.6"
MOTOR_NAMES = [f"Motor_{i}" for i in range(6)] + ["gripper"]


def sdk_types():
    vendor = Path(__file__).with_name("vendor")
    # Put the pinned official SDK ahead of site-packages. No network/install at run time.
    for name in ("pyserial-3.5-py2.py3-none-any.whl", "fashionstar_uart_sdk-1.3.6-py3-none-any.whl"):
        location = str(vendor / name)
        if location not in sys.path:
            sys.path.insert(0, location)
    from fashionstar_uart_sdk.uart_pocket_handler import PortHandler, SyncPositionControlOptions
    from fashionstar_uart_sdk.uservo import UartServoManager
    return PortHandler, SyncPositionControlOptions, UartServoManager


def serial_module():
    wheel = str(Path(__file__).with_name('vendor') / 'pyserial-3.5-py2.py3-none-any.whl')
    if wheel not in sys.path:
        sys.path.insert(0, wheel)
    import serial
    return serial


class AttachedUart:
    def __init__(self, fd, write_all):
        self.fd, self.write_all = fd, write_all
        self.is_open = True

    def write(self, frame):
        self.write_all(self.fd, frame, 0.35)
        return len(frame)

    def read(self, size):
        if hasattr(self.fd, 'read'):
            return self.fd.read(size)
        try:
            return os.read(self.fd, size)
        except BlockingIOError:
            return b""

    @property
    def in_waiting(self):
        if hasattr(self.fd, 'read'):
            return int(self.fd.in_waiting)
        import array
        import fcntl
        import termios
        pending = array.array("I", [0])
        fcntl.ioctl(self.fd, termios.FIONREAD, pending, True)
        return int(pending[0])


class NativeActDriver:
    def __init__(self, uart):
        PortHandler, self.Options, Manager = sdk_types()
        self.port = PortHandler("attached-follower-uart", 1_000_000)
        # This constructor initializes callbacks only; it does not scan or move motors.
        Manager.__init__(self.port, uart)
        self.seen = set()
        self.monitors = []
        original = self.port.response_handle_funcs[self.port.CODE_QUERY_SERVO_MONITOR]
        def observed(params):
            original(params)
            if len(params) == 16:
                self.seen.add(params[0])
        self.port.response_handle_funcs[self.port.CODE_QUERY_SERVO_MONITOR] = observed

    def prepare(self):
        # Same sequence as StaraiMotorsBus.connect(): unlock, then clear turn count.
        # This does not set the physical origin or change calibration ranges.
        self.release(power=900)
        self.port.ResetLoop(0xFF)

    def lock(self):
        for servo_id in range(7):
            self.port.StopOnControlMode(servo_id, "locked", 0)

    def release(self, power=0):
        failures = []
        for servo_id in range(7):
            try:
                self.port.StopOnControlMode(servo_id, "unlocked", power)
            except OSError as error:
                failures.append(str(error))
        if failures:
            raise OSError("；".join(failures))

    def write(self, angles, interval_ms=350, power=0, t_acc=50, t_dec=50):
        if len(angles) != 7 or not all(math.isfinite(float(value)) for value in angles):
            raise ValueError("目标角度必须包含七个有限值")
        motors = {}
        for index, (name, angle) in enumerate(zip(MOTOR_NAMES, angles, strict=True)):
            # Same physical units and motion options as StaraiMotorsBus.sync_write.
            motors[name] = self.Options(index, round(float(angle) * 10),
                100 if index == 6 else int(interval_ms),
                1000 if index == 6 else int(power),
                50 if index == 6 else int(t_acc),
                50 if index == 6 else int(t_dec))
        self.port.sync_write["Goal_Position"](motors)

    def read(self, timeout=0.35):
        self.seen.clear()
        # Invalidate cached SDK values: missing replies must never look like fresh observations.
        for servo_id in range(7):
            self.port.servos[servo_id].angle_monitor = float("nan")
        self.port.uart.read(self.port.uart.in_waiting)  # discard old replies before querying
        started = time.monotonic()
        self.port.sync_read["Monitor"]({name: i for i, name in enumerate(MOTOR_NAMES)})
        remaining = timeout - (time.monotonic() - started)
        if len(self.seen) < 7 and remaining > 0:
            self.port.monitor_update(7 - len(self.seen), timeout=remaining)
        missing = sorted(set(range(7)) - self.seen)
        if missing:
            raise OSError("官方驱动读取缺少舵机 ID " + "、".join(map(str, missing)))
        result, monitors = [], []
        for servo_id in range(7):
            item = self.port.servos[servo_id]
            angle = float(item.angle_monitor)
            if not math.isfinite(angle):
                raise OSError(f"舵机 ID {servo_id} 读回角度无效")
            result.append(angle)
            monitors.append({"id": servo_id, "angle": angle, "voltage_v": item.voltage / 1000,
                "current_a": item.current / 1000, "power_w": item.power / 1000,
                "temperature_c": item.temp, "status": int(item.status), "turn": item.turn})
        self.monitors = monitors
        return result

    def snapshot(self):
        return {"name": "fashionstar_uart_sdk", "version": SDK_VERSION,
            "lerobot_motor_contract": "starai-0.0.4", "motion_time_ms": 350,
            "acc_ms": 50, "dec_ms": 50, "gripper_motion_time_ms": 100,
            "gripper_power_mw": 1000, "monitors": list(self.monitors)}
