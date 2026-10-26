import { FACTORY_PARAMS } from './factory_params.js?v=server-1.0.35';
import { ServoProtocol } from './fashionstar_serial.js?v=server-1.0.35';

export const FACTORY_SERVO_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

export async function restoreFactoryParameters(options) {
  const {
    model,
    write,
    readAndVerify,
    delayMs = 500,
    onProgress = () => {},
    onPhase = () => {},
    protocol = {
      stop: (id) => ServoProtocol.stopOnControlMode(id, 0x10, 0),
      writePublic: (id, values) => ServoProtocol.writePublicParameters(id, values),
      writeInternal: (id, values) => ServoProtocol.writeInternalParameters(id, values),
    },
  } = options;
  const params = FACTORY_PARAMS[model];
  if (!params) throw new Error(`不支持的手臂型号: ${model}`);

  onPhase('stop');
  for (const id of FACTORY_SERVO_IDS) {
    await writeStep(write, protocol.stop(id), '停止卸力', id);
    onProgress('stop', id);
    await delay(delayMs);
  }
  onPhase('public');
  for (const id of FACTORY_SERVO_IDS) {
    await writeStep(write, protocol.writePublic(id, params.public[id]), '写入公开参数', id);
    onProgress('public', id);
    await delay(delayMs);
  }
  onPhase('internal');
  for (const id of FACTORY_SERVO_IDS) {
    await writeStep(write, protocol.writeInternal(id, params.internal[id]), '写入内部参数', id);
    onProgress('internal', id);
    await delay(delayMs);
  }
  onPhase('verify-public');
  for (const id of FACTORY_SERVO_IDS) {
    await readAndVerify('public', id, params.public[id]);
    onProgress('verify-public', id);
  }
  onPhase('verify-internal');
  for (const id of FACTORY_SERVO_IDS) {
    await readAndVerify('internal', id, params.internal[id]);
    onProgress('verify-internal', id);
  }
}

export function compareParameters(actual, expected) {
  const mismatches = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[key];
    if (!Number.isFinite(actualValue) || Math.abs(actualValue - expectedValue) > 1) {
      mismatches.push(`${key}: 期望 ${expectedValue}，实际 ${actualValue ?? '缺失'}`);
    }
  }
  return mismatches;
}

async function writeStep(write, frame, phase, id) {
  try {
    await write(frame);
  } catch (error) {
    throw new Error(`${phase}失败（舵机 ID ${id}）：${error.message}`);
  }
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
