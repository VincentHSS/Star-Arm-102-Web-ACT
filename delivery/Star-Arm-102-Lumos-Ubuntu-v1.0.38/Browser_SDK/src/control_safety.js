export class ControlGeneration {
  constructor() {
    this.generation = 0;
    this.emergencyStopDepth = 0;
  }

  get emergencyStopping() {
    return this.emergencyStopDepth > 0;
  }

  capture() {
    if (this.emergencyStopDepth > 0) throw new Error('急停处理中，不能生成新目标');
    return Object.freeze({ generation: this.generation });
  }

  assertActive(token) {
    if (!token || this.emergencyStopDepth > 0 || token.generation !== this.generation) {
      throw new Error('急停已触发，待确认目标已失效');
    }
  }

  beginEmergencyStop() {
    this.generation += 1;
    this.emergencyStopDepth += 1;
  }

  finishEmergencyStop() {
    this.emergencyStopDepth = Math.max(0, this.emergencyStopDepth - 1);
  }
}

function sameConnection(confirmed, current) {
  return Boolean(
    current
    && !current.reason
    && confirmed.bus === current.bus
    && confirmed.profileCode === current.profileCode
    && confirmed.connectionId === current.connectionId
  );
}

function assertCurrentConnection(confirmed, resolveCurrent) {
  const current = resolveCurrent();
  if (!confirmed.bus?.connected || !sameConnection(confirmed, current)) {
    throw new Error('型号或连接身份已变化，待确认目标已失效');
  }
}

export async function executeConfirmedTarget({
  confirmed,
  stopAndDrain,
  resolveCurrent,
  assertControlActive = () => {},
  commandExecution,
}) {
  await stopAndDrain();
  assertControlActive(confirmed.controlToken);
  assertCurrentConnection(confirmed, resolveCurrent);
  const result = await commandExecution.confirm({
    pending: confirmed.pending,
    profileCode: confirmed.profileCode,
    connectionId: confirmed.connectionId,
    write: async (frame) => {
      assertControlActive(confirmed.controlToken);
      assertCurrentConnection(confirmed, resolveCurrent);
      await confirmed.bus.write(frame);
    },
  });
  try {
    assertControlActive(confirmed.controlToken);
  } catch (error) {
    if (commandExecution.status === 'sent') commandExecution.status = 'aborted';
    throw error;
  }
  return result;
}

export async function connectInitializedBus({ bus, initialize, publish, identity }) {
  await bus.connect();
  try {
    await initialize(bus);
  } catch (error) {
    await bus.disconnect();
    throw error;
  }
  publish(identity);
  return identity;
}
