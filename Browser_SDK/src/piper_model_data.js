// Audited from the supplied PiPER Mate robot.urdf (CAD export, Z-up, mm->m scale 0.001).
// Display-only model: revolute joints from the URDF. Not controllable in this tool.
const joint = (name, parent, child, xyz, rpy, axis, lower, upper) => Object.freeze({
  name,
  type: 'revolute',
  parent,
  child,
  origin: Object.freeze({ xyz: Object.freeze(xyz), rpy: Object.freeze(rpy) }),
  axis: Object.freeze(axis),
  // 最新实机反馈：J2/J4 保持正向；J3 反向；J1/J5/J6 保持反向。
  // 双夹爪使用同号逻辑角，由 URDF 中镜像的关节 origin 形成相反物理方向。
  displayAxisDirection: ['joint2', 'joint4'].includes(name) || name.startsWith('joint7_') ? 1 : -1,
  // J3 实机回读为有符号多圈角（如 -239°）；只读姿态显示不截断到 CAD 的 0..180°。
  clampToLimits: name !== 'joint3',
  // 左右 CAD 零位不对称：分别校准至闭合点 y=-0.00385（固定握柄两侧平面中线）。
  displayAngleOffset: (name === 'joint7_left' ? -11.9972150843 : name === 'joint7_right' ? -6.2850948931 : 0) * Math.PI / 180,
  limit: Object.freeze({ lower, upper }),
});

export const PIPER_JOINTS = Object.freeze([
  joint('joint1', 'base_link', 'link1', [0.02607175, 0.02251247, -0.0001000015], [-1.570796, 0, 0], [0, 0, 1], -1.57, 1.57),
  joint('joint2', 'link1', 'link2', [1e-05, 0.011775, 0.03128499], [-1.570796, 0, 0], [0, 0, 1], 0, 3.14),
  joint('joint3', 'link2', 'link3', [-0.1719654, -0.01693569, 0.006758297], [-3.141593, -0.009291954, 0], [0, 0, 1], 0, 3.14),
  joint('joint4', 'link3', 'link4', [0.1258523, 0.03044155, 0.02017753], [1.570796, 0, 1.570796], [0, 0, 1], -1.57, 1.57),
  joint('joint5', 'link4', 'link_5', [-0.00289, 0.012475, 0.0360675], [0, -1.570796, -1.570796], [0, 0, 1], -1.57, 1.57),
  joint('joint6', 'link_5', 'link6', [0.053505, 0.0005599958, -0.01252251], [1.570796, 0, 1.570796], [0, 0, 1], -3.14, 3.14),
  joint('joint7_right', 'link6', 'link7_right', [0.00369, 0.00698, 0.038805], [-3.141593, 0, 0], [0, 0, 1], -0.05, 2.6),
  joint('joint7_left', 'link6', 'link7_left', [0.00369, -0.01065, 0.041305], [0, 0, 0], [0, 0, 1], -0.15, 2.5),
]);
