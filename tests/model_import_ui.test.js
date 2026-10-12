import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.js', import.meta.url), 'utf8');
const importFunction = source.slice(source.indexOf('async function importActModel(file)'), source.indexOf('async function exportActModel(modelId)'));
const chooseFunction = source.slice(source.indexOf('function latestExecutableInferenceModel()'), source.indexOf('function selectedInferenceModel()'));

function harness({ ready = true, fail = false, active = false } = {}) {
  const state = { modelImporting: false, inference: { status: active ? 'running' : 'stopped', model_id: 'old' },
    inferenceGate: null, selectedInferenceModelId: 'old', models: [{ id: 'old', execution_ready: true }] };
  const calls = [];
  const nodes = new Map();
  const context = { state, console, document: { querySelector: () => ({ click: () => calls.push('navigate') }) },
    $: selector => { if (!nodes.has(selector)) nodes.set(selector, { checked: true, value: 'file.zip' }); return nodes.get(selector); },
    inferenceIsActive: () => state.inference.status === 'running',
    setModelImportStatus: (message, mode) => calls.push({ message, mode }),
    renderInferenceGate: () => {}, formatBytes: () => '1 MB', toast: message => calls.push(message),
    request: async (path, options) => { calls.push({ path, options }); if (fail) throw new Error('missing processor'); return { id: 'imported', tasks: ['task'], execution_ready: true }; },
    loadModels: async () => { state.models.push({ id: 'imported', execution_ready: true }); calls.push('loaded'); },
    validateInference: async () => { state.inferenceGate = { ready }; calls.push('validated'); },
    startInference: () => calls.push('UNEXPECTED ROBOT START'),
  };
  vm.createContext(context);
  vm.runInContext(`${chooseFunction}\n${importFunction}`, context);
  return { context, state, calls, nodes };
}

test('model import uploads raw ZIP, selects imported model and validates without starting robot', async () => {
  const h = harness();
  const file = { name: 'model.zip', size: 1000 };
  await h.context.importActModel(file);
  assert.equal(h.state.selectedInferenceModelId, 'imported');
  assert.equal(h.context.latestExecutableInferenceModel().id, 'imported');
  const upload = h.calls.find(call => call.path === '/models/import');
  assert.equal(upload.options.body, file);
  assert.equal(upload.options.headers['Content-Type'], 'application/zip');
  assert.ok(h.calls.includes('validated'));
  assert.ok(h.calls.some(call => call.message?.includes('即可启动')));
  assert.ok(!h.calls.includes('UNEXPECTED ROBOT START'));
  assert.equal(h.nodes.get('#inference-confirm').checked, false);
  assert.equal(h.state.modelImporting, false);
});

test('missing hardware after import explains remaining connection requirements', async () => {
  const h = harness({ ready: false });
  await h.context.importActModel({ name: 'model.zip', size: 1000 });
  assert.equal(h.state.selectedInferenceModelId, 'imported');
  assert.ok(h.calls.some(call => call.message?.includes('完成连接或准备运行环境')));
  assert.ok(!h.calls.includes('UNEXPECTED ROBOT START'));
});

test('published TAR.GZ uploads directly without changing its bytes', async () => {
  const h = harness();
  const file = { name: 'stararm102_pick_act_torch271.tar.gz', size: 191108326 };
  await h.context.importActModel(file);
  const upload = h.calls.find(call => call.path === '/models/import');
  assert.equal(upload.options.body, file);
  assert.equal(upload.options.headers['Content-Type'], 'application/octet-stream');
  assert.equal(h.state.selectedInferenceModelId, 'imported');
});

test('failed upload keeps old model and allows retry', async () => {
  const h = harness({ fail: true });
  await h.context.importActModel({ name: 'broken.zip', size: 1000 });
  assert.equal(h.state.selectedInferenceModelId, 'old');
  assert.equal(h.state.modelImporting, false);
  assert.equal(h.nodes.get('#model-import-file').value, '');
  assert.ok(h.calls.some(call => call.mode === 'error' && call.message.includes('missing processor')));
});

test('active inference rejects import and keeps the actual running model selected', async () => {
  const h = harness({ active: true });
  h.state.selectedInferenceModelId = 'another';
  h.state.models.push({ id: 'another', execution_ready: true });
  await h.context.importActModel({ name: 'model.zip', size: 1000 });
  assert.ok(!h.calls.some(call => call.path));
  assert.equal(h.context.latestExecutableInferenceModel().id, 'old');
});

test('single weights and oversized packages are rejected before upload', async () => {
  const h = harness();
  await h.context.importActModel({ name: 'model.safetensors', size: 1000 });
  await h.context.importActModel({ name: 'model.zip', size: 2_000_000_001 });
  assert.ok(!h.calls.some(call => call.path));
  assert.equal(h.calls.filter(call => call.mode === 'error').length, 2);
});
