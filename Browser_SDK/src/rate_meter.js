export function createRateMeter({ minimumWindowMs = 1000 } = {}) {
  if (!Number.isFinite(minimumWindowMs) || minimumWindowMs <= 0) {
    throw new RangeError('minimumWindowMs 必须为正数');
  }
  let startedAt = null;
  let count = 0;

  return {
    tick(now) {
      if (!Number.isFinite(now)) throw new TypeError('速率采样时间必须是有限数值');
      if (startedAt === null) {
        startedAt = now;
        return null;
      }
      count += 1;
      const elapsedMs = now - startedAt;
      if (elapsedMs < minimumWindowMs) return null;
      const sample = Object.freeze({ hz: (count / elapsedMs) * 1000, count, elapsedMs });
      startedAt = now;
      count = 0;
      return sample;
    },
    reset() {
      startedAt = null;
      count = 0;
    },
  };
}
