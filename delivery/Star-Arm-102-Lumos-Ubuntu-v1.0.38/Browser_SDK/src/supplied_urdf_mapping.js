import { SUPPLIED_URDF_MODELS } from './supplied_urdf_models.js?v=server-1.0.38';

export function isSuppliedVirtualModel(key) {
  return Object.hasOwn(SUPPLIED_URDF_MODELS, key);
}

// Virtual visual following: J1–J6 in URDF order, with no hardware zero calibration.
// FL J7's 0–90° display convention drives each parallel finger through 0–42.5 mm.
export function mapSuppliedVirtualAngles(key, radians) {
  if (!isSuppliedVirtualModel(key)) throw new RangeError(`未知虚拟模型：${key}`);
  if (radians.length !== 7 || !radians.every(Number.isFinite)) throw new TypeError('需要七个有限关节角');
  const config = SUPPLIED_URDF_MODELS[key];
  const modelAngles = {};
  const displayAngles = config.joints.slice(0, 6).map((joint, index) => {
    const value = joint.type === 'continuous' ? radians[index]
      : Math.max(joint.limit.lower, Math.min(joint.limit.upper, radians[index]));
    modelAngles[joint.name] = value;
    return value;
  });
  const gripper = key === 'fl-v3' ? Math.max(0, Math.min(Math.PI / 2, radians[6])) : radians[6];
  if (key === 'fl-v3') {
    const travel = gripper / (Math.PI / 2) * 0.0425;
    modelAngles.gripper_joint1 = -travel;
    modelAngles.gripper_joint2 = travel;
  } else if (key === 'ld-touch') {
    // CAD display angle only. Encoder zero, direction, and physical travel are
    // separate hardware calibration; the renderer derives the passive finger
    // from URDF mimic instead of a second hand-written control mapping.
    modelAngles.joint_7 = gripper;
  }
  return { modelAngles, displayAngles: [...displayAngles, gripper] };
}
