const REQUEST_HEADER = [0x12, 0x4c];
const RESPONSE_HEADER = [0x05, 0x1c];

const CODE_RESET_MULTI_TURN_ANGLE = 17;
const CODE_QUERY_SERVO_MONITOR = 22;
const CODE_SET_ORIGIN_POINT = 23;
const CODE_SET_STOP_ON_CONTROL = 24;
const CODE_SYNC_COMMAND = 25;
const CODE_SET_SERVO_ANGLE_MTURN_BY_INTERVAL = 14;

export class Packet {
  static pack(code, params = []) {
    const paramBytes = Uint8Array.from(params);
    const frame = new Uint8Array(REQUEST_HEADER.length + 2 + paramBytes.length + 1);
    frame.set(REQUEST_HEADER, 0);
    frame[2] = code & 0xff;
    frame[3] = paramBytes.length & 0xff;
    frame.set(paramBytes, 4);
    frame[frame.length - 1] = checksum(frame.slice(0, -1));
    return frame;
  }

  static unpackResponse(frame) {
    const bytes = Uint8Array.from(frame);
    if (bytes.length < 5) return null;
    if (bytes[0] !== RESPONSE_HEADER[0] || bytes[1] !== RESPONSE_HEADER[1]) return null;
    const code = bytes[2];
    const size = bytes[3];
    if (bytes.length !== 2 + 1 + 1 + size + 1) return null;
    if (bytes[bytes.length - 1] !== checksum(bytes.slice(0, -1))) return null;
    return { code, params: bytes.slice(4, -1) };
  }

  static packResponseForTest(code, params = []) {
    const paramBytes = Uint8Array.from(params);
    const frame = new Uint8Array(RESPONSE_HEADER.length + 2 + paramBytes.length + 1);
    frame.set(RESPONSE_HEADER, 0);
    frame[2] = code & 0xff;
    frame[3] = paramBytes.length & 0xff;
    frame.set(paramBytes, 4);
    frame[frame.length - 1] = checksum(frame.slice(0, -1));
    return frame;
  }
}

export class PacketParser {
  constructor() {
    this.buffer = [];
  }

  push(chunk) {
    this.buffer.push(...chunk);
    const packets = [];

    while (this.buffer.length >= 5) {
      if (this.isParameterReadRequest()) {
        const length = 6;
        if (this.buffer.length < length) break;
        this.buffer.splice(0, length);
        continue;
      }
      const parameterPacket = this.takeParameterPacket();
      if (parameterPacket) {
        packets.push(parameterPacket);
        continue;
      }
      if (this.isPartialParameterPacket()) break;

      const headerIndex = this.findResponseHeader();
      if (headerIndex < 0) {
        this.buffer = this.buffer.slice(-1);
        break;
      }
      if (headerIndex > 0) this.buffer.splice(0, headerIndex);
      if (this.buffer.length < 4) break;

      const size = this.buffer[3];
      const frameLength = 2 + 1 + 1 + size + 1;
      if (this.buffer.length < frameLength) break;

      const frame = this.buffer.slice(0, frameLength);
      this.buffer.splice(0, frameLength);
      const packet = Packet.unpackResponse(frame);
      if (packet) {
        // Real servo responses use 05 1c; legacy echoed parameter frames
        // are handled above. Preserve code/params for other consumers.
        if (packet.code === 0x05 && packet.params.length === 33) {
          packets.push({ ...packet, kind: 'public-parameters', frame: Uint8Array.from(frame) });
        } else if ((packet.code === 0xc5 || packet.code === 0xc4) && packet.params.length === 26) {
          packets.push({ ...packet, kind: 'internal-parameters', frame: Uint8Array.from(frame) });
        } else {
          packets.push(packet);
        }
      }
    }

    return packets;
  }

  findResponseHeader() {
    for (let i = 0; i < this.buffer.length - 1; i += 1) {
      if (this.buffer[i] === RESPONSE_HEADER[0] && this.buffer[i + 1] === RESPONSE_HEADER[1]) {
        return i;
      }
    }
    return -1;
  }

  isParameterReadRequest() {
    return (this.buffer[0] === 0x12 && this.buffer[1] === 0x4c && this.buffer[2] === 0x05 && this.buffer[3] === 0x01)
      || (this.buffer[0] === 0x13 && this.buffer[1] === 0x4d && this.buffer[2] === 0xc5 && this.buffer[3] === 0x01);
  }

  isPartialParameterPacket() {
    return isPublicParameterHeader(this.buffer) || isInternalParameterHeader(this.buffer);
  }

  takeParameterPacket() {
    const length = isPublicParameterHeader(this.buffer) ? 38 : (isInternalParameterHeader(this.buffer) ? 31 : 0);
    if (!length || this.buffer.length < length) return null;
    const frame = Uint8Array.from(this.buffer.slice(0, length));
    if (frame[frame.length - 1] !== checksum(frame.slice(0, -1))) {
      this.buffer.shift();
      return null;
    }
    this.buffer.splice(0, length);
    return { kind: length === 38 ? 'public-parameters' : 'internal-parameters', frame };
  }
}

export class ServoProtocol {
  static resetMultiTurnAngle(servoId) {
    return Packet.pack(CODE_RESET_MULTI_TURN_ANGLE, [servoId & 0xff]);
  }

  static setOriginPoint(servoId) {
    return Packet.pack(CODE_SET_ORIGIN_POINT, [servoId & 0xff, 0]);
  }

  static stopOnControlMode(servoId, method, power = 0) {
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint8(0, servoId & 0xff);
    view.setUint8(1, method & 0xff);
    view.setUint16(2, power, true);
    return Packet.pack(CODE_SET_STOP_ON_CONTROL, bytes);
  }
  static releaseTorque(servoId) {
    return ServoProtocol.stopOnControlMode(servoId, 0x10, 0);
  }

  static lockTorque(servoId) {
    return ServoProtocol.stopOnControlMode(servoId, 0x11, 0);
  }

  static writePublicParameters(servoId, v, options = {}) {
    const targetId = options.targetId ?? servoId;
    const p = [servoId & 255, 1, v.need_response, targetId & 255, 0, v.baudrate, v.stall_protection];
    for (const key of ['stall_power_limit','low_voltage_protection','high_voltage_protection','temperature_protection','power_protection','current_protection']) pushU16(p, v[key]);
    p.push(v.startup_force,v.hysteresis_percent,v.power_lock_switch,v.wheel_mode_brake_switch,v.angle_limit_switch,v.soft_start_switch);
    pushU16(p,v.soft_start_time); pushU16(p,v.angle_upper_limit); pushU16(p,v.angle_lower_limit & 0xffff); p.push(0,0);
    return packRaw([0x12,0x4c,0x06,0x21],p);
  }

  static writeInternalParameters(servoId, v) {
    const p=[servoId & 255];
    for (const key of ['kp','kd','ki','bias','hold_kp','hold_kd','hold_bias']) pushU16(p,v[key]);
    p.push(0x10,0x0e,0,0,0xa4,0x0b,v.forward_direction,5,v.dead_zone,0,1);
    return packRaw([0x13,0x4d,0xc4,0x1a],p);
  }

  static readPublicParameters(servoId) { return packRaw([0x12,0x4c,0x05,0x01],[servoId & 255]); }
  static readInternalParameters(servoId) { return packRaw([0x13,0x4d,0xc5,0x01],[servoId & 255]); }

  static syncServoMonitor(servoIds) {
    return Packet.pack(CODE_SYNC_COMMAND, [
      CODE_QUERY_SERVO_MONITOR,
      1,
      servoIds.length,
      ...servoIds.map((id) => id & 0xff),
    ]);
  }

  static syncMultiTurnAngleByInterval(angles, options = {}) {
    const interval = options.interval ?? 100;
    const tAcc = options.tAcc ?? 50;
    const tDec = options.tDec ?? 50;
    const power = options.power ?? 0;
    const servoIds = options.servoIds ?? angles.map((_, index) => index);
    const commandBytes = [];

    for (let i = 0; i < servoIds.length; i += 1) {
      const bytes = new Uint8Array(15);
      const view = new DataView(bytes.buffer);
      view.setUint8(0, servoIds[i] & 0xff);
      view.setInt32(1, Math.trunc(angles[i] * 10), true);
      view.setUint32(5, interval, true);
      view.setUint16(9, tAcc, true);
      view.setUint16(11, tDec, true);
      view.setUint16(13, power, true);
      commandBytes.push(...bytes);
    }

    return Packet.pack(CODE_SYNC_COMMAND, [
      CODE_SET_SERVO_ANGLE_MTURN_BY_INTERVAL,
      15,
      servoIds.length,
      ...commandBytes,
    ]);
  }
}

export function parseMonitorPacket(frameOrPacket) {
  const packet = frameOrPacket.params ? frameOrPacket : Packet.unpackResponse(frameOrPacket);
  if (!packet || packet.code !== CODE_QUERY_SERVO_MONITOR || packet.params.length !== 16) return null;

  const params = packet.params;
  const view = new DataView(params.buffer, params.byteOffset, params.byteLength);
  const angleRaw = view.getInt32(10, true);
  const turn = view.getInt16(14, true);

  if (angleRaw === -235929599 && turn === 0) return null;

  return {
    id: view.getUint8(0),
    voltage: view.getUint16(1, true),
    current: view.getUint16(3, true),
    power: view.getUint16(5, true),
    temperatureRaw: view.getUint16(7, true),
    status: view.getUint8(9),
    angle: angleRaw / 10,
    turn,
  };
}

export function clampGripperAngle(angle) {
  return Math.max(0, Math.min(angle * 1.5, 90));
}

function checksum(bytes) {
  return bytes.reduce((sum, byte) => (sum + byte) & 0xff, 0);
}



export function selectParameterResponse(bytes, kind, servoId) {
  const data = Uint8Array.from(bytes);
  const length = kind === 'public' ? 38 : 31;
  const command = kind === 'public' ? 0x05 : 0xc5;
  for (let index = 0; index + length <= data.length; index += 1) {
    const realHeader = data[index] === 0x05 && data[index + 1] === 0x1c && data[index + 2] === command;
    const legacyHeader = data[index] === (kind === 'public' ? 0x12 : 0x13)
      && data[index + 1] === (kind === 'public' ? 0x4c : 0x4d);
    if ((realHeader || legacyHeader) && data[index + 3] !== 0x01 && data[index + 4] === servoId) {
      return data.slice(index, index + length);
    }
  }
  return null;
}

export function parsePublicParametersPacket(input) {
  const f=Uint8Array.from(input.frame ?? input); if(f.length!==38) return null; const v=new DataView(f.buffer,f.byteOffset,f.byteLength);
  return {id:f[4],need_response:f[6],baudrate:f[9],stall_protection:f[10],stall_power_limit:v.getUint16(11,true),low_voltage_protection:v.getUint16(13,true),high_voltage_protection:v.getUint16(15,true),temperature_protection:v.getUint16(17,true),power_protection:v.getUint16(19,true),current_protection:v.getUint16(21,true),startup_force:f[23],hysteresis_percent:f[24],power_lock_switch:f[25],wheel_mode_brake_switch:f[26],angle_limit_switch:f[27],soft_start_switch:f[28],soft_start_time:v.getUint16(29,true),angle_upper_limit:v.getUint16(31,true),angle_lower_limit:v.getInt16(33,true)};
}
export function parseInternalParametersPacket(input) {
  const f=Uint8Array.from(input.frame ?? input); if(f.length!==31) return null; const v=new DataView(f.buffer,f.byteOffset,f.byteLength);
  return {id:f[4],kp:v.getUint16(5,true),kd:v.getUint16(7,true),ki:v.getUint16(9,true),bias:v.getUint16(11,true),hold_kp:v.getUint16(13,true),hold_kd:v.getUint16(15,true),hold_bias:v.getUint16(17,true),forward_direction:f[25],dead_zone:f[27]};
}
function isPublicParameterHeader(bytes){return bytes[0]===0x12&&bytes[1]===0x4c&&(bytes[2]===0x05||bytes[2]===0x06)&&bytes[3]===0x21;}
function isInternalParameterHeader(bytes){return bytes[0]===0x13&&bytes[1]===0x4d&&(bytes[2]===0xc4||bytes[2]===0xc5)&&bytes[3]===0x1a;}
function packRaw(header,params){const f=Uint8Array.from([...header,...params,0]);f[f.length-1]=checksum(f.slice(0,-1));return f;}
function pushU16(a,v){a.push(v&255,(v>>>8)&255);}
