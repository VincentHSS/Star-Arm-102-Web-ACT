import * as THREE from '../assets/vendor/three.module.js';
import { STLLoader } from '../assets/vendor/STLLoader.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import { ALL_JOINTS } from './urdf_model_data.js';
import { MODEL_CONFIGS } from './robot_model_configs.js';
import { createRateMeter } from './rate_meter.js';
import { loadModelAssets } from './model_asset_loader.js';
import { constrainAxisTranslation, constrainPlaneTranslation, constrainScreenTranslation } from './tcp_translation_gizmo.js';
import { t, tWithVars } from './i18n.js';

export const MODEL_PARTS = MODEL_CONFIGS.fl.parts;

const cloneVector = (value) => [...value];
const DISPLAY_AXIS_DIRECTIONS = Object.freeze({
  joint7_left: -1,
  joint_right: -1,
  joint7_right: -1,
});

/** Build a renderer-independent URDF tree suitable for Node tests and scene adapters. */
export function buildJointTree(joints = ALL_JOINTS) {
  const childLinks = new Set(joints.map(({ child }) => child));
  const parentLinks = new Set(joints.map(({ parent }) => parent));
  const rootLinks = [...parentLinks].filter((link) => !childLinks.has(link));
  if (rootLinks.length !== 1) throw new Error(`URDF 必须且只能有一个根 link，当前为 ${rootLinks.length}`);

  const links = new Map([...new Set([...parentLinks, ...childLinks])].map((name) => [name, {
    name,
    parentJoint: null,
    children: [],
  }]));
  const jointNodes = new Map();

  for (const source of joints) {
    if (jointNodes.has(source.name)) throw new Error(`URDF 关节重名: ${source.name}`);
    const parent = links.get(source.parent);
    const child = links.get(source.child);
    if (!parent || !child || child.parentJoint) throw new Error(`URDF 关节层级无效: ${source.name}`);
    const node = {
      name: source.name,
      type: source.type ?? 'revolute',
      parent: source.parent,
      child: source.child,
      origin: { xyz: cloneVector(source.origin.xyz), rpy: cloneVector(source.origin.rpy) },
      axis: cloneVector(source.axis),
      limit: { ...source.limit },
      clampToLimits: source.clampToLimits ?? true,
      displayAngleOffset: source.displayAngleOffset ?? 0,
      mimic: source.mimic ? { ...source.mimic } : null,
      angle: 0,
      translation: 0,  // 平移关节的初始位移
      displayAxisDirection: source.displayAxisDirection ?? DISPLAY_AXIS_DIRECTIONS[source.name] ?? 1,
    };
    jointNodes.set(node.name, node);
    parent.children.push(child.name);
    child.parentJoint = node.name;
  }

  const tree = { rootLink: rootLinks[0], links, joints: jointNodes };
  // Validate and initialize passive joints from the same URDF relationship
  // used for subsequent updates. This only affects the display tree.
  applyModelJointAngles(tree);
  return tree;
}

/** Apply model radians using display-only clamping to each attachment URDF limit. */
export function applyModelJointAngles(tree, angles = {}) {
  const applyDisplayAngle = (joint, value, label = joint?.name) => {
    if (!joint) return;
    if (!Number.isFinite(value)) throw new TypeError(`${label} 角度必须是有限数值`);
    if (joint.type === 'fixed') {
      joint.angle = 0;
      return;
    }
    // 对于平移关节（prismatic），直接应用位移值（单位：米）
    if (joint.type === 'prismatic') {
      joint.translation = Math.max(joint.limit.lower, Math.min(joint.limit.upper, value));
      return;
    }
    // 对于旋转关节（revolute），应用角度值（单位：弧度）
    joint.angle = joint.clampToLimits === false ? value : Math.max(joint.limit.lower, Math.min(joint.limit.upper, value));
  };
  for (const [name, value] of Object.entries(angles)) {
    if (name === 'gripper') {
      if (!Number.isFinite(value)) throw new TypeError('gripper 角度必须是有限数值');
      const left = tree.joints.get('joint7_left');
      const right = tree.joints.get('joint_right') ?? tree.joints.get('joint7_right');
      applyDisplayAngle(left, value, 'gripper');
      applyDisplayAngle(right, -value, 'gripper');
      continue;
    }
    // A1Z 夹爪关节特殊处理
    if (name === 'gripper_finger_left_joint' || name === 'gripper_finger_right_joint') {
      const joint = tree.joints.get(name);
      applyDisplayAngle(joint, value);
      continue;
    }
    // B601 平移夹爪关节特殊处理
    if (name === 'gripper_joint1' || name === 'gripper_joint2') {
      const joint = tree.joints.get(name);
      applyDisplayAngle(joint, value);
      continue;
    }
    const joint = tree.joints.get(name) ?? (name === 'joint_right' ? tree.joints.get('joint7_right') : null);
    if (!joint) throw new RangeError(`未知模型关节：${name}`);
    applyDisplayAngle(joint, value);
  }
  const resolved = new Set();
  const resolving = new Set();
  const follow = joint => {
    if (!joint.mimic || resolved.has(joint.name)) return;
    if (resolving.has(joint.name)) throw new Error(`URDF 从动关节循环引用：${joint.name}`);
    resolving.add(joint.name);
    const driver = tree.joints.get(joint.mimic.joint);
    const multiplier = joint.mimic.multiplier ?? 1;
    const offset = joint.mimic.offset ?? 0;
    if (!driver || !Number.isFinite(multiplier) || !Number.isFinite(offset)) {
      throw new Error(`URDF 从动关节参数无效：${joint.name}`);
    }
    follow(driver);
    const value = driver.type === 'prismatic' ? driver.translation : driver.angle;
    applyDisplayAngle(joint, value * multiplier + offset);
    resolving.delete(joint.name);
    resolved.add(joint.name);
  };
  for (const joint of tree.joints.values()) follow(joint);
  return tree;
}

/** Render-only correction; logical/readback angles keep their original zero. */
export function renderedJointAngle(joint) {
  return (joint.angle ?? 0) * joint.displayAxisDirection + (joint.displayAngleOffset ?? 0);
}

/** Return the homogeneous matrix for URDF fixed-axis RPY: Rz(yaw) * Ry(pitch) * Rx(roll). */
export function urdfRpyMatrix(roll, pitch, yaw) {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return new THREE.Matrix4().set(
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, 0,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, 0,
    -sp, cp * sr, cp * cr, 0,
    0, 0, 0, 1,
  );
}

export function applyUrdfOrigin(group, origin) {
  group.position.fromArray(origin.xyz);
  group.quaternion.setFromRotationMatrix(urdfRpyMatrix(...origin.rpy));
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose?.();
  });
}

export function createPointerDragLifecycle({
  controls,
  setVisual,
  isHandleEnabled,
  onError,
  setPointerCapture,
  hasPointerCapture,
  releasePointerCapture,
}) {
  let activePointerId = null;

  const restore = () => {
    controls.enabled = true;
    setVisual(isHandleEnabled() ? 'idle' : 'disabled');
  };

  const clear = (pointerId, { release = true, error = null } = {}) => {
    if (activePointerId !== pointerId) return false;
    activePointerId = null;
    restore();
    if (release && hasPointerCapture(pointerId)) {
      try { releasePointerCapture(pointerId); } catch (_) {}
    }
    if (error) onError(error);
    return true;
  };

  return {
    get activePointerId() { return activePointerId; },
    begin(pointerId) {
      if (activePointerId !== null) return false;
      activePointerId = pointerId;
      controls.enabled = false;
      try {
        setPointerCapture(pointerId);
      } catch (cause) {
        activePointerId = null;
        restore();
        onError(new Error(`无法捕获 TCP 拖拽指针：${cause.message}`, { cause }));
        return false;
      }
      setVisual('dragging');
      return true;
    },
    finish(pointerId) { return clear(pointerId); },
    cancel(pointerId, reason = 'TCP 拖拽已取消') {
      return clear(pointerId, { error: new Error(reason) });
    },
    lost(pointerId) {
      return clear(pointerId, { release: false, error: new Error('TCP 拖拽指针捕获已丢失') });
    },
  };
}

export function createRobotModel({
  canvas,
  modelConfig = MODEL_CONFIGS.fl,
  statusElement = null,
  errorElement = null,
  onError = () => {},
  onRenderFps = () => {},
} = {}) {
  if (!canvas) throw new TypeError('创建三维模型需要 canvas');

  const scene = new THREE.Scene();
  scene.background = null; // Let the console scene background show through.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 100);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();

  scene.add(new THREE.HemisphereLight(0xb9e6ff, 0x172033, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(0.5, -0.4, 0.8);
  scene.add(keyLight);
  const grid = new THREE.GridHelper(1.6, 32, 0x4d88ad, 0x294f69);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true;
  grid.material.opacity = 0.72;
  scene.add(grid);

  const actualRoot = new THREE.Group();
  actualRoot.name = 'actualRobot';
  const previewRoot = new THREE.Group();
  previewRoot.name = 'targetPreviewRobot';
  previewRoot.visible = false;
  const tcpTranslationGizmo = new THREE.Group();
  tcpTranslationGizmo.name = 'tcpTranslationGizmo';
  tcpTranslationGizmo.visible = false;
  tcpTranslationGizmo.renderOrder = 20;
  const gizmoVisuals = [];
  const gizmoHitTargets = [];
  const axisDefinitions = [
    { name: 'x', hitName: 'tcpAxisXHit', color: 0xff4b55, direction: new THREE.Vector3(1, 0, 0) },
    { name: 'y', hitName: 'tcpAxisYHit', color: 0x44da78, direction: new THREE.Vector3(0, 1, 0) },
    { name: 'z', hitName: 'tcpAxisZHit', color: 0x3c8cff, direction: new THREE.Vector3(0, 0, 1) },
  ];

  const planeDefinitions = [
    { name: 'xy', hitName: 'tcpPlaneXYHit', color: 0xffc94b, u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
    { name: 'yz', hitName: 'tcpPlaneYZHit', color: 0x49d9c8, u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, 1) },
    { name: 'xz', hitName: 'tcpPlaneXZHit', color: 0xb18cff, u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
  ];

  function addAxisHandle({ name, hitName, color, direction }) {
    const axisGroup = new THREE.Group();
    axisGroup.name = `tcpAxis${name.toUpperCase()}`;
    const material = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.078, 10), material);
    shaft.position.y = 0.039;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.022, 12), material.clone());
    arrow.position.y = 0.089;
    axisGroup.add(shaft, arrow);
    axisGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.105, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.name = hitName;
    hit.position.y = 0.0525;
    hit.userData = { dragMode: 'axis', axisName: name };
    axisGroup.add(hit);
    tcpTranslationGizmo.add(axisGroup);
    gizmoVisuals.push({ key: name, meshes: [shaft, arrow], color });
    gizmoHitTargets.push(hit);
  }
  axisDefinitions.forEach(addAxisHandle);

  function addPlaneHandle({ name, hitName, color, u, v }) {
    const planeGroup = new THREE.Group();
    planeGroup.name = `tcpPlane${name.toUpperCase()}`;
    const normal = u.clone().cross(v).normalize();
    const planeQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const visual = new THREE.Mesh(
      new THREE.PlaneGeometry(0.028, 0.028),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthTest: false, side: THREE.DoubleSide }),
    );
    visual.position.copy(u).add(v).multiplyScalar(0.048);
    visual.quaternion.copy(planeQuaternion);
    const hit = new THREE.Mesh(
      new THREE.PlaneGeometry(0.046, 0.046),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    hit.name = hitName;
    hit.position.copy(visual.position);
    hit.quaternion.copy(planeQuaternion);
    hit.userData = { dragMode: 'plane', axisName: name };
    planeGroup.add(visual, hit);
    tcpTranslationGizmo.add(planeGroup);
    gizmoVisuals.push({ key: name, meshes: [visual], color });
    gizmoHitTargets.push(hit);
  }
  planeDefinitions.forEach(addPlaneHandle);

  const tcpHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.018, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x1be7e2, emissive: 0x063f43, metalness: 0.1, roughness: 0.28 }),
  );
  tcpHandle.name = 'tcpCenterHandle';
  const tcpCenterHit = new THREE.Mesh(
    new THREE.SphereGeometry(0.017, 14, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  tcpCenterHit.name = 'tcpCenterHit';
  tcpCenterHit.userData = { dragMode: 'screen', axisName: null };
  tcpTranslationGizmo.add(tcpHandle, tcpCenterHit);
  gizmoVisuals.push({ key: 'screen', meshes: [tcpHandle], color: 0x1be7e2 });
  gizmoHitTargets.push(tcpCenterHit);
  scene.add(actualRoot, previewRoot, tcpTranslationGizmo);

  const loader = new STLLoader();
  let actualTree = null;
  let previewTree = null;
  const actualNodes = new Map();
  const previewNodes = new Map();
  let frame = 0;
  let activeModelConfig = modelConfig;
  let geometryLoaded = false;
  let loadGeneration = 0;
  let loadStatus = null;
  let lastLoadError = null;
  let observer = null;
  let destroyed = false;
  let renderDirty = true;
  let sceneVisible = true;
  let visibilityObserver = null;
  const invalidate = () => { renderDirty = true; };
  controls.addEventListener('change', invalidate);
  let handleEnabled = false;
  let hoverHandle = null;
  let dragConstraint = null;
  const renderRateMeter = createRateMeter();
  let handleCallbacks = { onDrag: () => {}, onDragEnd: () => {}, onDragError: () => {} };

  const HANDLE_STYLES = Object.freeze({
    disabled: { color: 0x688087, emissive: 0x071216, scale: 0.85, opacity: 0.38 },
    idle: { color: 0x1be7e2, emissive: 0x063f43, scale: 1, opacity: 0.9 },
    hover: { color: 0x70fff9, emissive: 0x0b7777, scale: 1.18, opacity: 1 },
    dragging: { color: 0xffffff, emissive: 0x1be7e2, scale: 1.28, opacity: 1 },
  });

  function setHandleVisual(state) {
    renderDirty = true;
    const style = HANDLE_STYLES[state];
    const activeKey = dragConstraint?.axisName ?? (dragConstraint?.mode === 'screen' ? 'screen' : hoverHandle);
    for (const visual of gizmoVisuals) {
      const active = visual.key === activeKey;
      for (const mesh of visual.meshes) {
        mesh.material.color.setHex(state === 'dragging' && active ? 0xffffff : visual.color);
        if (mesh.material.emissive) mesh.material.emissive.setHex(active ? style.emissive : 0x000000);
        mesh.material.transparent = state === 'disabled' || (!active && state === 'dragging');
        mesh.material.opacity = state === 'disabled' ? 0.32 : (!active && state === 'dragging' ? 0.42 : 1);
      }
    }
    tcpHandle.scale.setScalar(activeKey === 'screen' && state !== 'idle' ? style.scale : 1);
    canvas.style.cursor = state === 'dragging' ? 'grabbing' : (state === 'hover' ? 'grab' : '');
  }

  const pointerDrag = createPointerDragLifecycle({
    controls,
    setVisual: setHandleVisual,
    isHandleEnabled: () => handleEnabled,
    onError: (error) => handleCallbacks.onDragError(error),
    setPointerCapture: (pointerId) => renderer.domElement.setPointerCapture(pointerId),
    hasPointerCapture: (pointerId) => renderer.domElement.hasPointerCapture?.(pointerId) ?? false,
    releasePointerCapture: (pointerId) => renderer.domElement.releasePointerCapture(pointerId),
  });

  function setRayFromPointer(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function intersectDragPlane(event) {
    setRayFromPointer(event);
    if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return null;
    if (dragConstraint?.mode === 'axis') {
      const displacement = dragPoint.clone().sub(dragConstraint.startHit).dot(dragConstraint.axis.clone());
      return new THREE.Vector3().fromArray(constrainAxisTranslation({
        start: dragConstraint.startPosition.toArray(),
        axis: dragConstraint.axis.toArray(),
        displacement,
        snap: event.shiftKey ? 0.001 : 0,
      }));
    }
    if (dragConstraint?.mode === 'plane') {
      const movement = dragPoint.clone().sub(dragConstraint.startHit);
      return new THREE.Vector3().fromArray(constrainPlaneTranslation({
        start: dragConstraint.startPosition.toArray(),
        u: dragConstraint.u.toArray(),
        v: dragConstraint.v.toArray(),
        uDisplacement: movement.dot(dragConstraint.u),
        vDisplacement: movement.dot(dragConstraint.v),
        snap: event.shiftKey ? 0.001 : 0,
      }));
    }
    if (dragConstraint?.mode === 'screen') {
      const movement = dragPoint.clone().sub(dragConstraint.startHit);
      return new THREE.Vector3().fromArray(constrainScreenTranslation({
        start: dragConstraint.startPosition.toArray(),
        right: dragConstraint.right.toArray(),
        up: dragConstraint.up.toArray(),
        rightDisplacement: movement.dot(dragConstraint.right),
        upDisplacement: movement.dot(dragConstraint.up),
        snap: event.shiftKey ? 0.001 : 0,
      }));
    }
    return dragPoint.clone().add(dragOffset);
  }

  function onPointerDown(event) {
    if (!handleEnabled || pointerDrag.activePointerId !== null || event.button !== 0) return;
    setRayFromPointer(event);
    const hit = raycaster.intersectObjects(gizmoHitTargets, false)[0];
    if (!hit) return;
    const { dragMode, axisName } = hit.object.userData;
    const startPosition = tcpTranslationGizmo.position.clone();
    const viewDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
    let normal = viewDirection;
    let axis = null;
    let u = null;
    let v = null;
    if (dragMode === 'axis') {
      const localAxis = axisDefinitions.find((entry) => entry.name === axisName).direction;
      axis = localAxis.clone().applyQuaternion(tcpTranslationGizmo.quaternion).normalize();
      normal = viewDirection.clone().addScaledVector(axis, -viewDirection.dot(axis));
      if (normal.lengthSq() < 1e-6) {
        handleCallbacks.onDragError(new Error(`当前视角下末端局部 ${axisName.toUpperCase()} 轴不可拖动，请旋转视角后重试`));
        return;
      }
      normal.normalize();
    } else if (dragMode === 'plane') {
      const definition = planeDefinitions.find((entry) => entry.name === axisName);
      u = definition.u.clone().applyQuaternion(tcpTranslationGizmo.quaternion).normalize();
      v = definition.v.clone().applyQuaternion(tcpTranslationGizmo.quaternion).normalize();
      normal = u.clone().cross(v).normalize();
    }
    dragPlane.setFromNormalAndCoplanarPoint(normal, startPosition);
    const planePoint = raycaster.ray.intersectPlane(dragPlane, dragPoint);
    if (!planePoint) {
      handleCallbacks.onDragError(new Error('无法建立 TCP 拖拽平面'));
      return;
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
    dragConstraint = {
      mode: dragMode,
      axisName,
      axis,
      u,
      v,
      startPosition,
      startHit: planePoint.clone(),
      right,
      up,
    };
    dragOffset.copy(startPosition).sub(planePoint);
    if (!pointerDrag.begin(event.pointerId)) {
      dragConstraint = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event) {
    if (pointerDrag.activePointerId === event.pointerId) {
      const target = intersectDragPlane(event);
      if (!target) handleCallbacks.onDragError(new Error('TCP 拖拽射线未命中拖拽平面'));
      else {
        tcpTranslationGizmo.position.copy(target);
        const metadata = { mode: dragConstraint.mode, axis: dragConstraint.axisName };
        handleCallbacks.onDrag(target.toArray(), metadata);
      }
      event.preventDefault();
      return;
    }
    if (!handleEnabled) return setHandleVisual('disabled');
    setRayFromPointer(event);
    const hit = raycaster.intersectObjects(gizmoHitTargets, false)[0];
    hoverHandle = hit?.object.userData.axisName ?? (hit?.object.userData.dragMode === 'screen' ? 'screen' : null);
    setHandleVisual(hit ? 'hover' : 'idle');
  }

  function finishPointerDrag(event, cancelled = false) {
    if (pointerDrag.activePointerId !== event.pointerId) return;
    let target = null;
    const metadata = dragConstraint ? { mode: dragConstraint.mode, axis: dragConstraint.axisName } : null;
    if (!cancelled) target = intersectDragPlane(event);
    if (cancelled) pointerDrag.cancel(event.pointerId);
    else pointerDrag.finish(event.pointerId);
    dragConstraint = null;
    if (!cancelled && target) handleCallbacks.onDragEnd(target.toArray(), metadata);
    else if (!cancelled) handleCallbacks.onDragError(new Error('TCP 拖拽结束点无效'));
  }

  const onPointerUp = (event) => finishPointerDrag(event, false);
  const onPointerCancel = (event) => finishPointerDrag(event, true);
  const onLostPointerCapture = (event) => {
    const lost = pointerDrag.lost(event.pointerId);
    if (lost) dragConstraint = null;
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerCancel);
  renderer.domElement.addEventListener('lostpointercapture', onLostPointerCapture);

  function makeSkeleton(tree, root, nodes) {
    const linkGroups = new Map([...tree.links].map(([name]) => [name, new THREE.Group()]));
    for (const [name, group] of linkGroups) group.name = name;
    root.add(linkGroups.get(tree.rootLink));
    for (const joint of tree.joints.values()) {
      const originGroup = new THREE.Group();
      originGroup.name = joint.name;
      applyUrdfOrigin(originGroup, joint.origin);
      const motionGroup = new THREE.Group();
      motionGroup.name = `${joint.name}:axis-motion`;
      originGroup.add(motionGroup);
      motionGroup.add(linkGroups.get(joint.child));
      linkGroups.get(joint.parent).add(originGroup);
      // 保存关节的原始位置和轴，用于平移关节的位移计算
      nodes.set(joint.name, {
        originGroup,
        motionGroup,
        axis: new THREE.Vector3(...joint.axis).normalize(),
        origin: { x: joint.origin.xyz[0], y: joint.origin.xyz[1], z: joint.origin.xyz[2] },
      });
    }
    return linkGroups;
  }

  let actualLinks = new Map();
  let previewLinks = new Map();

  function rebuildSkeleton(config) {
    disposeObject(actualRoot);
    disposeObject(previewRoot);
    actualRoot.clear();
    previewRoot.clear();
    // 复位根节点位姿：避免上一个模型的 rootPose（如 PiPER 的立起旋转）残留到其它模型
    actualRoot.position.set(0, 0, 0);
    actualRoot.quaternion.set(0, 0, 0, 1);
    previewRoot.position.set(0, 0, 0);
    previewRoot.quaternion.set(0, 0, 0, 1);
    actualNodes.clear();
    previewNodes.clear();
    actualTree = buildJointTree(config.joints);
    previewTree = buildJointTree(config.joints);
    actualLinks = makeSkeleton(actualTree, actualRoot, actualNodes);
    previewLinks = makeSkeleton(previewTree, previewRoot, previewNodes);
    // 可选：模型级根姿态（如把 CAD 导出的“前伸/平放”姿态整体立起）
    if (config.rootPose) {
      applyUrdfOrigin(actualRoot, config.rootPose);
      applyUrdfOrigin(previewRoot, config.rootPose);
    }
    // 可选：固定的显示关节姿态（纯展示模型加载后即呈现该姿态）
    if (config.displayPose) {
      updateNodes(actualTree, actualNodes, config.displayPose);
      updateNodes(previewTree, previewNodes, config.displayPose);
    }
    previewRoot.visible = false;
  }

  rebuildSkeleton(activeModelConfig);

  function updateNodes(tree, nodes, angles) {
    renderDirty = true;
    applyModelJointAngles(tree, angles);
    for (const [name, joint] of tree.joints) {
      const node = nodes.get(name);
      // 平移关节：应用位移（单位：米）
      if (joint.type === 'prismatic') {
        const translation = joint.translation ?? 0;
        // motionGroup 已经是 originGroup 的子对象，只需沿轴移动 translation 距离
        node.motionGroup.position.set(
          (node.axis?.x || 0) * translation,
          (node.axis?.y || 0) * translation,
          (node.axis?.z || 0) * translation,
        );
      } else {
        // 旋转关节：应用旋转
        node.motionGroup.quaternion.setFromAxisAngle(node.axis, renderedJointAngle(joint));
      }
    }
  }

  function refreshLanguage() {
    if (destroyed) return;
    if (statusElement && loadStatus) {
      const { state, name, count } = loadStatus;
      statusElement.textContent = state === 'error'
        ? t('model.status.failed')
        : tWithVars(state === 'ready' ? 'model.status.ready' : 'model.status.loading-parts', { name, count });
      statusElement.dataset.state = state;
    }
    if (errorElement && lastLoadError !== null) {
      errorElement.textContent = tWithVars('model.status.failed-detail', { message: lastLoadError });
    }
  }

  function setStatus(state, config) {
    loadStatus = { state, name: config.name, count: config.parts.length };
    refreshLanguage();
  }

  function resize() {
    renderDirty = true;
    const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
    const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render() {
    if (destroyed) return;
    frame = requestAnimationFrame(render);
    if (document.hidden || !sceneVisible) return;
    const cameraChanged = controls.update();
    if (!renderDirty && !cameraChanged) return;
    if (tcpTranslationGizmo.visible) {
      const distance = camera.position.distanceTo(tcpTranslationGizmo.position);
      tcpTranslationGizmo.scale.setScalar(THREE.MathUtils.clamp(distance * 0.16, 0.55, 2.4));
    }
    renderDirty = false;
    const sample = renderRateMeter.tick(performance.now());
    if (sample) onRenderFps(sample.hz);
    renderer.render(scene, camera);
  }

  function resetCamera() {
    camera.position.set(0.62, -0.72, 0.46);
    controls.target.set(0.04, 0, 0.16);
    controls.update();
  }

  function fitCamera() {
    const box = new THREE.Box3().setFromObject(actualRoot);
    if (box.isEmpty()) return resetCamera();
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(0.25, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.2);
    const direction = new THREE.Vector3(1, -1, 0.65).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.near = Math.max(0.001, distance / 100);
    camera.far = Math.max(10, distance * 10);
    camera.updateProjectionMatrix();
    controls.update();
  }

  async function load(config = activeModelConfig) {
    const generation = ++loadGeneration;
    activeModelConfig = config;
    geometryLoaded = false;
    cancelTcpDrag('模型正在切换');
    handleEnabled = false;
    tcpTranslationGizmo.visible = false;
    rebuildSkeleton(config);
    setStatus('loading', config);
    try {
      const geometries = await loadModelAssets(config.parts, {
        baseUrl: import.meta.url,
        load: url => loader.loadAsync(url),
        isCurrent: () => !destroyed && generation === loadGeneration,
      });
      if (destroyed || generation !== loadGeneration) {
        for (const { geometry } of geometries) geometry.dispose();
        return api;
      }
      for (const { link, geometry, origin, scale, color } of geometries) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (destroyed || generation !== loadGeneration) {
          for (const part of geometries) part.geometry.dispose();
          return api;
        }
        geometry.computeVertexNormals();
        const actualMaterial = new THREE.MeshStandardMaterial({ color: color ? new THREE.Color(...color) : 0xd8dde5, metalness: 0.35, roughness: 0.42 });
        const actualMesh = new THREE.Mesh(geometry, actualMaterial);
        if (origin) applyUrdfOrigin(actualMesh, origin);
        if (scale) actualMesh.scale.fromArray(scale);
        actualLinks.get(link).add(actualMesh);
        // Both meshes can share immutable vertex data; material and transforms remain independent.
        const previewGeometry = geometry;
        // Dense CAD wireframes are expensive on software WebGL and can block
        // fresh control feedback. A flat translucent surface keeps the same
        // target geometry without lighting or a second set of edge indices.
        const previewMaterial = new THREE.MeshBasicMaterial({
          color: 0x1be7e2, transparent: true, opacity: 0.28, depthWrite: false,
        });
        const previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
        if (origin) applyUrdfOrigin(previewMesh, origin);
        if (scale) previewMesh.scale.fromArray(scale);
        previewLinks.get(link).add(previewMesh);
      }
      geometryLoaded = true;
      lastLoadError = null;
      setStatus('ready', config);
      if (errorElement) errorElement.hidden = true;
      fitCamera();
      return api;
    } catch (error) {
      if (destroyed || generation !== loadGeneration) return api;
      lastLoadError = String(error?.message ?? error);
      setStatus('error', config);
      if (errorElement) {
        errorElement.hidden = false;
      }
      onError(error);
      throw error;
    }
  }

  async function setModel(config) {
    if (!config?.parts || !config?.joints) throw new TypeError('模型配置无效');
    if (config.key === activeModelConfig.key && geometryLoaded) return api;
    return load(config);
  }

  function update(angles) {
    updateNodes(actualTree, actualNodes, angles);
  }

  function preview(angles = null) {
    renderDirty = true;
    previewRoot.visible = Boolean(angles);
    if (angles) updateNodes(previewTree, previewNodes, angles);
  }

  function cancelTcpDrag(reason = 'TCP 拖拽已取消') {
    if (pointerDrag.activePointerId === null) return false;
    const cancelled = pointerDrag.cancel(pointerDrag.activePointerId, reason);
    if (cancelled) dragConstraint = null;
    return cancelled;
  }

  function setTcpDragHandle({
    position,
    orientation = [0, 0, 0, 1],
    enabled = false,
    visible = true,
    onDrag = () => {},
    onDragEnd = () => {},
    onDragError = () => {},
  } = {}) {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
      throw new TypeError('TCP handle position 必须是包含 3 个有限数值的数组');
    }
    if (!Array.isArray(orientation) || orientation.length !== 4 || !orientation.every(Number.isFinite)) {
      throw new TypeError('TCP handle orientation 必须是包含 4 个有限数值的四元数数组');
    }
    if (!enabled) cancelTcpDrag('TCP 拖拽入口已禁用');
    tcpTranslationGizmo.position.fromArray(position);
    if (pointerDrag.activePointerId === null) tcpTranslationGizmo.quaternion.fromArray(orientation).normalize();
    tcpTranslationGizmo.visible = Boolean(visible);
    handleEnabled = Boolean(enabled);
    handleCallbacks = { onDrag, onDragEnd, onDragError };
    setHandleVisual(handleEnabled ? 'idle' : 'disabled');
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    visibilityObserver?.disconnect();
    controls.removeEventListener('change', invalidate);
    cancelTcpDrag('三维模型已销毁');
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
    renderer.domElement.removeEventListener('lostpointercapture', onLostPointerCapture);
    controls.dispose();
    disposeObject(actualRoot);
    disposeObject(previewRoot);
    disposeObject(tcpTranslationGizmo);
    renderer.dispose();
  }

  const api = {
    load, setModel, update, preview, setTcpDragHandle, cancelTcpDrag, destroy, resize, resetCamera, fitCamera, refreshLanguage,
  };
  resetCamera();
  resize();
  observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement || canvas);
  if (typeof IntersectionObserver === 'function') {
    visibilityObserver = new IntersectionObserver(entries => { sceneVisible = entries[0]?.isIntersecting !== false; renderDirty = true; });
    visibilityObserver.observe(canvas);
  }
  render();
  return api;
}
