// Configuration-only LD viewer: picking and highlighting never communicate with hardware.
import * as THREE from '../assets/vendor/three.module.js';
import { STLLoader } from '../assets/vendor/STLLoader.js';
import { OrbitControls } from '../assets/vendor/OrbitControls.js';
import { MODEL_CONFIGS } from './robot_model_configs.js';
import { buildJointTree, applyModelJointAngles, renderedJointAngle } from './robot_model.js?v=servo-studio-1';
import { loadModelAssets } from './model_asset_loader.js';

export async function createServoSetupModel({ canvas, onSelect, onLabels, onError }) {
  const config = MODEL_CONFIGS.ld;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.001, 20);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.enablePan = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8fa5, 2.3));
  const light = new THREE.DirectionalLight(0xffffff, 3.2); light.position.set(0.4, -0.7, 1); scene.add(light);
  const grid = new THREE.GridHelper(1.6, 32, 0xc0d2e5, 0xe0e8f2); grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true; grid.material.opacity = 0.65; scene.add(grid);
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
  const slots = { base_link: 0, link1: 1, link2: 2, link3: 3, link4: 4, link5: 5, link6: 6, link7_left: 6, link7_right: 6 };
  const meshes = [], raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let selected = 0, dirty = true, destroyed = false, visible = true, frame = 0, down = null;
  const invalidate = () => { dirty = true; };
  controls.addEventListener('change', invalidate);
  function labels() {
    root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const values = Array.from({ length: 7 }, (_, slot) => {
      const point = new THREE.Vector3();
      if (slot === 6) {
        // Centre of the original LD gripper motor case, in link6 metres.
        // Its finger pivot nearly coincides with J6 and would conceal that label.
        point.set(-0.00285, -0.00235, -0.03065); links.get('link6').localToWorld(point);
      } else origins.get(`joint${slot + 1}`).getWorldPosition(point);
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
    for (const mesh of meshes) {
      const chosen = mesh.userData.slot === slot;
      mesh.material.color.setHex(chosen ? 0x80baff : 0xd1dde8);
      mesh.material.emissive.setHex(chosen ? 0x0d326a : 0x000000);
      mesh.material.emissiveIntensity = chosen ? 0.3 : 0;
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
    if (hit) onSelect(hit.object.userData.slot);
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
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    grid.geometry.dispose(); grid.material.dispose(); renderer.dispose();
  }
  try {
    const loader = new STLLoader();
    const parts = await loadModelAssets(config.parts, { baseUrl: import.meta.url, load: url => loader.loadAsync(url), isCurrent: () => !destroyed });
    for (const { link, geometry } of parts) {
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd1dde8, metalness: 0.35, roughness: 0.38 }));
      mesh.userData.slot = slots[link]; links.get(link).add(mesh); meshes.push(mesh);
    }
    resize(); fit(); setSelected(selected); tick();
  } catch (error) { destroy(); onError(error); throw error; }
  return { resize, fit, setSelected, destroy };
}
