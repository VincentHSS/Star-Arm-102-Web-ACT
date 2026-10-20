import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

for (const [key, partCount, jointCount] of [['fl-v3', 9, 8], ['ld-touch', 25, 8]]) {
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
const touchAsset = name => new URL(`../Browser_SDK/assets/urdf/ld-touch/${name}`, import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = url => JSON.parse(readFileSync(url, 'utf8'));

test('Touch R1 V3.2 preserves the complete upstream geometry, seven servos and native finger tree', () => {
  const source = readJson(touchAsset('SOURCE.json'));
  const original = readFileSync(touchAsset('source.urdf'), 'utf8');
  const display = readFileSync(touchAsset('model.urdf'), 'utf8');
  const config = SUPPLIED_URDF_MODELS['ld-touch'];
  assert.equal(source.commit, 'e264ed0dc7bd209fdf63c11bc2f6061e2598fc05');
  assert.equal(sha256(Buffer.from(original)), 'a90ce584e474b6d4ab540ff13127f7fa5bb81a2937e8b5bdbb06adbe211e9663');
  assert.equal(display, original.replaceAll('filename="../meshes/', 'filename="meshes/'));
  for (const [name, expectedHash] of Object.entries(source.sha256)) {
    assert.equal(sha256(readFileSync(touchAsset(name))), expectedHash, name);
  }
  const meshes = Object.keys(source.sha256).filter(name => name.startsWith('meshes/'));
  assert.equal(meshes.length, 25);
  assert.equal(config.parts.filter(part => /-servo\.stl(?:\?|$)/.test(part.url)).length, 7);
  assert.equal(config.parts.filter(part => part.url.includes('gripper-servo')).length, 0);
  assert.equal(config.parts.find(part => part.url.includes('link_6-servo.stl')).link, 'link_6');
  assert.equal(config.parts.find(part => part.url.includes('right_finger-horn.stl')).link, 'right_finger');
  assert.equal(config.parts.find(part => part.url.includes('left_finger-finger.stl')).link, 'left_finger');
  for (const name of meshes) {
    assert.equal(config.parts.filter(part => new URL(part.url, new URL('../Browser_SDK/src/', import.meta.url))
      .pathname.endsWith('/ld-touch/' + name)).length, 1, name + ' must be displayed once');
  }
  const jointBlocks = [...original.matchAll(/<joint\b[\s\S]*?<\/joint>/g)].map(match => match[0]);
  const attribute = (block, tag, name) => block.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`))?.[1];
  const vector = value => value.trim().split(/\s+/).map(Number);
  assert.equal(jointBlocks.length, 8);
  for (const block of jointBlocks) {
    const joint = config.joints.find(candidate => candidate.name === attribute(block, 'joint', 'name'));
    assert.ok(joint);
    assert.equal(joint.type, attribute(block, 'joint', 'type'));
    assert.equal(joint.parent, attribute(block, 'parent', 'link'));
    assert.equal(joint.child, attribute(block, 'child', 'link'));
    assert.deepEqual(joint.origin.xyz, vector(attribute(block, 'origin', 'xyz')));
    assert.deepEqual(joint.origin.rpy, vector(attribute(block, 'origin', 'rpy')));
    assert.deepEqual(joint.axis, vector(attribute(block, 'axis', 'xyz')));
    assert.equal(joint.clampToLimits, false);
    assert.equal(joint.displayAxisDirection, 1);
    if (joint.mimic) {
      assert.deepEqual(joint.mimic, { joint: attribute(block, 'mimic', 'joint'),
        multiplier: Number(attribute(block, 'mimic', 'multiplier')), offset: Number(attribute(block, 'mimic', 'offset')) });
    }
  }
  assert.equal(source.validation.independentJoints, 7);
  assert.equal(source.validation.mimicJoints, 1);
  assert.equal(source.validation.triangles, 214230);
  assert.equal(source.validation.hardwareMappingChanged, false);
  assert.equal(source.validation.physicalHardwareVerified, false);
});

test('Touch R1 J7 moves both CAD finger branches while the motor casing stays attached to the handle', () => {
  const config = SUPPLIED_URDF_MODELS['ld-touch'];
  const tree = buildJointTree(config.joints);
  assert.deepEqual(tree.links.get('link_6').children, ['right_finger', 'left_finger']);
  assert.equal(tree.links.get('right_finger').parentJoint, 'joint_7');
  assert.equal(tree.links.get('left_finger').parentJoint, 'left_finger_joint');
  const originalOrigins = config.joints.map(joint => structuredClone(joint.origin));
  for (const angle of [0, 25 * Math.PI / 180, -0.2, 4]) {
    applyModelJointAngles(tree, { joint_6: 0.35, joint_7: angle, left_finger_joint: 99 });
    assert.equal(tree.joints.get('joint_7').angle, angle);
    assert.equal(tree.joints.get('left_finger_joint').angle, -angle || 0);
    assert.equal(tree.joints.get('joint_6').angle, 0.35);
    assert.deepEqual([...tree.joints.values()].map(joint => joint.origin), originalOrigins);
  }
  applyModelJointAngles(tree, { joint_1: 0.5 });
  assert.equal(tree.joints.get('left_finger_joint').angle, -4, 'unrelated axis updates preserve the grip pose');
});

test('URDF mimic resolves chains and offsets and rejects incomplete or cyclic model descriptions', () => {
  const base = SUPPLIED_URDF_MODELS['ld-touch'].joints;
  const chained = structuredClone(base);
  chained[6].mimic = { joint: 'joint_1', multiplier: 2, offset: 0.1 };
  const tree = buildJointTree(chained);
  applyModelJointAngles(tree, { joint_1: 0.2 });
  assert.equal(tree.joints.get('joint_7').angle, 0.5);
  assert.equal(tree.joints.get('left_finger_joint').angle, -0.5);
  for (const mimic of [{ joint: 'missing' }, { joint: 'joint_1', multiplier: NaN }, { joint: 'left_finger_joint' }]) {
    const invalid = structuredClone(base);
    invalid[6].mimic = mimic;
    assert.throws(() => buildJointTree(invalid), /从动关节/);
  }
});

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

test('Touch R1 reads six axes and the gripper without commanding the Leader', async () => {
  const profile = getRobotProfile('TOUCH');
  assert.equal(profile.code, 'TOUCH');
  assert.equal(profile.name, 'Touch R1');
  assert.equal(profile.role, 'leader');
  assert.equal(profile.canCommand, false);
  assert.equal(profile.powered, false);
  assert.deepEqual(profile.servoIds, [0, 1, 2, 3, 4, 5, 6]);
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

test('supplied LD displays all seven raw model angles and derives the left finger from URDF mimic', () => {
  const input = [4, -4, 0.3, -0.4, 0.5, -0.6, Math.PI / 2];
  const { modelAngles, displayAngles } = mapSuppliedVirtualAngles('ld-touch', input);
  assert.deepEqual(modelAngles, { joint_1: 4, joint_2: -4, joint_3: 0.3, joint_4: -0.4, joint_5: 0.5, joint_6: -0.6, joint_7: Math.PI / 2 });
  assert.deepEqual(displayAngles, input);
  const tree = applyModelJointAngles(buildJointTree(SUPPLIED_URDF_MODELS['ld-touch'].joints), modelAngles);
  assert.equal(tree.joints.get('joint_1').angle, 4);
  assert.equal(tree.joints.get('joint_2').angle, -4);
  assert.equal(tree.joints.get('joint_7').angle, Math.PI / 2);
  assert.equal(tree.joints.get('left_finger_joint').angle, -Math.PI / 2);
  assert.throws(() => mapSuppliedVirtualAngles('unknown', input), /未知虚拟模型/);
  assert.throws(() => mapSuppliedVirtualAngles('ld-touch', input.slice(0, 6)), /七个有限/);
  assert.throws(() => mapSuppliedVirtualAngles('fl-v3', [...input.slice(0, 6), NaN]), /七个有限/);
});
