import { getRobotProfile } from './robot_profiles.js?v=server-1.0.35';

export async function connectLeaderForProfile({ bus, model, onConnected = () => {}, initializeBus, openOptions }) {
  const profile = getRobotProfile(model);
  if (openOptions) await bus.connect(null, openOptions);
  else await bus.connect();
  try {
    if (profile.canCommand) await initializeBus(bus, profile);
  } catch (error) {
    await bus.disconnect();
    throw error;
  }
  onConnected(profile);
  return profile;
}

export function getConnectedLeaderType(profile, selectedType) {
  return profile ? `102${profile.code}` : selectedType;
}

export function isLeaderTypeLocked({ leaderConnected, running }) {
  return leaderConnected || running;
}

export async function writeLeaderControlFrame({ bus, profile, frame }) {
  if (!profile?.canCommand) return false;
  await bus.write(frame);
  return true;
}

export async function applyHdHoverForConnectedLeader({
  profile,
  buttonAngle,
  locked,
  lockFrames,
  unlockFrame,
  write,
}) {
  if (profile?.code !== 'HD' || !profile.canCommand || buttonAngle == null) return locked;

  const shouldLock = Math.round(buttonAngle) === 180;
  if (shouldLock && !locked) {
    for (const frame of lockFrames) await write(frame);
    return true;
  }
  if (!shouldLock && locked) {
    await write(unlockFrame);
    return false;
  }
  return locked;
}
