import { ServoProtocol } from './fashionstar_serial.js';
import { modelToServoAngles, servoToModelAngles, validateJointTargets, JOINT_MAPPINGS } from './joint_mapper.js';
import { getRobotProfile } from './robot_profiles.js';

const SERVO_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const JOINT_NAMES = Object.freeze(['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6']);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function toModelTargets(modelAngles, currentGripperAngle) {
  const values = [...modelAngles, currentGripperAngle * Math.PI / 180];
  const targets = Object.fromEntries(JOINT_NAMES.map((name, index) => [name, values[index]]));
  targets.joint7_left = values[6];
  targets.joint_right = -values[6];
  return targets;
}

function reject(controller, code, message) {
  controller.status = 'rejected';
  controller.pending = null;
  throw new CommandExecutionError(code, message);
}

export class CommandExecutionError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CommandExecutionError';
    this.code = code;
  }
}

export class CommandExecutionController {
  constructor({ write }) {
    if (typeof write !== 'function') throw new TypeError('必须注入 write(frame)');
    this.write = write;
    this.status = 'idle';
    this.pending = null;
    this.lastError = null;
  }

  preview({ profileCode, connectionId, modelAngles, currentGripperAngle, durationMs }) {
    if (this.status === 'sending') {
      throw new CommandExecutionError('EXECUTION_IN_PROGRESS', '控制命令正在发送，不能生成新预览');
    }
    const profile = getRobotProfile(profileCode);
    if (!profile.canCommand) {
      reject(this, 'PROFILE_READ_ONLY', `${profile.code} 型号不允许执行控制命令`);
    }
    if (typeof connectionId !== 'string' || connectionId.trim() === '') {
      reject(this, 'INVALID_CONNECTION_ID', '连接身份不能为空');
    }
    if (!Array.isArray(modelAngles) || ![6, 7].includes(modelAngles.length)) {
      reject(this, 'INVALID_ANGLE_COUNT', 'modelAngles 必须包含 6 或 7 个关节角');
    }
    if (!modelAngles.every(Number.isFinite)) {
      reject(this, 'NON_FINITE_ANGLE', 'modelAngles 必须全部为有限数值');
    }
    if (modelAngles.length === 6 && !Number.isFinite(currentGripperAngle)) {
      reject(this, 'NON_FINITE_GRIPPER', '当前夹爪角度必须为有限数值');
    }
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      reject(this, 'INVALID_DURATION', 'durationMs 必须为正整数');
    }
    const gripperRadians = modelAngles.length === 7
      ? modelAngles[6]
      : profile.code === 'A1Z' || profile.code === 'B601'
        ? 0  // A1Z 和 B601 没有 J7 夹爪
        : servoToModelAngles(profile.code, [0, 0, 0, 0, 0, 0, currentGripperAngle]).joint7_left;
    const targets = toModelTargets(modelAngles.slice(0, 6), gripperRadians * 180 / Math.PI);
    const validation = validateJointTargets(targets, { mode: 'reject' });
    if (!validation.valid) reject(this, 'JOINT_LIMIT', `目标关节超限: ${validation.errors.join('; ')}`);
    const servoAngles = modelToServoAngles(profile.code, targets);
    const frame = ServoProtocol.syncMultiTurnAngleByInterval(servoAngles, {
      servoIds: SERVO_IDS,
      interval: durationMs,
    });
    const mapping = JOINT_MAPPINGS[profile.code];
    this.pending = deepFreeze({
      status: 'pending',
      profileCode: profile.code,
      connectionId,
      servoIds: [...SERVO_IDS],
      servoAngles,
      frame: [...frame],
      metadata: {
        hardwareCalibrated: mapping.hardwareCalibrated,
        calibrationWarning: mapping.calibrationStatus,
        executionNotice: '命令仅经自动测试，未实机验证；执行前须完成校准与安全检查',
      },
    });
    this.status = 'pending';
    return this.pending;
  }

  cancel(pending) {
    if (this.status !== 'pending' || pending !== this.pending) {
      throw new CommandExecutionError('CANCEL_MISMATCH', '只能取消当前待确认命令');
    }
    this.pending = null;
    this.status = 'cancelled';
    return deepFreeze({ status: 'cancelled' });
  }

  async confirm({ pending, profileCode, connectionId, write = this.write }) {
    if (['sending', 'sent', 'cancelled', 'failed'].includes(this.status)) {
      throw new CommandExecutionError('ALREADY_HANDLED', '该待确认命令已处理，不能重复执行');
    }
    if (
      this.status !== 'pending'
      || pending !== this.pending
      || pending.profileCode !== getRobotProfile(profileCode).code
      || pending.connectionId !== connectionId
    ) {
      throw new CommandExecutionError('CONFIRMATION_MISMATCH', '待确认命令与当前型号或连接身份不一致');
    }
    this.status = 'sending';
    try {
      await write(Uint8Array.from(pending.frame));
    } catch (cause) {
      this.pending = null;
      this.status = 'failed';
      this.lastError = new CommandExecutionError('WRITE_FAILED', '控制命令下发失败', cause);
      throw this.lastError;
    }
    this.pending = null;
    this.status = 'sent';
    return deepFreeze({ status: 'sent' });
  }
}
