import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PARAMS } from '../../Browser_SDK/src/factory_params.js';
import { restoreFactoryParameters } from '../../Browser_SDK/src/factory_restore.js';

const MODELS = ['FL', 'HD', 'U25', 'U45'];
const IDS = [0, 1, 2, 3, 4, 5, 6];
const PUBLIC_FIELDS = [
  'need_response', 'baudrate', 'stall_protection', 'stall_power_limit',
  'low_voltage_protection', 'high_voltage_protection', 'temperature_protection',
  'power_protection', 'current_protection', 'startup_force', 'hysteresis_percent',
  'power_lock_switch', 'wheel_mode_brake_switch', 'angle_limit_switch',
  'soft_start_switch', 'soft_start_time', 'angle_upper_limit', 'angle_lower_limit',
];
const INTERNAL_FIELDS = [
  'kp', 'kd', 'ki', 'bias', 'hold_kp', 'hold_kd', 'hold_bias',
  'forward_direction', 'dead_zone',
];

function assertCompleteParameters(model) {
  const params = FACTORY_PARAMS[model];
  assert.ok(params, `${model} must have factory parameters`);
  assert.deepEqual(Object.keys(params.public).map(Number).sort((a, b) => a - b), IDS);
  assert.deepEqual(Object.keys(params.internal).map(Number).sort((a, b) => a - b), IDS);
  for (const id of IDS) {
    assert.deepEqual(Object.keys(params.public[id]).sort(), [...PUBLIC_FIELDS].sort(), `${model} public ID ${id}`);
    assert.deepEqual(Object.keys(params.internal[id]).sort(), [...INTERNAL_FIELDS].sort(), `${model} internal ID ${id}`);
  }
}

test('every factory-restore selector model has complete ID 0-6 parameters', () => {
  for (const model of MODELS) assertCompleteParameters(model);
});

test('U25 and U45 preserve their authoritative model-specific PID values', () => {
  assert.deepEqual(
    IDS.map((id) => [FACTORY_PARAMS.U25.internal[id].kp, FACTORY_PARAMS.U25.internal[id].kd]),
    [[400, 2300], [800, 50], [800, 50], [200, 1100], [200, 20], [200, 1100], [200, 20]],
  );
  assert.deepEqual(
    IDS.map((id) => [FACTORY_PARAMS.U45.internal[id].kp, FACTORY_PARAMS.U45.internal[id].kd]),
    [[300, 700], [800, 50], [800, 50], [5, 2], [5, 2], [5, 2], [5, 2]],
  );
  assert.deepEqual(
    IDS.map((id) => FACTORY_PARAMS.U25.public[id].temperature_protection),
    [1058, 735, 735, 1058, 1058, 1058, 1058],
  );
  assert.deepEqual(
    IDS.map((id) => FACTORY_PARAMS.U45.public[id].temperature_protection),
    [1058, 735, 735, 1058, 1058, 1058, 1058],
  );
});

test('U25 and U45 complete factory restoration without unsupported-model errors', async () => {
  for (const model of ['U25', 'U45']) {
    const writes = [];
    const verifies = [];
    await restoreFactoryParameters({
      model,
      write: async (frame) => writes.push(frame),
      readAndVerify: async (kind, id, expected) => verifies.push({ kind, id, expected }),
      delayMs: 0,
    });
    assert.equal(writes.length, 21, `${model} must release, write public, and write internal for seven servos`);
    assert.equal(verifies.length, 14, `${model} must verify public and internal parameters for seven servos`);
  }
});
