import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FL_TRAJECTORY_MAX_DURATION_MS,
  FL_TRAJECTORY_MAX_FRAMES,
  appendFlFrame,
  createFlTrajectory,
  finalizeFlTrajectory,
  normalizeFlTrajectoryJoints,
  validateFlTrajectory,
} from '../../Browser_SDK/src/fl_trajectory_model.js';

const pose = (j1 = 0) => [j1, 1, -1, 0, 0, 0, 0.4];
const frame = (t, jointsRad = pose()) => ({ t, jointsRad });

test('creates a versioned manual FL trajectory with immutable copied frames', () => {
  const source = [frame(0), frame(20, pose(0.2))];
  const trajectory = createFlTrajectory({
    name: '手遥轨迹 01',
    createdAt: '2026-08-03T00:00:00.000Z',
    frames: source,
  });
  source[0].jointsRad[0] = 99;
  assert.equal(trajectory.schemaVersion, 1);
  assert.equal(trajectory.robotModel, 'FL');
  assert.equal(trajectory.source, 'manual_fl');
  assert.equal(trajectory.frames[0].jointsRad[0], 0);
  assert.equal(trajectory.durationMs, 20);
  assert.equal(validateFlTrajectory(trajectory).valid, true);
});

test('skips stationary intermediate samples but preserves the final pause timestamp', () => {
  let trajectory = createFlTrajectory({ name: 'pause', createdAt: '2026-08-03T00:00:00.000Z' });
  ({ trajectory } = appendFlFrame(trajectory, frame(0)));
  const skipped = appendFlFrame(trajectory, frame(20, pose(0.0005)));
  assert.equal(skipped.appended, false);
  trajectory = skipped.trajectory;
  const finalized = finalizeFlTrajectory(trajectory, frame(1000, pose(0.0005)));
  assert.equal(finalized.frames.length, 2);
  assert.equal(finalized.frames[1].t, 1000);
  assert.equal(finalized.durationMs, 1000);
});

test('rejects invalid FL trajectory identity, timestamps, joints and limits', () => {
  const valid = createFlTrajectory({ name: 'valid', createdAt: '2026-08-03T00:00:00.000Z', frames: [frame(0)] });
  for (const mutation of [
    { robotModel: 'LD' },
    { source: 'teleop' },
    { frames: [frame(20), frame(10)] },
    { frames: [{ t: 0, jointsRad: [0, 1] }] },
    { frames: [frame(0, pose(3))] },
  ]) {
    assert.equal(validateFlTrajectory({ ...valid, ...mutation }).valid, false);
  }
});

test('enforces ten minute and thirty thousand frame limits', () => {
  const valid = createFlTrajectory({ name: 'valid', createdAt: '2026-08-03T00:00:00.000Z', frames: [frame(0)] });
  assert.equal(validateFlTrajectory({ ...valid, durationMs: FL_TRAJECTORY_MAX_DURATION_MS + 1 }).valid, false);
  const frames = Array.from({ length: FL_TRAJECTORY_MAX_FRAMES + 1 }, (_, index) => frame(index * 20));
  assert.equal(validateFlTrajectory({ ...valid, frames, durationMs: frames.at(-1).t }).valid, false);
});

test('finalized interrupted trajectory remains valid and preserves interruption marker', () => {
  const initial = createFlTrajectory({ name: 'interrupted', createdAt: '2026-08-03T00:00:00.000Z', frames: [frame(0)] });
  const result = finalizeFlTrajectory(initial, frame(200, pose(0.1)), { interrupted: true });
  assert.equal(result.interrupted, true);
  assert.equal(result.frames.at(-1).t, 200);
  assert.equal(validateFlTrajectory(result).valid, true);
});

test('normalizes every hardware joint within three degrees of both limits without accepting real overtravel', () => {
  const limits = [
    [-2.27, 2.27], [0, 3.14], [-3.14, 0], [-1.57, 2.2],
    [-1.2, 1.2], [-3.14, 3.14], [0, 1.57],
  ];
  const midpoint = limits.map(([lower, upper]) => (lower + upper) / 2);
  const acceptedBoundaryJitter = 2.9 * Math.PI / 180;
  const rejectedOvertravel = 3.1 * Math.PI / 180;

  limits.forEach(([lower, upper], index) => {
    const nearLower = [...midpoint];
    nearLower[index] = lower - acceptedBoundaryJitter;
    const lowerTrajectory = createFlTrajectory({
      name: `J${index + 1} lower boundary`,
      createdAt: '2026-08-03T00:00:00.000Z',
      frames: [frame(0, nearLower)],
    });
    assert.equal(lowerTrajectory.frames[0].jointsRad[index], lower);

    const nearUpper = [...midpoint];
    nearUpper[index] = upper + acceptedBoundaryJitter;
    const upperTrajectory = createFlTrajectory({
      name: `J${index + 1} upper boundary`,
      createdAt: '2026-08-03T00:00:00.000Z',
      frames: [frame(0, nearUpper)],
    });
    assert.equal(upperTrajectory.frames[0].jointsRad[index], upper);

    const belowTolerance = [...midpoint];
    belowTolerance[index] = lower - rejectedOvertravel;
    const below = validateFlTrajectory({ ...lowerTrajectory, frames: [frame(0, belowTolerance)] });
    assert.equal(below.valid, false);
    assert.match(below.errors.join('; '), new RegExp(`J${index + 1} 超出`));

    const aboveTolerance = [...midpoint];
    aboveTolerance[index] = upper + rejectedOvertravel;
    const above = validateFlTrajectory({ ...upperTrajectory, frames: [frame(0, aboveTolerance)] });
    assert.equal(above.valid, false);
    assert.match(above.errors.join('; '), new RegExp(`J${index + 1} 超出`));
  });
});

test('exposes the same seven-joint normalization used by trajectory import', () => {
  const limits = [
    [-2.27, 2.27], [0, 3.14], [-3.14, 0], [-1.57, 2.2],
    [-1.2, 1.2], [-3.14, 3.14], [0, 1.57],
  ];
  const midpoint = limits.map(([lower, upper]) => (lower + upper) / 2);
  const acceptedBoundaryJitter = 2.9 * Math.PI / 180;
  const rejectedOvertravel = 3.1 * Math.PI / 180;

  limits.forEach(([, upper], index) => {
    const accepted = [...midpoint];
    accepted[index] = upper + acceptedBoundaryJitter;
    assert.equal(normalizeFlTrajectoryJoints(accepted)[index], upper);

    const rejected = [...midpoint];
    rejected[index] = upper + rejectedOvertravel;
    assert.throws(() => normalizeFlTrajectoryJoints(rejected), new RegExp(`J${index + 1} 超出`));
  });
});
