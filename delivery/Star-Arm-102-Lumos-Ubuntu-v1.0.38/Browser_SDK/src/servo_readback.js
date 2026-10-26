import { ServoProtocol, parseMonitorPacket } from './fashionstar_serial.js?v=server-1.0.38';

// A sync monitor command receives one reply per ID on the same serial bus.
// Arm all ID waiters before writing, so an immediate or out-of-order reply
// counts for its own joint and every missing ID shares this round's deadline.
async function readRound(bus, ids, timeoutMs, onRequest) {
  const abort = new AbortController();
  bus.clearPackets();
  const replies = ids.map(id => bus.waitForPacket(packet => parseMonitorPacket(packet)?.id === id,
    timeoutMs, { signal: abort.signal }));
  const settled = Promise.allSettled(replies);
  try {
    const frame = ServoProtocol.syncServoMonitor(ids);
    onRequest(frame, ids);
    await bus.write(frame);
    const results = await settled;
    return results.flatMap(result => {
      if (result.status === 'fulfilled') return [parseMonitorPacket(result.value)];
      if (result.reason?.code === 'serial_response_timeout') return [];
      throw result.reason;
    });
  } catch (error) {
    abort.abort(error);
    await settled;
    throw error;
  } finally {
    abort.abort();
  }
}

export async function readServoFeedback({ bus, servoIds, timeoutMs = 800, maxAttempts = 3,
  onRequest = () => {}, onAttempt = () => {} }) {
  const ids = [...new Set(servoIds)];
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id > 253)) throw new Error('舵机 ID 无效');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('舵机读取等待参数无效');
  const monitors = {};
  let missingIds = ids;
  let attempts = 0;
  for (; attempts < maxAttempts && missingIds.length; attempts++) {
    onAttempt({ attempt: attempts + 1, maxAttempts, missingIds: [...missingIds] });
    const replies = await readRound(bus, missingIds, timeoutMs, onRequest);
    for (const monitor of replies) if (monitor && Number.isFinite(monitor.angle)) monitors[monitor.id] = monitor;
    missingIds = ids.filter(id => !Object.hasOwn(monitors, id));
  }
  return { monitors, missingIds, attempts };
}
