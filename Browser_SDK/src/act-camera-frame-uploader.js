const CAMERA_ROLES = ['wrist', 'world'];

function assertRole(role) {
  if (!CAMERA_ROLES.includes(role)) throw new RangeError('camera role must be wrist or world');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function freezeVideoFrame(video, environment = globalThis, metadata = {}) {
  const width = Number(video?.videoWidth || 0);
  const height = Number(video?.videoHeight || 0);
  if (!width || !height) throw new Error('真实视频帧尺寸不可用');
  if (typeof environment.VideoFrame === 'function') {
    try {
      const timestamp = Number.isFinite(Number(metadata.mediaTime)) ? Math.round(Number(metadata.mediaTime) * 1_000_000) : 0;
      return new environment.VideoFrame(video, { timestamp });
    } catch {}
  }
  const canvas = environment.createCanvas ? environment.createCanvas() : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('浏览器无法创建相机帧编码画布');
  context.drawImage(video, 0, 0, width, height);
  return canvas;
}

export async function encodeFrozenFrame(frame, quality = 0.85, environment = globalThis) {
  const ownedVideoFrame = typeof frame?.close === 'function';
  try {
    let blob;
    if (ownedVideoFrame && typeof environment.OffscreenCanvas === 'function') {
      const width = Number(frame.displayWidth || frame.codedWidth || 0);
      const height = Number(frame.displayHeight || frame.codedHeight || 0);
      const canvas = new environment.OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('浏览器无法创建离屏相机帧编码画布');
      context.drawImage(frame, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    } else {
      blob = await new Promise((resolve, reject) => {
        frame.toBlob(result => result ? resolve(result) : reject(new Error('相机帧 JPEG 编码失败')), 'image/jpeg', quality);
      });
    }
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  } finally {
    if (ownedVideoFrame) frame.close();
  }
}

export async function encodeVideoFrame(video, quality = 0.85) {
  return encodeFrozenFrame(freezeVideoFrame(video), quality);
}

export class CameraFrameUploader {
  constructor({ freeze = null, encode = encodeFrozenFrame, upload, batchSize = 6, maxQueue = 24, encodeConcurrency = 2, quality = 0.85 } = {}) {
    if (typeof upload !== 'function') throw new TypeError('upload function is required');
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize must be a positive integer');
    if (!Number.isInteger(maxQueue) || maxQueue < batchSize) throw new RangeError('maxQueue must be at least batchSize');
    if (!Number.isInteger(encodeConcurrency) || encodeConcurrency < 1) throw new RangeError('encodeConcurrency must be a positive integer');
    this.freeze = freeze || (encode === encodeFrozenFrame ? (video, _sequence, _width, _height, metadata) => freezeVideoFrame(video, globalThis, metadata) : video => video);
    this.encode = encode;
    this.upload = upload;
    this.batchSize = batchSize;
    this.maxQueue = maxQueue;
    this.encodeConcurrency = encodeConcurrency;
    this.quality = quality;
    this.reset();
  }

  reset() {
    this.episodeId = null;
    this.accepting = false;
    this.error = null;
    this.pendingByRole = { wrist: 0, world: 0 };
    this.sequences = { wrist: 0, world: 0 };
    this.frames = { wrist: 0, world: 0 };
    this.queues = { wrist: [], world: [] };
    this.encodeChains = { wrist: Promise.resolve(), world: Promise.resolve() };
    this.encodeWorkers = { wrist: 0, world: 0 };
    this.encodeQueues = { wrist: [], world: [] };
    this.encodeWork = new Set();
    this.uploadChains = { wrist: Promise.resolve(), world: Promise.resolve() };
    this.tasks = new Set();
  }

  start(episodeId) {
    if (!episodeId) throw new Error('Episode ID 不能为空');
    if (this.accepting || Object.values(this.pendingByRole).some(Boolean)) throw new Error('相机帧上传器仍在运行');
    this.reset();
    this.episodeId = String(episodeId);
    this.accepting = true;
    return this.snapshot();
  }

  snapshot() {
    return {
      active: this.accepting,
      episodeId: this.episodeId,
      pending: this.pendingByRole.wrist + this.pendingByRole.world,
      pendingByRole: { ...this.pendingByRole },
      frames: { ...this.frames },
      error: this.error?.message || null,
      ok: !this.error,
    };
  }

  scheduleEncode(role, frozenFrame) {
    let resolveJob;
    let rejectJob;
    const result = new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject; });
    this.encodeQueues[role].push({ frozenFrame, resolve: resolveJob, reject: rejectJob });
    this.pumpEncoders(role);
    return result;
  }

  pumpEncoders(role) {
    while (this.encodeWorkers[role] < this.encodeConcurrency && this.encodeQueues[role].length) {
      const job = this.encodeQueues[role].shift();
      this.encodeWorkers[role] += 1;
      const work = Promise.resolve().then(() => this.encode(job.frozenFrame, this.quality));
      this.encodeWork.add(work);
      work.then(job.resolve, job.reject).finally(() => {
        this.encodeWork.delete(work);
        this.encodeWorkers[role] -= 1;
        this.pumpEncoders(role);
      });
    }
  }

  capture(role, video, now, metadata = {}) {
    assertRole(role);
    if (!this.accepting || !this.episodeId) return Promise.reject(new Error('相机帧上传器未在采集'));
    if (this.error) return Promise.reject(this.error);
    if (this.pendingByRole[role] >= this.maxQueue) {
      const error = new Error(`${role} 相机上传队列已满`);
      this.error = error;
      return Promise.reject(error);
    }
    const width = Number(metadata.width || video?.videoWidth || 0);
    const height = Number(metadata.height || video?.videoHeight || 0);
    const presentedFrames = Number(metadata.presentedFrames || 0);
    const mediaTime = Number(metadata.mediaTime);
    if (!width || !height || !presentedFrames || !Number.isFinite(mediaTime) || !Number.isFinite(Number(now))) {
      return Promise.reject(new Error('缺少真实视频帧元数据'));
    }

    const sequence = ++this.sequences[role];
    let frozenFrame;
    try {
      frozenFrame = this.freeze(video, sequence, width, height, metadata);
    } catch (error) {
      this.error ||= error;
      return Promise.reject(error);
    }
    this.pendingByRole[role] += 1;
    const encoded = this.scheduleEncode(role, frozenFrame);
    encoded.catch(() => {});
    const encodeTask = this.encodeChains[role].then(async () => {
      let queued = false;
      try {
        const jpeg = await encoded;
        const frame = {
          sequence,
          captured_at_ms: Date.now(),
          monotonic_ms: Number(now),
          media_time: mediaTime,
          presented_frames: presentedFrames,
          width,
          height,
          jpeg_base64: jpeg,
        };
        this.queues[role].push(frame);
        queued = true;
        const uploadTask = this.queues[role].length >= this.batchSize ? this.flush(role) : null;
        return { frame, uploadTask };
      } catch (error) {
        if (!queued) this.pendingByRole[role] = Math.max(0, this.pendingByRole[role] - 1);
        this.error ||= error;
        throw error;
      }
    });
    this.encodeChains[role] = encodeTask;
    const task = encodeTask.then(async ({ frame, uploadTask }) => {
      if (uploadTask) await uploadTask;
      return frame;
    });
    this.tasks.add(task);
    task.finally(() => this.tasks.delete(task)).catch(() => {});
    return task;
  }

  async flush(role) {
    assertRole(role);
    if (!this.episodeId || !this.queues[role].length) return;
    const frames = this.queues[role].splice(0, this.batchSize);
    const releasePending = () => {
      this.pendingByRole[role] = Math.max(0, this.pendingByRole[role] - frames.length);
    };
    const uploadTask = this.uploadChains[role].then(async () => {
      try {
        await this.upload(this.episodeId, role, frames);
        this.frames[role] += frames.length;
        releasePending();
      } catch (error) {
        releasePending();
        this.error ||= error;
        throw error;
      }
    }, error => {
      releasePending();
      this.error ||= error;
      throw error;
    });
    this.uploadChains[role] = uploadTask;
    return uploadTask;
  }

  async stopAndDrain() {
    this.accepting = false;
    await Promise.allSettled(Object.values(this.encodeChains));
    await Promise.allSettled([...this.encodeWork]);
    for (const role of CAMERA_ROLES) {
      try {
        while (this.queues[role].length) await this.flush(role);
        await this.uploadChains[role];
      } catch (error) {
        this.error ||= error;
      }
    }
    const result = this.snapshot();
    result.active = false;
    return result;
  }
}
