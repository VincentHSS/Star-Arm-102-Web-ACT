import test from 'node:test';
import assert from 'node:assert/strict';

import { WaveformBuffer, WaveformChart } from '../Browser_SDK/src/act-waveform.js';

function sample(timestampMs = 1000, base = 0) {
  return {
    timestamp_ms: timestampMs,
    observation_state: Array.from({ length: 7 }, (_, index) => base + index),
    action: Array.from({ length: 7 }, (_, index) => base + index + 0.5),
    state_offset_ms: -3,
    action_offset_ms: 4,
  };
}

test('waveform buffer remains empty until a real sample is appended', () => {
  const buffer = new WaveformBuffer();

  const series = buffer.series();
  assert.equal(series.view, 'joint');
  assert.equal(series.joint, null);
  assert.equal(series.channels.length, 14);
  assert.ok(series.channels.every(channel => channel.points.length === 0));
  assert.deepEqual(buffer.stats(), { samples: 0, latest: null });
});

test('waveform buffer keeps a fixed number of real samples', () => {
  const buffer = new WaveformBuffer({ limit: 2 });
  buffer.append(sample(1000, 0));
  buffer.append(sample(1001, 10));
  buffer.append(sample(1002, 20));

  assert.deepEqual(buffer.series().channels[0].points.map(point => point.timestampMs), [1001, 1002]);
  assert.equal(buffer.stats().samples, 2);
});

test('joint view exposes fourteen action and state channels and filters a selected joint', () => {
  const buffer = new WaveformBuffer();
  buffer.append(sample());

  const all = buffer.series();
  assert.equal(all.channels.length, 14);
  assert.equal(all.channels.find(channel => channel.key === 'action-j1').points[0].value, 0.5);
  assert.equal(all.channels.find(channel => channel.key === 'state-j7').points[0].value, 6);

  buffer.selectJoint(6);
  const selected = buffer.series();
  assert.equal(selected.joint, 6);
  assert.deepEqual(selected.channels.map(channel => channel.key), ['action-j7', 'state-j7']);
  buffer.selectAllJoints();
  assert.equal(buffer.series().channels.length, 14);
});

test('individual waveform channels can be hidden without changing retained telemetry', () => {
  const buffer = new WaveformBuffer();
  buffer.append(sample());
  buffer.setChannelVisible('action-j1', false);
  assert.equal(buffer.series().channels.some(channel => channel.key === 'action-j1'), false);
  assert.equal(buffer.stats().samples, 1);
  assert.throws(() => buffer.setChannelVisible('camera', false), /channel/);
});

test('sync view exposes real action and state offsets', () => {
  const buffer = new WaveformBuffer();
  buffer.append(sample());
  buffer.setView('sync');

  assert.deepEqual(buffer.series(), {
    view: 'sync',
    toleranceMs: 16,
    actionOffset: [{ timestampMs: 1000, value: 4 }],
    stateOffset: [{ timestampMs: 1000, value: -3 }],
  });
});

test('invalid or incomplete samples are rejected and clear removes retained data', () => {
  const buffer = new WaveformBuffer();
  assert.throws(() => buffer.append({ ...sample(), action: [1, 2] }), /J1-J7/);
  assert.throws(() => buffer.selectJoint(7), /0-6/);
  assert.throws(() => buffer.setView('camera'), /joint or sync/);

  buffer.append(sample());
  buffer.clear();
  assert.equal(buffer.stats().samples, 0);
});

test('waveform chart coalesces high-frequency redraw requests and destroys delayed work', async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let rafCalls = 0;
  let timerCalls = 0;
  const timers = new Map();
  const rafCallbacks = new Map();
  globalThis.requestAnimationFrame = callback => { rafCalls += 1; rafCallbacks.set(rafCalls, callback); return rafCalls; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.setTimeout = (callback, delay) => { timerCalls += 1; const id = timerCalls; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    const canvas = { getBoundingClientRect: () => ({ width: 320, height: 120 }), width: 0, height: 0, getContext: () => ({ setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {} }) };
    const chart = new WaveformChart(canvas, new WaveformBuffer(), { maxDrawHz: 20 });
    chart.lastDrawAt = performance.now() - 100;
    chart.schedule();
    chart.schedule();
    chart.schedule();
    assert.equal(rafCalls, 1);
    const callback = rafCallbacks.get(1);
    rafCallbacks.delete(1);
    callback();
    chart.lastDrawAt = performance.now();
    chart.schedule();
    assert.equal(timerCalls, 1);
    chart.destroy();
    assert.equal(timers.size, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
