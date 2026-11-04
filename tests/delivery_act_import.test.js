import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { zipSync, strToU8 } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.37/服务器网页/assets/vendor/fflate/browser.js';
import { DATASET_TRANSFER_TIMEOUT_MS, calibrationApplyState, localStoragePaths, zipArchiveKind } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.37/服务器网页/src/act-import-state.js';

const source = await readFile(new URL('../delivery/Star-Arm-102-SERVER-FINAL-v1.0.37/服务器网页/src/act-workbench.js', import.meta.url), 'utf8');
const datasetCode = source.slice(source.indexOf('async function importDataset(file)'), source.indexOf('function toast(message)'));
const taskCode = source.slice(source.indexOf('function populateInferenceTasks()'), source.indexOf('function renderInferenceGate('));
const statsCode = source.slice(source.indexOf('async function refreshDatasetStats()'), source.indexOf('function renderJoints('));
function node() {
  let html = '';
  return { value: '', checked: false, disabled: false, textContent: '', title: '', hidden: false,
    get previousElementSibling() { return this; },
    get innerHTML() { return html; }, set innerHTML(value) { html = value; this.value = value.match(/<option value="([^"]*)"/)?.[1] || ''; },
    closest() { return this; }, querySelector() { return this; }, querySelectorAll() { return []; },
  };
}
function harness({ kind = 'dataset', failure = null } = {}) {
  const nodes = new Map(), calls = [], status = [], timers = new Set();
  const state = { datasets: [], models: [], data_dir: 'C:\\RobotData' };
  const context = { state, Date, Math, DATASET_TRANSFER_TIMEOUT_MS,
    $: id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    setTransferStatus: (text, mode) => status.push({ text, mode }), toast: message => calls.push({ toast: message }),
    formatBytes: String, localStoragePaths, zipArchiveKind: async () => kind, inferenceIsActive: () => false,
    setInterval: callback => { timers.add(callback); return callback; }, clearInterval: id => timers.delete(id),
    localFetch: {}, API: 'http://127.0.0.1:18765/api/v1',
    requestJson: async (_fetch, url, options) => {
      calls.push({ url, options }); if (failure) throw new Error(failure);
      return { dataset: { id: 'import-1', slug: 'shiyan', task_name: 'test' }, stats: { integrity_ok: true } };
    },
    renderDatasets: items => { state.datasets = items; }, renderDatasetStats: stats => calls.push({ stats }),
    renderStoragePaths: () => calls.push('paths'), refreshAfterMutation: async () => calls.push('refresh'),
  };
  vm.createContext(context); vm.runInContext(datasetCode, context);
  return { context, state, nodes, calls, status, timers };
}
const file = { name: 'shiyan.zip', size: 1_733_851_761 };
test('large dataset import stays visible, uses extended deadline, selects result and displays local location', async () => {
  const h = harness();
  assert.equal(await h.context.importDataset(file), true);
  assert.equal(h.state.selectedDatasetId, 'import-1');
  const upload = h.calls.find(call => call.url);
  assert.equal(upload.options.body, file);
  assert.equal(upload.options.timeoutMs, 1800000);
  assert.ok(h.status[0].text.includes('shiyan.zip') && h.status[0].text.includes('1733851761'));
  assert.ok(h.status.at(-1).text.includes('C:\\RobotData\\datasets\\import-1'));
  assert.equal(h.status.at(-1).mode, 'success');
  assert.equal(h.nodes.get('#dataset-import').disabled, false);
  assert.equal(h.state.datasetImporting, false);
  assert.equal(h.timers.size, 0);
});
test('failed imports remain visible, are not automatically retried and can be selected again', async () => {
  const h = harness({ failure: 'service unavailable' });
  assert.equal(await h.context.importDataset(file), false);
  assert.equal(h.calls.filter(call => call.url).length, 1);
  assert.equal(h.status.at(-1).mode, 'error');
  assert.ok(h.status.at(-1).text.includes('service unavailable'));
  assert.equal(h.nodes.get('#dataset-import-file').value, '');
  assert.equal(h.timers.size, 0);
});
test('model ZIP is rejected at the dataset entry before upload', async () => {
  const h = harness({ kind: 'model' });
  await h.context.importDataset({ name: 'model.zip', size: 20 });
  assert.ok(h.status.at(-1).text.includes('第 3 步'));
  assert.equal(h.calls.filter(call => call.url).length, 0);
});
test('concurrent import and recording cannot submit another archive', async () => {
  for (const state of [{ datasetImporting: true }, { episode: { id: 'active' } }, { frameDrain: {} }]) {
    const h = harness(); Object.assign(h.state, state);
    await h.context.importDataset(file);
    assert.equal(h.calls.filter(call => call.url).length, 0);
  }
});
test('dataset import cannot compete with active inference for disk IO', async () => {
  const h = harness(); h.context.inferenceIsActive = () => true;
  await h.context.importDataset(file);
  assert.equal(h.calls.filter(call => call.url).length, 0);
});
test('calibration explains every blocked state and requires same-arm confirmation', () => {
  const valid = { snapshot: { status: 'saved' }, model: { id: 'act', coordinate_contract: 'starai_0_0_4_calibrated' }, sameArm: true };
  assert.equal(calibrationApplyState(valid).allowed, true);
  for (const state of [{ snapshot: { status: 'recording' } }, { model: null }, { model: { id: 'raw', coordinate_contract: 'degrees' } }, { sameArm: false }, { active: true }, { busy: true }]) {
    const gate = calibrationApplyState({ ...valid, ...state });
    assert.equal(gate.allowed, false); assert.ok(gate.reason);
  }
});
test('local locations use the runtime root and actual imported model path', () => {
  assert.equal(localStoragePaths('/home/user/act/', { id: 'd1' }).dataset, '/home/user/act/datasets/d1');
  assert.equal(localStoragePaths('D:\\ACT\\', { id: 'd1' }).dataset, 'D:\\ACT\\datasets\\d1');
  assert.equal(localStoragePaths('', { id: 'd1' }).dataset, '');
  assert.equal(localStoragePaths('/data', null, { path: '/data/models/imported' }).model, '/data/models/imported');
});
test('ZIP kind inspection separates datasets, native models and browser models without unpacking them', async () => {
  for (const [kind, names] of [['dataset', ['dataset.json', 'manifest.json', 'checksums.sha256']], ['model', ['export/pretrained_model/model.safetensors']], ['browser-model', ['web-act.json']], ['unknown', ['notes.txt']]]) {
    const blob = new Blob([zipSync(Object.fromEntries(names.map(name => [name, strToU8('{}')])))]);
    Object.defineProperty(blob, 'name', { value: 'test.zip' });
    assert.equal(await zipArchiveKind(blob), kind);
  }
});

test('refreshing an unchanged model preserves the selected task, validation and confirmation', () => {
  const h = harness(), model = { id: 'act', tasks: ['pick', 'place'], execution_ready: true };
  Object.assign(h.state, { inferenceModelSignature: JSON.stringify(model), inferenceGate: { ready: true } });
  h.context.selectedInferenceModel = () => model; h.context.escapeHtml = String;
  h.context.cameraRolePresentation = () => ({ wrist: { name: 'wrist', caption: 'wrist' }, world: { name: 'world', caption: 'world' } });
  h.context.renderInferenceGate = () => {};
  h.context.$('#inference-task').value = 'place'; h.context.$('#inference-confirm').checked = true;
  vm.runInContext(`let inferenceValidationGeneration=0; ${taskCode}`, h.context);
  h.context.populateInferenceTasks();
  assert.equal(h.context.$('#inference-task').value, 'place');
  assert.equal(h.state.inferenceGate.ready, true);
  assert.equal(h.context.$('#inference-confirm').checked, true);
  model.execution_ready = false;
  h.context.populateInferenceTasks();
  assert.equal(h.state.inferenceGate, null);
  assert.equal(h.context.$('#inference-confirm').checked, false);
});
test('large dataset statistics get enough time and preserve verified import counts on timeout', async () => {
  const h = harness();
  h.state.datasetStats = { dataset_id: 'large', totals: { samples: 75232 } };
  h.context.selectedDatasetId = () => 'large';
  h.context.request = async (path, options) => { assert.equal(options.timeoutMs, 180000); throw new Error('timeout'); };
  vm.runInContext(statsCode, h.context);
  await h.context.refreshDatasetStats();
  assert.equal(h.state.datasetStats.totals.samples, 75232);
  assert.equal(h.calls.filter(call => call.stats).length, 0);
});
test('late statistics from a previous dataset cannot overwrite the current dataset', async () => {
  const h = harness(); let selected = 'old', resolve;
  h.context.selectedDatasetId = () => selected;
  h.context.request = () => new Promise(done => { resolve = done; });
  vm.runInContext(statsCode, h.context);
  const pending = h.context.refreshDatasetStats(); selected = 'new'; resolve({ dataset_id: 'old' });
  await pending;
  assert.equal(h.calls.filter(call => call.stats).length, 0);
});
