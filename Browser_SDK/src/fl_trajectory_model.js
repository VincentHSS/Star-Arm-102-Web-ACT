import { REVOLUTE_JOINTS, GRIPPER_JOINTS } from './urdf_model_data.js';

export const FL_TRAJECTORY_SCHEMA_VERSION = 1;
export const FL_TRAJECTORY_MAX_DURATION_MS = 10 * 60 * 1000;
export const FL_TRAJECTORY_MAX_FRAMES = 30000;
export const FL_TRAJECTORY_SAMPLE_INTERVAL_MS = 20;
export const FL_TRAJECTORY_CHANGE_THRESHOLD_DEG = 0.1;

const RAD_TO_DEG = 180 / Math.PI;
const JOINT_LIMIT_EPSILON_RAD = 3 * Math.PI / 180;
const LIMITS = Object.freeze([
  ...REVOLUTE_JOINTS.map((joint) => joint.limit),
  GRIPPER_JOINTS.find((joint) => joint.name === 'joint7_left').limit,
]);

export function normalizeFlTrajectoryJoints(jointsRad) {
  if (!Array.isArray(jointsRad) || jointsRad.length !== 7 || !jointsRad.every(Number.isFinite)) {
    throw new TypeError('轨迹帧必须包含 7 个有限关节角');
  }
  return jointsRad.map((value, index) => {
    const limit = LIMITS[index];
    if (value < limit.lower - JOINT_LIMIT_EPSILON_RAD || value > limit.upper + JOINT_LIMIT_EPSILON_RAD) {
      throw new RangeError(`J${index + 1} 超出 [${limit.lower}, ${limit.upper}]`);
    }
    return Math.min(limit.upper, Math.max(limit.lower, value));
  });
}

function copyFrame(frame, previousTime = -1) {
  if (!frame || !Number.isFinite(frame.t) || frame.t < 0 || frame.t < previousTime) {
    throw new RangeError('轨迹帧时间必须是单调非负数值');
  }
  return { t: frame.t, jointsRad: normalizeFlTrajectoryJoints(frame.jointsRad) };
}

function validateIdentity(value, errors) {
  if (value.schemaVersion !== FL_TRAJECTORY_SCHEMA_VERSION) errors.push(`不支持的轨迹版本：${value.schemaVersion}`);
  if (value.robotModel !== 'FL') errors.push('轨迹型号必须为 FL');
  if (value.source !== 'manual_fl') errors.push('轨迹来源必须为 manual_fl');
  if (typeof value.name !== 'string' || value.name.trim() === '') errors.push('轨迹名称不能为空');
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) errors.push('轨迹创建时间无效');
  if (typeof value.interrupted !== 'boolean') errors.push('轨迹中断标记必须是布尔值');
}

export function validateFlTrajectory(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return { valid: false, errors: ['轨迹格式无效'] };
  validateIdentity(value, errors);
  if (!Number.isInteger(value.sampleIntervalMs) || value.sampleIntervalMs < 1 || value.sampleIntervalMs > 1000) {
    errors.push('采样间隔必须是 1–1000 ms 的整数');
  }
  if (!Array.isArray(value.frames)) errors.push('轨迹 frames 必须是数组');
  else {
    if (value.frames.length > FL_TRAJECTORY_MAX_FRAMES) errors.push(`轨迹帧数不能超过 ${FL_TRAJECTORY_MAX_FRAMES}`);
    let previousTime = -1;
    value.frames.forEach((frame, index) => {
      try {
        const copied = copyFrame(frame, previousTime);
        previousTime = copied.t;
      } catch (error) {
        errors.push(`轨迹帧 ${index + 1}：${error.message}`);
      }
    });
  }
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0 || value.durationMs > FL_TRAJECTORY_MAX_DURATION_MS) {
    errors.push(`轨迹时长必须在 0–${FL_TRAJECTORY_MAX_DURATION_MS} ms`);
  }
  const lastTime = Array.isArray(value.frames) ? value.frames.at(-1)?.t ?? 0 : 0;
  if (Number.isFinite(value.durationMs) && value.durationMs !== lastTime) errors.push('轨迹时长必须等于末帧时间');
  return { valid: errors.length === 0, errors };
}

export function createFlTrajectory({
  name,
  createdAt = new Date().toISOString(),
  sampleIntervalMs = FL_TRAJECTORY_SAMPLE_INTERVAL_MS,
  interrupted = false,
  frames = [],
} = {}) {
  let previousTime = -1;
  const copiedFrames = frames.map((frame) => {
    const copied = copyFrame(frame, previousTime);
    previousTime = copied.t;
    return copied;
  });
  const result = {
    schemaVersion: FL_TRAJECTORY_SCHEMA_VERSION,
    name: typeof name === 'string' ? name.trim() : name,
    robotModel: 'FL',
    source: 'manual_fl',
    createdAt,
    sampleIntervalMs,
    interrupted: Boolean(interrupted),
    durationMs: copiedFrames.at(-1)?.t ?? 0,
    frames: copiedFrames,
  };
  const validation = validateFlTrajectory(result);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  return result;
}

function maxDeltaDegrees(a, b) {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index]) * RAD_TO_DEG));
}

export function appendFlFrame(trajectory, frame, {
  minIntervalMs = FL_TRAJECTORY_SAMPLE_INTERVAL_MS,
  changeThresholdDeg = FL_TRAJECTORY_CHANGE_THRESHOLD_DEG,
} = {}) {
  const validation = validateFlTrajectory(trajectory);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  const previous = trajectory.frames.at(-1);
  const copied = copyFrame(frame, previous?.t ?? -1);
  if (copied.t > FL_TRAJECTORY_MAX_DURATION_MS) return { trajectory, appended: false, limitReached: true };
  if (trajectory.frames.length >= FL_TRAJECTORY_MAX_FRAMES) return { trajectory, appended: false, limitReached: true };
  if (previous && copied.t - previous.t < minIntervalMs) return { trajectory, appended: false, limitReached: false };
  if (previous && maxDeltaDegrees(copied.jointsRad, previous.jointsRad) < changeThresholdDeg) {
    return { trajectory, appended: false, limitReached: false };
  }
  const frames = [...trajectory.frames, copied];
  return {
    trajectory: { ...trajectory, durationMs: copied.t, frames },
    appended: true,
    limitReached: frames.length >= FL_TRAJECTORY_MAX_FRAMES || copied.t >= FL_TRAJECTORY_MAX_DURATION_MS,
  };
}

export function finalizeFlTrajectory(trajectory, finalFrame, { interrupted = trajectory.interrupted } = {}) {
  const validation = validateFlTrajectory(trajectory);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  let frames = trajectory.frames.map((frame) => ({ t: frame.t, jointsRad: [...frame.jointsRad] }));
  if (finalFrame) {
    const previous = frames.at(-1);
    const copied = copyFrame(finalFrame, previous?.t ?? -1);
    if (copied.t > FL_TRAJECTORY_MAX_DURATION_MS) copied.t = FL_TRAJECTORY_MAX_DURATION_MS;
    if (!previous) frames.push(copied);
    else if (copied.t === previous.t) frames[frames.length - 1] = copied;
    else if (frames.length < FL_TRAJECTORY_MAX_FRAMES) frames.push(copied);
    else frames[frames.length - 1] = copied;
  }
  const result = { ...trajectory, interrupted: Boolean(interrupted), durationMs: frames.at(-1)?.t ?? 0, frames };
  const resultValidation = validateFlTrajectory(result);
  if (!resultValidation.valid) throw new TypeError(resultValidation.errors.join('; '));
  return result;
}
