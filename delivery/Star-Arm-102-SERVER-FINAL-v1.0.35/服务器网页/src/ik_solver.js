import { REVOLUTE_JOINTS } from './urdf_model_data.js?v=server-1.0.35';

const identity = () => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

const multiply = (left, right) => {
  const result = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[row * 4 + column] += left[row * 4 + index] * right[index * 4 + column];
      }
    }
  }
  return result;
};

const originTransform = ({ xyz, rpy }) => {
  const [roll, pitch, yaw] = rpy;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyz[0],
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyz[1],
    -sp, cp * sr, cp * cr, xyz[2],
    0, 0, 0, 1,
  ];
};

const axisAngleTransform = (axis, angle) => {
  const length = Math.hypot(...axis);
  const [x, y, z] = axis.map((value) => value / length);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const complement = 1 - cosine;
  return [
    cosine + x * x * complement, x * y * complement - z * sine, x * z * complement + y * sine, 0,
    y * x * complement + z * sine, cosine + y * y * complement, y * z * complement - x * sine, 0,
    z * x * complement - y * sine, z * y * complement + x * sine, cosine + z * z * complement, 0,
    0, 0, 0, 1,
  ];
};

export function forwardKinematics(angles) {
  if (!Array.isArray(angles) || angles.length !== REVOLUTE_JOINTS.length
    || angles.some((angle) => !Number.isFinite(angle))) {
    throw new TypeError('angles 必须是包含 6 个有限弧度值的数组');
  }

  let matrix = identity();
  REVOLUTE_JOINTS.forEach((joint, index) => {
    matrix = multiply(matrix, originTransform(joint.origin));
    matrix = multiply(matrix, axisAngleTransform(joint.axis, angles[index]));
  });

  return {
    position: [matrix[3], matrix[7], matrix[11]],
    matrix,
  };
}

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));
const norm = (vector) => Math.hypot(...vector);

const solveThreeByThree = (matrix, vector) => {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-15) return null;
    for (let index = column; index < 4; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index < 4; index += 1) {
        rows[row][index] -= factor * rows[column][index];
      }
    }
  }
  return rows.map((row) => row[3]);
};

export function solveInverseKinematics(targetPosition, seedAngles, options = {}) {
  const maxIterations = options.maxIterations ?? 100;
  const tolerance = options.tolerance ?? 0.001;
  const damping = options.damping ?? 0.03;
  const differenceStep = options.differenceStep ?? 1e-5;
  const maxAngleStep = options.maxAngleStep ?? 0.2;

  const validTarget = Array.isArray(targetPosition) && targetPosition.length === 3
    && targetPosition.every(Number.isFinite);
  const validSeed = Array.isArray(seedAngles) && seedAngles.length === REVOLUTE_JOINTS.length
    && seedAngles.every(Number.isFinite);
  if (!validTarget || !validSeed) {
    return { success: false, angles: null, positionError: null, iterations: 0, reason: 'invalid-input' };
  }

  const maximumReach = REVOLUTE_JOINTS.reduce((sum, joint) => sum + Math.hypot(...joint.origin.xyz), 0);
  if (norm(targetPosition) > maximumReach + tolerance) {
    const seedPosition = forwardKinematics(seedAngles.map((angle, index) => {
      const { lower, upper } = REVOLUTE_JOINTS[index].limit;
      return clamp(angle, lower, upper);
    })).position;
    return {
      success: false,
      angles: null,
      positionError: norm(targetPosition.map((value, index) => value - seedPosition[index])),
      iterations: 0,
      reason: 'unreachable',
    };
  }

  const angles = seedAngles.map((angle, index) => {
    const { lower, upper } = REVOLUTE_JOINTS[index].limit;
    return clamp(angle, lower, upper);
  });

  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    const position = forwardKinematics(angles).position;
    const error = targetPosition.map((value, index) => value - position[index]);
    const positionError = norm(error);
    if (positionError <= tolerance) {
      return { success: true, angles: [...angles], positionError, iterations: iteration, reason: 'converged' };
    }
    if (iteration === maxIterations) break;

    const jacobian = [[], [], []];
    for (let jointIndex = 0; jointIndex < angles.length; jointIndex += 1) {
      const perturbed = [...angles];
      perturbed[jointIndex] += differenceStep;
      const nextPosition = forwardKinematics(perturbed).position;
      for (let axis = 0; axis < 3; axis += 1) {
        jacobian[axis][jointIndex] = (nextPosition[axis] - position[axis]) / differenceStep;
      }
    }

    const normal = Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => (
      jacobian[row].reduce((sum, value, index) => sum + value * jacobian[column][index], 0)
      + (row === column ? damping * damping : 0)
    )));
    const taskStep = solveThreeByThree(normal, error);
    if (!taskStep) break;

    for (let jointIndex = 0; jointIndex < angles.length; jointIndex += 1) {
      let delta = 0;
      for (let axis = 0; axis < 3; axis += 1) delta += jacobian[axis][jointIndex] * taskStep[axis];
      delta = clamp(delta, -maxAngleStep, maxAngleStep);
      const { lower, upper } = REVOLUTE_JOINTS[jointIndex].limit;
      angles[jointIndex] = clamp(angles[jointIndex] + delta, lower, upper);
    }
  }

  const positionError = norm(targetPosition.map((value, index) => (
    value - forwardKinematics(angles).position[index]
  )));
  return { success: false, angles: null, positionError, iterations: maxIterations, reason: 'max-iterations' };
}
