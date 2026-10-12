import { ServoProtocol } from './fashionstar_serial.js';

export const ARM_SERVO_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

export async function resetArmOrigin(writeFrame, options = {}) {
  const servoIds = options.servoIds ?? ARM_SERVO_IDS;
  const delayMs = options.delayMs ?? 20;
  const onProgress = options.onProgress ?? (() => {});

  for (const servoId of servoIds) {
    try {
      await writeFrame(ServoProtocol.stopOnControlMode(servoId, 0x10, 0));
      await delay(delayMs);
      await writeFrame(ServoProtocol.setOriginPoint(servoId));
      await delay(delayMs);
      onProgress(servoId);
    } catch (error) {
      throw new Error(`舵机 ID ${servoId} 设置零点失败: ${error.message}`, { cause: error });
    }
  }
}

export function verifyOriginAngles(monitors, options = {}) {
  const servoIds = options.servoIds ?? ARM_SERVO_IDS;
  const tolerance = options.tolerance ?? 1;
  const byId = new Map(monitors.map((monitor) => [monitor.id, monitor]));

  for (const servoId of servoIds) {
    const monitor = byId.get(servoId);
    if (!monitor || !Number.isFinite(monitor.angle)) {
      throw new Error(`舵机 ID ${servoId} 角度读取失败`);
    }
    if (monitor.angle < -tolerance || monitor.angle > tolerance) {
      throw new Error(`舵机 ID ${servoId} 当前角度 ${monitor.angle.toFixed(2)}°，超出允许范围 -${tolerance.toFixed(2)}°～+${tolerance.toFixed(2)}°`);
    }
  }
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
