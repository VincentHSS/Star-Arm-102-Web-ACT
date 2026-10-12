import test from 'node:test';
import assert from 'node:assert/strict';
import { Packet, PacketParser, parsePublicParametersPacket } from '../../Browser_SDK/src/fashionstar_serial.js';
import { PendingPacketQueue } from '../../Browser_SDK/src/browser_serial_utils.js';
import { readServoPublicConfig, writeAndVerifyServoConfig } from '../../Browser_SDK/src/servo_setup_flow.js';

function publicFrame(id, baudrate = 8) {
  const params = new Uint8Array(33);
  params[0] = id; params[2] = 1; params[5] = baudrate;
  return Packet.packResponseForTest(0x05, params);
}
function mockBus() {
  const queue = new PendingPacketQueue();
  const parser = new PacketParser();
  const writes = [];
  return {
    writes, clearPackets: () => queue.clear(),
    waitForPacket: (predicate, ms) => queue.waitFor(predicate, ms),
    async write(frame) {
      writes.push(frame);
      if (frame[2] !== 0x05) return;
      const response = publicFrame(frame[4]);
      // USB serial can deliver a response across several reads.
      for (const chunk of [response.slice(0, 3), response.slice(3, 12), response.slice(12)]) {
        for (const packet of parser.push(chunk)) queue.push(packet);
      }
    },
  };
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

test('servo setup reads actual fragmented responses instead of timing out', async () => {
  const bus = mockBus();
  const config = await readServoPublicConfig(bus, 2, 20);
  assert.equal(config.id, 2); assert.equal(config.baudrate, 8);
});

test('servo setup writes exactly once and verifies the target ID after reconnect', async () => {
  const bus = mockBus();
  let reconnected = false;
  const actual = await writeAndVerifyServoConfig({ bus, initialId: 0, targetId: 4,
    values: parsePublicParametersPacket(publicFrame(0)), settleMs: 0, timeoutMs: 20,
    reconnect: async baud => { assert.equal(baud, 1000000); reconnected = true; },
  });
  assert.equal(reconnected, true); assert.equal(actual.id, 4);
  assert.equal(bus.writes.filter(frame => frame[2] === 0x06).length, 1);
  assert.equal(bus.writes[0][4], 0); assert.equal(bus.writes[0][7], 4);
});

test('bad-checksum parameter frames never satisfy configuration reads', () => {
  const frame = publicFrame(2); frame[frame.length - 1] ^= 1;
  assert.deepEqual(new PacketParser().push(frame), []);
});
