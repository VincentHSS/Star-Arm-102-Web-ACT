import test from 'node:test';
import assert from 'node:assert/strict';
import { PendingPacketQueue } from '../Browser_SDK/src/browser_serial_utils.js';
import { readServoFeedback } from '../Browser_SDK/src/servo_readback.js';

const ids = [0, 1, 2, 3, 4, 5, 6];
const flush = () => new Promise(resolve => setImmediate(resolve));
function monitor(id, angle = 10 + id) {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, id); view.setInt32(10, angle * 10, true);
  return { code: 22, params: bytes };
}
function fakeBus(reply) {
  const queue = new PendingPacketQueue();
  const writes = [];
  return { queue, writes, clearPackets: () => queue.clear(),
    waitForPacket: (predicate, timeout, options) => queue.waitFor(predicate, timeout, 'timeout', options),
    write: async frame => { writes.push([...frame]); await reply?.(frame, queue, writes.length); } };
}

test('first feedback accepts immediate, out-of-order replies without fixed startup sleeps', async () => {
  const bus = fakeBus((frame, queue) => {
    assert.equal(queue.waiters.length, 7, 'Every ID must already be waiting before the write');
    for (const id of [6, 2, 0, 4, 1, 5, 3]) queue.push(monitor(id));
  });
  const result = await readServoFeedback({ bus, servoIds: ids });
  assert.deepEqual(result.missingIds, []);
  assert.deepEqual(Object.values(result.monitors).map(item => item.angle), [10, 11, 12, 13, 14, 15, 16]);
  assert.equal(result.attempts, 1);
  assert.equal(bus.writes.length, 1);
  assert.equal(bus.queue.waiters.length, 0);
});

test('seven missing servos cost one timeout per round instead of seven sequential timeouts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bus = fakeBus();
  const operation = readServoFeedback({ bus, servoIds: ids, timeoutMs: 800 });
  for (let round = 1; round <= 3; round++) {
    t.mock.timers.tick(799); await flush();
    assert.equal(bus.writes.length, round);
    t.mock.timers.tick(1); await flush();
    assert.equal(bus.writes.length, Math.min(round + 1, 3));
  }
  const result = await operation;
  assert.deepEqual(result.missingIds, ids);
  assert.equal(result.attempts, 3);
  assert.equal(bus.queue.waiters.length, 0);
});

test('retry reads only missing IDs and retains replies received in prior rounds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bus = fakeBus((frame, queue, attempt) => {
    const requested = [...frame.slice(7, -1)];
    assert.deepEqual(requested, attempt === 1 ? ids : [0, 3]);
    for (const id of requested) if (attempt > 1 || ![0, 3].includes(id)) queue.push(monitor(id));
  });
  const operation = readServoFeedback({ bus, servoIds: ids, timeoutMs: 800 });
  t.mock.timers.tick(800); await flush();
  const result = await operation;
  assert.deepEqual(result.missingIds, []);
  assert.equal(result.monitors[0].angle, 10);
  assert.equal(result.monitors[3].angle, 13);
  assert.equal(result.monitors[6].angle, 16);
  assert.equal(result.attempts, 2);
});

test('missing ID is determined from actual replies, regardless of order and duplicates', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bus = fakeBus((frame, queue) => {
    for (const id of [6, 6, 2, 1, 3, 5, 4, 7]) queue.push(monitor(id));
  });
  const operation = readServoFeedback({ bus, servoIds: ids, timeoutMs: 800, maxAttempts: 1 });
  t.mock.timers.tick(800);
  const result = await operation;
  assert.deepEqual(result.missingIds, [0]);
  assert.equal(Object.hasOwn(result.monitors, 0), false);
  assert.equal(Object.hasOwn(result.monitors, 7), false);
});

test('write failure cancels its pending replies and permits a clean reconnect', async () => {
  const bus = fakeBus(() => { throw Error('Serial write failed'); });
  await assert.rejects(readServoFeedback({ bus, servoIds: ids }), /Serial write failed/);
  assert.equal(bus.queue.waiters.length, 0);
  bus.write = async () => ids.forEach(id => bus.queue.push(monitor(id, 30 + id)));
  const result = await readServoFeedback({ bus, servoIds: ids });
  assert.deepEqual(result.missingIds, []);
  assert.equal(result.monitors[0].angle, 30);
});

test('device loss is reported immediately without further monitor requests', async () => {
  const bus = fakeBus((frame, queue) => queue.rejectAll(Error('Serial device disconnected')));
  await assert.rejects(readServoFeedback({ bus, servoIds: ids }), /disconnected/);
  assert.equal(bus.writes.length, 1);
  assert.equal(bus.queue.waiters.length, 0);
});

test('aborting one request does not remove another consumer or deliver stale matches', async () => {
  const queue = new PendingPacketQueue();
  const abort = new AbortController();
  const canceled = queue.waitFor(p => p.id === 1, 800, 'timeout', { signal: abort.signal });
  const current = queue.waitFor(p => p.id === 2, 800);
  abort.abort(Error('canceled'));
  await assert.rejects(canceled, /canceled/);
  queue.push({ id: 2 });
  assert.deepEqual(await current, { id: 2 });
  assert.equal(queue.waiters.length, 0);
});
