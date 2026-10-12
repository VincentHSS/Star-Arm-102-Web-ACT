import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlTrajectory } from '../../Browser_SDK/src/fl_trajectory_model.js';
import { FlTrajectoryController } from '../../Browser_SDK/src/fl_trajectory_controller.js';

const joints = (j1 = 0) => [j1, 1, -1, 0, 0, 0, 0.4];
const saved = [];
const store = () => ({
  async save(value) { saved.push(structuredClone(value)); return { trajectory: value, persisted: true, error: null }; },
});
const trajectory = () => createFlTrajectory({
  name: '轨迹 A', createdAt: '2026-08-03T00:00:00.000Z',
  frames: [{ t: 0, jointsRad: joints(0.1) }, { t: 100, jointsRad: joints(0.2) }],
});

test('records only current physical FL manual readback and leaves sampling running after stop', async () => {
  saved.length = 0;
  let now = 100;
  const controller = new FlTrajectoryController({ store: store(), now: () => now });
  assert.throws(() => controller.startRecording({ name: 'x', connectionId: null, sessionState: 'manual_readback', initialJointsRad: joints() }), /连接/);
  assert.throws(() => controller.startRecording({ name: 'x', connectionId: 'fl-1', sessionState: 'slider_control', initialJointsRad: joints() }), /卸力/);
  controller.startRecording({ name: '手遥轨迹', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints() });
  now = 120;
  assert.equal(controller.acceptReadback({ connectionId: 'fl-other', jointsRad: joints(0.3) }), false);
  assert.equal(controller.acceptReadback({ connectionId: 'fl-1', jointsRad: joints(0.2) }), true);
  now = 200;
  const result = await controller.stopRecording({ connectionId: 'fl-1', finalJointsRad: joints(0.2) });
  assert.equal(result.trajectory.frames.at(-1).t, 100);
  assert.equal(result.trajectory.interrupted, false);
  assert.equal(controller.state, 'ready');
});

test('recording applies the teleoperation thirty-sample moving average to every saved frame', async () => {
  saved.length = 0;
  let now = 0;
  const controller = new FlTrajectoryController({ store: store(), now: () => now });
  controller.startRecording({
    name: 'filtered', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints(0.1),
  });
  now = 20;
  controller.acceptReadback({ connectionId: 'fl-1', jointsRad: joints(0.3) });
  now = 40;
  const result = await controller.stopRecording({ connectionId: 'fl-1', finalJointsRad: joints(0.5) });
  assert.deepEqual(result.trajectory.frames.map((savedFrame) => savedFrame.jointsRad[0]), [0.1, 0.2, 0.3]);
});

test('recording rejects raw overtravel before filtering can hide it', () => {
  let now = 0;
  const controller = new FlTrajectoryController({ store: store(), now: () => now });
  controller.startRecording({
    name: 'raw-limit', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints(0),
  });
  now = 20;
  const j1Overtravel = joints(2.27 + 3.1 * Math.PI / 180);
  assert.throws(
    () => controller.acceptReadback({ connectionId: 'fl-1', jointsRad: j1Overtravel }),
    /J1 超出/,
  );
  assert.equal(controller.recording.filter.sampleCount, 1);
});

test('recording normalizes all seven raw joints before filtering without double-counting the final sample', async () => {
  saved.length = 0;
  let now = 0;
  const limits = [
    [-2.27, 2.27], [0, 3.14], [-3.14, 0], [-1.57, 2.2],
    [-1.2, 1.2], [-3.14, 3.14], [0, 1.57],
  ];
  const midpoint = limits.map(([lower, upper]) => (lower + upper) / 2);
  const nearUpper = limits.map(([, upper]) => upper + 2.9 * Math.PI / 180);
  const controller = new FlTrajectoryController({ store: store(), now: () => now });
  controller.startRecording({
    name: 'all-joints', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: midpoint,
  });
  now = 20;
  assert.equal(controller.acceptReadback({ connectionId: 'fl-1', jointsRad: nearUpper }), true);
  now = 40;
  const result = await controller.stopRecording({ connectionId: 'fl-1', finalJointsRad: nearUpper });
  const expected = limits.map(([, upper], index) => (midpoint[index] + upper) / 2);
  assert.equal(result.trajectory.frames.length, 3);
  for (const frameIndex of [1, 2]) {
    result.trajectory.frames[frameIndex].jointsRad.forEach((value, index) => {
      assert.ok(Math.abs(value - expected[index]) < 1e-12, `frame ${frameIndex} J${index + 1}`);
    });
  }
});

test('device loss saves an interrupted partial trajectory', async () => {
  saved.length = 0;
  let now = 0;
  const controller = new FlTrajectoryController({ store: store(), now: () => now });
  controller.startRecording({ name: 'partial', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints() });
  now = 40;
  controller.acceptReadback({ connectionId: 'fl-1', jointsRad: joints(0.2) });
  now = 80;
  await controller.handleDisconnect({ connectionId: 'fl-1' });
  assert.equal(saved.at(-1).interrupted, true);
  assert.equal(controller.state, 'disconnected');
});

test('playback confirmation is bound to trajectory and immutable connection identity', async () => {
  const writes = [];
  let connectionId = 'fl-1';
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (...args) => writes.push(args), waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  connectionId = 'fl-2';
  await assert.rejects(() => controller.confirmPlayback({ pending, connectionId: 'fl-2' }), /身份/);
  assert.equal(writes.length, 0);
});

test('playback confirmation rejects a replacement device object even when its connection id is reused', async () => {
  const writes = [];
  const originalToken = {};
  let connectionToken = originalToken;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (...args) => writes.push(args), waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connectionToken, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  connectionToken = {};
  await assert.rejects(() => controller.confirmPlayback({ pending, connectionId: 'fl-1' }), /身份/);
  assert.equal(writes.length, 0);
});

test('confirmed playback waits for the 2000 ms start transition before sending trajectory motion', async () => {
  const events = [];
  let connected = true;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => events.push('paused'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(),
    writeFrame: async (frame, duration) => { events.push(['write', frame[0], duration]); },
    waitUntil: async (deadline) => events.push(['wait', deadline]),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const result = await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.equal(result.status, 'completed');
  assert.deepEqual(events.slice(0, 3), ['paused', ['write', 0.1, 2000], ['wait', 1100]]);
  assert.deepEqual(events.slice(-2), [['write', 0.2, 100], ['wait', 3100]]);
  assert.equal(events.filter((event) => Array.isArray(event) && event[0] === 'wait').length, 21);
  assert.equal(controller.state, 'holding');
  assert.equal(connected, true);
});

test('start transition does not send trajectory motion before the twentieth 100 ms checkpoint', async () => {
  const writes = [];
  const waits = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => writes.push([frame[0], duration]),
    waitUntil: (deadline) => new Promise((resolve) => waits.push({ deadline, resolve })),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  for (let checkpoint = 1; checkpoint <= 19; checkpoint += 1) {
    while (waits.length < checkpoint) await Promise.resolve();
    waits[checkpoint - 1].resolve();
    await Promise.resolve();
    assert.equal(writes.length, 1);
  }
  while (waits.length < 20) await Promise.resolve();
  assert.equal(waits[19].deadline, 3000);
  waits[19].resolve();
  while (writes.length < 2) await Promise.resolve();
  assert.deepEqual(writes.slice(0, 2), [[0.1, 2000], [0.2, 100]]);
  await controller.stopPlayback();
  await execution;
});

test('start transition duration begins after the first serial write completes', async () => {
  let now = 1000;
  const waits = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => now,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => { now = 1080; },
    waitUntil: async (deadline) => waits.push(deadline),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.equal(waits[0], 1180);
  assert.equal(waits.at(-1), 3180);
});

test('hardware playback resamples dense recording frames to 100 ms command windows', async () => {
  const writes = [];
  const dense = createFlTrajectory({
    name: 'dense', createdAt: '2026-08-03T00:00:00.000Z',
    frames: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250]
      .map((t) => ({ t, jointsRad: joints(t / 1000) })),
  });
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => writes.push([frame[0], duration]),
    waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: dense, connectionId: 'fl-1' });
  const result = await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(writes, [
    [0, 2000],
    [0.1, 100],
    [0.2, 100],
    [0.25, 50],
  ]);
  assert.equal(result.framesWritten, 3);
});

test('smooth playback refreshes interpolated targets every 20 ms with overlapping 100 ms servo windows', async () => {
  const writes = [];
  const smooth = createFlTrajectory({
    name: 'smooth', createdAt: '2026-08-03T00:00:00.000Z',
    frames: [{ t: 0, jointsRad: joints(0) }, { t: 100, jointsRad: joints(0.1) }],
  });
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => writes.push([Number(frame[0].toFixed(2)), duration]),
    waitUntil: async () => {}, playbackUpdateIntervalMs: 20,
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: smooth, connectionId: 'fl-1' });
  const result = await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(writes, [
    [0, 2000],
    [0.02, 100], [0.04, 100], [0.06, 100], [0.08, 100], [0.1, 100],
  ]);
  assert.equal(result.framesWritten, 5);
});

test('smooth playback keeps the final partial target on a 100 ms servo window', async () => {
  const writes = [];
  const smooth = createFlTrajectory({
    name: 'smooth-final', createdAt: '2026-08-03T00:00:00.000Z',
    frames: [{ t: 0, jointsRad: joints(0) }, { t: 110, jointsRad: joints(0.11) }],
  });
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => writes.push([Number(frame[0].toFixed(2)), duration]),
    waitUntil: async () => {}, playbackUpdateIntervalMs: 20,
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: smooth, connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(writes.at(-1), [0.11, 100]);
});

test('hardware playback skips missed samples instead of bursting catch-up writes', async () => {
  let now = 1000;
  let writeCount = 0;
  const writes = [];
  const delayed = createFlTrajectory({
    name: 'delayed', createdAt: '2026-08-03T00:00:00.000Z',
    frames: Array.from({ length: 41 }, (_, index) => ({ t: index * 20, jointsRad: joints(index * 0.02) })),
  });
  const controller = new FlTrajectoryController({
    store: store(), now: () => now,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => {
      writes.push([Number(frame[0].toFixed(2)), duration]);
      writeCount += 1;
      if (writeCount === 2) now = 3500;
    },
    waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: delayed, connectionId: 'fl-1' });
  const result = await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(writes, [[0, 2000], [0.1, 100], [0.6, 100], [0.7, 100], [0.8, 100]]);
  assert.equal(result.framesWritten, 4);
});

test('hardware playback preserves the final pose when trajectory is shorter than 100 ms', async () => {
  const writes = [];
  const short = createFlTrajectory({
    name: 'short', createdAt: '2026-08-03T00:00:00.000Z',
    frames: [{ t: 0, jointsRad: joints(0) }, { t: 50, jointsRad: joints(0.25) }],
  });
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame, duration) => writes.push([frame[0], duration]),
    waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: short, connectionId: 'fl-1' });
  const result = await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(writes, [[0, 2000], [0.25, 50]]);
  assert.equal(result.framesWritten, 1);
});

test('stop during an awaited frame invalidates generation before the next write', async () => {
  const writes = [];
  let waiting = false;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame) => writes.push(frame[0]),
    waitUntil: () => {
      waiting = true;
      return new Promise(() => {});
    },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!waiting) await Promise.resolve();
  const stopped = await controller.stopPlayback();
  const result = await execution;
  assert.equal(stopped.status, 'holding');
  assert.equal(result.status, 'stopped');
  assert.equal(controller.state, 'holding');
  assert.deepEqual(writes, [0.1]);
});

test('disconnect interrupts an active scheduler wait without another write', async () => {
  const writes = [];
  let waiting = false;
  let connected = true;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async (frame) => writes.push(frame[0]),
    waitUntil: () => {
      waiting = true;
      return new Promise(() => {});
    },
    connectionSnapshot: () => ({ connectionId: connected ? 'fl-1' : null, connected }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!waiting) await Promise.resolve();
  connected = false;
  await controller.handleDisconnect({ connectionId: 'fl-1' });
  assert.equal((await execution).status, 'stopped');
  assert.deepEqual(writes, [0.1]);
  assert.equal(controller.state, 'disconnected');
});

test('emergency stop invalidates playback and releases torque without resuming a faulted session', async () => {
  const events = [];
  let releaseWrite;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'), resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(),
    writeFrame: async () => new Promise((resolve) => { releaseWrite = resolve; }),
    releaseTorque: async () => events.push('released'), waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!releaseWrite) await Promise.resolve();
  const emergency = controller.emergencyStop();
  releaseWrite();
  await execution;
  await emergency;
  assert.ok(events.includes('released'));
  assert.ok(!events.includes('resumed'));
  assert.equal(controller.state, 'fault');
});

test('emergency stop interrupts an active scheduler wait before releasing torque', async () => {
  const events = [];
  let waiting = false;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(), writeFrame: async () => events.push('write'),
    waitUntil: () => {
      waiting = true;
      return new Promise(() => {});
    },
    releaseTorque: async () => events.push('released'),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!waiting) await Promise.resolve();
  const result = await controller.emergencyStop();
  assert.equal(result.status, 'fault');
  assert.equal((await execution).status, 'stopped');
  assert.deepEqual(events, ['paused', 'write', 'released']);
});

test('emergency during explicit torque release never restores sampling', async () => {
  const events = [];
  let finishFirstRelease;
  let releaseCalls = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(), writeFrame: async () => events.push('write'),
    waitUntil: async () => {},
    releaseTorque: async () => {
      releaseCalls += 1;
      events.push('releasing');
      if (releaseCalls === 1) await new Promise((resolve) => { finishFirstRelease = resolve; });
    },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  const releasing = controller.releasePlaybackTorque();
  while (!finishFirstRelease) await Promise.resolve();
  const emergency = controller.emergencyStop();
  finishFirstRelease();
  await Promise.all([releasing, emergency]);
  assert.ok(!events.includes('resumed'));
  assert.equal(releaseCalls, 1);
  assert.equal(controller.state, 'fault');
});

test('disconnect during explicit torque release never restores sampling even before adapter closes', async () => {
  const events = [];
  let finishRelease;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(), writeFrame: async () => events.push('write'),
    waitUntil: async () => {},
    releaseTorque: async () => new Promise((resolve) => { finishRelease = resolve; }),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  const releasing = controller.releasePlaybackTorque();
  while (!finishRelease) await Promise.resolve();
  const disconnected = controller.handleDisconnect({ connectionId: 'fl-1' });
  finishRelease();
  await Promise.all([releasing, disconnected]);
  assert.ok(!events.includes('resumed'));
  assert.equal(controller.state, 'disconnected');
});

test('explicit torque release failure enters fault instead of reporting ready', async () => {
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => { throw new Error('release failed'); },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  await assert.rejects(controller.releasePlaybackTorque(), /轨迹卸力失败：release failed/);
  assert.equal(controller.state, 'fault');
});

test('manual stop holds fault when explicit torque release fails', async () => {
  let waiting = false;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {},
    waitUntil: () => new Promise(() => { waiting = true; }),
    releaseTorque: async () => { throw new Error('release failed'); },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!waiting) await Promise.resolve();
  await controller.stopPlayback();
  await execution;
  await assert.rejects(controller.releasePlaybackTorque(), /轨迹卸力失败：release failed/);
  assert.equal(controller.state, 'fault');
});

test('manual stop propagates an in-flight write failure and keeps the faulted session paused', async () => {
  let rejectWrite;
  let writeStarted = false;
  const events = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(),
    writeFrame: () => new Promise((resolve, reject) => {
      writeStarted = true;
      rejectWrite = reject;
    }),
    waitUntil: async () => {},
    releaseTorque: async () => events.push('released'),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  const executionResult = execution.catch((error) => error);
  while (!writeStarted) await Promise.resolve();
  const stopping = controller.stopPlayback();
  rejectWrite(new Error('serial write failed during stop'));
  await assert.rejects(stopping, /轨迹回放写入失败：serial write failed during stop/);
  assert.match((await executionResult).message, /轨迹回放写入失败：serial write failed during stop/);
  assert.equal(controller.state, 'fault');
  assert.ok(events.includes('released'));
  assert.ok(!events.includes('resumed'));
});

test('completed playback holds torque until the operator explicitly releases it', async () => {
  const events = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    releaseTorque: async () => events.push('released'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(),
    writeFrame: async () => events.push('write'), waitUntil: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.equal(controller.state, 'holding');
  assert.ok(!events.includes('released'));
  assert.ok(!events.includes('resumed'));
  await controller.releasePlaybackTorque();
  assert.deepEqual(events.slice(-2), ['released', 'resumed']);
  assert.equal(controller.state, 'ready');
});

test('manual playback stop holds torque until the operator explicitly releases it', async () => {
  const events = [];
  let releaseWait;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => events.push('paused'),
    releaseTorque: async () => events.push('released'),
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(), writeFrame: async () => events.push('write'),
    waitUntil: () => new Promise((resolve) => { releaseWait = resolve; }),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (!releaseWait) await Promise.resolve();
  const stopping = controller.stopPlayback();
  releaseWait();
  await Promise.all([execution, stopping]);
  assert.equal(controller.state, 'holding');
  assert.ok(!events.includes('released'));
  assert.ok(!events.includes('resumed'));
  await controller.releasePlaybackTorque();
  assert.deepEqual(events.slice(-2), ['released', 'resumed']);
});

test('explicit release shares one torque operation with emergency and never restores sampling', async () => {
  const events = [];
  let finishRelease;
  let releaseCalls = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {},
    resumeSampling: () => events.push('resumed'),
    currentJoints: () => joints(), writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => {
      releaseCalls += 1;
      await new Promise((resolve) => { finishRelease = resolve; });
    },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.throws(() => controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' }), /先卸力/);
  assert.throws(() => controller.startRecording({
    name: 'blocked while holding', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints(),
  }), /先卸力/);
  const releasing = controller.releasePlaybackTorque();
  while (!finishRelease) await Promise.resolve();
  assert.throws(() => controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' }), /正在卸力/);
  assert.throws(() => controller.startRecording({
    name: 'blocked', connectionId: 'fl-1', sessionState: 'manual_readback', initialJointsRad: joints(),
  }), /正在卸力/);
  const emergency = controller.emergencyStop();
  finishRelease();
  await Promise.all([releasing, emergency]);
  assert.equal(releaseCalls, 1);
  assert.ok(!events.includes('resumed'));
  assert.equal(controller.state, 'fault');
});

test('playback waits through the final frame command window before entering torque hold', async () => {
  const events = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 1000,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => events.push('write'),
    waitUntil: async (deadline) => events.push(['wait', deadline]),
    releaseTorque: async () => events.push('released'),
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  assert.deepEqual(events.at(-1), ['wait', 3100]);
  assert.equal(controller.state, 'holding');
  assert.ok(!events.includes('released'));
});

test('explicit torque release refuses a changed connection before issuing any write', async () => {
  let connectionId = 'fl-1';
  let releaseCalls = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => { releaseCalls += 1; },
    connectionSnapshot: () => ({ connectionId, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  connectionId = 'fl-2';
  await assert.rejects(controller.releasePlaybackTorque(), /身份|连接/);
  assert.equal(releaseCalls, 0);
  assert.equal(controller.state, 'fault');
});

test('explicit torque release refuses a replacement device object with a reused connection id', async () => {
  let connectionToken = {};
  let releaseCalls = 0;
  let resumed = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => { resumed += 1; }, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => { releaseCalls += 1; },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connectionToken, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  connectionToken = {};
  await assert.rejects(controller.releasePlaybackTorque(), /身份|连接/);
  assert.equal(releaseCalls, 0);
  assert.equal(resumed, 0);
  assert.equal(controller.state, 'fault');
});

test('late disconnect for an old connection never releases torque on the replacement connection', async () => {
  let connectionId = 'fl-1';
  let releaseCalls = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => { releaseCalls += 1; },
    connectionSnapshot: () => ({ connectionId, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  connectionId = 'fl-2';
  await assert.rejects(controller.handleDisconnect({ connectionId: 'fl-1' }), /身份|连接/);
  assert.equal(releaseCalls, 0);
  assert.equal(controller.state, 'fault');
});

test('active playback disconnect never releases torque on a replacement object with the same id', async () => {
  let connectionToken = {};
  let releaseCalls = 0;
  const waits = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: () => new Promise((resolve) => waits.push(resolve)),
    releaseTorque: async () => { releaseCalls += 1; },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connectionToken, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (waits.length === 0) await Promise.resolve();
  connectionToken = {};
  await assert.rejects(controller.handleDisconnect({ connectionId: 'fl-1' }), /身份|连接/);
  await execution;
  assert.equal(releaseCalls, 0);
  assert.equal(controller.state, 'fault');
});

test('active playback emergency never releases torque on a replacement object with the same id', async () => {
  let connectionToken = {};
  let releaseCalls = 0;
  const waits = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: () => new Promise((resolve) => waits.push(resolve)),
    releaseTorque: async () => { releaseCalls += 1; },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connectionToken, connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  while (waits.length === 0) await Promise.resolve();
  connectionToken = {};
  await controller.emergencyStop();
  await execution;
  assert.equal(releaseCalls, 0);
  assert.equal(controller.state, 'fault');
});

test('disconnect propagates a concurrent write and torque release failure without overwriting fault', async () => {
  let rejectWrite;
  let writeStarted = false;
  let releaseCalls = 0;
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: () => new Promise((resolve, reject) => { writeStarted = true; rejectWrite = reject; }),
    releaseTorque: async () => { releaseCalls += 1; throw new Error('release failed during disconnect'); },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  const execution = controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  const observedExecution = execution.catch((error) => error);
  while (!writeStarted) await Promise.resolve();
  const disconnecting = controller.handleDisconnect({ connectionId: 'fl-1' });
  rejectWrite(new Error('write failed during disconnect'));
  const disconnectError = await disconnecting.catch((error) => error);
  assert.ok(disconnectError instanceof AggregateError);
  assert.match(disconnectError.message, /write failed during disconnect/);
  assert.match(disconnectError.message, /release failed during disconnect/);
  assert.equal(await observedExecution, disconnectError);
  assert.equal(releaseCalls, 1);
  assert.equal(controller.state, 'fault');
});

test('failed explicit torque release can be retried on the same held connection', async () => {
  let releaseCalls = 0;
  const events = [];
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => events.push('resumed'), currentJoints: () => joints(),
    writeFrame: async () => {}, waitUntil: async () => {},
    releaseTorque: async () => { releaseCalls += 1; if (releaseCalls === 1) throw new Error('first release failed'); },
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await controller.confirmPlayback({ pending, connectionId: 'fl-1' });
  await assert.rejects(controller.releasePlaybackTorque(), /first release failed/);
  assert.equal(controller.state, 'fault');
  const result = await controller.releasePlaybackTorque();
  assert.equal(result.status, 'ready');
  assert.equal(releaseCalls, 2);
  assert.deepEqual(events, ['resumed']);
});

test('write failures preserve the serial error and enter fault state', async () => {
  const controller = new FlTrajectoryController({
    store: store(), now: () => 0,
    pauseSampling: async () => {}, resumeSampling: () => {}, currentJoints: () => joints(),
    writeFrame: async () => { throw new Error('serial write failed'); },
    releaseTorque: async () => {},
    connectionSnapshot: () => ({ connectionId: 'fl-1', connected: true }),
  });
  const pending = controller.preparePlayback({ trajectory: trajectory(), connectionId: 'fl-1' });
  await assert.rejects(
    controller.confirmPlayback({ pending, connectionId: 'fl-1' }),
    /轨迹回放写入失败：serial write failed/,
  );
  assert.equal(controller.state, 'fault');
});
