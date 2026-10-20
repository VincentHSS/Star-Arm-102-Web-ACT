import test from 'node:test';
import assert from 'node:assert/strict';
import installHardware from '../helpers/servo_setup_hardware.cjs';
import { SerialServoBus } from '../../Browser_SDK/src/serial_servo_bus.js';
import { readServoPublicConfig, writeAndVerifyServoConfig, reconcileServoMutation } from '../../Browser_SDK/src/servo_setup_flow.js';
import { ServoBusWizard } from '../../Browser_SDK/src/servo_bus_wizard.js';

async function harness(t) {
  const { state, serial, port } = installHardware();
  const bus = new SerialServoBus('Wizard test', { serial }); let baud;
  const reconnect = async rate => {
    if (bus.connected && rate === baud) return;
    await bus.disconnect(); await bus.connect(port, { baudRate: rate }); baud = rate;
  };
  const dependencies = {
    readAt: async (id, rate) => { await reconnect(rate); return readServoPublicConfig(bus, id, 12); },
    changeConfig: options => writeAndVerifyServoConfig({ bus, reconnect, settleMs: 0, timeoutMs: 12, collisionTimeoutMs: 3, ...options }),
    reconcile: mutation => reconcileServoMutation({ bus, reconnect, mutation, timeoutMs: 3 }),
  };
  t.after(() => bus.disconnect());
  return { state, dependencies, wizard: new ServoBusWizard(dependencies),
    writes: () => state.writes.filter(row => row.frame[2] === 6) };
}
async function addressAll(h) {
  for (let i = 0; i < 7; i++) { h.state.addFactory(); await h.wizard.advance({ newServoConfirmed: true }); }
  await h.wizard.advance();
}

test('seven factory motors remain attached: temporary 253, IDs 1–6, restore 0, then all at 1 Mbps', async t => {
  const h = await harness(t), original = [];
  for (let i = 0; i < 7; i++) {
    original.push([...h.state.addFactory().params]);
    await h.wizard.advance({ newServoConfirmed: true });
    assert.deepEqual(h.state.motors.map(m => m.id), [253, 1, 2, 3, 4, 5, 6].slice(0, i + 1));
    assert(h.state.motors.every(m => m.baud === 115200));
  }
  assert.equal(h.wizard.state.phase, 'restore');
  await h.wizard.advance();
  assert.equal(h.wizard.state.phase, 'baud');
  assert.deepEqual(h.state.motors.map(m => m.id), [0, 1, 2, 3, 4, 5, 6]);
  await h.wizard.advance();
  assert.equal(h.wizard.state.phase, 'complete');
  assert(h.state.motors.every(m => m.baud === 1000000));
  assert.equal(h.writes().length, 15);
  assert.deepEqual(h.writes().slice(0, 8).map(w => [w.frame[4], w.frame[7], w.frame[9]]),
    [[0, 253, 5], [0, 1, 5], [0, 2, 5], [0, 3, 5], [0, 4, 5], [0, 5, 5], [0, 6, 5], [253, 0, 5]]);
  assert.deepEqual(h.writes().slice(8).map(w => [w.frame[4], w.frame[7], w.frame[9]]), Array.from({ length: 7 }, (_, id) => [id, id, 8]));
  for (const motor of h.state.motors) {
    const after = [...motor.params]; after[0] = 0; after[3] = 0; after[5] = 5; after[1] = 0;
    assert.deepEqual(after, original[motor.number], 'only ID and baud may change');
  }
  assert(h.state.writes.every(w => [5, 6].includes(w.frame[2])), 'setup sends no motion, torque or broadcast writes');
});

test('a new-motor confirmation is required and an existing motor cannot disappear mid-setup', async t => {
  const h = await harness(t); h.state.addFactory();
  await assert.rejects(h.wizard.advance(), { code: 'confirm-new' }); assert.equal(h.writes().length, 0);
  await h.wizard.advance({ newServoConfirmed: true });
  h.state.motors.splice(0, 1); h.state.addFactory();
  await assert.rejects(h.wizard.advance({ newServoConfirmed: true }), { code: 'serial_response_timeout' });
  assert.equal(h.writes().length, 1); assert.equal(h.wizard.state.assigned, 1);
});

test('an occupied temporary ID at another speed prevents the first mutation', async t => {
  const h = await harness(t); h.state.addFactory(); const other = h.state.addFactory();
  other.id = 253; other.params[0] = 253; other.baud = 1000000; other.params[5] = 8;
  await assert.rejects(h.wizard.advance({ newServoConfirmed: true }), { code: 'id-occupied' });
  assert.equal(h.writes().length, 0); assert.equal(h.wizard.state.assigned, 0); assert.equal(h.wizard.state.pending, null);
});

test('an applied but unverified assignment survives a reload and resumes with reads only', async t => {
  const h = await harness(t); h.state.addFactory(); h.state.dropAfterWrite = true;
  await assert.rejects(h.wizard.advance({ newServoConfirmed: true }), { code: 'serial_response_timeout' });
  assert.equal(h.wizard.state.assigned, 0); assert.equal(h.wizard.state.pending.targetId, 253);
  const resumed = new ServoBusWizard({ ...h.dependencies, checkpoint: h.wizard.checkpoint() });
  const result = await resumed.advance();
  assert.equal(result.recovered, true); assert.equal(resumed.state.assigned, 1); assert.equal(h.writes().length, 1);
  assert.equal(resumed.state.pending, null);
});

test('an unapplied write is reconciled without automatically retrying the mutation', async t => {
  const h = await harness(t); h.state.addFactory(); h.state.applyWrite = false;
  await assert.rejects(h.wizard.advance({ newServoConfirmed: true }), { code: 'serial_response_timeout' });
  const result = await h.wizard.advance();
  assert.equal(result.recovered, false); assert.equal(h.writes().length, 1); assert.equal(h.wizard.state.assigned, 0);
  assert.equal(h.wizard.state.pending, null);
  h.state.applyWrite = true;
  await h.wizard.advance({ newServoConfirmed: true });
  assert.equal(h.writes().length, 2); assert.equal(h.wizard.state.assigned, 1);
});

test('bulk speed migration pauses between motors and resumes without rewriting completed motors', async t => {
  const h = await harness(t); await addressAll(h);
  h.wizard.onChange = snapshot => {
    if (!h.wizard.pauseRequested && snapshot.slots.filter(s => s.baud === 1000000).length === 3) h.wizard.requestPause();
  };
  await h.wizard.advance(); assert.equal(h.wizard.state.phase, 'baud'); assert.equal(h.writes().length, 11);
  h.wizard.onChange = () => {};
  const resumed = new ServoBusWizard({ ...h.dependencies, checkpoint: h.wizard.checkpoint() });
  await resumed.advance(); assert.equal(resumed.state.phase, 'complete'); assert.equal(h.writes().length, 15);
});

test('a failed bulk readback retains the mixed-speed bus and does not advance until reconciled', async t => {
  const h = await harness(t); await addressAll(h);
  const change = h.wizard.changeConfig;
  h.wizard.changeConfig = options => { h.state.dropAfterWrite = options.slot === 2; return change(options); };
  await assert.rejects(h.wizard.advance(), { code: 'serial_response_timeout' });
  assert.equal(h.writes().length, 11); assert.equal(h.wizard.state.pending.slot, 2);
  assert.deepEqual(h.wizard.state.slots.map(s => s.baud), [1000000, 1000000, 115200, 115200, 115200, 115200, 115200]);
  h.state.dropAfterWrite = false; h.wizard.changeConfig = change;
  await h.wizard.advance(); assert.equal(h.writes().length, 11);
  await h.wizard.advance(); assert.equal(h.wizard.state.phase, 'complete'); assert.equal(h.writes().length, 15);
});

test('concurrent requests and malformed saved records cannot send extra writes', async t => {
  const h = await harness(t); h.state.addFactory();
  const running = h.wizard.advance({ newServoConfirmed: true });
  await assert.rejects(h.wizard.advance({ newServoConfirmed: true }), { code: 'busy' }); await running;
  const checkpoint = h.wizard.checkpoint(); checkpoint.slots[1] = { index: 1, id: 253, baud: 115200 };
  assert.throws(() => new ServoBusWizard({ ...h.dependencies, checkpoint }), { code: 'bad-record' });
  assert.equal(h.writes().length, 1);
});
