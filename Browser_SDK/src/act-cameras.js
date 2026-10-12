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
    try {
      this.streams.wrist = await this.#open(wristDeviceId, profile, '末端视角相机');
      this.streams.world = await this.#open(worldDeviceId, profile, '世界视角相机');
      return {
        ...this.streams,
        quality: {
          wrist: streamQuality(this.streams.wrist),
          world: streamQuality(this.streams.world),
        },
      };
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close() {
    stopStream(this.streams.wrist);
    stopStream(this.streams.world);
    this.streams = { wrist: null, world: null };
  }

  async #open(deviceId, profile, label) {
    let lastQuality = {};
    for (const [width, height, frameRate] of cameraModes(profile)) {
      try {
        const stream = await this.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { exact: width },
            height: { exact: height },
            frameRate: { ideal: frameRate },
          },
          audio: false,
        });
        lastQuality = streamQuality(stream);
        if (meetsMinimum(lastQuality)) return stream;
        stopStream(stream);
      } catch (error) {
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error.name)) throw error;
      }
    }

    const bootstrap = await this.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    });
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
