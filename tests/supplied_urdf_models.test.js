import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPLIED_URDF_MODELS } from '../Browser_SDK/src/supplied_urdf_models.js';
import { buildJointTree, applyModelJointAngles } from '../Browser_SDK/src/robot_model.js';
import { MODEL_CONFIGS, resolveDisplayModelKey } from '../Browser_SDK/src/robot_model_configs.js';
import { getRobotProfile } from '../Browser_SDK/src/robot_profiles.js';
import { connectLeaderForProfile, writeLeaderControlFrame, getConnectedLeaderType } from '../Browser_SDK/src/runtime_integration.js';
import { mapSuppliedVirtualAngles } from '../Browser_SDK/src/supplied_urdf_mapping.js';
import {
  createFollowerTargetState, createTeleopOutputOptions,
  FOLLOWER_TARGET_PHYSICAL, FOLLOWER_TARGET_VIRTUAL, VIRTUAL_MODEL_CONFIG_KEYS,
} from '../Browser_SDK/src/follower_target.js';

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

for (const key of ['fl-v3']) {
  test(`${key}: virtual selection connects without a serial writer and locks model changes`, () => {
    const target = createFollowerTargetState(FOLLOWER_TARGET_VIRTUAL);
    target.setVirtualModel(key);
    assert.equal(MODEL_CONFIGS[VIRTUAL_MODEL_CONFIG_KEYS[key]], SUPPLIED_URDF_MODELS[key]);
    assert.equal(target.connected(), false);
    target.connectVirtual();
    assert.equal(target.connected(), true);
    assert.throws(() => target.setVirtualModel('star-arm-102-fl'), /请先断开/);
    assert.throws(() => target.setType(FOLLOWER_TARGET_PHYSICAL), /请先断开/);
    let writes = 0;
    const output = createTeleopOutputOptions({ type: target.type, writeFollowerAngles: () => writes++ });
    assert.deepEqual(output, { readOnly: true });
    assert.equal(writes, 0);
    target.disconnectVirtual();
    assert.equal(target.connected(), false);
    target.setVirtualModel('star-arm-102-fl');
    target.setType(FOLLOWER_TARGET_PHYSICAL);
    assert.equal(target.connected({ physicalConnected: true }), true);
    assert.throws(() => target.connectVirtual(), /不是虚拟/);
    assert.throws(() => target.setVirtualModel('unsupported'), /未知虚拟型号/);
  });
}

test('Touch R1 is a six-axis read-only Leader and cannot be selected as a virtual Follower', async () => {
  const profile = getRobotProfile('TOUCH');
  assert.equal(profile.code, 'TOUCH');
  assert.equal(profile.name, 'Touch R1');
  assert.equal(profile.role, 'leader');
  assert.equal(profile.canCommand, false);
  assert.equal(profile.powered, false);
  assert.deepEqual(profile.servoIds, [0, 1, 2, 3, 4, 5]);
  assert.equal(getConnectedLeaderType(profile, '102LD'), '102TOUCH');
  assert.equal(resolveDisplayModelKey({ role: 'leader', leaderType: '102TOUCH' }), 'ld-touch');
  assert.equal(resolveDisplayModelKey({ role: 'follower', leaderType: '102TOUCH' }), 'fl');
  assert.equal(MODEL_CONFIGS['ld-touch'].name, 'Touch R1');
  assert.equal(MODEL_CONFIGS['fl-v3'].name, 'LumosTouch V3');
  assert.equal(Object.hasOwn(VIRTUAL_MODEL_CONFIG_KEYS, 'ld-touch'), false);
  assert.throws(() => createFollowerTargetState(FOLLOWER_TARGET_VIRTUAL).setVirtualModel('ld-touch'), /未知虚拟型号/);
  const calls = [];
  const bus = { connect: async () => calls.push('connect'), write: async () => calls.push('write') };
  const connected = await connectLeaderForProfile({ bus, model: 'TOUCH', initializeBus: async () => calls.push('initialize') });
  assert.equal(connected, profile);
  assert.equal(await writeLeaderControlFrame({ bus, profile, frame: new Uint8Array([1]) }), false);
  assert.deepEqual(calls, ['connect']);
});

test('supplied FL maps six display axes with URDF limits and J7 to opposing 42.5 mm fingers', () => {
  const input = [100, -100, 100, -100, 100, -100, Math.PI / 4];
  const { modelAngles, displayAngles } = mapSuppliedVirtualAngles('fl-v3', input);
  const bounds = SUPPLIED_URDF_MODELS['fl-v3'].joints.slice(0, 6).map((joint, index) =>
    index % 2 === 0 ? joint.limit.upper : joint.limit.lower);
  assert.deepEqual(displayAngles.slice(0, 6), bounds);
  assert.deepEqual(Object.values(modelAngles).slice(0, 6), bounds);
  assert.equal(displayAngles[6], Math.PI / 4);
  assert.equal(modelAngles.gripper_joint1, -0.02125);
  assert.equal(modelAngles.gripper_joint2, 0.02125);
  for (const [angle, travel, shown] of [[-1, 0, 0], [0, 0, 0], [Math.PI / 2, 0.0425, Math.PI / 2], [5, 0.0425, Math.PI / 2]]) {
    const pose = mapSuppliedVirtualAngles('fl-v3', [0, 0, 0, 0, 0, 0, angle]);
    assert.equal(pose.modelAngles.gripper_joint1, -travel);
    assert.equal(pose.modelAngles.gripper_joint2, travel);
    assert.equal(pose.displayAngles[6], shown);
    const tree = applyModelJointAngles(buildJointTree(SUPPLIED_URDF_MODELS['fl-v3'].joints), pose.modelAngles);
    assert.equal(Math.abs(tree.joints.get('gripper_joint1').translation), travel);
    assert.equal(tree.joints.get('gripper_joint2').translation, travel);
  }
});

test('supplied LD maps joint_1 through joint_6 continuously and has no J7 model channel', () => {
  const input = [4, -4, 0.3, -0.4, 0.5, -0.6, Math.PI / 2];
  const { modelAngles, displayAngles } = mapSuppliedVirtualAngles('ld-touch', input);
  assert.deepEqual(modelAngles, { joint_1: 4, joint_2: -4, joint_3: 0.3, joint_4: -0.4, joint_5: 0.5, joint_6: -0.6 });
  assert.deepEqual(displayAngles, [...input.slice(0, 6), 0]);
  assert.deepEqual(mapSuppliedVirtualAngles('ld-touch', [...input.slice(0, 6), 0]).modelAngles, modelAngles);
  const tree = applyModelJointAngles(buildJointTree(SUPPLIED_URDF_MODELS['ld-touch'].joints), modelAngles);
  assert.equal(tree.joints.get('joint_1').angle, 4);
  assert.equal(tree.joints.get('joint_2').angle, -4);
  assert.throws(() => mapSuppliedVirtualAngles('unknown', input), /未知虚拟模型/);
  assert.throws(() => mapSuppliedVirtualAngles('ld-touch', input.slice(0, 6)), /七个有限/);
  assert.throws(() => mapSuppliedVirtualAngles('fl-v3', [...input.slice(0, 6), NaN]), /七个有限/);
});
