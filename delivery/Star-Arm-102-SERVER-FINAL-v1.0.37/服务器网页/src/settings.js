const STORAGE_KEY = 'star-arm-102.control-settings';

export const DEFAULT_CONTROL_SETTINGS = Object.freeze({
  loopIntervalMs: 20,
  filterWindow: 30,
  schedulingMode: 'interval',
  filterMode: 'moving-average',
});

function normalizeInteger(name, value, fallback) {
  const candidate = value === undefined ? fallback : value;
  if (!Number.isInteger(candidate) || candidate < 0 || candidate > 100) {
    throw new RangeError(`${name} 必须是 0–100 的整数`);
  }
  return candidate;
}

export function normalizeControlSettings(input = {}) {
  const loopIntervalMs = normalizeInteger('loopIntervalMs', input.loopIntervalMs, 20);
  const filterWindow = normalizeInteger('filterWindow', input.filterWindow, 30);
  return {
    loopIntervalMs,
    filterWindow,
    schedulingMode: loopIntervalMs === 0 ? 'fastest' : 'interval',
    filterMode: filterWindow === 0 ? 'disabled' : 'moving-average',
  };
}

export function loadSettings(storage) {
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    return serialized ? normalizeControlSettings(JSON.parse(serialized)) : { ...DEFAULT_CONTROL_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTROL_SETTINGS };
  }
}

export function saveSettings(storage, value) {
  if (!storage?.setItem) throw new TypeError('storage 必须实现 setItem');
  const normalized = normalizeControlSettings(value);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
