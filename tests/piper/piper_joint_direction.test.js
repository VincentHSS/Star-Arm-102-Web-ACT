import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CONFIGS } from '../../Browser_SDK/src/robot_model_configs.js';
import { buildJointTree, applyModelJointAngles, renderedJointAngle } from '../../Browser_SDK/src/robot_model.js';
import { servoToModelAngles } from '../../Browser_SDK/src/joint_mapper.js';

// Compare against the previous renderer's defaults, including its two finger reversals.
const oldDirection = name => (name.startsWith('joint7_') || name === 'joint_right') ? -1 : 1;
test('PiPER uses the latest reported arm directions while retaining usable joint ranges', () => {
  const tree = buildJointTree(MODEL_CONFIGS.piper.joints);
  const inputs = [20, 40, 60, 20, 20, 20, 2];
  const mapped = servoToModelAngles('PIPER', inputs);
  applyModelJointAngles(tree, mapped);
  for (const [name, joint] of tree.joints) {
    if (name.startsWith('joint7_')) continue;
    const expectedAngle = mapped[name === 'joint7_right' ? 'joint_right' : name];
    assert.ok(Math.abs(joint.angle - expectedAngle) < 1e-10, `${name} must not be clipped by the direction correction`);
    const oldRenderedAngle = joint.angle * oldDirection(name);
    const newRenderedAngle = joint.angle * joint.displayAxisDirection;
    assert.notEqual(oldRenderedAngle, 0, `${name} must move in this test`);
    assert.equal(newRenderedAngle, ['joint2', 'joint4'].includes(name) ? oldRenderedAngle : -oldRenderedAngle, `${name} direction`);
  }
});

test('PiPER direction overrides do not affect LD or FL', () => {
  for (const key of ['ld', 'fl']) {
    const tree = buildJointTree(MODEL_CONFIGS[key].joints);
    for (const [name, joint] of tree.joints) {
      const source = MODEL_CONFIGS[key].joints.find(j => j.name === name);
      assert.equal(joint.displayAxisDirection, source.displayAxisDirection ?? oldDirection(name));
    }
  }
});


test('PiPER both fingers open and close throughout normal positive gripper travel', () => {
  const tree = buildJointTree(MODEL_CONFIGS.piper.joints);
  for (const degrees of [0, 30, 60, 90, 60, 30, 0]) {
    applyModelJointAngles(tree, servoToModelAngles('PIPER', [0, 0, 0, 0, 0, 0, degrees]));
    for (const name of ['joint7_left', 'joint7_right']) {
      const joint = tree.joints.get(name);
      assert.ok(Math.abs(joint.angle - degrees * Math.PI / 180) < 1e-10,
        `${name} must follow ${degrees} degrees without clipping`);
    }
  }
});

test('PiPER mirrored finger origins produce opposite physical opening motion after independent zero calibration', async () => {
  const THREE = await import('../../Browser_SDK/assets/vendor/three.module.js');
  const { urdfRpyMatrix } = await import('../../Browser_SDK/src/robot_model.js');
  const tree = buildJointTree(MODEL_CONFIGS.piper.joints);
  applyModelJointAngles(tree, servoToModelAngles('PIPER', [0, 0, 0, 0, 0, 0, 60]));
  const vectors = ['joint7_left', 'joint7_right'].map(name => {
    const j = tree.joints.get(name);
    return new THREE.Vector3(...j.axis).transformDirection(urdfRpyMatrix(...j.origin.rpy))
      .multiplyScalar(renderedJointAngle(j) - j.displayAngleOffset);
  });
  assert.ok(vectors[0].length() > 0.8);
  assert.ok(vectors[0].clone().add(vectors[1]).length() < 1e-6);
});
