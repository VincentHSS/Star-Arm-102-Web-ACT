import { ServoProtocol, parsePublicParametersPacket } from './fashionstar_serial.js';

export const SERVO_SETUP_BAUDRATES = Object.freeze([115200, 1000000]);
export const SERVO_SETUP_TARGET_BAUDRATE_CODE = 8;

export async function readServoPublicConfig(bus, servoId, timeoutMs = 1500) {
  const response = bus.waitForPacket((packet) => {
    if (packet?.kind !== 'public-parameters') return false;
    return parsePublicParametersPacket(packet)?.id === servoId;
  }, timeoutMs);
  await bus.write(ServoProtocol.readPublicParameters(servoId));
  const actual = parsePublicParametersPacket(await response);
  if (!actual || actual.id !== servoId) throw new Error(`未读取到初始舵机 ID ${servoId}`);
  return actual;
}

export async function writeAndVerifyServoConfig({
  bus,
  initialId,
  targetId,
  targetBaudRate = 1000000,
  reconnect,
  settleMs = 500,
  timeoutMs = 1500,
  values,
}) {
  const targetBaudrateCode = targetBaudRate === 1000000 ? SERVO_SETUP_TARGET_BAUDRATE_CODE : null;
  if (targetBaudrateCode === null) throw new Error(`不支持的目标波特率：${targetBaudRate}`);

  await bus.write(ServoProtocol.writePublicParameters(initialId, {
    ...values,
    need_response: 1,
    baudrate: targetBaudrateCode,
  }, { targetId }));

  if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
  await reconnect(targetBaudRate);
  const response = bus.waitForPacket((packet) => {
    if (packet?.kind !== 'public-parameters') return false;
    return parsePublicParametersPacket(packet)?.id === targetId;
  }, timeoutMs);
  await bus.write(ServoProtocol.readPublicParameters(targetId));
  const packet = await response;
  const actual = parsePublicParametersPacket(packet);
  if (!actual || actual.id !== targetId || actual.baudrate !== targetBaudrateCode) {
    throw new Error(`校验失败：目标 ID ${targetId} 或波特率未生效`);
  }
  return actual;
}