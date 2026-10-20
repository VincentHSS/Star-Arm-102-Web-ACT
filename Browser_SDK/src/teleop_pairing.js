export const PHYSICAL_FOLLOWER_STAR_ARM_FL = 'FL';
export const PHYSICAL_FOLLOWER_LUMOS = 'LUMOS';

// This is a compatibility policy, not transport configuration or device
// identification. A connected adapter must separately verify its own hardware.
export const PHYSICAL_FOLLOWER_MODELS = Object.freeze({
  [PHYSICAL_FOLLOWER_STAR_ARM_FL]: Object.freeze({
    code: PHYSICAL_FOLLOWER_STAR_ARM_FL,
    name: 'Star Arm 102-FL',
    allowedLeaderCodes: Object.freeze(['LD', 'HD']),
  }),
  [PHYSICAL_FOLLOWER_LUMOS]: Object.freeze({
    code: PHYSICAL_FOLLOWER_LUMOS,
    name: 'LumosTouch V3',
    allowedLeaderCodes: Object.freeze(['TOUCH']),
  }),
});

const LEADER_NAMES = Object.freeze({
  LD: 'Star Arm 102-LD',
  HD: 'Star Arm 102-HD',
  TOUCH: 'Touch R1',
  PIPER: 'PiPER Mate',
});

/**
 * Evaluate the committed connection identity, never a pending UI selection.
 * Call again immediately before hardware output because a permitted pairing
 * does not grant permission to a later connection or changed target.
 */
export function evaluateTeleopPairing({
  followerTargetType,
  connectedLeaderProfile,
  physicalFollowerModel,
} = {}) {
  const leaderCode = connectedLeaderProfile?.code ?? null;
  const followerCode = physicalFollowerModel ?? null;
  const result = (allowed, reason, errorCode = null) => Object.freeze({
    allowed,
    reason,
    errorCode,
    leaderCode,
    followerCode: followerTargetType === 'virtual' ? null : followerCode,
  });

  if (!['physical', 'virtual'].includes(followerTargetType)) {
    return result(false, 'Follower 类型无效，请重新选择并连接。', 'UNKNOWN_FOLLOWER_TARGET');
  }
  if (!connectedLeaderProfile) {
    return result(false, '请先连接 Leader，再开始遥操作。', 'LEADER_NOT_CONNECTED');
  }
  if (connectedLeaderProfile.role !== 'leader' || !Object.hasOwn(LEADER_NAMES, leaderCode)) {
    return result(false, '已连接 Leader 型号无效，请断开后重新连接。', 'UNKNOWN_LEADER');
  }
  if (followerTargetType === 'virtual') return result(true, '');

  if (!Object.hasOwn(PHYSICAL_FOLLOWER_MODELS, followerCode)) {
    return result(false, '真实 Follower 型号未确认，请重新选择并连接。', 'UNKNOWN_PHYSICAL_FOLLOWER');
  }
  const follower = PHYSICAL_FOLLOWER_MODELS[followerCode];
  if (!follower.allowedLeaderCodes.includes(leaderCode)) {
    const allowedNames = follower.allowedLeaderCodes.map(code => LEADER_NAMES[code]).join(' / ');
    return result(false, `${follower.name} 仅允许 ${allowedNames} 遥操作，当前连接的是 ${LEADER_NAMES[leaderCode]}。`, 'INCOMPATIBLE_TELEOP_PAIR');
  }
  return result(true, '');
}

export function assertTeleopPairing(options) {
  const pairing = evaluateTeleopPairing(options);
  if (!pairing.allowed) {
    const error = new Error(pairing.reason);
    error.code = pairing.errorCode;
    throw error;
  }
  return pairing;
}
