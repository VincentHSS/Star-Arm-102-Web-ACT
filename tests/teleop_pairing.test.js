import test from 'node:test';
import assert from 'node:assert/strict';
import { getRobotProfile } from '../Browser_SDK/src/robot_profiles.js';
import {
  PHYSICAL_FOLLOWER_STAR_ARM_FL,
  PHYSICAL_FOLLOWER_LUMOS,
  PHYSICAL_FOLLOWER_MODELS,
  evaluateTeleopPairing,
  assertTeleopPairing,
} from '../Browser_SDK/src/teleop_pairing.js';

const physical = (leaderCode, physicalFollowerModel) => ({
  followerTargetType: 'physical',
  connectedLeaderProfile: getRobotProfile(leaderCode),
  physicalFollowerModel,
});

test('physical pairing permits only the corresponding Leader family', () => {
  for (const leaderCode of ['LD', 'HD', 'TOUCH', 'PIPER']) {
    for (const followerCode of [PHYSICAL_FOLLOWER_STAR_ARM_FL, PHYSICAL_FOLLOWER_LUMOS]) {
      const expected = followerCode === PHYSICAL_FOLLOWER_LUMOS
        ? leaderCode === 'TOUCH'
        : ['LD', 'HD'].includes(leaderCode);
      const result = evaluateTeleopPairing(physical(leaderCode, followerCode));
      assert.equal(result.allowed, expected, `${leaderCode} → ${followerCode}`);
      assert.equal(result.leaderCode, leaderCode);
      assert.equal(result.followerCode, followerCode);
      if (expected) {
        assert.equal(result.reason, '');
        assert.equal(result.errorCode, null);
      } else {
        assert.match(result.reason, /仅允许/);
        assert.equal(result.errorCode, 'INCOMPATIBLE_TELEOP_PAIR');
        assert.throws(() => assertTeleopPairing(physical(leaderCode, followerCode)),
          error => error.code === 'INCOMPATIBLE_TELEOP_PAIR');
      }
    }
  }
});

test('virtual targets allow each known Leader without a physical pairing', () => {
  for (const leaderCode of ['LD', 'HD', 'TOUCH', 'PIPER']) {
    const options = { ...physical(leaderCode, 'not-a-physical-target'), followerTargetType: 'virtual' };
    const result = assertTeleopPairing(options);
    assert.equal(result.allowed, true);
    assert.equal(result.followerCode, null);
  }
});

test('missing or unrecognized connection identities fail closed', () => {
  assert.equal(evaluateTeleopPairing().errorCode, 'UNKNOWN_FOLLOWER_TARGET');
  for (const followerTargetType of ['physical', 'virtual']) {
    for (const connectedLeaderProfile of [undefined, null]) {
      const result = evaluateTeleopPairing({
        followerTargetType, connectedLeaderProfile, physicalFollowerModel: 'LUMOS',
      });
      assert.equal(result.allowed, false);
      assert.equal(result.errorCode, 'LEADER_NOT_CONNECTED');
    }
    for (const connectedLeaderProfile of [
      { code: 'TOUCH' }, { code: 'TOUCH', role: 'follower' },
      { code: 'unknown', role: 'leader' }, { code: 'toString', role: 'leader' },
      getRobotProfile('FL'), { code: '102TOUCH', role: 'leader' },
    ]) {
      assert.equal(evaluateTeleopPairing({
        followerTargetType, connectedLeaderProfile, physicalFollowerModel: 'LUMOS',
      }).errorCode, 'UNKNOWN_LEADER');
    }
  }
  for (const physicalFollowerModel of [undefined, null, '', 'fl-v3', 'toString', 'physical']) {
    assert.equal(evaluateTeleopPairing({
      ...physical('TOUCH', physicalFollowerModel),
    }).errorCode, 'UNKNOWN_PHYSICAL_FOLLOWER');
  }
  for (const followerTargetType of [undefined, null, '', 'LUMOS', 'virtual ']) {
    assert.equal(evaluateTeleopPairing({
      ...physical('TOUCH', 'LUMOS'), followerTargetType,
    }).errorCode, 'UNKNOWN_FOLLOWER_TARGET');
  }
});

test('a pending selector change does not substitute for the connected Leader', () => {
  const result = evaluateTeleopPairing({
    ...physical('LD', 'LUMOS'),
    selectedLeaderType: '102TOUCH',
    leaderType: 'TOUCH',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.leaderCode, 'LD');
  assert.match(result.reason, /当前连接的是 Star Arm 102-LD/);
});

test('re-evaluation catches target or Leader changes after a valid pairing', () => {
  const connection = physical('TOUCH', 'LUMOS');
  assert.equal(assertTeleopPairing(connection).allowed, true);
  connection.physicalFollowerModel = 'FL';
  assert.throws(() => assertTeleopPairing(connection), /Star Arm 102-FL/);
  connection.physicalFollowerModel = 'LUMOS';
  connection.connectedLeaderProfile = getRobotProfile('HD');
  assert.throws(() => assertTeleopPairing(connection), /当前连接的是 Star Arm 102-HD/);
  connection.connectedLeaderProfile = null;
  assert.throws(() => assertTeleopPairing(connection), error => error.code === 'LEADER_NOT_CONNECTED');
});

test('pairing definitions and decisions cannot be mutated into a permission', () => {
  assert.ok(Object.isFrozen(PHYSICAL_FOLLOWER_MODELS));
  const lumos = PHYSICAL_FOLLOWER_MODELS[PHYSICAL_FOLLOWER_LUMOS];
  assert.ok(Object.isFrozen(lumos));
  assert.ok(Object.isFrozen(lumos.allowedLeaderCodes));
  assert.throws(() => lumos.allowedLeaderCodes.push('HD'), TypeError);
  const denied = evaluateTeleopPairing(physical('HD', PHYSICAL_FOLLOWER_LUMOS));
  assert.ok(Object.isFrozen(denied));
  assert.throws(() => { denied.allowed = true; }, TypeError);
});
