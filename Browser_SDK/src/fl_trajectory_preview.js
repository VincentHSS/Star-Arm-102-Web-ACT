import { createFlTrajectory, validateFlTrajectory } from './fl_trajectory_model.js';

const noop = () => {};
const defaultSchedule = (callback) => requestAnimationFrame(callback);
const defaultCancel = (handle) => cancelAnimationFrame(handle);
const START_TRANSITION_MS = 2000;

function copyJoints(value) {
  if (!Array.isArray(value) || value.length !== 7 || !value.every(Number.isFinite)) {
    throw new TypeError('虚拟试播放需要 FL 的 7 个有效关节角');
  }
  return [...value];
}

function fingerprint(trajectory) {
  const normalized = createFlTrajectory(trajectory);
  let hash = 2166136261;
  const text = JSON.stringify(normalized);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fl-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function interpolate(a, b, ratio) {
  const bounded = Math.max(0, Math.min(1, ratio));
  return a.map((value, index) => value + (b[index] - value) * bounded);
}

function sampleFrames(frames, elapsed) {
  if (elapsed <= frames[0].t) return [...frames[0].jointsRad];
  const last = frames.at(-1);
  if (elapsed >= last.t) return [...last.jointsRad];
  let upperIndex = 1;
  while (upperIndex < frames.length && frames[upperIndex].t < elapsed) upperIndex += 1;
  const lower = frames[upperIndex - 1];
  const upper = frames[upperIndex];
  const span = Math.max(1, upper.t - lower.t);
  return interpolate(lower.jointsRad, upper.jointsRad, (elapsed - lower.t) / span);
}

export class FlTrajectoryPreview {
  constructor({
    now = () => performance.now(),
    schedule = defaultSchedule,
    cancel = defaultCancel,
    onPose,
    onRestore = noop,
    onStateChange = noop,
    onProgress = noop,
  } = {}) {
    if (typeof onPose !== 'function') throw new TypeError('虚拟试播放必须注入 onPose(jointsRad)');
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.onPose = onPose;
    this.onRestore = onRestore;
    this.onStateChange = onStateChange;
    this.onProgress = onProgress;
    this.state = 'idle';
    this.handle = null;
    this.generation = 0;
    this.session = null;
    this.approval = null;
  }

  setState(state, detail = null) {
    this.state = state;
    this.onStateChange({ state, detail });
  }

  start({ trajectory, connectionId, currentJointsRad }) {
    if (typeof connectionId !== 'string' || connectionId.trim() === '') throw new Error('请先连接真实 FL');
    const validation = validateFlTrajectory(trajectory);
    if (!validation.valid) throw new TypeError(validation.errors.join('; '));
    if (!trajectory.frames.length) throw new Error('轨迹没有可预演帧');
    const normalized = createFlTrajectory(trajectory);
    const startPose = copyJoints(currentJointsRad);
    this.cancelActive(false);
    this.approval = null;
    const generation = ++this.generation;
    this.session = {
      connectionId: connectionId.trim(),
      trajectory: normalized,
      fingerprint: fingerprint(normalized),
      startPose,
      startedAt: this.now(),
    };
    this.setState('moving_to_start');
    this.renderTick(generation);
    return { fingerprint: this.session.fingerprint, connectionId: this.session.connectionId };
  }

  renderTick(generation) {
    if (!this.session || generation !== this.generation) return;
    const elapsed = Math.max(0, this.now() - this.session.startedAt);
    const frames = this.session.trajectory.frames;
    let pose;
    let progress;
    const totalDurationMs = START_TRANSITION_MS + this.session.trajectory.durationMs;
    if (elapsed < START_TRANSITION_MS) {
      pose = interpolate(this.session.startPose, frames[0].jointsRad, elapsed / START_TRANSITION_MS);
      progress = { mode: 'preview', elapsedMs: elapsed, durationMs: totalDurationMs };
    } else {
      if (this.state === 'moving_to_start') this.setState('playing');
      const trajectoryElapsed = elapsed - START_TRANSITION_MS;
      pose = sampleFrames(frames, trajectoryElapsed);
      progress = { mode: 'preview', elapsedMs: START_TRANSITION_MS + Math.min(trajectoryElapsed, this.session.trajectory.durationMs), durationMs: totalDurationMs };
      if (trajectoryElapsed >= this.session.trajectory.durationMs) {
        this.onPose(pose);
        this.onProgress(progress);
        this.handle = null;
        this.setState('completed');
        return;
      }
    }
    this.onPose(pose);
    this.onProgress(progress);
    this.handle = this.schedule(() => this.renderTick(generation));
  }

  approve() {
    if (!this.session || !['moving_to_start', 'playing', 'completed'].includes(this.state)) {
      throw new Error('请先开始虚拟试播放');
    }
    const approval = Object.freeze({
      fingerprint: this.session.fingerprint,
      connectionId: this.session.connectionId,
    });
    this.approval = approval;
    this.cancelActive(true);
    this.setState('approved', approval);
    return approval;
  }

  stop() {
    this.approval = null;
    this.cancelActive(true);
    this.setState('stopped');
    return { status: 'stopped' };
  }

  revoke(reason = 'revoked') {
    this.approval = null;
    this.cancelActive(true);
    this.setState('idle', { reason });
  }

  disconnect() {
    this.approval = null;
    this.cancelActive(true);
    this.setState('disconnected');
  }

  isApproved({ trajectory, connectionId }) {
    if (!this.approval || typeof connectionId !== 'string') return false;
    try {
      return this.approval.connectionId === connectionId.trim()
        && this.approval.fingerprint === fingerprint(trajectory);
    } catch (_) {
      return false;
    }
  }

  cancelActive(restore) {
    this.generation += 1;
    if (this.handle !== null) this.cancel(this.handle);
    const hadSession = Boolean(this.session);
    this.handle = null;
    this.session = null;
    if (restore && hadSession) this.onRestore();
  }
}
