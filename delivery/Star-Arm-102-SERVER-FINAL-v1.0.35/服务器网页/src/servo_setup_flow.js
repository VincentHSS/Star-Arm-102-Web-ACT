import { ServoProtocol, parsePublicParametersPacket } from './fashionstar_serial.js?v=server-1.0.35';

export const SERVO_SETUP_BAUDRATES = Object.freeze([115200, 1000000]);
export const SERVO_SETUP_TARGET_BAUDRATE_CODE = 8;
// Same public-parameter protocol as servodevelop/Star-Arm-102 python-sdk/set-param.py.
export const SERVO_SETUP_BAUDRATE_CODES = Object.freeze({ 115200: 5, 1000000: 8 });

export class ServoSetupError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'ServoSetupError'; this.code = code; this.details = details; }
}

export function validateServoAddress(id) {
  if (!Number.isInteger(id) || id < 0 || id > 253) throw new ServoSetupError('invalid-id');
}

export async function readServoPublicConfig(bus, servoId, timeoutMs = 1500, { attempts = 1, retryDelayMs = 100 } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3
    || !Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 1000) throw new RangeError('Invalid read retry bounds');
  // Share the response budget across attempts instead of multiplying it.
  const attemptTimeoutMs = Math.max(1, Math.floor(timeoutMs / attempts));
  for (let attempt = 1; ; attempt++) {
    try { return await readServoPublicConfigOnce(bus, servoId, attemptTimeoutMs); }
    catch (error) {
      if (error.code !== 'serial_response_timeout') throw error;
      error.details = { ...error.details, id: servoId, attempts: attempt };
      if (attempt >= attempts) throw error;
      if (retryDelayMs > 0) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

async function readServoPublicConfigOnce(bus, servoId, timeoutMs) {
  validateServoAddress(servoId);
  bus.clearPackets?.({ discardPartial: true });
  const controller = new AbortController();
  const response = bus.waitForPacket((packet) => {
    if (packet?.kind !== 'public-parameters') return false;
    // A delayed write echo is not proof that a subsequent read succeeded.
    if ((packet.frame?.[2] ?? packet.code) !== 0x05) return false;
    return parsePublicParametersPacket(packet)?.id === servoId;
  }, timeoutMs, { signal: controller.signal });
  void response.catch(() => {});
  try {
    await bus.write(ServoProtocol.readPublicParameters(servoId));
    const actual = parsePublicParametersPacket(await response);
    if (!actual || actual.id !== servoId) throw new ServoSetupError('read-failed', { id: servoId });
    return actual;
  } finally { controller.abort(); }
}

export async function probeServoPublicConfig(bus, id, timeoutMs = 350, options = {}) {
  try { return await readServoPublicConfig(bus, id, timeoutMs, options); }
  catch (error) { if (error.code === 'serial_response_timeout') return null; throw error; }
}

export async function reconcileServoMutation({ bus, mutation, reconnect, timeoutMs = 350,
  readAttempts = 3, retryDelayMs = 100 }) {
  const hits = [];
  for (const baud of SERVO_SETUP_BAUDRATES) {
    await reconnect(baud);
    for (const id of new Set([mutation.initialId, mutation.targetId])) {
      const config = await probeServoPublicConfig(bus, id, timeoutMs, { attempts: readAttempts, retryDelayMs });
      if (config) {
        if (config.baudrate !== SERVO_SETUP_BAUDRATE_CODES[baud]) throw new ServoSetupError('baud-mismatch', { id });
        hits.push({ id, baud, config });
      }
    }
  }
  if (hits.length !== 1) throw new ServoSetupError('uncertain-write', { id: mutation.targetId });
  const hit = hits[0];
  const applied = hit.id === mutation.targetId && hit.baud === mutation.targetBaudRate;
  const unchanged = hit.id === mutation.initialId && hit.baud === mutation.initialBaudRate;
  if (!applied && !unchanged) throw new ServoSetupError('uncertain-write', { id: mutation.targetId });
  await reconnect(hit.baud);
  let config;
  try { config = await readServoPublicConfig(bus, hit.id, 1500, { attempts: readAttempts, retryDelayMs }); }
  catch (error) { error.details = { ...error.details, id: hit.id, baud: hit.baud }; throw error; }
  if (config.baudrate !== SERVO_SETUP_BAUDRATE_CODES[hit.baud]) throw new ServoSetupError('baud-mismatch', { id: hit.id });
  for (const [key, value] of Object.entries(mutation.expected || {})) {
    if (!['id', 'baudrate'].includes(key) && config[key] !== value) throw new ServoSetupError('parameters-changed', { id: hit.id, key });
  }
  return { applied, config, baudRate: hit.baud };
}

export async function writeAndVerifyServoConfig({
  bus,
  initialId,
  targetId,
  targetBaudRate = 1000000,
  values,
  initialBaudRate = values?.baudrate === 5 ? 115200 : 1000000,
  reconnect,
  settleMs = 750,
  timeoutMs = 1500,
  collisionTimeoutMs = 350,
  readAttempts = 3,
  retryDelayMs = 100,
  onMutation = () => {},
}) {
  validateServoAddress(initialId); validateServoAddress(targetId);
  const targetBaudrateCode = SERVO_SETUP_BAUDRATE_CODES[targetBaudRate];
  if (targetBaudrateCode === undefined || SERVO_SETUP_BAUDRATE_CODES[initialBaudRate] === undefined) throw new ServoSetupError('invalid-baud');
  // Inspect both supported speeds before changing an address. Previously
  // configured motors stay connected, including motors already at 1 Mbps.
  try {
    for (const baud of SERVO_SETUP_BAUDRATES) {
      if (baud === initialBaudRate && targetId === initialId) continue;
      await reconnect(baud);
      if (await probeServoPublicConfig(bus, targetId, collisionTimeoutMs, { attempts: readAttempts, retryDelayMs })) throw new ServoSetupError('id-occupied', { id: targetId, baud });
    }
  } finally { await reconnect(initialBaudRate); }
  const read = async (id, baud) => {
    try { return await readServoPublicConfig(bus, id, timeoutMs, { attempts: readAttempts, retryDelayMs }); }
    catch (error) { error.details = { ...error.details, id, baud }; throw error; }
  };
  const fresh = await read(initialId, initialBaudRate);
  if (fresh.baudrate !== SERVO_SETUP_BAUDRATE_CODES[initialBaudRate]) throw new ServoSetupError('baud-mismatch', { id: initialId });
  if (values && values.id !== initialId) throw new ServoSetupError('source-changed');
  onMutation({ initialId, targetId, initialBaudRate, targetBaudRate, expected: fresh });
  await bus.write(ServoProtocol.writePublicParameters(initialId, {
    ...fresh,
    baudrate: targetBaudrateCode,
  }, { targetId }));

  if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));
  await reconnect(targetBaudRate);
  const actual = await read(targetId, targetBaudRate);
  if (!actual || actual.id !== targetId || actual.baudrate !== targetBaudrateCode) {
    throw new ServoSetupError('verify-failed', { id: targetId });
  }
  for (const [key, value] of Object.entries(fresh)) if (!['id', 'baudrate'].includes(key) && actual[key] !== value) throw new ServoSetupError('parameters-changed', { id: targetId, key });
  return actual;
}
