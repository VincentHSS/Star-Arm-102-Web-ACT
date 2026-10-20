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

for (const [key, partCount, jointCount] of [['fl-v3', 9, 8], ['ld-touch', 22, 6]]) {
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

function stlComponents(bytes) {
  const triangleCount = bytes.readUInt32LE(80);
  const parents = Array.from({ length: triangleCount }, (_, index) => index);
  const vertexOwners = new Map();
  const root = index => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let vertex = 0; vertex < 3; vertex++) {
      // Old CAD seams share coordinates at micrometre precision.
      const point = [0, 1, 2].map(axis => Math.round(
        bytes.readFloatLE(84 + triangle * 50 + 12 + vertex * 12 + axis * 4) * 1e6));
      const key = point.join(',');
      if (vertexOwners.has(key)) parents[root(triangle)] = root(vertexOwners.get(key));
      else vertexOwners.set(key, triangle);
    }
  }
  const components = new Map();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const component = root(triangle);
    if (!components.has(component)) components.set(component, []);
    components.get(component).push(triangle);
  }
  return [...components.values()].sort((a, b) => b.length - a.length);
}

test('Touch R1 retains its upstream meshes and six joints with one fixed seventh-servo visual', () => {
  const source = readJson(touchAsset('SOURCE.json'));
  const original = readFileSync(touchAsset('source.urdf'), 'utf8');
  const display = readFileSync(touchAsset('model.urdf'), 'utf8');
  const config = SUPPLIED_URDF_MODELS['ld-touch'];
  assert.equal(source.commit, '7c6811913e0928b04a2ad69d6ab25b7f22217ee5');
  assert.equal(sha256(Buffer.from(original)),
    '4a00fe0f6c66861168be23ab6e021c5c289d8954387dd29b902b7251ffdd0499');
  const upstreamMeshes = Object.entries(source.sha256)
    .filter(([name]) => name.startsWith('meshes/') && name !== 'meshes/link_6-gripper-servo.stl')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  assert.equal(upstreamMeshes.length, 21);
  assert.equal(sha256(JSON.stringify(upstreamMeshes)),
    '88a6f421c33b9757abfe09d6c4232bbd4d8cde5ab76d78eb77e376d1f648a0b5');
  for (const [name, expectedHash] of upstreamMeshes) {
    assert.equal(sha256(readFileSync(touchAsset(name))), expectedHash, name);
    assert.equal(config.parts.filter(part => new URL(part.url, new URL('../Browser_SDK/src/', import.meta.url))
      .pathname.endsWith('/ld-touch/' + name)).length, 1, name + ' must be displayed once');
  }
  const jointBlocks = urdf => [...urdf.matchAll(/<joint\b[\s\S]*?<\/joint>/g)]
    .map(match => match[0].replace(/\s+/g, ' ').trim());
  assert.equal(jointBlocks(original).length, 6);
  assert.deepEqual(jointBlocks(display), jointBlocks(original));
  assert.equal([...original.matchAll(/<visual\b/g)].length, 21);
  assert.equal([...display.matchAll(/<visual\b/g)].length, 22);
  assert.deepEqual(config.joints.map(joint => joint.name),
    ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6']);
  const attribute = (block, tag, name) => block.match(
    new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`))?.[1];
  const vector = text => text.trim().split(/\s+/).map(Number);
  for (const block of jointBlocks(original)) {
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
  }
  const servoVisuals = config.parts.filter(part => /-servo\.stl(?:\?|$)/.test(part.url));
  assert.equal(servoVisuals.length, 7);
  const added = config.parts.filter(part => /\/link_6-gripper-servo\.stl(?:\?|$)/.test(part.url));
  assert.equal(added.length, 1);
  assert.equal(added[0].link, 'link_6');
  assert.deepEqual(added[0].origin, { xyz: [0, 0, 0], rpy: [0, 0, 0] });
  assert.deepEqual(added[0].scale, [1, 1, 1]);
  const link6 = display.match(/<link name="link_6">([\s\S]*?)<\/link>/)?.[1];
  assert.ok(link6?.includes('meshes/link_6-gripper-servo.stl'));
  const tree = buildJointTree(config.joints);
  assert.equal(tree.links.get(added[0].link).parentJoint, 'joint_6');
  assert.deepEqual(tree.links.get(added[0].link).children, []);
  assert.equal(tree.joints.size, 6, 'fixed casing geometry must not create a seventh motion axis');
  assert.equal(source.validation.meshes, 22);
  assert.equal(source.validation.upstreamMeshes, 21);
  assert.equal(source.validation.upstreamTriangles, 182708);
  assert.equal(source.validation.triangles, 182708 + 9820);
  assert.equal(source.supplement.kind, 'fixed-gripper-servo-visual');
  assert.equal(source.supplement.link, 'link_6');
  assert.equal(source.supplement.report, 'gripper-servo.json');
  assert.equal(source.supplement.hardwareMappingChanged, false);
});

test('Touch R1 gripper visual contains only the transformed old LD motor, without its grip structure', () => {
  const report = readJson(touchAsset('gripper-servo.json'));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.source.path, 'Browser_SDK/assets/models/ld/link6.STL');
  const oldMesh = readFileSync(new URL('../Browser_SDK/assets/models/ld/link6.STL', import.meta.url));
  const servoMesh = readFileSync(touchAsset('meshes/link_6-gripper-servo.stl'));
  assert.equal(report.source.sha256, sha256(oldMesh));
  assert.equal(report.target.sha256, sha256(servoMesh));
  assert.equal(report.source.triangles, 15022);
  assert.equal(oldMesh.readUInt32LE(80), report.source.triangles);
  assert.equal(report.target.link, 'link_6');
  assert.equal(report.target.mesh, 'meshes/link_6-gripper-servo.stl');
  assert.equal(report.target.triangles, 9820);
  assert.equal(servoMesh.readUInt32LE(80), report.target.triangles);
  assert.equal(servoMesh.length, 84 + 50 * report.target.triangles);
  const components = stlComponents(oldMesh);
  assert.deepEqual(components.map(component => component.length),
    [5202, 4792, 1968, 1370, 1182, 60, 60, 60, 60, 60, 60, 60, 44, 44]);
  assert.equal(report.source.components, components.length);
  assert.equal(report.extraction.excludedStructureTriangles, 5202);
  assert.equal(report.extraction.servoComponents, 13);
  assert.equal(report.extraction.servoTriangles, 9820);
  const excludedGrip = new Set(components[0]);
  const selected = Array.from({ length: report.source.triangles }, (_, index) => index)
    .filter(index => !excludedGrip.has(index));
  assert.equal(selected.length, report.target.triangles);
  const rotation = report.registration.rotationOldLdToTouch;
  const translation = report.registration.translationMeters;
  assert.equal(rotation.length, 3);
  assert.ok(rotation.every(row => row.length === 3 && row.every(Number.isFinite)));
  assert.equal(translation.length, 3);
  assert.ok(translation.every(Number.isFinite));
  let maximumVertexError = 0;
  for (const [targetTriangle, sourceTriangle] of selected.entries()) {
    for (let vertex = 0; vertex < 3; vertex++) {
      const sourcePoint = [0, 1, 2].map(axis =>
        oldMesh.readFloatLE(84 + sourceTriangle * 50 + 12 + vertex * 12 + axis * 4));
      for (let axis = 0; axis < 3; axis++) {
        const expected = rotation[axis].reduce((sum, value, column) =>
          sum + value * sourcePoint[column], translation[axis]);
        const actual = servoMesh.readFloatLE(84 + targetTriangle * 50 + 12 + vertex * 12 + axis * 4);
        maximumVertexError = Math.max(maximumVertexError, Math.abs(actual - expected));
      }
    }
  }
  assert.ok(maximumVertexError < 2e-8,
    `STL must contain the 13 source motor components alone, transformed in metres (${maximumVertexError})`);
  assert.ok(report.registration.maxHoleAxisResidualMm < 0.001);
  assert.equal(report.validation.physicalHardwareVerified, false);
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
