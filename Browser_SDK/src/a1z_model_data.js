const freezeJoint = (name, type, parent, child, xyz, rpy, axis, lower, upper, displayAxisDirection = 1) => Object.freeze({
  name,
  type,
  parent,
  child,
  origin: Object.freeze({ xyz: Object.freeze(xyz), rpy: Object.freeze(rpy) }),
  axis: Object.freeze(axis),
  limit: Object.freeze({ lower, upper }),
  displayAxisDirection,
});

// 星海图 A1Z 关节配置（6 自由度 + 平移夹爪）
// 基于 A1Z_G1Z_with_gripper.urdf，夹爪为 prismatic 类型，沿 Y 轴平移
export const A1Z_JOINTS = Object.freeze([
  // J1: 基座旋转，轴 [0,0,1]，限位 [-2.094, 2.094]
  freezeJoint('arm_joint1', 'revolute', 'base_link', 'arm_link1', [0, 0, 0.075], [0, 0, 0], [0, 0, 1], -2.094, 2.094),
  
  // J2: 肩部关节，轴 [0,1,0]，限位 [0, 3.142]
  freezeJoint('arm_joint2', 'revolute', 'arm_link1', 'arm_link2', [0.02, 0, 0.043], [0, 0, 0], [0, 1, 0], 0, 3.142),
  
  // J3: 肘部关节，轴 [0,1,0]，限位 [-3.142, 0]
  freezeJoint('arm_joint3', 'revolute', 'arm_link2', 'arm_link3', [-0.264, 0, 0], [0, 0, 0], [0, 1, 0], -3.142, 0),
  
  // J4: 手腕 1，轴 [0,1,0]，限位 [-1.309, 1.309]
  freezeJoint('arm_joint4', 'revolute', 'arm_link3', 'arm_link4', [0.245, 0, 0.06], [0, 0, 0], [0, 1, 0], -1.309, 1.309),
  
  // J5: 手腕 2，轴 [0,0,1]，限位 [-1.484, 1.484]
  freezeJoint('arm_joint5', 'revolute', 'arm_link4', 'arm_link5', [0.074, 0, 0.042], [0, 0, 0], [0, 0, 1], -1.484, 1.484),
  
  // J6: 手腕 3（末端法兰），轴 [1,0,0]，限位 [-2.007, 2.007]
  freezeJoint('arm_joint6', 'revolute', 'arm_link5', 'arm_link6', [0.0235, 0, -0.042], [0, 0, 0], [1, 0, 0], -2.007, 2.007),
  
  // 夹爪关节（A1Z 新 URDF 为 prismatic 类型，沿 Y 轴平移）
  // 左夹爪：沿 +Y 方向移动，范围 0 到 0.048m
  freezeJoint('gripper_finger_left_joint', 'prismatic', 'arm_link6', 'gripper_finger_left_link', [0.0727, -0.025, 0.018], [0, 0, 0], [0, 1, 0], 0, 0.048),
  // 右夹爪：沿 +Y 方向移动，范围 -0.048 到 0（负限位实现反向运动）
  freezeJoint('gripper_finger_right_joint', 'prismatic', 'arm_link6', 'gripper_finger_right_link', [0.0727, 0.025, -0.018], [0, 0, 0], [0, 1, 0], -0.048, 0),
]);

/**
 * 将 Leader 关节角映射到 A1Z
 * @param {number[]} angles - Leader 关节角（弧度）
 * @returns {Object} A1Z 关节名称到角度/位移的映射
 */
export function mapLeaderAnglesToA1Z(angles) {
  if (!Array.isArray(angles) || angles.length < 6) {
    throw new RangeError('A1Z 映射需要至少 6 个关节角');
  }
  
  const values = angles.slice(0, 6).map((angle, index) => {
    if (!Number.isFinite(angle)) {
      throw new TypeError('A1Z 关节角必须是有限数值');
    }
    
    // A1Z 映射逻辑（根据实机测试调整方向）：
    // J1: Leader 轴 [0,0,-1]，A1Z 轴 [0,0,1]，方向相反，须取负 ✓
    // J2: 方向相同，无需调整
    // J3: 方向相同，无需调整
    // J4: 方向相同，无需调整
    // J5: Leader 轴 [0,0,-1]，A1Z 轴 [0,0,1]，方向相反，须取负 ✓
    // J6: Leader 轴 [0,0,-1]，A1Z 轴 [1,0,0]，方向相反，须取负 ✓
    
    if (index === 0 || index === 4 || index === 5) {
      // J1, J5, J6 取负
      return -angle;
    }
    return angle;
  });
  
  // 处理 J7 夹爪（Leader J7 弧度，angles[6]）
  // Leader J7 范围：0..π/2 弧度（0..90°）
  // A1Z 夹爪平移范围：0..0.048m（48mm）
  // 映射：0 弧度 → 0m（闭合），π/2 弧度 → 0.048m（最大张开）
  const leaderGripper = Number.isFinite(angles[6]) ? angles[6] : 0;
  const gripperTravel = Math.max(0, Math.min(Math.PI / 2, leaderGripper)) / (Math.PI / 2) * 0.048;
  
  // 返回 8 个关节值（A1Z 为 6 自由度 + 2 个夹爪平移关节）
  return {
    arm_joint1: values[0],
    arm_joint2: values[1],
    arm_joint3: values[2],
    arm_joint4: values[3],
    arm_joint5: values[4],
    arm_joint6: values[5],
    // 夹爪平移（左夹爪沿 +Y，右夹爪沿 -Y）
    gripper_finger_left_joint: gripperTravel,
    gripper_finger_right_joint: -gripperTravel,
  };
}
