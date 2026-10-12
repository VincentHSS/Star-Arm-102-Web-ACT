import test from 'node:test';
import assert from 'node:assert/strict';

import { CaptureQualityMonitor } from '../Browser_SDK/src/act-capture-quality.js';

function sample({ action = [0, 0, 0, 0, 0, 0, 0], state = [0, 0, 0, 0, 0, 0, 0], actionOffset = 0, stateOffset = 0 } = {}) {
  return {
    timestamp_ms: 1000,
    action,
    observation_state: state,
    action_offset_ms: actionOffset,
    state_offset_ms: stateOffset,
  };
}

test('quality remains waiting until a real telemetry sample arrives', () => {
  const monitor = new CaptureQualityMonitor({ windowSize: 4 });
  assert.deepEqual(monitor.snapshot(), {
    status: 'waiting', sampleCount: 0, meanError: null, maxError: null,
    worstJoint: null, syncOffsetMs: null, cameras: { wrist: null, world: null },
  });
});

test('quality derives rolling action-state error and worst joint from real samples', () => {
  const monitor = new CaptureQualityMonitor({ windowSize: 2 });
  monitor.appendTelemetry(sample({ action: [0, 10, 20, 30, 40, 50, 60], state: [0, 8, 18, 30, 35, 50, 57], actionOffset: 4, stateOffset: -3 }));
  monitor.appendTelemetry(sample({ action: [0, 10, 20, 30, 40, 50, 60], state: [0, 9, 19, 30, 31, 50, 56], actionOffset: 5, stateOffset: -4 }));
  const quality = monitor.snapshot();
  assert.equal(quality.sampleCount, 2);
  assert.equal(quality.meanError, 1.929);
  assert.equal(quality.maxError, 9);
  assert.equal(quality.worstJoint, 5);
  assert.equal(quality.syncOffsetMs, 9);
  assert.equal(quality.status, 'retry');
});

test('quality classifies low error samples as good and resets per episode', () => {
  const monitor = new CaptureQualityMonitor({ windowSize: 4 });
  monitor.appendTelemetry(sample({ action: [1, 2, 3, 4, 5, 6, 7], state: [1, 2.2, 3, 4, 5.1, 6, 7], actionOffset: 2, stateOffset: -2 }));
  assert.equal(monitor.snapshot().status, 'good');
  monitor.reset();
  assert.equal(monitor.snapshot().status, 'waiting');
  assert.equal(monitor.snapshot().sampleCount, 0);
});

test('camera quality uses real presented frame metadata and counts frame gaps', () => {
  const monitor = new CaptureQualityMonitor({ windowSize: 4 });
  monitor.updateCamera('wrist', { nowMs: 1000, presentedFrames: 10, width: 1920, height: 1080 });
  monitor.updateCamera('wrist', { nowMs: 1100, presentedFrames: 13, width: 1920, height: 1080 });
  const wrist = monitor.snapshot().cameras.wrist;
  assert.equal(wrist.fps, 30);
  assert.equal(wrist.dropped, 2);
  assert.equal(wrist.width, 1920);
  assert.equal(wrist.height, 1080);
});

test('camera quality reports stable FPS over a rolling observation window', () => {
  const monitor = new CaptureQualityMonitor({ cameraWindowMs: 2000 });
  monitor.updateCamera('wrist', { nowMs: 0, presentedFrames: 1, width: 640, height: 360 });
  monitor.updateCamera('wrist', { nowMs: 500, presentedFrames: 16, width: 640, height: 360 });
  monitor.updateCamera('wrist', { nowMs: 1000, presentedFrames: 31, width: 640, height: 360 });
  monitor.updateCamera('wrist', { nowMs: 1900, presentedFrames: 57, width: 640, height: 360 });
  monitor.updateCamera('wrist', { nowMs: 2000, presentedFrames: 61, width: 640, height: 360 });

  assert.equal(monitor.snapshot().cameras.wrist.fps, 30);
});

test('camera quality is cleared when a real preview disconnects', () => {
  const monitor = new CaptureQualityMonitor();
  monitor.updateCamera('wrist', { nowMs: 1000, presentedFrames: 1, width: 1280, height: 720 });
  assert.equal(monitor.snapshot().cameras.wrist.width, 1280);
  monitor.clearCamera('wrist');
  assert.equal(monitor.snapshot().cameras.wrist, null);
});

test('invalid telemetry and synthetic camera estimates are rejected', () => {
  const monitor = new CaptureQualityMonitor();
  assert.throws(() => monitor.appendTelemetry({ action: [0], observation_state: [0] }), /J1-J7/);
  assert.throws(() => monitor.updateCamera('wrist', { fps: 30, dropped: 0 }), /real nowMs/);
  assert.throws(() => monitor.clearCamera('other'), /wrist or world/);
});
