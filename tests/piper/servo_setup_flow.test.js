import test from 'node:test';
import assert from 'node:assert/strict';
import { Packet, PacketParser, parsePublicParametersPacket } from '../../Browser_SDK/src/fashionstar_serial.js';
import { SerialServoBus } from '../../Browser_SDK/src/serial_servo_bus.js';
import { readServoPublicConfig, writeAndVerifyServoConfig, reconcileServoMutation } from '../../Browser_SDK/src/servo_setup_flow.js';
import installHardware from '../helpers/servo_setup_hardware.cjs';

function publicFrame(id, baudrate = 8) {
  const params = new Uint8Array(33);
  params[0] = id; params[2] = 1; params[5] = baudrate;
  return Packet.packResponseForTest(0x05, params);
}
async function mockBus(t) {
  const { state, serial, port } = installHardware();
  const bus = new SerialServoBus('Test', { serial });
  let baud;
  const reconnect = async rate => {
    if (bus.connected && baud === rate) return;
    await bus.disconnect(); await bus.connect(port, { baudRate: rate }); baud = rate;
  };
  await reconnect(115200); t.after(() => bus.disconnect());
  const change = options => writeAndVerifyServoConfig({ bus, reconnect, initialBaudRate: 115200, settleMs: 0, timeoutMs: 15, collisionTimeoutMs: 5, ...options });
  return { bus, state, reconnect, change };
}

test('real public-parameter response is classified, including every split position', () => {
  const frame = publicFrame(3);
  for (let split = 1; split < frame.length; split++) {
    const parser = new PacketParser();
    const packets = [...parser.push(frame.slice(0, split)), ...parser.push(frame.slice(split))];
    assert.equal(packets.length, 1);
    assert.equal(packets[0].kind, 'public-parameters');
    assert.equal(parsePublicParametersPacket(packets[0]).id, 3);
  }
});

test('internal parameter response and monitor keep their respective packet types', () => {
  const parser = new PacketParser();
  const packets = parser.push(Uint8Array.from([
    ...Packet.packResponseForTest(0xc5, new Uint8Array(26)),
    ...Packet.packResponseForTest(22, new Uint8Array(16)),
    ...Packet.packResponseForTest(0x05, [0]), // short ACK is not a config
  ]));
  assert.equal(packets[0].kind, 'internal-parameters');
  assert.equal(packets[1].code, 22);
  assert.equal(packets[1].kind, undefined);
  assert.equal(packets[2].kind, undefined);
});

test('servo setup reads actual fragmented responses instead of timing out', async t => {
  const { bus, state } = await mockBus(t);
  const motor = state.addFactory(); motor.id = 2; motor.params[0] = 2;
  const config = await readServoPublicConfig(bus, 2, 20);
  assert.equal(config.id, 2); assert.equal(config.baudrate, 5);
});

test('servo setup writes exactly once, preserves protection settings and verifies at the new speed', async t => {
  const { bus, state, change } = await mockBus(t); state.addFactory();
  const before = await readServoPublicConfig(bus, 0);
  const actual = await change({ initialId: 0, targetId: 4, values: before });
  assert.equal(state.baud, 1000000); assert.equal(actual.id, 4);
  const writes = state.writes.filter(row => row.frame[2] === 0x06);
  assert.equal(writes.length, 1); assert.equal(writes[0].frame[4], 0); assert.equal(writes[0].frame[7], 4);
  assert.deepEqual({ ...actual, id: 0, baudrate: 5 }, before);
});

test('an occupied destination at either speed blocks writes, including a speed-only change', async t => {
  for (const speedOnly of [false, true]) {
    const { state, change } = await mockBus(t); state.addFactory();
    const other = state.addFactory(); other.id = speedOnly ? 0 : 4; other.params[0] = other.id; other.baud = 1000000; other.params[5] = 8;
    await assert.rejects(change({ initialId: 0, targetId: other.id }), { code: 'id-occupied' });
    assert.equal(state.baud, 115200); assert.equal(state.writes.filter(row => row.frame[2] === 6).length, 0);
  }
});

test('ID-only writes retain 115200 and every other public parameter', async t => {
  const { bus, state, change } = await mockBus(t); state.addFactory();
  const before = await readServoPublicConfig(bus, 0);
  const after = await change({ initialId: 0, targetId: 253, targetBaudRate: 115200 });
  assert.deepEqual({ ...after, id: 0 }, before); assert.equal(state.baud, 115200);
});

test('lost verification is reconciled read-only whether a write applied or not', async t => {
  for (const applied of [false, true]) {
    const { bus, state, change, reconnect } = await mockBus(t); state.addFactory();
    state.applyWrite = applied;
    await assert.rejects(change({ initialId: 0, targetId: 4, onMutation() { state.dropAfterWrite = true; } }), { code: 'serial_response_timeout' });
    state.dropReads = 0;
    const count = state.writes.filter(row => row.frame[2] === 6).length;
    const result = await reconcileServoMutation({ bus, reconnect, timeoutMs: 5,
      mutation: { initialId: 0, targetId: 4, initialBaudRate: 115200, targetBaudRate: 1000000 } });
    assert.equal(result.applied, applied); assert.equal(result.config.id, applied ? 4 : 0);
    assert.equal(state.writes.filter(row => row.frame[2] === 6).length, count);
  }
});

test('read failures remove their pending waiter and a delayed write echo cannot verify a read', async t => {
  const { bus, state } = await mockBus(t); state.addFactory(); state.dropReads = 1;
  const reading = readServoPublicConfig(bus, 0, 10);
  const frame = publicFrame(0, 5); frame[2] = 6; frame[37] = frame.slice(0, 37).reduce((a, b) => a + b, 0) & 255;
  for (const packet of new PacketParser().push(frame)) bus.packetQueue.push(packet);
  await assert.rejects(reading, { code: 'serial_response_timeout' });
  assert.equal(bus.packetQueue.waiters.length, 0);
  assert.equal((await readServoPublicConfig(bus, 0, 20)).id, 0);
});

test('a motor changing another public parameter fails verification', async t => {
  const { state, change } = await mockBus(t); state.addFactory(); state.mutateProtection = true;
  await assert.rejects(change({ initialId: 0, targetId: 4 }), { code: 'parameters-changed' });
});

test('recovery cannot silently accept a changed protection setting after a failed verification', async t => {
  const { bus, state, change, reconnect } = await mockBus(t); state.addFactory(); state.mutateProtection = true;
  let mutation;
  await assert.rejects(change({ initialId: 0, targetId: 4, onMutation: value => { mutation = value; } }), { code: 'parameters-changed' });
  await assert.rejects(reconcileServoMutation({ bus, reconnect, mutation, timeoutMs: 5 }), { code: 'parameters-changed' });
  assert.equal(state.writes.filter(row => row.frame[2] === 6).length, 1);
});

test('bad-checksum parameter frames never satisfy configuration reads', () => {
  const frame = publicFrame(2); frame[frame.length - 1] ^= 1;
  assert.deepEqual(new PacketParser().push(frame), []);
});
