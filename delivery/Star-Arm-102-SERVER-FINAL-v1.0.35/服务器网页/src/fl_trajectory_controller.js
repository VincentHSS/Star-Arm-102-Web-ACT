import {
  FL_TRAJECTORY_MAX_DURATION_MS,
  appendFlFrame,
  createFlTrajectory,
  finalizeFlTrajectory,
  normalizeFlTrajectoryJoints,
  validateFlTrajectory,
} from './fl_trajectory_model.js?v=server-1.0.35';
import { AngleFilter } from './teleop_controller.js?v=server-1.0.35';

const noop = () => {};
const asyncNoop = async () => {};
const defaultWaitUntil = (deadline) => new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - performance.now())));
const START_TRANSITION_MS = 2000;
const PLAYBACK_COMMAND_INTERVAL_MS = 100;
const DEFAULT_PLAYBACK_UPDATE_INTERVAL_MS = 100;
const RECORDING_FILTER_WINDOW = 30;
const copyJoints = (value) => {
  if (!Array.isArray(value) || value.length !== 7 || !value.every(Number.isFinite)) throw new TypeError('必须提供 FL 的 7 个有效关节角');
  return [...value];
};
const copyTrajectory = (value) => createFlTrajectory(value);

function sampleFrames(frames, elapsedMs) {
  if (elapsedMs <= frames[0].t) return [...frames[0].jointsRad];
  const last = frames.at(-1);
  if (elapsedMs >= last.t) return [...last.jointsRad];
  let low = 1;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].t < elapsedMs) low = middle + 1;
    else high = middle;
  }
  const upperIndex = low;
  const lower = frames[upperIndex - 1];
  const upper = frames[upperIndex];
  const ratio = (elapsedMs - lower.t) / Math.max(1, upper.t - lower.t);
  return lower.jointsRad.map((value, index) => value + (upper.jointsRad[index] - value) * ratio);
}

export class FlTrajectoryController {
  constructor({
    store,
    now = () => performance.now(),
    pauseSampling = asyncNoop,
    resumeSampling = noop,
    currentJoints = () => null,
    writeFrame = asyncNoop,
    releaseTorque = asyncNoop,
    waitUntil = defaultWaitUntil,
    playbackUpdateIntervalMs = DEFAULT_PLAYBACK_UPDATE_INTERVAL_MS,
    connectionSnapshot = () => ({ connectionId: null, connected: false }),
    onStateChange = noop,
    onProgress = noop,
  } = {}) {
    if (!store?.save) throw new TypeError('轨迹控制器必须注入存储仓库');
    this.store = store;
    this.now = now;
    this.pauseSampling = pauseSampling;
    this.resumeSampling = resumeSampling;
    this.currentJoints = currentJoints;
    this.writeFrame = writeFrame;
    this.releaseTorque = releaseTorque;
    this.waitUntil = waitUntil;
    if (!Number.isInteger(playbackUpdateIntervalMs) || playbackUpdateIntervalMs < 1 || playbackUpdateIntervalMs > PLAYBACK_COMMAND_INTERVAL_MS) {
      throw new RangeError('playbackUpdateIntervalMs 必须是 1–100 ms 的整数');
    }
    this.playbackUpdateIntervalMs = playbackUpdateIntervalMs;
    this.connectionSnapshot = connectionSnapshot;
    this.onStateChange = onStateChange;
    this.onProgress = onProgress;
    this.state = 'disconnected';
    this.recording = null;
    this.currentTrajectory = null;
    this.pending = null;
    this.execution = null;
    this.activePlaybackGeneration = null;
    this.activeConnectionId = null;
    this.activeConnectionToken = undefined;
    this.generation = 0;
    this.emergency = false;
    this.waitInterrupts = new Set();
    this.lastTorqueReleaseGeneration = null;
    this.lastTorqueReleaseConnectionId = null;
    this.lastTorqueReleaseConnectionToken = undefined;
    this.torqueReleaseGeneration = null;
    this.torqueReleaseConnectionId = null;
    this.torqueReleaseConnectionToken = undefined;
    this.torqueReleasePromise = null;
    this.heldPlaybackGeneration = null;
    this.heldConnectionId = null;
    this.heldConnectionToken = undefined;
    this.disconnectedPlaybackGeneration = null;
  }

  setState(state, detail = null) {
    this.state = state;
    this.onStateChange({ state, detail });
  }

  startRecording({ name, connectionId, sessionState, initialJointsRad }) {
    if (this.recording) throw new Error('轨迹正在录制');
    if (this.execution) throw new Error('轨迹正在回放');
    if (this.state === 'holding') throw new Error('当前实机仍保持力矩，请先卸力');
    if (this.state === 'releasing') throw new Error('轨迹正在卸力');
    if (typeof connectionId !== 'string' || connectionId.trim() === '') throw new Error('请先连接真实 FL');
    if (sessionState !== 'manual_readback') throw new Error('FL 必须处于卸力实时回读状态');
    const initial = normalizeFlTrajectoryJoints(initialJointsRad);
    const filter = new AngleFilter(RECORDING_FILTER_WINDOW);
    const filteredInitial = filter.push(initial);
    const startedAt = this.now();
    const trajectory = createFlTrajectory({ name, createdAt: new Date().toISOString() });
    const appended = appendFlFrame(trajectory, { t: 0, jointsRad: filteredInitial });
    this.recording = {
      connectionId: connectionId.trim(),
      startedAt,
      trajectory: appended.trajectory,
      latestJoints: filteredInitial,
      latestRawJoints: initial,
      filter,
    };
    this.emergency = false;
    this.setState('recording');
    return copyTrajectory(this.recording.trajectory);
  }

  acceptReadback({ connectionId, jointsRad }) {
    const session = this.recording;
    if (!session || connectionId !== session.connectionId) return false;
    const copied = normalizeFlTrajectoryJoints(jointsRad);
    const filtered = session.filter.push(copied);
    const elapsed = Math.max(0, this.now() - session.startedAt);
    session.latestRawJoints = copied;
    session.latestJoints = filtered;
    const result = appendFlFrame(session.trajectory, { t: elapsed, jointsRad: filtered });
    session.trajectory = result.trajectory;
    if (result.limitReached || elapsed >= FL_TRAJECTORY_MAX_DURATION_MS) {
      void this.stopRecording({ connectionId, finalJointsRad: copied })
        .catch((error) => {
          try { this.setState('fault', error); }
          catch (_) {}
        });
    }
    if (result.appended) this.onProgress({ mode: 'recording', trajectory: copyTrajectory(session.trajectory) });
    return result.appended;
  }

  async stopRecording({ connectionId, finalJointsRad, interrupted = false } = {}) {
    const session = this.recording;
    if (!session) throw new Error('当前没有正在录制的轨迹');
    if (!interrupted && connectionId !== session.connectionId) throw new Error('真实 FL 连接身份已变化');
    this.recording = null;
    const elapsed = Math.min(FL_TRAJECTORY_MAX_DURATION_MS, Math.max(0, this.now() - session.startedAt));
    let finalJoints = session.latestJoints;
    if (finalJointsRad) {
      const copied = normalizeFlTrajectoryJoints(finalJointsRad);
      const matchesLatestRaw = copied.every((value, index) => value === session.latestRawJoints[index]);
      finalJoints = matchesLatestRaw ? session.latestJoints : session.filter.push(copied);
    }
    const trajectory = finalizeFlTrajectory(session.trajectory, { t: elapsed, jointsRad: finalJoints }, { interrupted });
    const saved = await this.store.save(trajectory);
    this.currentTrajectory = copyTrajectory(trajectory);
    this.setState(interrupted ? 'interrupted' : 'ready', saved);
    return { trajectory: copyTrajectory(trajectory), ...saved };
  }

  async handleDisconnect({ connectionId } = {}) {
    const playbackGeneration = this.heldPlaybackGeneration ?? this.activePlaybackGeneration ?? this.generation;
    const playbackConnectionId = this.heldConnectionId ?? this.activeConnectionId ?? connectionId;
    const initialSnapshot = this.connectionSnapshot();
    const playbackConnectionToken = this.heldConnectionToken ?? this.activeConnectionToken ?? initialSnapshot.connectionToken;
    this.disconnectedPlaybackGeneration = playbackGeneration;
    this.generation += 1;
    this.interruptScheduledWaits();
    this.pending = null;
    if (this.recording && (!connectionId || connectionId === this.recording.connectionId)) {
      await this.stopRecording({ connectionId: this.recording.connectionId, interrupted: true });
    }
    const execution = this.execution;
    let executionError = null;
    if (execution) {
      try { await execution; }
      catch (cause) { executionError = cause; }
    }
    const snapshot = this.connectionSnapshot();
    if (
      playbackConnectionId
      && snapshot.connected
      && (
        snapshot.connectionId !== playbackConnectionId
        || (playbackConnectionToken !== undefined && snapshot.connectionToken !== playbackConnectionToken)
      )
    ) {
      const cause = new Error('真实 FL 连接身份已变化，未发送卸力');
      this.setState('fault', cause);
      throw cause;
    }
    if (
      !executionError
      && playbackConnectionId
      && snapshot.connected
      && snapshot.connectionId === playbackConnectionId
      && (playbackConnectionToken === undefined || snapshot.connectionToken === playbackConnectionToken)
    ) {
      try {
        await this.releaseForGeneration(playbackGeneration, playbackConnectionId, playbackConnectionToken);
      } catch (cause) {
        this.setState('fault', cause);
        throw new Error(`断连卸力失败：${cause.message}`, { cause });
      }
    }
    if (executionError) {
      this.setState('fault', executionError);
      throw executionError;
    }
    this.clearHeldPlayback();
    this.setState('disconnected');
  }

  preparePlayback({ trajectory, connectionId }) {
    if (this.execution) throw new Error('轨迹正在回放');
    if (this.state === 'holding') throw new Error('当前实机仍保持力矩，请先卸力');
    if (this.state === 'releasing') throw new Error('轨迹正在卸力');
    if (this.recording) throw new Error('请先停止录制');
    if (typeof connectionId !== 'string' || connectionId.trim() === '') throw new Error('请先连接真实 FL');
    const validation = validateFlTrajectory(trajectory);
    if (!validation.valid) throw new TypeError(validation.errors.join('; '));
    if (trajectory.frames.length === 0) throw new Error('轨迹没有可执行帧');
    const frozenFrames = trajectory.frames.map((frame) => Object.freeze({ t: frame.t, jointsRad: Object.freeze([...frame.jointsRad]) }));
    const snapshot = this.connectionSnapshot();
    if (!snapshot.connected || snapshot.connectionId !== connectionId.trim()) throw new Error('真实 FL 连接身份已变化，请重新确认');
    const pending = Object.freeze({
      id: globalThis.crypto?.randomUUID?.() ?? `fl-playback-${Date.now()}`,
      connectionId: connectionId.trim(),
      connectionToken: snapshot.connectionToken,
      trajectory: Object.freeze({ ...copyTrajectory(trajectory), frames: Object.freeze(frozenFrames) }),
    });
    this.pending = pending;
    this.setState('pending_confirmation');
    return pending;
  }

  confirmPlayback({ pending, connectionId }) {
    if (this.execution) return Promise.reject(new Error('轨迹正在回放'));
    if (!pending || pending !== this.pending) return Promise.reject(new Error('轨迹确认已失效，请重新生成'));
    if (connectionId !== pending.connectionId) return Promise.reject(new Error('真实 FL 连接身份已变化，请重新确认'));
    const snapshot = this.connectionSnapshot();
    if (
      !snapshot.connected
      || snapshot.connectionId !== pending.connectionId
      || (pending.connectionToken !== undefined && snapshot.connectionToken !== pending.connectionToken)
    ) return Promise.reject(new Error('真实 FL 连接身份已变化，请重新确认'));
    const generation = ++this.generation;
    this.activePlaybackGeneration = generation;
    this.activeConnectionId = pending.connectionId;
    this.activeConnectionToken = pending.connectionToken;
    this.emergency = false;
    this.pending = null;
    this.setState('moving_to_start');
    const execution = this.executePlayback(pending, generation);
    this.execution = execution;
    execution.finally(() => {
      if (this.execution === execution) this.execution = null;
      if (this.activePlaybackGeneration === generation) {
        this.activePlaybackGeneration = null;
        this.activeConnectionId = null;
        this.activeConnectionToken = undefined;
      }
    }).catch(noop);
    return execution;
  }

  active(generation, connectionId, connectionToken) {
    const snapshot = this.connectionSnapshot();
    return generation === this.generation
      && !this.emergency
      && snapshot.connected
      && snapshot.connectionId === connectionId
      && (connectionToken === undefined || snapshot.connectionToken === connectionToken);
  }

  interruptScheduledWaits() {
    for (const resolve of this.waitInterrupts) resolve();
    this.waitInterrupts.clear();
  }

  async waitForDeadline(deadline) {
    let interrupt;
    const interrupted = new Promise((resolve) => { interrupt = resolve; });
    this.waitInterrupts.add(interrupt);
    try {
      await Promise.race([this.waitUntil(deadline), interrupted]);
    } finally {
      this.waitInterrupts.delete(interrupt);
    }
  }

  clearHeldPlayback() {
    this.heldPlaybackGeneration = null;
    this.heldConnectionId = null;
    this.heldConnectionToken = undefined;
  }

  releaseForGeneration(generation, connectionId, connectionToken) {
    const tokenMatches = (snapshot) => connectionToken === undefined || snapshot.connectionToken === connectionToken;
    const matches = () => {
      const snapshot = this.connectionSnapshot();
      return snapshot.connected && snapshot.connectionId === connectionId && tokenMatches(snapshot);
    };
    if (!connectionId || !matches()) return Promise.reject(new Error('真实 FL 连接身份已变化，未发送卸力'));
    if (
      this.lastTorqueReleaseGeneration === generation
      && this.lastTorqueReleaseConnectionId === connectionId
      && this.lastTorqueReleaseConnectionToken === connectionToken
    ) return Promise.resolve();
    if (
      this.torqueReleasePromise
      && this.torqueReleaseGeneration === generation
      && this.torqueReleaseConnectionId === connectionId
      && this.torqueReleaseConnectionToken === connectionToken
    ) return this.torqueReleasePromise;
    const releasing = Promise.resolve().then(() => {
      if (!matches()) throw new Error('真实 FL 连接身份已变化，未发送卸力');
      return this.releaseTorque(connectionId, connectionToken);
    });
    this.torqueReleaseGeneration = generation;
    this.torqueReleaseConnectionId = connectionId;
    this.torqueReleaseConnectionToken = connectionToken;
    this.torqueReleasePromise = releasing;
    releasing.then(() => {
      this.lastTorqueReleaseGeneration = generation;
      this.lastTorqueReleaseConnectionId = connectionId;
      this.lastTorqueReleaseConnectionToken = connectionToken;
    }).finally(() => {
      if (this.torqueReleasePromise === releasing) {
        this.torqueReleasePromise = null;
        this.torqueReleaseGeneration = null;
        this.torqueReleaseConnectionId = null;
        this.torqueReleaseConnectionToken = undefined;
      }
    }).catch(noop);
    return releasing;
  }

  canRetryTorqueRelease() {
    return this.state === 'fault' && this.heldPlaybackGeneration !== null && Boolean(this.heldConnectionId);
  }

  async releasePlaybackTorque() {
    const mayRelease = this.state === 'holding' || this.canRetryTorqueRelease();
    if (!mayRelease || this.heldPlaybackGeneration === null || !this.heldConnectionId) {
      throw new Error('当前没有等待卸力的实机回放');
    }
    const generation = this.heldPlaybackGeneration;
    const connectionId = this.heldConnectionId;
    const connectionToken = this.heldConnectionToken;
    this.setState('releasing');
    try {
      await this.releaseForGeneration(generation, connectionId, connectionToken);
    } catch (cause) {
      this.setState('fault', cause);
      throw new Error(`轨迹卸力失败：${cause.message}`, { cause });
    }
    const snapshot = this.connectionSnapshot();
    const mayResume = !this.emergency
      && this.state === 'releasing'
      && this.heldPlaybackGeneration === generation
      && this.disconnectedPlaybackGeneration !== generation
      && snapshot.connected
      && snapshot.connectionId === connectionId
      && (connectionToken === undefined || snapshot.connectionToken === connectionToken);
    this.clearHeldPlayback();
    if (!mayResume) return { status: this.state };
    this.resumeSampling();
    this.setState('ready');
    return { status: 'ready' };
  }

  async executePlayback(pending, generation) {
    const connectionId = pending.connectionId;
    const connectionToken = pending.connectionToken;
    let paused = false;
    let framesWritten = 0;
    let completed = false;
    let playbackError = null;
    try {
      if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten: 0 };
      await this.pauseSampling();
      paused = true;
      if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten: 0 };
      copyJoints(this.currentJoints());
      const frames = pending.trajectory.frames;
      const trajectoryDurationMs = frames.at(-1).t;
      const totalDurationMs = START_TRANSITION_MS + trajectoryDurationMs;
      this.onProgress({ mode: 'playing', elapsedMs: 0, durationMs: totalDurationMs });
      await this.writeFrame([...frames[0].jointsRad], START_TRANSITION_MS, connectionId, connectionToken);
      const startDeadline = this.now() + START_TRANSITION_MS;
      if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten: 0 };
      for (let elapsedMs = PLAYBACK_COMMAND_INTERVAL_MS; elapsedMs <= START_TRANSITION_MS; elapsedMs += PLAYBACK_COMMAND_INTERVAL_MS) {
        await this.waitForDeadline(startDeadline - START_TRANSITION_MS + elapsedMs);
        if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten: 0 };
        this.onProgress({ mode: 'playing', elapsedMs, durationMs: totalDurationMs });
      }
      this.setState('playing');
      let previousCommandTimeMs = 0;
      let commandTimeMs = this.playbackUpdateIntervalMs;
      while (commandTimeMs <= trajectoryDurationMs) {
        if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten };
        // Keep a 100 ms servo motion window while refreshing its target at the
        // teleoperation cadence, so overlapping commands do not repeatedly stop
        // and restart the arm at every historical trajectory sample.
        const durationMs = PLAYBACK_COMMAND_INTERVAL_MS;
        await this.writeFrame(sampleFrames(frames, commandTimeMs), durationMs, connectionId, connectionToken);
        framesWritten += 1;
        previousCommandTimeMs = commandTimeMs;
        this.onProgress({ mode: 'playing', elapsedMs: START_TRANSITION_MS + commandTimeMs, durationMs: totalDurationMs });
        if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten };
        await this.waitForDeadline(startDeadline + commandTimeMs);
        if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten };
        const observedTimeMs = Math.max(commandTimeMs, this.now() - startDeadline);
        commandTimeMs = Math.max(
          commandTimeMs + this.playbackUpdateIntervalMs,
          (Math.floor(observedTimeMs / this.playbackUpdateIntervalMs) + 1) * this.playbackUpdateIntervalMs,
        );
      }
      if (previousCommandTimeMs < trajectoryDurationMs) {
        const remainingMs = trajectoryDurationMs - previousCommandTimeMs;
        const durationMs = this.playbackUpdateIntervalMs < PLAYBACK_COMMAND_INTERVAL_MS
          ? PLAYBACK_COMMAND_INTERVAL_MS
          : remainingMs;
        await this.writeFrame(sampleFrames(frames, trajectoryDurationMs), durationMs, connectionId, connectionToken);
        framesWritten += 1;
        this.onProgress({ mode: 'playing', elapsedMs: totalDurationMs, durationMs: totalDurationMs });
        await this.waitForDeadline(startDeadline + trajectoryDurationMs);
        if (!this.active(generation, connectionId, connectionToken)) return { status: 'stopped', framesWritten };
      }
      completed = true;
      return { status: 'completed', framesWritten };
    } catch (cause) {
      playbackError = new Error(`轨迹回放写入失败：${cause.message}`, { cause });
      this.setState('fault', playbackError);
      throw playbackError;
    } finally {
      if (paused && !this.emergency) {
        const snapshot = this.connectionSnapshot();
        const sameConnection = snapshot.connected
          && snapshot.connectionId === connectionId
          && (connectionToken === undefined || snapshot.connectionToken === connectionToken);
        const disconnected = this.disconnectedPlaybackGeneration === generation;
        if (this.state === 'fault' || disconnected || !sameConnection) {
          try {
            if (sameConnection) await this.releaseForGeneration(generation, connectionId, connectionToken);
          } catch (cause) {
            const releaseError = new Error(`轨迹卸力失败：${cause.message}`, { cause });
            const combined = playbackError
              ? new AggregateError(
                [playbackError, releaseError],
                `${playbackError.message}；${releaseError.message}`,
              )
              : releaseError;
            this.setState('fault', combined);
            throw combined;
          }
        } else {
          this.heldPlaybackGeneration = generation;
          this.heldConnectionId = connectionId;
          this.heldConnectionToken = connectionToken;
          this.setState('holding', { completed });
        }
      }
    }
  }

  async stopPlayback() {
    this.generation += 1;
    this.interruptScheduledWaits();
    this.pending = null;
    const execution = this.execution;
    if (execution) await execution;
    if (this.state === 'holding') return { status: 'holding' };
    const snapshot = this.connectionSnapshot();
    this.setState(snapshot.connected ? 'stopped' : 'disconnected');
    return { status: 'stopped' };
  }

  async emergencyStop() {
    const initialSnapshot = this.connectionSnapshot();
    const playbackGeneration = this.heldPlaybackGeneration ?? this.activePlaybackGeneration ?? this.generation;
    const playbackConnectionId = this.heldConnectionId ?? this.activeConnectionId ?? initialSnapshot.connectionId;
    const playbackConnectionToken = this.heldConnectionToken ?? this.activeConnectionToken ?? initialSnapshot.connectionToken;
    this.emergency = true;
    this.generation += 1;
    this.interruptScheduledWaits();
    this.pending = null;
    this.recording = null;
    this.setState('fault');
    const execution = this.execution;
    if (execution) await execution.catch(noop);
    const snapshot = this.connectionSnapshot();
    if (
      snapshot.connected
      && snapshot.connectionId === playbackConnectionId
      && (playbackConnectionToken === undefined || snapshot.connectionToken === playbackConnectionToken)
    ) {
      try {
        await this.releaseForGeneration(playbackGeneration, playbackConnectionId, playbackConnectionToken);
      } catch (cause) {
        this.setState('fault', cause);
        throw new Error(`急停卸力失败：${cause.message}`, { cause });
      }
    }
    this.clearHeldPlayback();
    return { status: 'fault' };
  }
}
