function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

self.addEventListener('message', async event => {
  const { id, frame, quality = 0.85 } = event.data || {};
  try {
    const width = Number(frame?.displayWidth || frame?.codedWidth || 0);
    const height = Number(frame?.displayHeight || frame?.codedHeight || 0);
    if (!width || !height) throw new Error('真实视频帧尺寸不可用');
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建离屏相机帧编码画布');
    context.drawImage(frame, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const jpegBase64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    self.postMessage({ id, jpegBase64 });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  } finally {
    if (typeof frame?.close === 'function') frame.close();
  }
});
