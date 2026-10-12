import test from 'node:test';
import assert from 'node:assert/strict';

import { CameraFrameUploader, encodeFrozenFrame, freezeVideoFrame } from '../Browser_SDK/src/act-camera-frame-uploader.js';

function metadata(presentedFrames) {
  return { mediaTime: presentedFrames / 30, presentedFrames, width: 640, height: 360 };
}

test('uploader batches real frames per camera and drains before stop completes', async () => {
  const uploads = [];
  const qualities = [];
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    maxQueue: 8,
    encode: async (_video, quality) => {
      qualities.push(quality);
      return 'jpeg-base64';
    },
    upload: async (episodeId, role, frames) => uploads.push({ episodeId, role, frames }),
  });

  uploader.start('episode-1');
  await Promise.all([
    uploader.capture('wrist', {}, 10, metadata(1)),
    uploader.capture('wrist', {}, 20, metadata(2)),
    uploader.capture('world', {}, 11, metadata(1)),
  ]);
  const result = await uploader.stopAndDrain();

  assert.deepEqual(qualities, [0.85, 0.85, 0.85]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.frames, { wrist: 2, world: 1 });
  assert.equal(result.pending, 0);
  assert.deepEqual(uploads.map(item => [item.role, item.frames.map(frame => frame.sequence)]), [
    ['wrist', [1, 2]],
    ['world', [1]],
  ]);
  assert.equal(uploads[0].frames[0].jpeg_base64, 'jpeg-base64');
  assert.equal(uploads[0].frames[0].monotonic_ms, 10);
});

test('uploader exposes upload failure and blocks successful drain', async () => {
  const uploader = new CameraFrameUploader({
    batchSize: 1,
    encode: async () => 'jpeg-base64',
    upload: async () => { throw new Error('disk full'); },
  });
  uploader.start('episode-2');
  await assert.rejects(uploader.capture('wrist', {}, 10, metadata(1)), /disk full/);
  const result = await uploader.stopAndDrain();
  assert.equal(result.ok, false);
  assert.equal(result.pending, 0);
  assert.match(result.error, /disk full/);
});

test('uploader applies bounded backpressure and rejects frames after stop', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const uploader = new CameraFrameUploader({
    batchSize: 1,
    maxQueue: 1,
    encode: async () => { await blocked; return 'jpeg-base64'; },
    upload: async () => {},
  });
  uploader.start('episode-3');
  const first = uploader.capture('wrist', {}, 10, metadata(1));
  await assert.rejects(uploader.capture('wrist', {}, 20, metadata(2)), /队列已满/);
  release();
  await first;
  await uploader.stopAndDrain();
  await assert.rejects(uploader.capture('wrist', {}, 30, metadata(3)), /未在采集/);
});

test('uploader requires requestVideoFrameCallback metadata dimensions', async () => {
  const uploader = new CameraFrameUploader({ encode: async () => 'jpeg', upload: async () => {} });
  uploader.start('episode-4');
  await assert.rejects(uploader.capture('wrist', {}, 10, { presentedFrames: 1 }), /视频帧元数据/);
  await uploader.stopAndDrain();
});

test('uploader preserves callback sequence when JPEG encoding durations differ', async () => {
  const releases = [];
  const uploads = [];
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    encodeConcurrency: 1,
    encode: async () => new Promise(resolve => releases.push(resolve)),
    upload: async (_episodeId, _role, frames) => uploads.push(frames.map(frame => frame.sequence)),
  });
  uploader.start('episode-5');
  const first = uploader.capture('wrist', {}, 10, metadata(1));
  const second = uploader.capture('wrist', {}, 20, metadata(2));
  await Promise.resolve();
  assert.equal(releases.length, 1);
  releases[0]('jpeg-1');
  await first;
  assert.equal(releases.length, 2);
  releases[1]('jpeg-2');
  await second;
  await uploader.stopAndDrain();
  assert.deepEqual(uploads, [[1, 2]]);
});

test('blocked batch upload does not block encoding the next batch', async () => {
  let releaseUpload;
  const blockedUpload = new Promise(resolve => { releaseUpload = resolve; });
  let encoded = 0;
  let signalAllEncoded;
  const allEncoded = new Promise(resolve => { signalAllEncoded = resolve; });
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    maxQueue: 6,
    encode: async () => {
      encoded += 1;
      if (encoded === 4) signalAllEncoded();
      return `jpeg-${encoded}`;
    },
    upload: async () => { await blockedUpload; },
  });
  uploader.start('episode-6');

  const captures = [1, 2, 3, 4].map(index => uploader.capture('world', {}, index * 10, metadata(index)));
  await allEncoded;
  assert.equal(encoded, 4);

  releaseUpload();
  await Promise.all(captures);
  const result = await uploader.stopAndDrain();
  assert.equal(result.ok, true);
  assert.equal(result.frames.world, 4);
});

test('each camera has an independent bounded queue', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    maxQueue: 2,
    encode: async () => { await blocked; return 'jpeg'; },
    upload: async () => {},
  });
  uploader.start('episode-7');

  const wrist = [
    uploader.capture('wrist', {}, 10, metadata(1)),
    uploader.capture('wrist', {}, 20, metadata(2)),
  ];
  const world = uploader.capture('world', {}, 11, metadata(1));
  await Promise.resolve();
  assert.equal(uploader.snapshot().pendingByRole.wrist, 2);
  assert.equal(uploader.snapshot().pendingByRole.world, 1);

  release();
  await Promise.all([...wrist, world]);
  const result = await uploader.stopAndDrain();
  assert.deepEqual(result.frames, { wrist: 2, world: 1 });
});

test('failed first batch releases later queued batches without hiding the error', async () => {
  let uploadAttempts = 0;
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    maxQueue: 6,
    encode: async () => 'jpeg',
    upload: async () => {
      uploadAttempts += 1;
      throw new Error('network down');
    },
  });
  uploader.start('episode-8');

  await Promise.allSettled([1, 2, 3, 4].map(index => uploader.capture('world', {}, index * 10, metadata(index))));
  const result = await uploader.stopAndDrain();
  assert.equal(result.ok, false);
  assert.equal(result.pending, 0);
  assert.equal(uploadAttempts, 1);
  assert.match(result.error, /network down/);
});

test('capture freezes each callback frame before asynchronous JPEG encoding starts', async () => {
  const frozen = [];
  const encoded = [];
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const uploader = new CameraFrameUploader({
    batchSize: 2,
    maxQueue: 4,
    encodeConcurrency: 2,
    freeze: video => {
      const frame = `frozen-${video.currentFrame}`;
      frozen.push(frame);
      return frame;
    },
    encode: async frame => {
      encoded.push(frame);
      if (frame === 'frozen-1') await firstBlocked;
      return `jpeg-${frame}`;
    },
    upload: async () => {},
  });
  uploader.start('episode-freeze');
  const video = { currentFrame: 1 };
  const first = uploader.capture('wrist', video, 10, metadata(1));
  video.currentFrame = 2;
  const second = uploader.capture('wrist', video, 20, metadata(2));

  await Promise.resolve();
  assert.deepEqual(frozen, ['frozen-1', 'frozen-2']);
  assert.deepEqual(encoded, ['frozen-1', 'frozen-2']);
  releaseFirst();
  await Promise.all([first, second]);
  await uploader.stopAndDrain();
});

test('concurrent encoders still upload completed frames in callback sequence order', async () => {
  const releases = new Map();
  const uploads = [];
  const uploader = new CameraFrameUploader({
    batchSize: 3,
    maxQueue: 6,
    encodeConcurrency: 3,
    freeze: (_video, sequence) => sequence,
    encode: sequence => new Promise(resolve => releases.set(sequence, resolve)),
    upload: async (_episodeId, _role, frames) => uploads.push(frames.map(frame => frame.sequence)),
  });
  uploader.start('episode-order');
  const captures = [1, 2, 3].map(index => uploader.capture('world', {}, index * 10, metadata(index)));
  await Promise.resolve();
  assert.equal(releases.size, 3);
  releases.get(3)('jpeg-3');
  releases.get(2)('jpeg-2');
  releases.get(1)('jpeg-1');
  await Promise.all(captures);
  await uploader.stopAndDrain();
  assert.deepEqual(uploads, [[1, 2, 3]]);
});

test('modern browser freeze takes lightweight VideoFrame ownership without callback-time canvas drawing', () => {
  let drawCalls = 0;
  class FakeVideoFrame {
    constructor(video) {
      this.source = video;
      this.codedWidth = video.videoWidth;
      this.codedHeight = video.videoHeight;
    }
  }
  const frame = freezeVideoFrame(
    { videoWidth: 640, videoHeight: 360 },
    { VideoFrame: FakeVideoFrame, createCanvas: () => ({ getContext: () => ({ drawImage: () => { drawCalls += 1; } }) }) },
  );
  assert.ok(frame instanceof FakeVideoFrame);
  assert.equal(drawCalls, 0);
});

test('modern browser encoding uses OffscreenCanvas and releases the owned VideoFrame', async () => {
  let closeCalls = 0;
  let drawnSource = null;
  const frame = { codedWidth: 640, codedHeight: 360, close: () => { closeCalls += 1; } };
  class FakeOffscreenCanvas {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage: source => { drawnSource = source; } }; }
    async convertToBlob({ type, quality }) {
      assert.equal(type, 'image/jpeg');
      assert.equal(quality, 0.85);
      return { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
    }
  }
  const originalBtoa = globalThis.btoa;
  globalThis.btoa = value => value;
  try {
    const jpeg = await encodeFrozenFrame(frame, 0.85, { OffscreenCanvas: FakeOffscreenCanvas });
    assert.equal(drawnSource, frame);
    assert.equal(closeCalls, 1);
    assert.equal(jpeg.length, 3);
  } finally {
    globalThis.btoa = originalBtoa;
  }
});

test('failed OffscreenCanvas encoding still releases the owned VideoFrame', async () => {
  let closeCalls = 0;
  const frame = { codedWidth: 640, codedHeight: 360, close: () => { closeCalls += 1; } };
  class BrokenOffscreenCanvas {
    getContext() { return { drawImage: () => {} }; }
    async convertToBlob() { throw new Error('encode failed'); }
  }
  await assert.rejects(
    encodeFrozenFrame(frame, 0.85, { OffscreenCanvas: BrokenOffscreenCanvas }),
    /encode failed/,
  );
  assert.equal(closeCalls, 1);
});
