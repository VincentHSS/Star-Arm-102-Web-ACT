import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../../Browser_SDK/assets/vendor/three.module.js';
import { MODEL_CONFIGS } from '../../Browser_SDK/src/robot_model_configs.js';
import { urdfRpyMatrix } from '../../Browser_SDK/src/robot_model.js';

test('PiPER mounting face lies on z=0 with its outward normal facing down', async () => {
  const { rootPose } = MODEL_CONFIGS.piper;
  const rotation = urdfRpyMatrix(...rootPose.rpy);
  const normal = new THREE.Vector3(0, -1, 0).transformDirection(rotation);
  assert.ok(normal.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6,
    `mounting face must face down, got ${normal.toArray()}`);
  const bytes = await readFile(new URL('../../Browser_SDK/assets/models/piper/base_link.STL', import.meta.url));
  const count = bytes.readUInt32LE(80);
  assert.equal(bytes.length, 84 + 50 * count);
  const vertices = [];
  let minY = Infinity;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      const offset = 84 + i * 50 + 12 + j * 12;
      const v = new THREE.Vector3(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 4), bytes.readFloatLE(offset + 8));
      minY = Math.min(minY, v.y);
      vertices.push(v);
    }
  }
  let contactCount = 0;
  for (const local of vertices) {
    const world = local.clone().applyMatrix4(rotation).add(new THREE.Vector3(...rootPose.xyz));
    assert.ok(world.z >= -1e-7, `base penetrates ground: ${world.z}`);
    if (Math.abs(local.y - minY) < 1e-7) {
      contactCount++;
      assert.ok(Math.abs(world.z) < 1e-7, `mounting face floats above ground: ${world.z}`);
    }
  }
  assert.ok(contactCount > 3, 'check multiple mounting-face vertices');
});

test('PiPER base joint axis points upward after the root correction', () => {
  const config = MODEL_CONFIGS.piper;
  const joint = config.joints.find(({ name }) => name === 'joint1');
  const axis = new THREE.Vector3(...joint.axis)
    .transformDirection(urdfRpyMatrix(...joint.origin.rpy))
    .transformDirection(urdfRpyMatrix(...config.rootPose.rpy));
  assert.ok(axis.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6,
    `base joint axis must point up, got ${axis.toArray()}`);
});
