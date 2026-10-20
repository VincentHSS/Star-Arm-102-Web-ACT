export const FOLLOWER_TARGET_PHYSICAL = 'physical';
export const FOLLOWER_TARGET_VIRTUAL = 'virtual';
export const VIRTUAL_MODEL_STAR_ARM_FL = 'star-arm-102-fl';
export const VIRTUAL_MODEL_REBOT_B601 = 'rebot-b601';
export const VIRTUAL_MODEL_GALAXEA_A1Z = 'galaxea-a1z';
export const VIRTUAL_MODEL_LUMOS_FL = 'fl-v3';
export const VIRTUAL_MODEL_CONFIG_KEYS = Object.freeze({
  [VIRTUAL_MODEL_STAR_ARM_FL]: 'fl',
  [VIRTUAL_MODEL_REBOT_B601]: 'b601',
  [VIRTUAL_MODEL_GALAXEA_A1Z]: 'a1z',
  [VIRTUAL_MODEL_LUMOS_FL]: 'fl-v3',
});

function validateVirtualModel(model) {
  if (!Object.hasOwn(VIRTUAL_MODEL_CONFIG_KEYS, model)) {
    throw new RangeError(`未知虚拟型号：${model}`);
  }
  return model;
}

function validateFollowerTargetType(type) {
  if (![FOLLOWER_TARGET_PHYSICAL, FOLLOWER_TARGET_VIRTUAL].includes(type)) {
    throw new RangeError(`未知 Follower 类型：${type}`);
  }
  return type;
}

export function createFollowerTargetState(initialType = FOLLOWER_TARGET_PHYSICAL) {
  let type = validateFollowerTargetType(initialType);
  let virtualConnected = false;
  let virtualModel = VIRTUAL_MODEL_STAR_ARM_FL;

  return {
    get type() { return type; },
    get virtualConnected() { return virtualConnected; },
    get virtualModel() { return virtualModel; },
    setType(nextType) {
      if (virtualConnected) throw new Error('请先断开虚拟手臂，再切换 Follower 类型');
      type = validateFollowerTargetType(nextType);
    },
    setVirtualModel(nextModel) {
      if (virtualConnected) throw new Error('请先断开虚拟目标，再切换虚拟型号');
      virtualModel = validateVirtualModel(nextModel);
    },
    connectVirtual() {
      if (type !== FOLLOWER_TARGET_VIRTUAL) throw new Error('当前 Follower 类型不是虚拟手臂');
      virtualConnected = true;
    },
    disconnectVirtual() { virtualConnected = false; },
    connected({ physicalConnected = false } = {}) {
      return type === FOLLOWER_TARGET_VIRTUAL ? virtualConnected : Boolean(physicalConnected);
    },
  };
}

export function createTeleopOutputOptions({ type, writeFollowerAngles }) {
  validateFollowerTargetType(type);
  if (type === FOLLOWER_TARGET_VIRTUAL) return { readOnly: true };
  if (typeof writeFollowerAngles !== 'function') throw new TypeError('真实 FL 必须提供写入接口');
  return { readOnly: false, writeFollowerAngles };
}
