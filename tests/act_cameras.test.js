import test from 'node:test';
import assert from 'node:assert/strict';

import { BrowserCameraController } from '../Browser_SDK/src/act-cameras.js';

function stream(id, settings = { width: 1920, height: 1080, frameRate: 30 }) {
  const track = { stopped: false, stop() { this.stopped = true; }, getSettings() { return settings; } };
  return { id, track, getTracks() { return [track]; }, getVideoTracks() { return [track]; } };
}

function mediaHarness() {
  const streams = new Map();
  const calls = [];
  const devices = [
    { kind: 'videoinput', deviceId: 'camera-wrist', label: 'USB Camera A', groupId: 'group-a' },
    { kind: 'audioinput', deviceId: 'microphone', label: 'Microphone', groupId: 'audio' },
    { kind: 'videoinput', deviceId: 'camera-world', label: 'USB Camera B', groupId: 'group-b' },
  ];
  return {
    calls,
    streams,
    async enumerateDevices() { return devices; },
    async getUserMedia(constraints) {
      calls.push(constraints);
      const exact = constraints.video?.deviceId?.exact;
      const id = exact || 'permission';
      const value = stream(id);
      streams.set(id, value);
      return value;
    },
  };
}

test('camera permission refresh exposes browser video inputs with readable labels', async () => {
  const media = mediaHarness();
  const controller = new BrowserCameraController(media);

  const devices = await controller.requestPermissionAndList();

  assert.deepEqual(devices.map(item => [item.deviceId, item.label]), [
    ['camera-wrist', 'USB Camera A'],
    ['camera-world', 'USB Camera B'],
  ]);
  assert.equal(media.streams.get('permission').track.stopped, true);
});

test('two selected cameras open two independent exact-device streams', async () => {
  const media = mediaHarness();
  const controller = new BrowserCameraController(media);

  const opened = await controller.openPair('camera-wrist', 'camera-world');

  assert.equal(opened.wrist.id, 'camera-wrist');
  assert.equal(opened.world.id, 'camera-world');
  assert.deepEqual(media.calls.slice(-2).map(call => call.video.deviceId.exact), [
    'camera-wrist',
    'camera-world',
  ]);
  assert.notEqual(opened.wrist, opened.world);
});

test('camera streams try the selected native resolution first', async () => {
  const media = mediaHarness();
  const controller = new BrowserCameraController(media);

  await controller.openPair('camera-wrist', 'camera-world', { width: 1280, height: 720, frameRate: 30 });

  for (const call of media.calls.slice(-2)) {
    assert.deepEqual(call.video.width, { exact: 1280 });
    assert.deepEqual(call.video.height, { exact: 720 });
    assert.deepEqual(call.video.frameRate, { ideal: 30 });
    assert.equal(call.video.deviceId.exact.startsWith('camera-'), true);
  }
});

test('low-resolution fallback is stopped and retried at explicit native modes', async () => {
  const calls = [];
  const low = stream('camera-wrist-low', { width: 160, height: 120, frameRate: 30 });
  const hd = stream('camera-wrist-hd', { width: 1280, height: 720, frameRate: 15 });
  const world = stream('camera-world', { width: 1280, height: 720, frameRate: 30 });
  const media = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (constraints.video.deviceId.exact === 'camera-world') return world;
      return calls.length === 1 ? low : hd;
    },
  };
  const controller = new BrowserCameraController(media);

  const opened = await controller.openPair('camera-wrist', 'camera-world', { width: 1920, height: 1080, frameRate: 30 });

  assert.equal(low.track.stopped, true);
  assert.equal(opened.wrist, hd);
  assert.deepEqual(calls.slice(0, 2).map(call => [call.video.width.exact, call.video.height.exact, call.video.frameRate.ideal]), [
    [1920, 1080, 30],
    [1920, 1080, 15],
  ]);
});

test('exact startup rejection falls back to track constraints on the selected device', async () => {
  const calls = [];
  let settings = { width: 160, height: 120, frameRate: 30 };
  const applied = [];
  const track = {
    stopped: false,
    stop() { this.stopped = true; },
    getSettings() { return settings; },
    async applyConstraints(constraints) {
      applied.push(constraints);
      settings = { width: constraints.width.exact, height: constraints.height.exact, frameRate: constraints.frameRate.ideal };
    },
  };
  const bootstrap = {
    id: 'camera-wrist',
    track,
    getTracks() { return [track]; },
    getVideoTracks() { return [track]; },
  };
  const world = stream('camera-world', { width: 1920, height: 1080, frameRate: 30 });
  const media = {
    async getUserMedia(constraints) {
      calls.push(constraints);
      if (constraints.video.deviceId.exact === 'camera-world') return world;
      if (!constraints.video.width) return bootstrap;
      const error = new Error('startup exact mode unsupported');
      error.name = 'OverconstrainedError';
      throw error;
    },
  };
  const controller = new BrowserCameraController(media);

  const opened = await controller.openPair('camera-wrist', 'camera-world', { width: 1280, height: 720, frameRate: 30 });

  assert.equal(opened.wrist, bootstrap);
  assert.deepEqual(opened.quality.wrist, { width: 1280, height: 720, frameRate: 30 });
  assert.deepEqual(applied[0], {
    width: { exact: 1280 },
    height: { exact: 720 },
    frameRate: { ideal: 30 },
  });
  assert.equal(track.stopped, false);
});

test('pair opening rejects and rolls back when a camera never reaches minimum preview quality', async () => {
  const opened = [];
  const media = {
    async getUserMedia(constraints) {
      const value = stream(constraints.video.deviceId.exact, { width: 160, height: 120, frameRate: 30 });
      opened.push(value);
      return value;
    },
  };
  const controller = new BrowserCameraController(media);

  await assert.rejects(
    () => controller.openPair('camera-wrist', 'camera-world', { width: 1280, height: 720, frameRate: 30 }),
    /末端视角相机.*最低 640×360.*实际 160×120/,
  );
  assert.equal(opened.every(value => value.track.stopped), true);
});

test('opened pair reports the actual negotiated camera quality', async () => {
  const wrist = stream('camera-wrist', { width: 1920, height: 1080, frameRate: 30 });
  const world = stream('camera-world', { width: 1280, height: 720, frameRate: 29.97 });
  const media = {
    async getUserMedia(constraints) {
      return constraints.video.deviceId.exact === 'camera-wrist' ? wrist : world;
    },
  };
  const controller = new BrowserCameraController(media);

  const opened = await controller.openPair('camera-wrist', 'camera-world');

  assert.deepEqual(opened.quality, {
    wrist: { width: 1920, height: 1080, frameRate: 30 },
    world: { width: 1280, height: 720, frameRate: 29.97 },
  });
});

test('duplicate camera selection is rejected before opening a stream', async () => {
  const media = mediaHarness();
  const controller = new BrowserCameraController(media);

  await assert.rejects(() => controller.openPair('camera-wrist', 'camera-wrist'), /两路画面必须选择不同摄像头/);
  assert.equal(media.calls.length, 0);
});

test('partial camera opening is rolled back when the second device fails', async () => {
  const first = stream('camera-wrist');
  const media = {
    async getUserMedia(constraints) {
      if (constraints.video.deviceId.exact === 'camera-wrist') return first;
      throw new Error('device busy');
    },
  };
  const controller = new BrowserCameraController(media);

  await assert.rejects(() => controller.openPair('camera-wrist', 'camera-world'), /device busy/);
  assert.equal(first.track.stopped, true);
});

test('close stops both camera streams', async () => {
  const media = mediaHarness();
  const controller = new BrowserCameraController(media);
  const opened = await controller.openPair('camera-wrist', 'camera-world');

  controller.close();

  assert.equal(opened.wrist.track.stopped, true);
  assert.equal(opened.world.track.stopped, true);
});
