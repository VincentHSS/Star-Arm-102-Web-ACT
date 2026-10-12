const AXES = Object.freeze({
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
});

function finiteVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new TypeError(`${label}必须是包含 ${length} 个有限数值的数组`);
  }
  return [...value];
}

function normalize(value, label) {
  const vector = finiteVector(value, 3, label);
  const length = Math.hypot(...vector);
  if (length <= Number.EPSILON) throw new RangeError(`${label}不能是零向量`);
  return vector.map((component) => component / length);
}

export function snapDisplacement(value, step = 0) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step < 0) {
    throw new TypeError('位移和吸附步长必须是有限数值，且步长不能为负数');
  }
  return step === 0 ? value : Math.round(value / step) * step;
}

export function rotateLocalAxis(axisName, quaternion) {
  const local = AXES[axisName];
  if (!local) throw new RangeError(`未知末端局部轴: ${axisName}`);
  const [qx, qy, qz, qw] = finiteVector(quaternion, 4, '末端四元数');
  const length = Math.hypot(qx, qy, qz, qw);
  if (length <= Number.EPSILON) throw new RangeError('末端四元数不能为零');
  const x = qx / length;
  const y = qy / length;
  const z = qz / length;
  const w = qw / length;
  const [vx, vy, vz] = local;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return normalize([
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ], '旋转后的局部轴向量');
}

export function matrixToQuaternion(matrix) {
  finiteVector(matrix, 16, '末端变换矩阵');
  const m00 = matrix[0];
  const m11 = matrix[5];
  const m22 = matrix[10];
  const trace = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (trace > 0) {
    const scale = 2 * Math.sqrt(trace + 1);
    w = scale / 4;
    x = (matrix[9] - matrix[6]) / scale;
    y = (matrix[2] - matrix[8]) / scale;
    z = (matrix[4] - matrix[1]) / scale;
  } else if (m00 > m11 && m00 > m22) {
    const scale = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (matrix[9] - matrix[6]) / scale;
    x = scale / 4;
    y = (matrix[1] + matrix[4]) / scale;
    z = (matrix[2] + matrix[8]) / scale;
  } else if (m11 > m22) {
    const scale = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (matrix[2] - matrix[8]) / scale;
    x = (matrix[1] + matrix[4]) / scale;
    y = scale / 4;
    z = (matrix[6] + matrix[9]) / scale;
  } else {
    const scale = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (matrix[4] - matrix[1]) / scale;
    x = (matrix[2] + matrix[8]) / scale;
    y = (matrix[6] + matrix[9]) / scale;
    z = scale / 4;
  }
  const length = Math.hypot(x, y, z, w);
  return [x / length, y / length, z / length, w / length];
}

export function constrainAxisTranslation({ start, axis, displacement, snap = 0 } = {}) {
  const origin = finiteVector(start, 3, 'TCP 起点');
  const direction = normalize(axis, '轴向量');
  const delta = snapDisplacement(displacement, snap);
  return origin.map((value, index) => value + direction[index] * delta);
}

export function constrainPlaneTranslation({
  start,
  u,
  v,
  uDisplacement,
  vDisplacement,
  snap = 0,
} = {}) {
  const origin = finiteVector(start, 3, 'TCP 起点');
  const uAxis = normalize(u, '平面 U 向量');
  const vAxis = normalize(v, '平面 V 向量');
  const parallel = Math.abs(uAxis[0] * vAxis[0] + uAxis[1] * vAxis[1] + uAxis[2] * vAxis[2]);
  if (parallel >= 1 - 1e-10) throw new RangeError('平面 U/V 向量不能共线');
  const uDelta = snapDisplacement(uDisplacement, snap);
  const vDelta = snapDisplacement(vDisplacement, snap);
  return origin.map((value, index) => value + uAxis[index] * uDelta + vAxis[index] * vDelta);
}

export function constrainScreenTranslation({
  start,
  right,
  up,
  rightDisplacement,
  upDisplacement,
  snap = 0,
} = {}) {
  const origin = finiteVector(start, 3, 'TCP 起点');
  const rightAxis = normalize(right, '相机 right 向量');
  const upAxis = normalize(up, '相机 up 向量');
  const rightDelta = snapDisplacement(rightDisplacement, snap);
  const upDelta = snapDisplacement(upDisplacement, snap);
  return origin.map((value, index) => value
    + rightAxis[index] * rightDelta
    + upAxis[index] * upDelta);
}
