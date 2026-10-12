const JOINT_COUNT = 7;
const CAMERA_ROLES = new Set(['wrist', 'world']);

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function joints(values) {
  if (!Array.isArray(values) || values.length !== JOINT_COUNT) throw new TypeError('quality sample must contain J1-J7 values');
  const normalized = values.map(Number);
  if (!normalized.every(Number.isFinite)) throw new TypeError('quality sample joints must be finite numbers');
  return normalized;
}

export class CaptureQualityMonitor {
  constructor({ windowSize = 250, goodMeanError = 2, retryMaxError = 8, maxSyncOffsetMs = 16, cameraWindowMs = 2000 } = {}) {
    this.windowSize = Math.max(1, Math.floor(windowSize));
    this.goodMeanError = Number(goodMeanError);
    this.retryMaxError = Number(retryMaxError);
    this.maxSyncOffsetMs = Number(maxSyncOffsetMs);
    this.cameraWindowMs = Math.max(250, Number(cameraWindowMs) || 2000);
    this.reset();
  }

  reset() {
    this.samples = [];
    this.cameras = { wrist: null, world: null };
  }

  resetTelemetry() { this.samples = []; }

  appendTelemetry(sample) {
    const action = joints(sample?.action);
    const state = joints(sample?.observation_state);
    const actionOffset = Number(sample?.action_offset_ms);
    const stateOffset = Number(sample?.state_offset_ms);
    if (![actionOffset, stateOffset].every(Number.isFinite)) throw new TypeError('quality sample offsets must be finite numbers');
    const errors = action.map((value, index) => Math.abs(value - state[index]));
    this.samples.push({ errors, syncOffsetMs: Math.abs(actionOffset - stateOffset) });
    if (this.samples.length > this.windowSize) this.samples.splice(0, this.samples.length - this.windowSize);
    return this.snapshot();
  }

  updateCamera(role, frame) {
    if (!CAMERA_ROLES.has(role)) throw new RangeError('camera role must be wrist or world');
    const nowMs = Number(frame?.nowMs);
    const presentedFrames = Number(frame?.presentedFrames);
    const width = Number(frame?.width);
    const height = Number(frame?.height);
    if (![nowMs, presentedFrames, width, height].every(Number.isFinite)) throw new TypeError('camera frame requires real nowMs, presentedFrames, width and height metadata');
    const previous = this.cameras[role];
    let fps = previous?.fps ?? null;
    let dropped = previous?.dropped ?? 0;
    const samples = [...(previous?.samples || []), { nowMs, presentedFrames }]
      .filter(sample => nowMs - sample.nowMs <= this.cameraWindowMs);
    if (previous && nowMs > previous.nowMs && presentedFrames > previous.presentedFrames) {
      const frameDelta = presentedFrames - previous.presentedFrames;
      dropped += Math.max(0, frameDelta - 1);
    }
    const first = samples[0];
    if (first && nowMs > first.nowMs && presentedFrames > first.presentedFrames) {
      fps = round((presentedFrames - first.presentedFrames) * 1000 / (nowMs - first.nowMs), 1);
    }
    this.cameras[role] = { nowMs, presentedFrames, width, height, fps, dropped, samples };
    return this.snapshot();
  }

  clearCamera(role) {
    if (!CAMERA_ROLES.has(role)) throw new RangeError('camera role must be wrist or world');
    this.cameras[role] = null;
  }

  snapshot() {
    if (!this.samples.length) return {
      status: 'waiting', sampleCount: 0, meanError: null, maxError: null,
      worstJoint: null, syncOffsetMs: null, cameras: this.#cameraSnapshot(),
    };
    const jointTotals = Array(JOINT_COUNT).fill(0);
    let maxError = 0;
    let syncOffsetMs = 0;
    let errorTotal = 0;
    for (const sample of this.samples) {
      sample.errors.forEach((error, index) => { jointTotals[index] += error; errorTotal += error; maxError = Math.max(maxError, error); });
      syncOffsetMs = Math.max(syncOffsetMs, sample.syncOffsetMs);
    }
    const meanError = errorTotal / (this.samples.length * JOINT_COUNT);
    const worstJoint = jointTotals.indexOf(Math.max(...jointTotals)) + 1;
    const status = meanError <= this.goodMeanError && maxError <= this.retryMaxError && syncOffsetMs <= this.maxSyncOffsetMs ? 'good' : 'retry';
    return {
      status, sampleCount: this.samples.length, meanError: round(meanError), maxError: round(maxError),
      worstJoint, syncOffsetMs: round(syncOffsetMs), cameras: this.#cameraSnapshot(),
    };
  }

  #cameraSnapshot() {
    return Object.fromEntries(Object.entries(this.cameras).map(([role, camera]) => [role, camera ? {
      fps: camera.fps, dropped: camera.dropped, width: camera.width, height: camera.height,
    } : null]));
  }
}
