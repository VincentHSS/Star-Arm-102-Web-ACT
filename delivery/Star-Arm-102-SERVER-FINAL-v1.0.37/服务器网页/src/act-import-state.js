export const DATASET_TRANSFER_TIMEOUT_MS = 30 * 60 * 1000;

// Read only the ZIP central directory; a multi-GB dataset stays out of JS memory.
export async function zipArchiveKind(file) {
  if (!/\.zip$/i.test(file.name) || !file.slice) return 'unknown';
  const tail = new DataView(await file.slice(Math.max(0, file.size - 65557)).arrayBuffer());
  for (let offset = tail.byteLength - 22; offset >= 0; offset--) {
    if (tail.getUint32(offset, true) !== 0x06054b50) continue;
    if (offset + 22 + tail.getUint16(offset + 20, true) !== tail.byteLength) continue;
    const size = tail.getUint32(offset + 12, true), start = tail.getUint32(offset + 16, true);
    if (size === 0xffffffff || start === 0xffffffff || size > 32 * 1024 * 1024 || start + size > file.size) return 'unknown';
    const bytes = new Uint8Array(await file.slice(start, start + size).arrayBuffer());
    const view = new DataView(bytes.buffer), decoder = new TextDecoder();
    const names = new Set();
    for (let position = 0; position < bytes.length;) {
      if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) return 'unknown';
      const length = view.getUint16(position + 28, true);
      const next = position + 46 + length + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
      if (next > bytes.length) return 'unknown';
      names.add(decoder.decode(bytes.subarray(position + 46, position + 46 + length)));
      position = next;
    }
    if (['dataset.json', 'manifest.json', 'checksums.sha256'].every(name => names.has(name))) return 'dataset';
    if ([...names].some(name => /(^|\/)web-act\.json$/.test(name))) return 'browser-model';
    if ([...names].some(name => /(^|\/)(model\.json|model\.safetensors)$/.test(name))) return 'model';
    return 'unknown';
  }
  return 'unknown';
}

export function localStoragePaths(root, dataset, model) {
  const join = (...parts) => {
    if (!root) return '';
    const separator = /^[A-Za-z]:\\|^\\\\/.test(root) ? '\\' : '/';
    return [root.replace(/[\\/]+$/, ''), ...parts].join(separator);
  };
  return {
    root: root || '',
    dataset: dataset?.id ? join('datasets', dataset.id) : '',
    model: model?.path || model?.checkpoint_path || '',
  };
}

export function calibrationApplyState({ snapshot, model, busy, active, sameArm }) {
  let reason = '';
  if (active) reason = '请先停止实机推理。';
  else if (busy) reason = '正在处理校准操作，请稍候。';
  else if (snapshot?.status !== 'saved') reason = '请先完成七关节范围记录，并点击“完成并保存”。';
  else if (!model) reason = '请先在第 3 步导入 ACT 模型，再选择目标模型。';
  else if (model.coordinate_contract !== 'starai_0_0_4_calibrated') reason = '当前模型使用原始角度，不需要此归一化校准；可直接验证执行条件。';
  else if (!sameArm) reason = '请确认当前连接的是生成此校准的同一台物理从臂。';
  return { allowed: !reason, reason: reason || `校准将应用到模型 ${model.id}。` };
}
