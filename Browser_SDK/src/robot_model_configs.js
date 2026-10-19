import { ALL_JOINTS } from './urdf_model_data.js';
import { B601_JOINTS } from './b601_model_data.js';
import { A1Z_JOINTS } from './a1z_model_data.js';
import { PIPER_JOINTS } from './piper_model_data.js';
import { SUPPLIED_URDF_MODELS } from './supplied_urdf_models.js';

const linkNames = Object.freeze([
  'base_link', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'link7_left', 'link7_right',
]);

const makeParts = (folder) => Object.freeze(linkNames.map((link) => Object.freeze({
  link,
  url: `../assets/models/${folder}/${link}.STL`,
})));

const b601LinkNames = Object.freeze([
  'base_link', 'link1', 'link2', 'link3', 'link4', 'link5',
  'link6', 'gripper_link', 'gripper_left', 'gripper_right',
]);

const makeB601Parts = () => Object.freeze([
  // 手臂主体部分（base_link 到 link5）
  ...b601LinkNames.slice(0, 6).map((link) => Object.freeze({
    link,
    url: `../assets/models/b601/${link}.STL`,
  })),
  // 夹爪组件（link6 和夹爪使用扩展包的模型）
  ...b601LinkNames.slice(6).map((link) => Object.freeze({
    link,
    url: `../assets/models/b601-gripper/${link}.STL`,
  })),
]);

const a1zLinkNames = Object.freeze([
  'base_link', 'arm_link1', 'arm_link2', 'arm_link3', 'arm_link4', 'arm_link5', 'arm_link6',
  'gripper_finger_left_link', 'gripper_finger_right_link',
]);

const makeA1ZParts = () => Object.freeze(a1zLinkNames.map((link) => Object.freeze({
  link,
  url: `../assets/models/a1z/${link}.STL`,
})));

const piperLinkNames = Object.freeze([
  'base_link', 'link1', 'link2', 'link3', 'link4', 'link_5', 'link6', 'link7_left', 'link7_right',
]);

const makePiperParts = () => Object.freeze(piperLinkNames.map((link) => Object.freeze({
  link,
  url: `../assets/models/piper/${link}.STL`,
})));

const ldJoint = (name, parent, child, xyz, rpy, axis, lower, upper, type = 'revolute', displayAxisDirection) => Object.freeze({
  name, type, parent, child,
  origin: Object.freeze({ xyz: Object.freeze(xyz), rpy: Object.freeze(rpy) }),
  axis: Object.freeze(axis),
  limit: Object.freeze({ lower, upper }),
  displayAxisDirection,
});

export const LD_JOINTS = Object.freeze([
  ldJoint('joint1', 'base_link', 'link1', [0, 0, 0.03135], [0, 0, 0], [0, 0, -1], -2.27, 2.27),
  ldJoint('joint2', 'link1', 'link2', [0, 0, 0.061025], [-1.5708, 0, 3.1416], [0, 0, -1], 0, 3.14),
  ldJoint('joint3', 'link2', 'link3', [0.12162, -0.002, 0], [0, 0, -1.5708], [0, 0, -1], -1.57, 1.57),
  ldJoint('joint4', 'link3', 'link4', [0.024219, -0.10865, 0], [0, 0, -1.5708], [0, 0, -1], -1.57, 1.57, 'revolute', -1),
  ldJoint('joint5', 'link4', 'link5', [0.035, -0.00203, 0], [-1.5708, 0, 0], [0, 0, -1], -2.27, 2.27),
  ldJoint('joint6', 'link5', 'link6', [0.1186, 0, 0.005875], [-1.5708, 0, -1.5708], [0, 0, -1], -2.27, 2.27),
  ldJoint('joint7_left', 'link6', 'link7_left', [0.0032934, -0.0014419, -0.0031], [0, 0, 0], [0, 0, -1], -1.57, 1.57, 'revolute', 1),
  ldJoint('joint7_right', 'link6', 'link7_right', [-0.016371, -0.0022579, -0.002], [0, 0, 0], [0, 0, -1], -1.57, 1.57, 'revolute', 1),
]);

export const MODEL_CONFIGS = Object.freeze({
  ...SUPPLIED_URDF_MODELS,
  ld: Object.freeze({
    key: 'ld',
    name: 'Star Arm 102-LD',
    parts: makeParts('ld'),
    joints: LD_JOINTS,
    sourceUrdf: '../assets/urdf/ld/model.urdf',
  }),
  fl: Object.freeze({ key: 'fl', name: 'Star Arm 102-FL', parts: makeParts('fl'), joints: ALL_JOINTS }),
  b601: Object.freeze({
    key: 'b601',
    name: 'reBot Arm B601 with gripper',
    parts: makeB601Parts(),
    joints: B601_JOINTS,
    sourceUrdf: '../assets/urdf/b601/reBot_B601_DM_with_gripper.urdf',
  }),
  a1z: Object.freeze({
    key: 'a1z',
    name: '星海图 A1Z（带平移夹爪）',
    parts: makeA1ZParts(),
    joints: A1Z_JOINTS,
    sourceUrdf: '../assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf',
  }),
  piper: Object.freeze({
    key: 'piper',
    name: 'PiPER Mate (display-only)',
    parts: makePiperParts(),
    joints: PIPER_JOINTS,
    sourceUrdf: '../assets/urdf/piper/model.urdf',
    // STL 底座安装面为 y=-0.03581252、外法线 -Y；绕 X +90° 使安装面朝下，最低点平移至 z=0。
    // 关节不设固定 displayPose —— 该模型作为“姿态源”：连接真实手臂后按真实关节角跟随（映射在 joint_mapper 的 PIPER）。
    rootPose: Object.freeze({
      xyz: Object.freeze([0, 0, 0.03581252]),
      rpy: Object.freeze([Math.PI / 2, 0, 0]),
    }),
  }),
});

/** PiPER Mate 是一个纯展示（display-only）模型：只渲染本体，不参与任何虚拟/实机关节控制。 */
export const DISPLAY_ONLY_MODEL_KEYS = Object.freeze(['piper']);
export const PIPER_MODEL_KEY = 'piper';
export const LEADER_TYPE_PIPER = '102PIPER';

export function isDisplayOnlyModelKey(key) {
  return DISPLAY_ONLY_MODEL_KEYS.includes(key);
}

export function resolveDisplayModelKey({ role, leaderType }) {
  const normalizedLeaderType = String(leaderType ?? '').toUpperCase();
  if (role === 'leader' && normalizedLeaderType.includes('PIPER')) return 'piper';
  return role === 'follower' ? 'fl' : 'ld';
}
