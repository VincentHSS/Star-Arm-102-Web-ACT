import struct
import unittest

from ai_service.fashionstar_protocol import (
    QUERY_MONITOR_CODE,
    pack_sync_angle_command,
    pack_sync_monitor_query,
    pack_stop_on_control,
    parse_monitor_frames,
)


def response_frame(servo_id, angle):
    params = bytearray(16)
    params[0] = servo_id
    struct.pack_into("<H", params, 1, 7400)
    struct.pack_into("<H", params, 3, 120)
    struct.pack_into("<H", params, 5, 50)
    struct.pack_into("<H", params, 7, 250)
    params[9] = 0
    struct.pack_into("<i", params, 10, round(angle * 10))
    struct.pack_into("<h", params, 14, 0)
    frame = bytearray([0x05, 0x1C, QUERY_MONITOR_CODE, len(params), *params, 0])
    frame[-1] = sum(frame[:-1]) & 0xFF
    return bytes(frame)


class FashionStarProtocolTests(unittest.TestCase):
    def test_sync_monitor_query_matches_product_frame_shape(self):
        frame = pack_sync_monitor_query(range(7))
        self.assertEqual(frame[:4], bytes([0x12, 0x4C, 25, 10]))
        self.assertEqual(frame[4:7], bytes([22, 1, 7]))
        self.assertEqual(frame[7:14], bytes(range(7)))
        self.assertEqual(frame[-1], sum(frame[:-1]) & 0xFF)

    def test_monitor_parser_handles_fragmented_and_noisy_serial_bytes(self):
        payload = b"noise" + b"".join(response_frame(index, index + 0.5) for index in range(7))
        monitors, remainder = parse_monitor_frames(payload)
        self.assertEqual(remainder, b"")
        self.assertEqual([item["id"] for item in monitors], list(range(7)))
        self.assertEqual([item["angle"] for item in monitors], [index + 0.5 for index in range(7)])

    def test_sync_target_encodes_seven_angles_and_100_ms_interval(self):
        frame = pack_sync_angle_command([0, 1, 2, 3, 4, 5, 6], interval_ms=100)
        self.assertEqual(frame[:4], bytes([0x12, 0x4C, 25, 108]))
        self.assertEqual(frame[4:7], bytes([14, 15, 7]))
        first = struct.unpack_from("<BiIHHH", frame, 7)
        self.assertEqual(first[:3], (0, 0, 100))
        last = struct.unpack_from("<BiIHHH", frame, 7 + 6 * 15)
        self.assertEqual(last[:3], (6, 60, 100))
        self.assertEqual(frame[-1], sum(frame[:-1]) & 0xFF)

    def test_hd_hover_frames_match_existing_lock_and_release_contract(self):
        lock = pack_stop_on_control(3, 0x11)
        release = pack_stop_on_control(0xFF, 0x10)
        self.assertEqual(lock[:4], bytes([0x12, 0x4C, 24, 4]))
        self.assertEqual(lock[4:8], bytes([3, 0x11, 0, 0]))
        self.assertEqual(release[4:8], bytes([0xFF, 0x10, 0, 0]))


if __name__ == "__main__":
    unittest.main()
