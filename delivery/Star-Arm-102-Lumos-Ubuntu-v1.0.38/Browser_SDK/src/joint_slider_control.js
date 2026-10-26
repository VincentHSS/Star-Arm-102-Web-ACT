import { REVOLUTE_JOINTS, ALL_JOINTS } from './urdf_model_data.js?v=server-1.0.38';
import { MODEL_CONFIGS } from './robot_model_configs.js?v=server-1.0.38';

const gripperJoint = ALL_JOINTS.find(({ name }) => name === 'joint7_left');
export const DEFAULT_JOINT_RANGES = Object.freeze([...REVOLUTE_JOINTS, gripperJoint].map(({ name, limit }) => Object.freeze({
  name,
  min: limit.lower,
  max: limit.upper,
})));

/**
 * 获取指定模型的关节范围
 * @param {string} modelKey - 模型 key (fl, b601, a1z)
 * @returns {Array} 关节范围数组
 */
export function getJointRangesForModel(modelKey) {
  const config = MODEL_CONFIGS[modelKey];
  if (!config) return DEFAULT_JOINT_RANGES;
  
  // 从模型配置中提取关节范围
  return config.joints
    .filter(joint => joint.type === 'revolute')
    .map(({ name, limit }) => ({
      name,
      min: limit.lower,
      max: limit.upper,
    }));
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const radiansToDegrees = (radians) => radians * 180 / Math.PI;

export function parseJointInputDegrees(jointNumber, rawValue) {
  const index = jointNumber - 1;
  const range = JOINT_SLIDER_RANGES[index];
  if (!Number.isInteger(jointNumber) || !range) throw new RangeError('关节编号必须为 1–7');
  const text = String(rawValue).trim();
  const degrees = Number(text);
  if (text === '' || !Number.isFinite(degrees)) throw new TypeError(`J${jointNumber} 请输入有效角度`);
  const min = Number(radiansToDegrees(range.min).toFixed(2));
  const max = Number(radiansToDegrees(range.max).toFixed(2));
  if (degrees < min || degrees > max) throw new RangeError(`J${jointNumber} 允许范围 ${min}°～${max}°`);
  return degrees;
}

export function createJointSliderState(initialAngles = new Array(DEFAULT_JOINT_RANGES.length).fill(0), jointRanges = DEFAULT_JOINT_RANGES) {
  if (!Array.isArray(initialAngles) || initialAngles.length !== jointRanges.length || !initialAngles.every(Number.isFinite)) {
    throw new TypeError(`关节滑块需要 ${jointRanges.length} 个有限弧度值`);
  }
  let angles = initialAngles.map((value, index) => clamp(value, jointRanges[index].min, jointRanges[index].max));
  return {
    ranges: jointRanges,
    values: () => [...angles],
    replace(values) {
      if (!Array.isArray(values) || values.length !== jointRanges.length || !values.every(Number.isFinite)) {
        throw new TypeError(`关节滑块需要 ${jointRanges.length} 个有限弧度值`);
      }
      angles = values.map((value, index) => clamp(value, jointRanges[index].min, jointRanges[index].max));
      return [...angles];
    },
    setJoint(jointNumber, radians) {
      const index = jointNumber - 1;
      if (!Number.isInteger(jointNumber) || !jointRanges[index]) throw new RangeError('关节编号必须为 1–7');
      if (!Number.isFinite(radians)) throw new TypeError('关节角必须是有限弧度值');
      const range = jointRanges[index];
      angles[index] = clamp(radians, range.min, range.max);
      return [...angles];
    },
  };
}
