import test from 'node:test';
import assert from 'node:assert/strict';

import { CameraFrameEncoderWorkerClient } from '../Browser_SDK/src/act-camera-frame-encoder-worker-client.js';

class FakeWorker {
  constructor() {
    this.messages = [];
    this.listeners = { message: [], error: [] };
    this.terminated = false;
  }

  addEventListener(type, listener) { this.listeners[type].push(listener); }
  postMessage(message, transfer) { this.messages.push({ message, transfer }); }
  emit(type, payload) { for (const listener of this.listeners[type]) listener(payload); }
  terminate() { this.terminated = true; }
}

test('worker encoder transfers VideoFrame ownership and resolves the matching JPEG', async () => {
  const worker = new FakeWorker();
  const client = new CameraFrameEncoderWorkerClient({ worker });
  const frame = { close() {} };
  const encoding = client.encode(frame, 0.85);
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].message.frame, frame);
  assert.deepEqual(worker.messages[0].transfer, [frame]);
  worker.emit('message', { data: { id: worker.messages[0].message.id, jpegBase64: 'real-jpeg' } });
  assert.equal(await encoding, 'real-jpeg');
});

test('worker encoder rejects one request without poisoning another request', async () => {
  const worker = new FakeWorker();
  const client = new CameraFrameEncoderWorkerClient({ worker });
  const first = client.encode({ close() {} }, 0.85);
  const second = client.encode({ close() {} }, 0.85);
  const [firstMessage, secondMessage] = worker.messages;
  worker.emit('message', { data: { id: firstMessage.message.id, error: 'encode failed' } });
  worker.emit('message', { data: { id: secondMessage.message.id, jpegBase64: 'jpeg-2' } });
  await assert.rejects(first, /encode failed/);
  assert.equal(await second, 'jpeg-2');
});

test('worker encoder termination rejects outstanding requests and terminates the worker', async () => {
  const worker = new FakeWorker();
  const client = new CameraFrameEncoderWorkerClient({ worker });
  const pending = client.encode({ close() {} }, 0.85);
  client.terminate();
  await assert.rejects(pending, /已关闭/);
  assert.equal(worker.terminated, true);
});
