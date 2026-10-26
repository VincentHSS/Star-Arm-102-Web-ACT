function stopStream(stream) {
  stream?.getTracks().forEach(track => track.stop());
}

function streamQuality(stream) {
  const settings = stream?.getVideoTracks?.()[0]?.getSettings?.() || {};
  return {
    width: settings.width,
    height: settings.height,
    frameRate: settings.frameRate,
  };
}

const MIN_PREVIEW = { width: 640, height: 360 };

function cameraModes(profile) {
  if (profile.strict) return [[profile.width, profile.height, profile.frameRate]];
  const modes = [
    [profile.width, profile.height, profile.frameRate],
    [profile.width, profile.height, 15],
  ];
  if (profile.width > 1280 || profile.height > 720) {
    modes.push([1280, 720, 30], [1280, 720, 15]);
  }
  modes.push([640, 480, 30], [640, 360, 30]);
  return modes.filter((mode, index) =>
    modes.findIndex(item => item.join(',') === mode.join(',')) === index
  );
}

function meetsMinimum(quality) {
  return quality.width >= MIN_PREVIEW.width && quality.height >= MIN_PREVIEW.height;
}

export class BrowserCameraController {
  constructor(mediaDevices) {
    this.mediaDevices = mediaDevices;
    this.streams = { wrist: null, world: null };
    this.generation = 0;
  }

  async requestPermissionAndList() {
    const permissionStream = await this.mediaDevices.getUserMedia({ video: true, audio: false });
    stopStream(permissionStream);
    const devices = await this.mediaDevices.enumerateDevices();
    return devices
      .filter(device => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        label: device.label || `摄像头 ${index + 1}`,
      }));
  }

  async openPair(wristDeviceId, worldDeviceId, profile = { width: 1920, height: 1080, frameRate: 30 }) {
    if (!wristDeviceId || !worldDeviceId) throw new Error('请先选择末端视角和世界视角摄像头');
    if (wristDeviceId === worldDeviceId) throw new Error('两路画面必须选择不同摄像头');
    this.close();
    const generation = this.generation;
    try {
      const labels = profile.labels || ['末端视角相机', '世界视角相机'];
      profile.onProgress?.(labels[0]);
      this.streams.wrist = await this.#open(wristDeviceId, profile, labels[0], generation);
      profile.onProgress?.(labels[1]);
      this.streams.world = await this.#open(worldDeviceId, profile, labels[1], generation);
      return {
        ...this.streams,
        quality: {
          wrist: streamQuality(this.streams.wrist),
          world: streamQuality(this.streams.world),
        },
      };
    } catch (error) {
      if (generation === this.generation) this.close();
      throw error;
    }
  }

  close() {
    ++this.generation;
    stopStream(this.streams.wrist);
    stopStream(this.streams.world);
    this.streams = { wrist: null, world: null };
  }

  async #requestMedia(constraints, profile, label, generation) {
    let timer, expired = false;
    const pending = this.mediaDevices.getUserMedia(constraints).then(stream => {
      if (expired || generation !== this.generation) { stopStream(stream); throw new Error(`${label}连接已取消`); }
      return stream;
    });
    try {
      if (!profile.timeoutMs) return await pending;
      return await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error(`${label}打开超过 ${profile.timeoutMs / 1000} 秒；请检查浏览器相机授权及设备占用后重试`)); }, profile.timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }

  async #open(deviceId, profile, label, generation) {
    let lastQuality = {};
    for (const [width, height, frameRate] of cameraModes(profile)) {
      try {
        const stream = await this.#requestMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { exact: width },
            height: { exact: height },
            frameRate: profile.strict ? { exact: frameRate } : { ideal: frameRate },
          },
          audio: false,
        }, profile, label, generation);
        lastQuality = streamQuality(stream);
        if (meetsMinimum(lastQuality) && (!profile.strict || (lastQuality.width === profile.width && lastQuality.height === profile.height && Math.abs(lastQuality.frameRate - profile.frameRate) < 0.1))) return stream;
        stopStream(stream);
      } catch (error) {
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)) throw error;
      }
    }

    if (profile.strict) throw new Error(`${label}无法提供模型要求的 ${profile.width}×${profile.height} / ${profile.frameRate} FPS；请检查相机设置、USB 连接及其他占用相机的软件`);

    const bootstrap = await this.#requestMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    }, profile, label, generation);
    const track = bootstrap.getVideoTracks?.()[0];
    try {
      if (track?.applyConstraints) {
        for (const [width, height, frameRate] of cameraModes(profile)) {
          try {
            await track.applyConstraints({
              width: { exact: width },
              height: { exact: height },
              frameRate: { ideal: frameRate },
            });
            lastQuality = streamQuality(bootstrap);
            if (meetsMinimum(lastQuality)) return bootstrap;
          } catch (error) {
            if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)) throw error;
          }
        }
      } else {
        lastQuality = streamQuality(bootstrap);
        if (meetsMinimum(lastQuality)) return bootstrap;
      }
    } catch (error) {
      stopStream(bootstrap);
      throw error;
    }
    lastQuality = streamQuality(bootstrap);
    stopStream(bootstrap);

    const actual = lastQuality.width && lastQuality.height
      ? `${lastQuality.width}×${lastQuality.height}`
      : '未获取有效画面';
    throw new Error(`${label}未达到最低 ${MIN_PREVIEW.width}×${MIN_PREVIEW.height}，实际 ${actual}`);
  }
}
