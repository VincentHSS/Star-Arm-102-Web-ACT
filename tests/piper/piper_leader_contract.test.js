import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { MODEL_CONFIGS, resolveDisplayModelKey, isDisplayOnlyModelKey, PIPER_MODEL_KEY, LEADER_TYPE_PIPER } from '../../Browser_SDK/src/robot_model_configs.js';
import { getRobotProfile } from '../../Browser_SDK/src/robot_profiles.js';
import { JOINT_MAPPINGS, servoToModelAngles } from '../../Browser_SDK/src/joint_mapper.js';

const root = new URL('../../Browser_SDK/', import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('PiPER Mate is registered as a leader pose-source model with baked parts and joints', () => {
  const piper = MODEL_CONFIGS.piper;
  assert.ok(piper, 'MODEL_CONFIGS.piper 必须存在');
  assert.equal(piper.key, 'piper');
  assert.equal(piper.parts.length, 9, '应有 9 个 link 的 STL parts');
  assert.equal(piper.joints.length, 8, '应有 8 个 revolute 关节');
  assert.equal(piper.sourceUrdf, '../assets/urdf/piper/model.urdf');
  assert.equal(PIPER_MODEL_KEY, 'piper');
  assert.equal(LEADER_TYPE_PIPER, '102PIPER');
  // rootPose：把 CAD 平放姿态的整机旋转为底座贴地（保留）
  assert.ok(piper.rootPose, 'PiPER 应有 rootPose 以让底座贴地');
  assert.equal(piper.rootPose.xyz.length, 3);
  assert.equal(piper.rootPose.rpy.length, 3);
  assert.ok(piper.rootPose.rpy.every(Number.isFinite));
  assert.ok(piper.rootPose.xyz.every(Number.isFinite));
  // 不再有固定 displayPose —— 模型作为姿态源跟随真实手臂
  assert.equal(piper.displayPose, undefined, 'PiPER 不应有固定 displayPose（应跟随真实手臂）');
});

test('PIPER has a servo->model joint mapping (placeholder, uncalibrated)', () => {
  const mapping = JOINT_MAPPINGS.PIPER;
  assert.ok(mapping, 'JOINT_MAPPINGS.PIPER 必须存在');
  assert.equal(mapping.model, 'PIPER');
  assert.equal(mapping.canCommand, false);
  assert.equal(mapping.hardwareCalibrated, false);
  assert.equal(mapping.calibrationStatus, '待实机校准：方向与零点偏移使用中性占位值，不可视为实机正确映射');
  // 映射一组真实舵机角度应产出 piper 模型关节记录（含 joint7_left / joint_right→joint7_right 回退）
  const angles = [0, 45, 90, 45, 0, 30, 20];
  const record = servoToModelAngles('PIPER', angles);
  assert.equal(typeof record.joint1, 'number');
  assert.equal(typeof record.joint6, 'number');
  assert.ok('joint7_left' in record);
  assert.ok('joint_right' in record);
});

test('PiPER joint tree links match the baked part links (consistency)', () => {
  const piper = MODEL_CONFIGS.piper;
  const partLinks = new Set(piper.parts.map(({ link }) => link));
  const childLinks = new Set(piper.joints.map(({ child }) => child));
  const parentLinks = new Set(piper.joints.map(({ parent }) => parent));
  for (const link of [...childLinks, ...parentLinks]) {
    assert.ok(partLinks.has(link), `link ${link} 应有对应 STL part`);
  }
  const roots = [...parentLinks].filter((link) => !childLinks.has(link));
  assert.equal(roots.length, 1, 'root link 必须唯一');
  assert.equal(roots[0], 'base_link');
});

test('resolveDisplayModelKey routes leader + 102PIPER to the piper model', () => {
  assert.equal(resolveDisplayModelKey({ role: 'leader', leaderType: '102PIPER' }), 'piper');
  assert.equal(resolveDisplayModelKey({ role: 'leader', leaderType: LEADER_TYPE_PIPER }), 'piper');
  assert.equal(resolveDisplayModelKey({ role: 'leader', leaderType: '102LD' }), 'ld');
  assert.equal(resolveDisplayModelKey({ role: 'leader', leaderType: '102HD' }), 'ld');
  assert.equal(resolveDisplayModelKey({ role: 'follower', leaderType: '102PIPER' }), 'fl');
});

test('PIPER leader profile is read-only pose source (not commandable)', () => {
  const profile = getRobotProfile('PIPER');
  assert.equal(profile.code, 'PIPER');
  assert.equal(profile.role, 'leader');
  assert.equal(profile.canCommand, false);
  assert.equal(profile.powered, false);
  assert.equal(profile.permissionNoteKey, 'profile.piper-permission');
});

test('leaderType dropdown offers the PiPER Mate option', async () => {
  const html = await source('index.html');
  assert.match(html, /id="leaderType"/);
  assert.match(html, /<option value="102PIPER"[^>]*>PiPER Mate[^<]*<\/option>/);
});

test('app.js treats PiPER as connectable pose-source that follows a real arm', async () => {
  const app = await source('src/app.js');
  // 允许连接（不拦截 PIPER）
  assert.doesNotMatch(app, /leaderType === 'PIPER'/);
  assert.doesNotMatch(app, /error\.piper-display-only/);
  // 连接按钮不再因 PIPER 禁用
  assert.doesNotMatch(app, /isPiperLeaderSelected\(\)/);
  // 渲染时按真实手臂关节角映射（跟随），而非固定姿态
  assert.match(app, /PiPER Mate 为姿态源：按真实手臂关节角跟随/);
  assert.match(app, /mapped = servoToModelAngles\('PIPER', angles\)/);
});

test('i18n ships zh and en labels for PiPER leader option and pose-source note', async () => {
  const lang = await source('src/i18n.js');
  assert.match(lang, /'option\.leader-piper':\s*'PiPER Mate（仅展示本体）'/);
  assert.match(lang, /'profile\.piper-permission':\s*'无动力 PiPER Mate 姿态源：连接真实手臂后模型随臂运动/);
  assert.match(lang, /'option\.leader-piper':\s*'PiPER Mate \(View-Only Model\)'/);
  assert.match(lang, /'profile\.piper-permission':\s*'Unpowered PiPER Mate pose source/);
});

test('every baked PiPER STL part exists on disk', async () => {
  const piper = MODEL_CONFIGS.piper;
  for (const { url } of piper.parts) {
    const abs = new URL(url.replace('../', ''), root);
    const s = await stat(abs);
    assert.ok(s.isFile() && s.size > 0, `STL 必须存在且非空: ${url}`);
  }
  // sourceUrdf 指向的文件必须真实存在（与 ld/fl/b601/a1z 的约定一致）
  const urdf = new URL(piper.sourceUrdf.replace('../', ''), root);
  const s = await stat(urdf);
  assert.ok(s.isFile() && s.size > 0, `sourceUrdf 必须存在: ${piper.sourceUrdf}`);
});
