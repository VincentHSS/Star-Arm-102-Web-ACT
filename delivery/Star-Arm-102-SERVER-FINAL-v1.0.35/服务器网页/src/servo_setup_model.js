// Configuration-only LD viewer: picking and highlighting never communicate with hardware.
import * as THREE from '../assets/vendor/three.module.js';
import { STLLoader } from '../assets/vendor/STLLoader.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import { MODEL_CONFIGS } from './robot_model_configs.js?v=server-1.0.35';
import { buildJointTree, applyModelJointAngles, renderedJointAngle } from './robot_model.js?v=server-1.0.35';
import { loadModelAssets } from './model_asset_loader.js?v=server-1.0.35';
import { createStlAssetLoader } from './mesh_transport.js?v=server-1.0.35';
import { LD_SERVO_PARTS } from './servo_setup_parts.js?v=server-1.0.35';

export async function createServoSetupModel({ canvas, onSelect, onLabels, onError }) {
  const config = MODEL_CONFIGS.ld;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.001, 20);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  scene.add(new THREE.HemisphereLight(0xe5eeff, 0x141a23, 1.8));
  const light = new THREE.DirectionalLight(0xf1eaff, 3.2); light.position.set(0.4, -0.7, 1); scene.add(light);
  const rim = new THREE.DirectionalLight(0x65dbe3, 2.7); rim.position.set(-.5, .4, .7); scene.add(rim);
  const faces = Array.from({ length: 6 }, (_, i) => {
    const face = document.createElement('canvas'); face.width = face.height = 128;
    const context = face.getContext('2d'), gradient = context.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, '#131c27'); gradient.addColorStop(.35, i % 2 ? '#84799d' : '#466976');
    gradient.addColorStop(.43, '#e2eaf5'); gradient.addColorStop(.48, '#fcfdff'); gradient.addColorStop(.56, '#283244'); gradient.addColorStop(1, '#10161d');
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128); return face;
  });
  const cubemap = new THREE.CubeTexture(faces); cubemap.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromCubemap(cubemap);
  scene.environment = environment.texture; pmrem.dispose(); cubemap.dispose();
  const grid = new THREE.GridHelper(1.6, 40, 0x70517e, 0x36484e); grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true; grid.material.opacity = 0.28; scene.add(grid);
  const root = new THREE.Group(); scene.add(root);
  const tree = buildJointTree(config.joints), links = new Map([[tree.rootLink, root]]), joints = new Map();
  const origins = new Map();
  function branch(link) {
    for (const joint of tree.joints.values()) if (joint.parent === link) {
      const origin = new THREE.Group(); origin.position.fromArray(joint.origin.xyz);
      origin.quaternion.setFromEuler(new THREE.Euler(...joint.origin.rpy, 'ZYX'));
      const motion = new THREE.Group(); origin.add(motion); links.get(link).add(origin);
      links.set(joint.child, motion); joints.set(joint.name, motion); origins.set(joint.name, origin); branch(joint.child);
    }
  }
  branch(tree.rootLink);
  applyModelJointAngles(tree, { joint2: 1.0, joint3: -1.0, joint4: 0.4 });
  for (const joint of tree.joints.values()) joints.get(joint.name).quaternion.setFromAxisAngle(new THREE.Vector3(...joint.axis), renderedJointAngle(joint));
  const materials = Array.from({ length: 8 }, (_, index) => {
    const material = new THREE.MeshPhysicalMaterial({ color: index ? 0xa7b3bc : 0x4d5c63, metalness: .65, roughness: .28, clearcoat: .65, clearcoatRoughness: .2 });
    material.userData.slot = index ? index - 1 : null; return material;
  });
  const meshes = [], raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let selected = 0, dirty = true, destroyed = false, visible = true, frame = 0, down = null;
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);
  function labels() {
    root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const values = LD_SERVO_PARTS.motors.map(({ slot, link, center }) => {
      const point = new THREE.Vector3(...center); links.get(link).localToWorld(point);
      point.project(camera);
      return { slot, x: (point.x + 1) / 2, y: (1 - point.y) / 2, visible: point.z > -1 && point.z < 1 };
    });
    const box = canvas.getBoundingClientRect(), placed = [];
    for (const point of values) {
      point.anchorX = point.x; point.anchorY = point.y;
      const clear = (x, y) => placed.every(other => Math.hypot((x - other.x) * box.width, (y - other.y) * box.height) >= 37);
      if (!clear(point.x, point.y)) {
        search: for (let radius = 38; radius <= 152; radius += 19) for (let step = 0; step < 16; step++) {
          const angle = step * Math.PI / 8, x = point.anchorX + Math.cos(angle) * radius / box.width, y = point.anchorY + Math.sin(angle) * radius / box.height;
          if (x > 0.04 && x < 0.96 && y > 0.04 && y < 0.96 && clear(x, y)) { point.x = x; point.y = y; break search; }
        }
      }
      placed.push(point);
    }
    onLabels(values);
  }
  function resize() {
    const { width, height } = canvas.getBoundingClientRect(); if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
  }
  function fit() {
    const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(0.3, sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.aspect < 1 ? 1.15 : 1.05));
    controls.target.copy(sphere.center); camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(1, -1.6, 0.9).normalize(), distance);
    controls.update(); dirty = true;
  }
  function setSelected(slot) {
    selected = slot;
    for (const material of materials) {
      const chosen = material.userData.slot === slot;
      material.color.setHex(chosen ? 0xd8e3e7 : material.userData.slot === null ? 0x4d5c63 : 0xa7b3bc);
      material.emissive.setHex(chosen ? 0x74c5cc : 0x000000);
      material.emissiveIntensity = chosen ? 0.035 : 0;
      material.roughness = chosen ? .22 : .28;
    }
    dirty = true;
  }
  function pointerDown(event) { down = { x: event.clientX, y: event.clientY }; }
  function pointerUp(event) {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) { down = null; return; }
    down = null; const box = canvas.getBoundingClientRect();
    pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) {
      const slot = hit.object.material[hit.face.materialIndex].userData.slot;
      if (slot !== null) onSelect(slot);
    }
  }
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointerup', pointerUp);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; dirty = true; }); observer.observe(canvas);
  function tick() {
    if (destroyed) return; frame = requestAnimationFrame(tick);
    if (!visible) return;
    const moved = controls.update();
    if (dirty || moved) { renderer.render(scene, camera); labels(); dirty = false; }
  }
  function destroy() {
    destroyed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); observer.disconnect();
    canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp);
    controls.removeEventListener('change', invalidate); controls.dispose();
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of materials) material.dispose();
    environment.dispose(); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
  }
  try {
    const loader = new STLLoader();
    const parts = await loadModelAssets(config.parts, { baseUrl: import.meta.url, load: createStlAssetLoader(data => loader.parse(data)), isCurrent: () => !destroyed });
    for (const { link, geometry } of parts) {
      geometry.computeVertexNormals();
      geometry.clearGroups();
      const groups = LD_SERVO_PARTS.parts[link]?.ranges || [{ first: 0, count: geometry.attributes.position.count / 3, slot: null }];
      for (const group of groups) geometry.addGroup(group.first * 3, group.count * 3, group.slot === null ? 0 : group.slot + 1);
      const mesh = new THREE.Mesh(geometry, materials); links.get(link).add(mesh); meshes.push(mesh);
    }
    resize(); fit(); setSelected(selected); tick();
  } catch (error) { destroy(); onError(error); throw error; }
  return { resize, fit, setSelected, destroy };
}
