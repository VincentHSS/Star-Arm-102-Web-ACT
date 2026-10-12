export class ConnectionOperationLock {
  constructor(name = 'Follower') {
    this.name = name;
    this.operation = null;
    this.sequence = 0;
    this.invalidationCount = 0;
    this.waiters = [];
  }

  get active() {
    return this.operation !== null;
  }

  get invalidating() {
    return this.invalidationCount > 0;
  }

  begin(type) {
    if (this.invalidating) throw new Error(`${this.name} 正在断开`);
    if (this.active) throw new Error(`${this.name} 正在连接`);
    const operation = Object.freeze({ id: ++this.sequence, type });
    this.operation = operation;
    return operation;
  }

  assertCurrent(operation, currentType) {
    if (this.invalidating || this.operation !== operation) throw new Error(`${this.name} 连接操作已失效`);
    if (operation.type !== currentType) throw new Error(`${this.name} 类型已变化`);
  }

  finish(operation) {
    if (this.operation !== operation) return;
    this.operation = null;
    const waiters = this.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  async invalidateAndWait() {
    ++this.invalidationCount;
    if (this.operation) await new Promise((resolve) => this.waiters.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      --this.invalidationCount;
    };
  }
}

export async function drainLostConnection({ lock, stop, session, disconnectSession, isCurrent, clearCurrent }) {
  const release = await lock.invalidateAndWait();
  try {
    await stop();
    await disconnectSession(session);
    if (isCurrent()) clearCurrent();
  } finally {
    release();
  }
}

export class TeleopLifecycle {
  constructor() {
    this.phase = 'idle';
    this.teleop = null;
    this.startPromise = null;
    this.stopPromise = null;
    this.generation = 0;
    this.resumeAllowed = false;
    this.resume = null;
    this.startIntent = 0;
    this.terminating = false;
  }

  start({ suspend, createTeleop, resume }) {
    if (this.terminating) return Promise.reject(new Error('遥操作正在终止，暂时不能重新启动'));
    if (this.phase === 'running') return Promise.resolve(this.teleop);
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise) {
      const intent = this.startIntent;
      return this.stopPromise.then(() => (
        intent === this.startIntent ? this.start({ suspend, createTeleop, resume }) : null
      ));
    }

    const generation = ++this.generation;
    this.phase = 'starting';
    this.resumeAllowed = true;
    this.resume = resume;
    const operation = (async () => {
      let suspended = false;
      this.phase = 'suspending';
      try {
        await suspend(() => this.resumeAllowed && generation === this.generation);
        suspended = true;
        if (generation !== this.generation) return null;
        const teleop = createTeleop();
        if (generation !== this.generation) {
          await teleop.stop?.();
          return null;
        }
        this.teleop = teleop;
        teleop.start();
        this.phase = 'running';
        return teleop;
      } catch (error) {
        if (suspended && generation === this.generation) {
          await resume(() => this.resumeAllowed && generation === this.generation);
        }
        if (generation === this.generation) this.phase = 'idle';
        throw error;
      } finally {
        if (this.startPromise === operation) this.startPromise = null;
      }
    })();
    this.startPromise = operation;
    return operation;
  }

  stop({ resume }) {
    if (!resume) {
      this.terminating = true;
      this.resumeAllowed = false;
      ++this.startIntent;
    }
    ++this.generation;
    if (this.stopPromise) return this.stopPromise;

    const operation = (async () => {
      const starting = this.startPromise;
      const teleop = this.teleop;
      this.phase = 'stopping';
      await Promise.allSettled([starting, teleop?.stop?.()]);
      const currentTeleop = this.teleop;
      if (currentTeleop && currentTeleop !== teleop) await currentTeleop.stop?.();
      this.teleop = null;
      if (resume && this.resumeAllowed) {
        const generation = this.generation;
        await this.resume?.(() => this.resumeAllowed && generation === this.generation);
      }
      this.resume = null;
      this.phase = 'idle';
    })().finally(() => {
      if (this.stopPromise === operation) this.stopPromise = null;
      this.terminating = false;
    });
    this.stopPromise = operation;
    return operation;
  }
}
