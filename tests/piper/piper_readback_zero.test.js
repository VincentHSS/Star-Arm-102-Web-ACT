import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../../Browser_SDK/assets/vendor/three.module.js';
import { MODEL_CONFIGS } from '../../Browser_SDK/src/robot_model_configs.js';
import { buildJointTree, applyModelJointAngles, renderedJointAngle, urdfRpyMatrix } from '../../Browser_SDK/src/robot_model.js';
import { servoToModelAngles } from '../../Browser_SDK/src/joint_mapper.js';

test('PiPER J3 reverses reported signed multi-turn angles including -239 degrees', () => {
  const tree = buildJointTree(MODEL_CONFIGS.piper.joints);
  for (const degrees of [1, -30, -120, -239, -120, 1]) {
    applyModelJointAngles(tree, servoToModelAngles('PIPER', [0, 0, degrees, 0, 0, 0, 0]));
    assert.ok(Math.abs(renderedJointAngle(tree.joints.get('joint3')) + degrees * Math.PI / 180) < 1e-10);
  }
  const fl = buildJointTree(MODEL_CONFIGS.fl.joints);
  applyModelJointAngles(fl, { joint3: -100 });
  assert.equal(fl.joints.get('joint3').angle, fl.joints.get('joint3').limit.lower);
});

async function fingerMesh(name) {
  const bytes = await readFile(new URL(`../../Browser_SDK/assets/models/piper/${name}.STL`, import.meta.url));
  const triangles = [];
  for (let i = 0; i < bytes.readUInt32LE(80); i++) {
    const triangle = [];
    for (let j = 0; j < 3; j++) {
      const offset = 84 + i * 50 + 12 + j * 12;
      triangle.push(new THREE.Vector3(bytes.readFloatLE(offset), bytes.readFloatLE(offset + 4), bytes.readFloatLE(offset + 8)));
    }
    triangles.push(triangle);
  }
  return triangles;
}
function envelope(mesh, joint, x, upper) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...joint.axis), renderedJointAngle(joint));
  const origin = urdfRpyMatrix(...joint.origin.rpy);
  const xyz = new THREE.Vector3(...joint.origin.xyz);
  let result = upper ? -Infinity : Infinity;
  for (const triangle of mesh) {
    const vertices = triangle.map(v => v.clone().applyQuaternion(q).applyMatrix4(origin).add(xyz));
    for (let i = 0; i < 3; i++) {
      const a = vertices[i], b = vertices[(i + 1) % 3];
      if (Math.abs(b.x - a.x) < 1e-10) continue;
      const u = (x - a.x) / (b.x - a.x);
      if (u < 0 || u > 1) continue;
      const y = a.y + u * (b.y - a.y);
      result = upper ? Math.max(result, y) : Math.min(result, y);
    }
  }
  return result;
}

test('PiPER gripper closes on the fixed handle centerline and positive angles open it', async () => {
  const tree = buildJointTree(MODEL_CONFIGS.piper.joints);
  const meshes = await Promise.all([fingerMesh('link7_left'), fingerMesh('link7_right')]);
  const handleMesh = await fingerMesh('link6');
  const sidePlanes = new Map();
  for (const triangle of handleMesh) {
    const normal = triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0]));
    const area = normal.length() / 2;
    if (area < 1e-15 || Math.abs(normal.normalize().y) < 0.999999) continue;
    const y = Math.round(triangle[0].y * 1e6) / 1e6;
    sidePlanes.set(y, (sidePlanes.get(y) ?? 0) + area);
  }
  const largestSides = [...sidePlanes].sort((a, b) => b[1] - a[1]).slice(0, 2);
  assert.equal(largestSides.length, 2);
  const handleCenter = (largestSides[0][0] + largestSides[1][0]) / 2;
  const x = -0.04212062256809339 + 0.00369;
  const gaps = [];
  for (const degrees of [0, 5, 15, 30]) {
    const mapped = servoToModelAngles('PIPER', [0, 0, 0, 0, 0, 0, degrees]);
    applyModelJointAngles(tree, mapped);
    assert.equal(mapped.joint7_left, degrees * Math.PI / 180, 'UI logical zero must stay at zero');
    const left = envelope(meshes[0], tree.joints.get('joint7_left'), x, true);
    const right = envelope(meshes[1], tree.joints.get('joint7_right'), x, false);
    assert.ok(Number.isFinite(left) && Number.isFinite(right));
    if (degrees === 0) {
      assert.ok(Math.abs((left + right) / 2 - handleCenter) < 1e-6,
        `closed fingertip center must align with handle: ${(left + right) / 2}`);
    }
    gaps.push(right - left);
  }
  assert.ok(Math.abs(gaps[0]) < 1e-6, `zero gap: ${gaps[0]}m`);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1] + 0.001, `opening gaps: ${gaps}`);
});
