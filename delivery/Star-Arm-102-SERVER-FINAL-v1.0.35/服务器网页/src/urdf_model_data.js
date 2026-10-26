// Audited from the supplied satr arm102_description.urdf source.
const joint = (name, parent, child, xyz, rpy, axis, lower, upper) => Object.freeze({
  name,
  type: 'revolute',
  parent,
  child,
  origin: Object.freeze({ xyz: Object.freeze(xyz), rpy: Object.freeze(rpy) }),
  axis: Object.freeze(axis),
  limit: Object.freeze({ lower, upper }),
});

export const REVOLUTE_JOINTS = Object.freeze([
  joint('joint1', 'base_link', 'link1', [0, -0.004138, 0.02785], [0, 0, 0], [0, 0, -1], -2.27, 2.27),
  joint('joint2', 'link1', 'link2', [0.0001, 0, 0.061025], [-1.5708, 0, 3.1416], [0, 0, -1], 0, 3.14),
  joint('joint3', 'link2', 'link3', [0.12162, -0.0021, 0], [0, 0, -1.5708], [0, 0, -1], -3.14, 0),
  joint('joint4', 'link3', 'link4', [0.024219, -0.10865, 0], [0, 0, -1.5708], [0, 0, 1], -1.57, 2.2),
  joint('joint5', 'link4', 'link5', [0.035, 0.00122, 0], [-1.5708, 0, 0], [0, 0, -1], -1.2, 1.2),
  joint('joint6', 'link5', 'link6', [0.15168, 0, 0.002625], [-1.5708, 0, -1.5708], [0, 0, -1], -3.14, 3.14),
]);

export const GRIPPER_JOINTS = Object.freeze([
  joint('joint7_left', 'link6', 'link7_left', [0.012325, 0.0004, -0.07313], [1.5708, -1.5708, 0], [0, 0, 1], 0, 1.57),
  joint('joint_right', 'link6', 'link7_right', [-0.009675, 0.0004, -0.07313], [1.5708, -1.5708, 0], [0, 0, 1], -1.57, 0),
]);

export const ALL_JOINTS = Object.freeze([...REVOLUTE_JOINTS, ...GRIPPER_JOINTS]);
