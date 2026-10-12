const freezeJoint = (
  name,
  type,
  parent,
  child,
  xyz,
  rpy,
  axis,
  lower,
  upper,
  displayAxisDirection = 1,
) => Object.freeze({
  name,
  type,
  parent,
  child,
  origin: Object.freeze({ xyz: Object.freeze(xyz), rpy: Object.freeze(rpy) }),
  axis: Object.freeze(axis),
  limit: Object.freeze({ lower, upper }),
  displayAxisDirection,
});

// B601 带夹爪版本：包含平移夹爪关节
export const B601_JOINTS = Object.freeze([
  freezeJoint('joint1', 'revolute', 'base_link', 'link1', [-0.00008416, 0, 0.08465], [0, 0, 0], [0, 0, 1], -2.8, 2.8),
  freezeJoint('joint2', 'revolute', 'link1', 'link2', [0.020084, 0.031625, 0.05555], [-1.5708, 0, 0], [0, 0, -1], -3.14, 0),
  freezeJoint('joint3', 'revolute', 'link2', 'link3', [-0.264, 0, 0], [0, 0, 0], [0, 0, 1], -3.14, 0),
  freezeJoint('joint4', 'revolute', 'link3', 'link4', [0.2426, -0.054, -0.001625], [0, 0, 0], [0, 0, 1], -1.87, 1.57),
  freezeJoint('joint5', 'revolute', 'link4', 'link5', [0.078308, -0.0375, -0.03], [-1.5708, 0, 0], [0, 0, 1], -1.57, 1.57),
  freezeJoint('joint6', 'revolute', 'link5', 'link6', [0.023692, 0, 0.04], [0, 1.5708, 0], [0, 0, 1], -3.14, 3.14, -1),
  freezeJoint('gripper_joint', 'fixed', 'link6', 'gripper_link', [0, 0, 0.15971], [0, -1.5708, 0], [0, 0, 0], 0, 0),
  freezeJoint('gripper_joint1', 'prismatic', 'gripper_link', 'gripper_left', [-0.042091, 0.000027531, -0.000013031], [0, 0, -1.5708], [1, 0, 0], 0, 0.0715),
  freezeJoint('gripper_joint2', 'prismatic', 'gripper_link', 'gripper_right', [-0.042091, -0.000027531, 0.000013031], [0, 0, 1.5708], [1, 0, 0], 0, 0.0715),
]);

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

/**
 * 将 Leader 关节角映射到 B601（含夹爪）
 * @param {number[]} angles - Leader 关节角（弧度），angles[6] 为 J7 夹爪
 * @returns {Object} B601 关节名称到值的映射
 */
export function mapLeaderAnglesToB601(angles) {
  if (!Array.isArray(angles) || angles.length < 6) {
    throw new RangeError('B601 映射需要至少 6 个关节角');
  }

  const armValues = angles.slice(0, 6).map((angle, index) => {
    if (!Number.isFinite(angle)) {
      throw new TypeError('B601 关节角必须是有限数值');
    }
    // B601 J1 和 J2 与 Star Arm Leader 方向相反
    return index === 0 || index === 1 ? -angle : angle;
  });

  // Star Arm J7 范围：0..π/2 弧度，B601 夹爪平移范围：0..71.5mm
  // 如果 Leader 未连接或 J7 无效，默认夹爪闭合（位移 0）
  const leaderGripper = (Number.isFinite(angles[6]) && angles[6] > 0) ? angles[6] : 0;
  const gripperTravel = clamp(leaderGripper / (Math.PI / 2), 0, 1) * 0.0715;

  return {
    ...Object.fromEntries(armValues.map((value, index) => [`joint${index + 1}`, value])),
    gripper_joint1: gripperTravel,
    gripper_joint2: gripperTravel,
  };
}
