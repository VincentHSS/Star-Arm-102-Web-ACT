export function effectiveCameraBackend(selection, nativeDevices = []) {
  return selection === 'auto' ? (nativeDevices.length >= 2 ? 'native' : 'browser') : selection;
}
export function nativeCameraReady(camera) {
  return camera?.status === 'streaming' && ['wrist', 'world'].every(role => Boolean(camera.roles?.[role]));
}
export function browserCameraLive(stream) {
  return Boolean(stream?.getVideoTracks?.().some(track => track.readyState === 'live'));
}
// Frame counters/FPS must not revoke an already checked configuration each poll.
export function cameraConnectionSignature(camera, serial) {
  return JSON.stringify([camera?.status, ...['wrist', 'world'].map(role => {
    const item = camera?.roles?.[role];
    return [item?.device_id, item?.mode?.width, item?.mode?.height, item?.mode?.fps];
  }), serial?.follower?.connected, serial?.follower?.port]);
}

export function cameraRolePresentation(featureMap = {}) {
  const labels = {up: ['固定俯视相机 / UP', 'UP / 固定俯视'], front: ['固定正面相机 / FRONT', 'FRONT / 固定正面'], wrist: ['末端视角相机', 'WRIST / 末端视角'], world: ['世界视角相机', 'WORLD / 世界视角']};
  return Object.fromEntries(['wrist', 'world'].map(role => {
    const feature = featureMap[role] || role;
    const [name, caption] = labels[feature] || [`${feature} 相机`, feature];
    return [role, {name, caption, feature}];
  }));
}
