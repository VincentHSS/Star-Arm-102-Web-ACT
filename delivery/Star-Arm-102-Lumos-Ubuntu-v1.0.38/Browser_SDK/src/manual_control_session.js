import { ServoProtocol } from './fashionstar_serial.js?v=server-1.0.38';

const DEFAULT_SERVO_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const noop = () => {};

function copyAngles(angles) {
  if (!Array.isArray(angles) || angles.length !== 7 || angles.some((value) => !Number.isFinite(value))) {
    throw new Error('回读角度必须包含 7 个有效数值');
  }
  return [...angles];
}

export class ArmManualControlSession {
  constructor(options) {
    this.readOnly = options.readOnly === true;
    this.servoIds = [...(options.servoIds ?? DEFAULT_SERVO_IDS)];
    this.readAngles = options.readAngles;
    this.write = options.write;
    this.onAngles = options.onAngles ?? noop;
    this.onStateChange = options.onStateChange ?? noop;
    this.onError = options.onError ?? noop;
    this.invalidateTarget = options.invalidateTarget ?? noop;
    this.schedule = options.schedule ?? ((callback) => setTimeout(callback, 0));
    this.cancelSchedule = options.cancelSchedule ?? clearTimeout;
    this.state = 'disconnected';
    this.lastAngles = null;
    this.connected = false;
    this.generation = 0;
    this.scheduled = null;
    this.inFlight = null;
  }

  setState(state) {
    this.state = state;
    this.onStateChange(state);
  }

  async connect() {
    if (this.connected) return;
    this.connected = true;
    const generation = ++this.generation;
    this.setState('connecting');
    try {
      if (!this.readOnly) await this.writeModeForAll('release', generation);
      if (!this.isCurrent(generation)) return;
      await this.sampleOnce(generation);
      if (!this.isCurrent(generation)) return;
      this.setState('manual_readback');
      this.scheduleNext(generation);
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.connected = false;
        this.setState('fault');
      }
      throw error;
    }
  }

  async enterSliderControl() {
    if (this.readOnly) throw new Error('只读手臂不支持滑块控制');
    if (this.state !== 'manual_readback') throw new Error('当前状态不能进入滑块控制');
    if (!this.lastAngles) throw new Error('尚未获得有效关节角度');
    const generation = ++this.generation;
    this.cancelScheduled();
    this.invalidateTarget();
    this.setState('entering_slider');
    const locked = [];
    try {
      for (const id of this.servoIds) {
        await this.write(ServoProtocol.lockTorque(id));
        if (!this.isCurrent(generation)) return null;
        locked.push(id);
      }
      this.setState('slider_control');
      this.scheduleNext(generation);
      return [...this.lastAngles];
    } catch (error) {
      for (const id of locked) {
        try { await this.write(ServoProtocol.releaseTorque(id)); } catch {}
      }
      if (this.isCurrent(generation)) this.setState('fault');
      const failedId = this.servoIds[locked.length];
      throw new Error(`舵机 ID ${failedId} 锁力失败：${error.message}`);
    }
  }

  async exitSliderControl() {
    if (this.readOnly) return;
    if (this.state !== 'slider_control' && this.state !== 'entering_slider') return;
    const generation = ++this.generation;
    this.cancelScheduled();
    this.invalidateTarget();
    this.setState('exiting_slider');
    try {
      await this.writeModeForAll('release', generation);
      if (!this.isCurrent(generation)) return;
      this.setState('manual_readback');
      this.scheduleNext(generation);
    } catch (error) {
      if (this.isCurrent(generation)) this.setState('fault');
      throw error;
    }
  }

  async pauseSampling() {
    ++this.generation;
    this.cancelScheduled();
    await this.awaitInFlight();
  }

  resumeSampling() {
    if (!this.connected || this.state === 'disconnected' || this.state === 'fault' || this.state === 'teleoperation') return;
    const generation = ++this.generation;
    this.scheduleNext(generation);
  }

  resumeSamplingAfter(delayMs) {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('恢复采样延迟必须是非负数');
    if (!this.connected || this.state === 'disconnected' || this.state === 'fault' || this.state === 'teleoperation') return;
    const generation = ++this.generation;
    this.scheduleNext(generation, delayMs);
  }

  async suspendForTeleop(isAllowed = () => true) {
    this.invalidateTarget();
    ++this.generation;
    this.cancelScheduled();
    await this.awaitInFlight();
    // 在提交遥操作状态前再次检查许可
    if (!isAllowed() || !this.isCurrent(this.generation)) return;
    if (this.connected) this.setState('teleoperation');
  }

  async resumeAfterTeleop(isAllowed = () => true) {
    if (!this.connected || !isAllowed()) return;
    const generation = ++this.generation;
    this.setState('connecting');
    if (!this.readOnly) {
      for (const id of this.servoIds) {
        if (!isAllowed() || !this.isCurrent(generation)) return;
        try {
          await this.write(ServoProtocol.releaseTorque(id));
        } catch (error) {
          throw new Error(`舵机 ID ${id} 卸力失败：${error.message}`);
        }
        if (!isAllowed() || !this.isCurrent(generation)) return;
      }
    }
    if (!isAllowed() || !this.isCurrent(generation)) return;
    await this.sampleOnce(generation);
    if (!isAllowed() || !this.isCurrent(generation)) return;
    this.setState('manual_readback');
    this.scheduleNext(generation);
  }

  async emergencyStop() {
    this.invalidateTarget();
    const wasConnected = this.connected;
    const generation = ++this.generation;
    this.cancelScheduled();
    await this.awaitInFlight();
    let failure = null;
    if (wasConnected && !this.readOnly) {
      try {
        await this.writeModeForAll('release', generation);
      } catch (error) {
        failure = error;
        this.onError(error);
      }
    }
    if (this.connected) this.setState('fault');
    if (failure) throw failure;
  }

  async disconnect() {
    this.invalidateTarget();
    this.connected = false;
    ++this.generation;
    this.cancelScheduled();
    await this.awaitInFlight();
    this.lastAngles = null;
    this.setState('disconnected');
  }

  async writeModeForAll(mode, generation) {
    for (const id of this.servoIds) {
      const frame = mode === 'lock' ? ServoProtocol.lockTorque(id) : ServoProtocol.releaseTorque(id);
      try {
        await this.write(frame);
      } catch (error) {
        throw new Error(`舵机 ID ${id} ${mode === 'lock' ? '锁力' : '卸力'}失败：${error.message}`);
      }
      if (!this.isCurrent(generation)) return;
    }
  }

  async sampleOnce(generation) {
    const operation = Promise.resolve().then(() => this.readAngles());
    this.inFlight = operation;
    try {
      const angles = copyAngles(await operation);
      if (!this.isCurrent(generation)) return;
      this.lastAngles = angles;
      this.onAngles([...angles], this.state);
    } finally {
      if (this.inFlight === operation) this.inFlight = null;
    }
  }

  scheduleNext(generation, delayMs) {
    if (!this.isCurrent(generation) || this.scheduled !== null) return;
    this.scheduled = this.schedule(async () => {
      this.scheduled = null;
      if (!this.isCurrent(generation)) return;
      try {
        await this.sampleOnce(generation);
      } catch (error) {
        if (this.isCurrent(generation)) {
          this.setState('fault');
          this.onError(error);
        }
        return;
      }
      this.scheduleNext(generation);
    }, delayMs);
  }

  cancelScheduled() {
    if (this.scheduled === null) return;
    this.cancelSchedule(this.scheduled);
    this.scheduled = null;
  }

  async awaitInFlight() {
    try { await this.inFlight; } catch {}
  }

  isCurrent(generation) {
    return this.connected && generation === this.generation;
  }
}
