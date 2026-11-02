import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/three.module.js';
import { MODEL_CONFIGS } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model_configs.js';
import { buildJointTree, applyModelJointAngles, renderedJointAngle } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model.js';
import { servoToModelAngles, validateJointTargets } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/joint_mapper.js';
import { canCommand } from '../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_profiles.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('LD J1-J6 readback continues beyond both URDF endpoints and returns normally', () => {
  const tree = buildJointTree(MODEL_CONFIGS.ld.joints);
  for (let index = 0; index < 6; index++) {
    const joint = tree.joints.get(`joint${index + 1}`);
    for (const endpoint of [joint.limit.lower, joint.limit.upper]) {
      const direction = endpoint === joint.limit.lower ? -1 : 1;
      let previous;
      for (const offset of [0, 0.1, 0.3, 0.1, 0]) {
        const angle = endpoint + direction * offset;
        const input = [0, 90, 0, 0, 0, 0, 0];
        input[index] = angle * 180 / Math.PI * (index === 3 ? -1 : 1);
        applyModelJointAngles(tree, servoToModelAngles('LD', input));
        close(joint.angle, angle);
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...joint.axis), renderedJointAngle(joint));
        if (previous) assert.ok(rotation.angleTo(previous) > 0.09, `${joint.name} rotation stalled`);
        previous = rotation;
      }
    }
  }
});

test('J4 direction and gripper linkage retain their existing mapping', () => {
  const tree = buildJointTree(MODEL_CONFIGS.ld.joints);
  const input = [10, 80, 120, 130, -150, 160, 45];
  const mapped = servoToModelAngles('LD', input);
  applyModelJointAngles(tree, mapped);
  close(mapped.joint4, -130 * Math.PI / 180);
  close(renderedJointAngle(tree.joints.get('joint4')), 130 * Math.PI / 180);
  close(tree.joints.get('joint7_left').angle, Math.PI / 4);
  close(tree.joints.get('joint7_right').angle, -Math.PI / 4);
});

test('FL command validation and rendering limits remain enforced; LD remains read only', () => {
  const tree = buildJointTree(MODEL_CONFIGS.fl.joints);
  for (const config of MODEL_CONFIGS.fl.joints) {
    applyModelJointAngles(tree, { [config.name]: config.limit.upper + 0.5 });
    close(tree.joints.get(config.name).angle, config.limit.upper);
    applyModelJointAngles(tree, { [config.name]: config.limit.lower - 0.5 });
    close(tree.joints.get(config.name).angle, config.limit.lower);
  }
  const targets = Object.fromEntries(MODEL_CONFIGS.fl.joints.map(joint => [joint.name, joint.limit.lower]));
  assert.equal(validateJointTargets(targets).valid, true);
  targets.joint3 = 120 * Math.PI / 180;
  assert.equal(validateJointTargets(targets).valid, false);
  assert.equal(canCommand('LD'), false);
});

test('non-finite feedback is still rejected', () => {
  const tree = buildJointTree(MODEL_CONFIGS.ld.joints);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => applyModelJointAngles(tree, { joint3: value }), TypeError);
  }
});

test('console and preview override cached model config imports with the fixed URL', async () => {
  const root = new URL('../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/', import.meta.url);
  for (const entry of ['index.html', 'urdf-preview.html']) {
    const html = await readFile(new URL(entry, root), 'utf8');
    const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]);
    const key = './src/robot_model_configs.js?v=server-1.0.35';
    assert.equal(map.imports[key], './src/robot_model_configs.js?v=server-1.0.35-ld1');
    const resolvedKey = new URL(key, new URL(entry, root));
    // Relative specifiers from every existing importing module normalize to this key.
    for (const importer of ['app.js', 'robot_model.js', 'servo_setup_model.js', 'joint_slider_control.js']) {
      const text = await readFile(new URL(`src/${importer}`, root), 'utf8');
      const specifier = text.match(/from '(\.\/robot_model_configs\.js[^']*)'/)[1];
      assert.equal(new URL(specifier, new URL(`src/${importer}`, root)).href, resolvedKey.href);
    }
  }
});
