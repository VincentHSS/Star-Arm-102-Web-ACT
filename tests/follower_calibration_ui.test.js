import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('let followerCalibrationState = null;'), source.indexOf("$('#open-follower-calibration').addEventListener"));
function harness(fail = false) {
  const nodes = new Map();
  const calls = [];
  const context = { Number, AbortController, clearTimeout: () => {}, setTimeout: () => 1,
    $: id => { if (!nodes.has(id)) nodes.set(id, { checked: false, textContent: '', innerHTML: '', disabled: false }); return nodes.get(id); },
    selectedInferenceModel: () => ({ id: 'release-act', coordinate_contract: 'starai_0_0_4_calibrated' }),
    request: async (path, options) => { calls.push({ path, body: JSON.parse(options.body) }); if (fail) throw new Error('J7 尚未记录'); return path.endsWith('/apply') ? { id: 'release-act' } : { status: 'recording', samples: 1, joints: [] }; },
    loadModels: async () => calls.push('models'), validateInference: async () => calls.push('validate') };
  vm.createContext(context); vm.runInContext(code, context);
  return { context, nodes, calls };
}
test('manual calibration passes explicit support and range confirmations', async () => {
  const h = harness();
  h.context.$('#calibration-support-confirm').checked = true;
  await h.context.followerCalibrationOperation('start');
  assert.equal(h.calls[0].path, '/follower-calibration/start');
  assert.equal(h.calls[0].body.operator_confirmed, true);
  assert.equal(h.calls[0].body.range_confirmed, false);
  assert.equal(h.nodes.get('#calibration-range-confirm').checked, false);
  assert.equal(h.nodes.get('#calibration-save').disabled, false);
});
test('missing joint error remains visible through subsequent recording updates', async () => {
  const h = harness(true);
  await h.context.followerCalibrationOperation('finish');
  h.context.renderFollowerCalibration({ status: 'recording', samples: 10, joints: [] });
  assert.equal(h.nodes.get('#calibration-status').textContent, 'J7 尚未记录');
});
test('applying calibration checks same arm and revalidates without starting inference', async () => {
  const h = harness();
  h.context.$('#calibration-same-arm-confirm').checked = true;
  await h.context.followerCalibrationOperation('apply');
  assert.equal(h.calls[0].body.model_id, 'release-act');
  assert.equal(h.calls[0].body.same_arm_confirmed, true);
  assert.ok(h.calls.includes('models') && h.calls.includes('validate'));
  assert.ok(!h.calls.some(call => call.path === '/inference/start'));
});

test('one failed page request retries and keeps the displayed joint ranges', async () => {
  const h = harness();
  const pending = [];
  h.context.setTimeout = (fn, ms) => { if (ms === 250 || ms === 1000) pending.push(fn); return 1; };
  const snapshot = { status: 'recording', samples: 12, joints: [{ id: 0, angle: 10, span_deg: 60 }] };
  let failed = false;
  h.context.request = async path => {
    if (path.endsWith('/sample') && !failed) { failed = true; throw new Error('network interrupted'); }
    return snapshot;
  };
  h.context.renderFollowerCalibration(snapshot);
  const ranges = h.nodes.get('#calibration-joints').innerHTML;
  h.context.scheduleFollowerCalibration();
  await pending.shift()();
  assert.equal(h.nodes.get('#calibration-joints').innerHTML, ranges);
  assert.equal(h.nodes.get('#calibration-save').disabled, false);
  assert.equal(pending.length, 1);
  await pending.shift()();
  assert.ok(!h.nodes.get('#calibration-status').textContent.includes('network interrupted'));
});

test('continuous page connection failures keep retrying and allow reconnect or cancel', async () => {
  const h = harness();
  const pending = [];
  h.context.setTimeout = (fn, ms) => { if (ms === 250 || ms === 1000) pending.push(fn); return 1; };
  h.context.request = async () => { throw new Error('service unreachable'); };
  h.context.renderFollowerCalibration({ status: 'recording', samples: 12, joints: [{ id: 0, angle: 10, span_deg: 60 }] });
  const ranges = h.nodes.get('#calibration-joints').innerHTML;
  h.context.scheduleFollowerCalibration();
  for (let i = 0; i < 20; i++) await pending.shift()();
  assert.equal(pending.length, 1);
  assert.equal(h.nodes.get('#calibration-joints').innerHTML, ranges);
  assert.equal(h.nodes.get('#calibration-save').disabled, false);
  assert.equal(h.nodes.get('#calibration-resume').disabled, false);
  assert.equal(h.nodes.get('#calibration-start').disabled, true);
});

test('cancel works while automatic reading is pending and late results cannot restart it', async () => {
  const h = harness();
  const pending = [];
  let finishRead;
  h.context.setTimeout = (fn, ms) => { if (ms === 250 || ms === 1000) pending.push(fn); return 1; };
  h.context.request = path => {
    if (path.endsWith('/sample')) return new Promise(resolve => { finishRead = resolve; });
    h.calls.push(path);
    return Promise.resolve({ status: 'cancelled', samples: 12, joints: [] });
  };
  h.context.renderFollowerCalibration({ status: 'recording', samples: 12, joints: [] });
  h.context.scheduleFollowerCalibration();
  const reading = pending.shift()();
  await h.context.followerCalibrationOperation('cancel');
  assert.ok(h.calls.includes('/follower-calibration/cancel'));
  finishRead({ status: 'recording', samples: 13, joints: [] });
  await reading;
  assert.equal(h.nodes.get('#calibration-start').disabled, false);
  assert.equal(h.nodes.get('#calibration-save').disabled, true);
  assert.equal(pending.length, 0);
});

test('cancel is queued rather than discarded during a manual operation', async () => {
  const h = harness();
  let finishStart;
  h.context.request = path => {
    if (path.endsWith('/start')) return new Promise(resolve => { finishStart = resolve; });
    h.calls.push(path);
    return Promise.resolve({ status: 'cancelled', samples: 1, joints: [] });
  };
  const starting = h.context.followerCalibrationOperation('start');
  await h.context.followerCalibrationOperation('cancel');
  assert.ok(h.nodes.get('#calibration-status').textContent.includes('取消已收到'));
  finishStart({ status: 'recording', samples: 1, joints: [] });
  await starting;
  assert.ok(h.calls.includes('/follower-calibration/cancel'));
  assert.equal(h.nodes.get('#calibration-save').disabled, true);
});

test('empty or invalid response is reported instead of silently disabling recording', async () => {
  const h = harness();
  h.context.request = async () => ({});
  await assert.rejects(h.context.calibrationRequest('/follower-calibration'), /有效校准状态/);
});
