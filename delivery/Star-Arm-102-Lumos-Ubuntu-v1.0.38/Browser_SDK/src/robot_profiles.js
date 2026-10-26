import { t, tWithVars } from './i18n.js?v=server-1.0.38';

const profiles = Object.freeze({
  LUMOS: Object.freeze({
    code: 'LUMOS',
    name: 'LumosTouch V3',
    role: 'follower',
    powered: true,
    canCommand: false,
    permissionNote: '通过 Touch R1 校准控制六轴与夹爪；不支持旧款串口滑块、TCP 或轨迹指令',
    permissionNoteKey: 'lumos.permission',
  }),
  TOUCH: Object.freeze({
    code: 'TOUCH',
    name: 'Touch R1',
    role: 'leader',
    powered: false,
    canCommand: false,
    servoIds: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
    permissionNote: '采集六轴及夹爪；启用实体按钮板时仅允许六轴悬停／释放，不发送位置目标',
    permissionNoteKey: 'profile.touch-permission',
  }),
  LD: Object.freeze({
    code: 'LD',
    name: 'Star Arm 102-LD',
    role: 'leader',
    powered: false,
    canCommand: false,
    permissionNote: '无动力 Leader，仅支持姿态采集',
    permissionNoteKey: 'profile.ld-permission',
  }),
  HD: Object.freeze({
    code: 'HD',
    name: 'Star Arm 102-HD',
    role: 'leader',
    powered: true,
    canCommand: true,
  }),
  FL: Object.freeze({
    code: 'FL',
    name: 'Star Arm 102-FL',
    role: 'follower',
    powered: true,
    canCommand: true,
  }),
  PIPER: Object.freeze({
    code: 'PIPER',
    name: 'PiPER Mate',
    role: 'leader',
    powered: false,
    canCommand: false,
    permissionNote: '无动力 PiPER Mate 姿态源：连接真实手臂后模型随臂运动，仅姿态采集，不支持主动控制',
    permissionNoteKey: 'profile.piper-permission',
  }),
});

function normalizeModel(model) {
  // 提取型号代码：去掉 "Star Arm 102-" 前缀和括号内容
  let code = String(model ?? '').trim().toUpperCase();
  code = code.replace(/^STAR ARM 102-/, '');
  code = code.replace(/\s*[（(].*[）)]$/, '');  // 去掉中英文括号及其说明
  code = code.trim();
  
  if (!profiles[code]) throw new RangeError(tWithVars('profile.unknown-model', { model }));
  return code;
}

export function getRobotProfile(model) {
  return profiles[normalizeModel(model)];
}

export function canCommand(model) {
  return getRobotProfile(model).canCommand;
}

export function getPermissionNote(profileCode) {
  const profile = profiles[profileCode];
  if (!profile || !profile.permissionNoteKey) return '';
  return t(profile.permissionNoteKey);
}

export const ROBOT_PROFILES = profiles;
