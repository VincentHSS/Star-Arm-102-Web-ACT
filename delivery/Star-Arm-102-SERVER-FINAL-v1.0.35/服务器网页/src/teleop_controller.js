import { ServoProtocol } from './fashionstar_serial.js?v=server-1.0.35';

const SERVO_IDS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

export function createProtocolTeleopIO(bus, options = {}) {
  const { interval = 100, ...transactOptions } = options;

  return {
    async readLeaderAngles() {
      const monitors = await bus.transact(
        ServoProtocol.syncServoMonitor(SERVO_IDS),
        transactOptions,
      );
      const monitorsById = new Map();

      for (const monitor of monitors) {
        if (!SERVO_IDS.includes(monitor.id)) continue;
        if (monitorsById.has(monitor.id)) {
          throw new Error(`监控响应包含重复舵机 ID ${monitor.id}`);
        }
        monitorsById.set(monitor.id, monitor);
      }

      return SERVO_IDS.map((id) => {
        if (!monitorsById.has(id)) throw new Error(`监控响应缺失舵机 ID ${id}`);
        return monitorsById.get(id).angle;
      });
    },

    writeFollowerAngles(angles) {
      return bus.write(ServoProtocol.syncMultiTurnAngleByInterval(angles, {
        servoIds: SERVO_IDS,
        interval,
      }));
    },
  };
}

export class AngleFilter {
  constructor(windowSize) {
    if (!Number.isInteger(windowSize) || windowSize < 0 || windowSize > 100) {
      throw new RangeError('windowSize 必须是 0–100 的整数');
    }
    this.windowSize = windowSize;
    this.samples = [];
  }

  get sampleCount() { return this.samples.length; }

  clear() { this.samples.length = 0; }

  push(angles) {
    if (
      !Array.isArray(angles)
      || angles.length !== SERVO_IDS.length
      || !angles.every((angle) => Number.isFinite(angle))
    ) {
      throw new RangeError('angles 必须包含 7 个有限数值');
    }
    const latest = [...angles];
    if (this.windowSize === 0) return latest;
    this.samples.push(latest);
    if (this.samples.length > this.windowSize) this.samples.shift();
    return latest.map((_, index) => (
      this.samples.reduce((sum, sample) => sum + sample[index], 0) / this.samples.length
    ));
  }
}

export const timeoutScheduler = Object.freeze({
  schedule(callback, delay) { return setTimeout(callback, delay); },
  cancel(handle) { clearTimeout(handle); },
});

export class TeleopController {
  constructor({
    scheduler = timeoutScheduler,
    loopIntervalMs = 20,
    filterWindow = 30,
    readLeaderAngles,
    writeFollowerAngles,
    readOnly = false,
    onAngles = () => {},
    onError = () => {},
  }) {
    if (typeof readLeaderAngles !== 'function' || (!readOnly && typeof writeFollowerAngles !== 'function')) {
      throw new TypeError(readOnly ? '必须注入 Leader 读取接口' : '必须注入 Leader 读取和 Follower 写入接口');
    }
    if (!Number.isInteger(loopIntervalMs) || loopIntervalMs < 0 || loopIntervalMs > 100) {
      throw new RangeError('loopIntervalMs 必须是 0–100 的整数');
    }
    this.scheduler = scheduler;
    this.loopIntervalMs = loopIntervalMs;
    this.filter = new AngleFilter(filterWindow);
    this.readLeaderAngles = readLeaderAngles;
    this.writeFollowerAngles = writeFollowerAngles;
    this.readOnly = readOnly;
    this.onAngles = onAngles;
    this.onError = onError;
    this.running = false;
    this.generation = 0;
    this.pendingSchedule = null;
    this.inFlight = null;
  }

  start() {
    if (this.running) return false;
    this.running = true;
    this.generation += 1;
    this.filter.clear();
    this.#scheduleNext(this.generation);
    return true;
  }

  stop() {
    this.running = false;
    this.generation += 1;
    if (this.pendingSchedule !== null) this.scheduler.cancel(this.pendingSchedule);
    this.pendingSchedule = null;
    this.filter.clear();
    return this.inFlight ?? Promise.resolve();
  }

  #scheduleNext(generation) {
    if (!this.running || generation !== this.generation) return;
    this.pendingSchedule = this.scheduler.schedule(() => {
      this.pendingSchedule = null;
      const run = this.#runOnce(generation);
      this.inFlight = run;
      void run.finally(() => {
        if (this.inFlight === run) this.inFlight = null;
      });
    }, this.loopIntervalMs);
  }

  async #runOnce(generation) {
    try {
      const angles = await this.readLeaderAngles([...SERVO_IDS]);
      if (!this.running || generation !== this.generation) return;
      const filtered = this.filter.push(angles);
      if (!this.readOnly) await this.writeFollowerAngles(filtered, [...SERVO_IDS]);
      if (!this.running || generation !== this.generation) return;
      this.onAngles(filtered);
    } catch (error) {
      if (this.running && generation === this.generation) this.onError(error);
    } finally {
      this.#scheduleNext(generation);
    }
  }
}

export { SERVO_IDS };
