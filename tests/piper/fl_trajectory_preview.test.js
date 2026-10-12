import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlTrajectory } from '../../Browser_SDK/src/fl_trajectory_model.js';
import { FlTrajectoryPreview } from '../../Browser_SDK/src/fl_trajectory_preview.js';

const joints = (j1 = 0) => [j1, 1, -1, 0, 0, 0, 0.4];
const trajectory = () => createFlTrajectory({
  name: '预演轨迹',
  createdAt: '2026-08-03T00:00:00.000Z',
  frames: [
    { t: 0, jointsRad: joints(0.1) },
    { t: 100, jointsRad: joints(0.2) },
  ],
});

const manualClock = () => {
  let now = 0;
  let scheduled = null;
  return {
    now: () => now,
    schedule(callback) { scheduled = callback; return 1; },
    cancel() { scheduled = null; },
    step(value) { now = value; const callback = scheduled; scheduled = null; callback?.(); },
  };
};

test('virtual preview requires physical FL identity and never receives a serial writer capability', () => {
  const clock = manualClock();
  const poses = [];
  const preview = new FlTrajectoryPreview({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onPose: (pose) => poses.push(pose),
  });
  assert.throws(() => preview.start({ trajectory: trajectory(), connectionId: '', currentJointsRad: joints() }), /连接真实 FL/);
  preview.start({ trajectory: trajectory(), connectionId: 'fl-1', currentJointsRad: joints() });
  assert.equal(preview.state, 'moving_to_start');
  assert.equal(poses.length, 1);
  assert.equal(Object.hasOwn(preview, 'writeFrame'), false);
});

test('virtual preview interpolates for 2000 ms before following original timestamps', () => {
  const clock = manualClock();
  const poses = [];
  const preview = new FlTrajectoryPreview({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onPose: (pose) => poses.push(pose),
  });
  preview.start({ trajectory: trajectory(), connectionId: 'fl-1', currentJointsRad: joints(0) });
  clock.step(1000);
  assert.ok(Math.abs(poses.at(-1)[0] - 0.05) < 1e-9);
  clock.step(2000);
  assert.equal(preview.state, 'playing');
  assert.ok(Math.abs(poses.at(-1)[0] - 0.1) < 1e-9);
  clock.step(2050);
  assert.ok(Math.abs(poses.at(-1)[0] - 0.15) < 1e-9);
});

test('virtual preview reports one monotonic timeline across start transition and trajectory', () => {
  const clock = manualClock();
  const progress = [];
  const preview = new FlTrajectoryPreview({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onPose: () => {},
    onProgress: (value) => progress.push(value),
  });
  preview.start({ trajectory: trajectory(), connectionId: 'fl-1', currentJointsRad: joints() });
  clock.step(1999);
  clock.step(2000);
  clock.step(2050);
  assert.deepEqual(progress.map(({ elapsedMs }) => elapsedMs), [0, 1999, 2000, 2050]);
  assert.ok(progress.every(({ durationMs }) => durationMs === 2100));
});

test('manual approval can end preview immediately and is bound to trajectory plus connection identity', () => {
  const clock = manualClock();
  const restored = [];
  const preview = new FlTrajectoryPreview({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onPose: () => {},
    onRestore: () => restored.push('restored'),
  });
  const value = trajectory();
  preview.start({ trajectory: value, connectionId: 'fl-1', currentJointsRad: joints() });
  const approval = preview.approve();
  assert.equal(preview.state, 'approved');
  assert.equal(restored.length, 1);
  assert.equal(preview.isApproved({ trajectory: value, connectionId: 'fl-1' }), true);
  assert.equal(preview.isApproved({ trajectory: { ...value, name: 'changed' }, connectionId: 'fl-1' }), false);
  assert.equal(preview.isApproved({ trajectory: value, connectionId: 'fl-2' }), false);
  assert.equal(typeof approval.fingerprint, 'string');
});

test('plain stop restores physical readback but does not approve hardware playback', () => {
  const clock = manualClock();
  let restores = 0;
  const preview = new FlTrajectoryPreview({
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onPose: () => {},
    onRestore: () => { restores += 1; },
  });
  const value = trajectory();
  preview.start({ trajectory: value, connectionId: 'fl-1', currentJointsRad: joints() });
  preview.stop();
  assert.equal(preview.state, 'stopped');
  assert.equal(restores, 1);
  assert.equal(preview.isApproved({ trajectory: value, connectionId: 'fl-1' }), false);
});

test('trajectory mutation and disconnect revoke an existing preview approval', () => {
  const clock = manualClock();
  const preview = new FlTrajectoryPreview({ now: clock.now, schedule: clock.schedule, cancel: clock.cancel, onPose: () => {} });
  const value = trajectory();
  preview.start({ trajectory: value, connectionId: 'fl-1', currentJointsRad: joints() });
  preview.approve();
  preview.revoke('trajectory_changed');
  assert.equal(preview.isApproved({ trajectory: value, connectionId: 'fl-1' }), false);
  preview.start({ trajectory: value, connectionId: 'fl-1', currentJointsRad: joints() });
  preview.approve();
  preview.disconnect();
  assert.equal(preview.isApproved({ trajectory: value, connectionId: 'fl-1' }), false);
});
