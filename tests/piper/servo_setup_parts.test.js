import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LD_SERVO_PARTS } from '../../Browser_SDK/src/servo_setup_parts.js';

test('motor case picking groups cover the unchanged original CAD faces exactly once', async () => {
  for (const [link, part] of Object.entries(LD_SERVO_PARTS.parts)) {
    const data = await readFile(new URL(`../../Browser_SDK/assets/models/ld/${link}.STL`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), part.sha256);
    assert.equal(data.readUInt32LE(80), part.triangles);
    let next = 0;
    for (const group of part.ranges) {
      assert.equal(group.first, next); assert(group.count > 0);
      assert(group.slot === null || Number.isInteger(group.slot) && group.slot >= 0 && group.slot < 7);
      next += group.count;
    }
    assert.equal(next, part.triangles);
  }
});

test('motors 5 and 6 are distinct bodies inside link5; link4 is only a bracket; motor 7 excludes its grip', async () => {
  const motors = LD_SERVO_PARTS.motors;
  assert.deepEqual(motors.map(m => m.slot), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(motors[4].link, 'link5'); assert.equal(motors[5].link, 'link5'); assert.equal(motors[6].link, 'link6');
  assert(LD_SERVO_PARTS.parts.link4.ranges.every(group => group.slot === null));
  assert.equal(motors[4].caseFaces, 1978); assert.equal(motors[5].caseFaces, 4792); assert.equal(motors[6].caseFaces, 4792);
  for (const slot of [4, 5, 6]) {
    const motor = motors[slot], part = LD_SERVO_PARTS.parts[motor.link];
    const data = await readFile(new URL(`../../Browser_SDK/assets/models/ld/${motor.link}.STL`, import.meta.url));
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const group of part.ranges.filter(group => group.slot === slot)) for (let face = group.first; face < group.first + group.count; face++) {
      for (let corner = 0; corner < 3; corner++) for (let axis = 0; axis < 3; axis++) {
        const value = data.readFloatLE(84 + face * 50 + 12 + corner * 12 + axis * 4);
        lo[axis] = Math.min(lo[axis], value); hi[axis] = Math.max(hi[axis], value);
      }
    }
    assert(motor.center.every((value, axis) => value > lo[axis] && value < hi[axis]), 'the label anchor must lie inside its motor body');
    if (slot === 4) assert(lo[2] >= .009, 'motor 5 is the upper wrist case');
    if (slot === 5) assert(hi[2] < .017, 'motor 6 is the lower transverse case');
    if (slot === 6) assert(hi[1] < .008, 'motor 7 must exclude the long handle structure');
  }
});
