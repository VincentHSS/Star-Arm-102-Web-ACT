export class CameraFrameEncoderWorkerClient {
  constructor({ worker = null, workerUrl = new URL('./act-camera-frame-encoder-worker.js?v=server-1.0.35', import.meta.url) } = {}) {
    this.worker = worker || new Worker(workerUrl, { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.closed = false;
    this.worker.addEventListener('message', event => this.handleMessage(event.data || {}));
    this.worker.addEventListener('error', event => this.failAll(new Error(event.message || '相机 JPEG 编码 Worker 失败')));
  }

  encode(frame, quality = 0.85) {
    if (this.closed) return Promise.reject(new Error('相机 JPEG 编码 Worker 已关闭'));
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    try {
      this.worker.postMessage({ id, frame, quality }, [frame]);
    } catch (error) {
      this.pending.delete(id);
      if (typeof frame?.close === 'function') frame.close();
      return Promise.reject(error);
    }
    return result;
  }

  handleMessage(message) {
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.jpegBase64);
  }

  failAll(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  terminate() {
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error('相机 JPEG 编码 Worker 已关闭'));
    this.worker.terminate();
  }
}
