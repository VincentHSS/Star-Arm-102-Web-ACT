import { ALL_JOINTS } from './urdf_model_data.js?v=server-1.0.38';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const jointLimits = new Map(ALL_JOINTS.map((joint) => [joint.name, joint.limit]));

function createMapping(code, canCommand) {
  return Object.freeze({
    model: code,
    canCommand,
    hardwareCalibrated: false,
    mappingSemantics: 'uncalibrated-placeholder',
    calibrationStatus: '待实机校准：方向与零点偏移使用中性占位值，不可视为实机正确映射',
    joints: Object.freeze(Array.from({ length: 6 }, (_, servoId) => Object.freeze({
      servoId,
      jointName: `joint${servoId + 1}`,
      direction: servoId === 3 ? -1 : 1,
      offsetDegrees: 0,
      directionCalibrated: servoId === 3,
    }))),
    gripper: Object.freeze({
      servoId: 6,
      offsetDegrees: 0,
      directionCalibrated: true,
      mappingSemantics: 'external-single-servo-product-mapping',
      urdfMimic: false,
      left: Object.freeze({ jointName: 'joint7_left', direction: 1 }),
      // PiPER 右指的 origin 已翻转 180°，同号角度才能对称开合且不被下限截住。
      right: Object.freeze({ jointName: 'joint_right', direction: code === 'PIPER' ? 1 : -1 }),
    }),
  });
}

export const JOINT_MAPPINGS = Object.freeze({
  LD: createMapping('LD', false),
  HD: createMapping('HD', true),
  FL: createMapping('FL', true),
  PIPER: createMapping('PIPER', false),
});

function normalizeModel(model) {
  let code = String(model ?? '').trim().toUpperCase();
  code = code.replace(/^STAR ARM 102-/, '');
  code = code.replace(/\s*[（(].*[）)]$/, '');
  return code.trim();
}

function mappingFor(model) {
  const code = normalizeModel(model);
  const mapping = JOINT_MAPPINGS[code];
  if (!mapping) throw new RangeError(`未知型号: ${model}`);
  return mapping;
}

export function servoToModelAngles(model, servoAngles) {
  if (!Array.isArray(servoAngles) || servoAngles.length !== 7) throw new TypeError('需要 ID 0–6 的 7 个舵机角度');
  const mapping = mappingFor(model);
  const result = {};
  for (const config of mapping.joints) {
    result[config.jointName] = (servoAngles[config.servoId] - config.offsetDegrees) * config.direction * DEG_TO_RAD;
  }
  const gripperDegrees = servoAngles[6] - mapping.gripper.offsetDegrees;
  result.joint7_left = gripperDegrees * mapping.gripper.left.direction * DEG_TO_RAD;
  result.joint_right = gripperDegrees * mapping.gripper.right.direction * DEG_TO_RAD;
  return result;
}

export function modelToServoAngles(model, modelAngles) {
  const mapping = mappingFor(model);
  const result = new Array(7);
  for (const config of mapping.joints) {
    result[config.servoId] = modelAngles[config.jointName] * RAD_TO_DEG / config.direction + config.offsetDegrees;
  }
  result[6] = modelAngles.joint7_left * RAD_TO_DEG / mapping.gripper.left.direction + mapping.gripper.offsetDegrees;
  return result;
}

export function validateJointTargets(targets, { mode = 'reject' } = {}) {
  if (!['reject', 'clamp'].includes(mode)) throw new RangeError('mode 必须为 reject 或 clamp');
  const normalized = { ...targets };
  const errors = [];
  for (const [name, limit] of jointLimits) {
    const value = targets[name];
    if (!Number.isFinite(value)) {
      errors.push(`${name} 缺失或不是有限数值`);
      continue;
    }
    if (value < limit.lower || value > limit.upper) {
      errors.push(`${name} 超出 [${limit.lower}, ${limit.upper}]`);
      if (mode === 'clamp') normalized[name] = Math.max(limit.lower, Math.min(limit.upper, value));
    }
  }
  return { valid: mode === 'clamp' ? !errors.some((error) => error.includes('缺失')) : errors.length === 0, targets: normalized, errors };
}
