import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPLIED_URDF_MODELS } from '../Browser_SDK/src/supplied_urdf_models.js';
import { buildJointTree, applyModelJointAngles } from '../Browser_SDK/src/robot_model.js';
import { MODEL_CONFIGS } from '../Browser_SDK/src/robot_model_configs.js';

for (const [key, partCount, jointCount] of [['fl-v3', 9, 8], ['ld-touch', 21, 6]]) {
  test(`${key}: complete connected tree and nonempty binary STL assets`, () => {
    const config = SUPPLIED_URDF_MODELS[key];
    assert.equal(config.parts.length, partCount);
    assert.equal(config.joints.length, jointCount);
    const tree = buildJointTree(config.joints);
    assert.equal(tree.rootLink, 'base_link');
    assert.equal(tree.links.size, jointCount + 1);
    for (const part of config.parts) {
      assert.ok(tree.links.has(part.link));
      const bytes = readFileSync(new URL(`../Browser_SDK/src/${part.url}`, import.meta.url));
      const count = bytes.readUInt32LE(80);
      assert.ok(count > 0);
      assert.equal(bytes.length, 84 + 50 * count);
      assert.deepEqual(part.origin, { xyz: [0, 0, 0], rpy: [0, 0, 0] });
    }
    const seen = new Set();
    function walk(link) { assert.ok(!seen.has(link)); seen.add(link); tree.links.get(link).children.forEach(walk); }
    walk(tree.rootLink);
    assert.equal(seen.size, tree.links.size);
  });
}
test('FL parallel fingers translate in metres and obey the supplied bounds', () => {
  const tree = buildJointTree(SUPPLIED_URDF_MODELS['fl-v3'].joints);
  applyModelJointAngles(tree, { gripper_joint1: -0.03, gripper_joint2: 0.03 });
  assert.equal(tree.joints.get('gripper_joint1').translation, -0.03);
  assert.equal(tree.joints.get('gripper_joint2').translation, 0.03);
  applyModelJointAngles(tree, { gripper_joint1: -1, gripper_joint2: 1 });
  assert.equal(tree.joints.get('gripper_joint1').translation, -0.0425);
  assert.equal(tree.joints.get('gripper_joint2').translation, 0.0425);
});
test('LD continuous joints preserve CAD axes without changing hardware model configs', () => {
  const config = SUPPLIED_URDF_MODELS['ld-touch'];
  assert.ok(config.joints.every(j => j.type === 'continuous' && j.displayAxisDirection === 1));
  const tree = buildJointTree(config.joints);
  applyModelJointAngles(tree, { joint_1: 4 });
  assert.equal(tree.joints.get('joint_1').angle, 4);
  assert.equal(MODEL_CONFIGS.fl.parts[0].url, '../assets/models/fl/base_link.STL');
  assert.equal(MODEL_CONFIGS.ld.parts[0].url, '../assets/models/ld/base_link.STL');
  const page = readFileSync(new URL('../Browser_SDK/src/urdf-preview.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /navigator\.serial|requestPort|writeServo|sendCommand/);
});
