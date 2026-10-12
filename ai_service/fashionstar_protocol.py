import struct


REQUEST_HEADER = bytes((0x12, 0x4C))
RESPONSE_HEADER = bytes((0x05, 0x1C))
SYNC_COMMAND_CODE = 25
QUERY_MONITOR_CODE = 22
SET_ANGLE_CODE = 14
STOP_ON_CONTROL_CODE = 24
SERVO_IDS = tuple(range(7))


def _packet(code, params):
    params = bytes(params)
    frame = bytearray((*REQUEST_HEADER, code & 0xFF, len(params) & 0xFF, *params, 0))
    frame[-1] = sum(frame[:-1]) & 0xFF
    return bytes(frame)


def pack_sync_monitor_query(servo_ids=SERVO_IDS):
    ids = tuple(int(value) for value in servo_ids)
    return _packet(SYNC_COMMAND_CODE, (QUERY_MONITOR_CODE, 1, len(ids), *ids))


def pack_sync_angle_command(angles, interval_ms=100, t_acc=50, t_dec=50, power=0,
                            motor_options=None):
    values = tuple(float(value) for value in angles)
    if len(values) != 7:
        raise ValueError("目标角度必须包含 J1-J7")
    command = bytearray((SET_ANGLE_CODE, 15, len(values)))
    for servo_id, angle in enumerate(values):
        options = (motor_options or {}).get(servo_id, {})
        duration = int(options.get("interval_ms", interval_ms))
        acceleration = int(options.get("t_acc", t_acc))
        deceleration = int(options.get("t_dec", t_dec))
        motor_power = int(options.get("power", power))
        if duration < acceleration + deceleration or not 0 <= duration <= 4096000:
            raise ValueError("舵机运动时间不能短于加减速时间之和")
        command.extend(struct.pack(
            "<BiIHHH",
            servo_id,
            round(angle * 10),
            duration,
            acceleration,
            deceleration,
            motor_power,
        ))
    return _packet(SYNC_COMMAND_CODE, command)


def pack_stop_on_control(servo_id, method, power=0):
    return _packet(STOP_ON_CONTROL_CODE, struct.pack("<BBH", int(servo_id) & 0xFF, int(method) & 0xFF, int(power)))


def parse_monitor_frames(data):
    buffer = bytes(data)
    monitors = []
    cursor = 0
    while cursor + 5 <= len(buffer):
        header = buffer.find(RESPONSE_HEADER, cursor)
        if header < 0:
            return monitors, buffer[-1:] if buffer.endswith(RESPONSE_HEADER[:1]) else b""
        if header + 4 > len(buffer):
            return monitors, buffer[header:]
        size = buffer[header + 3]
        frame_length = 5 + size
        if header + frame_length > len(buffer):
            return monitors, buffer[header:]
        frame = buffer[header:header + frame_length]
        cursor = header + frame_length
        if frame[-1] != sum(frame[:-1]) & 0xFF:
            cursor = header + 1
            continue
        if frame[2] != QUERY_MONITOR_CODE or size != 16:
            continue
        params = frame[4:-1]
        angle_raw = struct.unpack_from("<i", params, 10)[0]
        turn = struct.unpack_from("<h", params, 14)[0]
        if angle_raw == -235929599 and turn == 0:
            continue
        monitors.append({
            "id": params[0],
            "angle": angle_raw / 10.0,
            "turn": turn,
        })
    return monitors, buffer[cursor:]
