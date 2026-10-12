import os
import unittest
if os.name == "nt":
    raise unittest.SkipTest("POSIX pseudo-terminal tests require Linux")
import pty
import select
import struct
import tempfile
import threading
import time
import unittest
from pathlib import Path

from ai_service.domain import DomainError
from ai_service.serial_connections import SerialConnectionManager


def monitor_response(servo_id, angle):
    params = bytearray(16)
    params[0] = servo_id
    struct.pack_into("<i", params, 10, round(angle * 10))
    frame = bytearray([0x05, 0x1C, 22, 16, *params, 0])
    frame[-1] = sum(frame[:-1]) & 0xFF
    return bytes(frame)


class ServoPeer:
    def __init__(self, master, angles):
        self.master = master
        self.angles = angles
        self.targets = []
        self.stop_controls = []
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def run(self):
        buffer = b""
        while not self.stop.is_set():
            readable, _, _ = select.select([self.master], [], [], 0.05)
            if not readable:
                continue
            try:
                buffer += os.read(self.master, 4096)
            except OSError:
                return
            while len(buffer) >= 5:
                if buffer[:2] != b"\x12\x4c":
                    buffer = buffer[1:]
                    continue
                length = 5 + buffer[3]
                if len(buffer) < length:
                    break
                frame, buffer = buffer[:length], buffer[length:]
                if frame[2] == 25 and frame[4] == 22:
                    ids = frame[7:7 + frame[6]]
                    os.write(self.master, b"".join(monitor_response(servo_id, self.angles[servo_id]) for servo_id in ids))
                elif frame[2] == 25 and frame[4] == 14:
                    self.targets.append([
                        struct.unpack_from("<BiIHHH", frame, 7 + index * 15)[1] / 10
                        for index in range(7)
                    ])
                elif frame[2] == 24:
                    self.stop_controls.append((frame[4], frame[5]))

    def close(self):
        self.stop.set()
        self.thread.join(timeout=1)


class SerialConnectionManagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.manager = SerialConnectionManager(Path(self.tmp.name))

    def tearDown(self):
        self.manager.close_all()
        self.tmp.cleanup()

    def test_rejects_unknown_candidate_and_invalid_role(self):
        with self.assertRaises(DomainError) as error:
            self.manager.connect("camera", "/dev/null", ["/dev/null"], "HD")
        self.assertEqual(error.exception.code, "invalid_serial_role")
        with self.assertRaises(DomainError) as error:
            self.manager.connect("leader", "/dev/ttyUSB9", [], "HD")
        self.assertEqual(error.exception.code, "unknown_serial_candidate")

    def test_opens_candidate_at_product_baud_and_disconnects_idempotently(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        try:
            state = self.manager.connect("leader", path, [path], "LD")
            self.assertTrue(state["connected"])
            self.assertEqual(state["baudrate"], 1_000_000)
            self.assertEqual(state["verification"], "transport_open")
            self.assertFalse(state["identity_verified"])
            self.assertFalse(self.manager.disconnect("leader")["connected"])
            self.assertFalse(self.manager.disconnect("leader")["connected"])
        finally:
            os.close(master)
            os.close(slave)

    def test_one_physical_port_cannot_serve_both_roles(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        try:
            self.manager.connect("leader", path, [path], "HD")
            with self.assertRaises(DomainError) as error:
                self.manager.connect("follower", path, [path], "HD")
            self.assertEqual(error.exception.code, "serial_port_in_use")
        finally:
            os.close(master)
            os.close(slave)

    def test_protocol_transactions_read_real_joints_and_write_follower_target(self):
        leader_master, leader_slave = pty.openpty()
        follower_master, follower_slave = pty.openpty()
        leader_path = os.ttyname(leader_slave)
        follower_path = os.ttyname(follower_slave)
        leader = ServoPeer(leader_master, [1, 2, 3, 4, 5, 6, 40])
        follower = ServoPeer(follower_master, [11, 12, 13, 14, 15, 16, 20])
        try:
            candidates = [leader_path, follower_path]
            self.manager.connect("leader", leader_path, candidates, "LD")
            self.manager.connect("follower", follower_path, candidates)
            leader_angles = self.manager.read_angles("leader")
            follower_angles = self.manager.read_follower_angles()
            self.assertEqual(leader_angles, [1, 2, 3, 4, 5, 6, 60])
            self.assertEqual(follower_angles, [11, 12, 13, 14, 15, 16, 20])
            self.manager.write_follower_angles(leader_angles)
            deadline = time.monotonic() + 1
            while not follower.targets and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual(follower.targets[-1], leader_angles)
        finally:
            self.manager.close_all()
            leader.close()
            follower.close()
            for fd in (leader_master, leader_slave, follower_master, follower_slave):
                os.close(fd)

    def test_ld_angle_reads_never_apply_hd_hover_torque_commands(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        peer = ServoPeer(master, [1, 2, 3, 4, 5, 6, 40])
        calls = []
        self.manager._apply_hd_hover = lambda *args, **kwargs: calls.append((args, kwargs))
        try:
            self.manager.connect("leader", path, [path], "LD")
            self.manager.read_angles("leader")
            self.assertEqual(calls, [])
        finally:
            self.manager.close_all()
            peer.close()
            os.close(master)
            os.close(slave)
    def test_lock_follower_torque_locks_j1_through_j7_in_order(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        peer = ServoPeer(master, [0] * 7)
        try:
            self.manager.connect("follower", path, [path])
            self.manager.lock_follower_torque()
            deadline = time.monotonic() + 1
            while len(peer.stop_controls) < 7 and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual(peer.stop_controls, [(servo_id, 0x11) for servo_id in range(7)])
        finally:
            self.manager.close_all()
            peer.close()
            os.close(master)
            os.close(slave)

    def test_release_follower_torque_stops_j1_through_j7_in_order(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        peer = ServoPeer(master, [0] * 7)
        try:
            self.manager.connect("follower", path, [path])
            self.manager.release_follower_torque()
            deadline = time.monotonic() + 1
            while len(peer.stop_controls) < 7 and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual(peer.stop_controls, [(servo_id, 0x10) for servo_id in range(7)])
        finally:
            self.manager.close_all()
            peer.close()
            os.close(master)
            os.close(slave)

    def test_follower_drive_test_sends_target_and_reports_structured_result(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        peer = ServoPeer(master, [10, 20, 30, 40, 50, 60, 45])
        try:
            self.manager.connect("follower", path, [path])
            result = self.manager.follower_drive_test(offset_deg=10, power=0, interval_ms=100)

            self.assertEqual(len(result["before"]), 7)
            self.assertEqual(len(result["moved"]), 7)
            self.assertEqual(result["target"], [20, 30, 40, 50, 60, 70, 55])
            deadline = time.monotonic() + 1
            while len(peer.targets) < 2 and time.monotonic() < deadline:
                time.sleep(0.01)
            # The peer does not emulate motion, so it sends target then restores before.
            self.assertEqual(peer.targets[0], result["target"])
            self.assertEqual(peer.targets[1], result["before"])
            self.assertEqual(result["power"], 0)
        finally:
            self.manager.close_all()
            peer.close()
            os.close(master)
            os.close(slave)

    def test_follower_drive_test_with_lock_sends_torque_lock_first(self):
        master, slave = pty.openpty()
        path = os.ttyname(slave)
        peer = ServoPeer(master, [10, 20, 30, 40, 50, 60, 45])
        try:
            self.manager.connect("follower", path, [path])
            result = self.manager.follower_drive_test(
                offset_deg=20, power=0, interval_ms=100, lock_before=True)
            deadline = time.monotonic() + 1
            while len(peer.stop_controls) < 7 and time.monotonic() < deadline:
                time.sleep(0.01)
            # lock_before sends the 0x11 torque lock to J1-J7 before driving.
            self.assertEqual(peer.stop_controls[:7], [(servo_id, 0x11) for servo_id in range(7)])
            self.assertEqual(result["before"], result["after"])
            self.assertEqual(result["max_moved"], 0.0)
            self.assertTrue(result["lock_before"])
        finally:
            self.manager.close_all()
            peer.close()
            os.close(master)
            os.close(slave)


if __name__ == "__main__":
    unittest.main()