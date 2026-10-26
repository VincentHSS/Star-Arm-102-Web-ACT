import { createRobotModel } from './robot_model.js?v=server-1.0.35';
import { SUPPLIED_URDF_MODELS } from './supplied_urdf_models.js?v=server-1.0.35';

const $ = (id) => document.getElementById(id);
let renderer;
let pose = {};
let config;
let generation = 0;
const showError = (error) => {
  $('modelError').hidden = false;
  $('modelError').textContent = `无法显示模型：${error.message}。请通过本地启动器或网站打开，检查资源是否完整。`;
};
function controls() {
  pose = {};
  $('jointControls').replaceChildren();
  for (const joint of config.joints) {
    if (joint.type === 'fixed' || joint.mimic) continue;
    const linear = joint.type === 'prismatic';
    const factor = linear ? 1000 : 180 / Math.PI;
    const label = document.createElement('label');
    label.className = 'joint';
    const title = document.createElement('span');
    title.textContent = joint.name;
    const output = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    const previewLimit = joint.previewLimit ?? joint.limit;
    input.min = String(Math.ceil(previewLimit.lower * factor * 10) / 10);
    input.max = String(Math.floor(previewLimit.upper * factor * 10) / 10);
    input.step = '0.1';
    input.value = '0';
    input.setAttribute('aria-label', joint.name);
    const update = () => {
      pose[joint.name] = Number(input.value) / factor;
      output.textContent = `${Number(input.value).toFixed(1)} ${linear ? 'mm' : '°'}`;
      renderer.update(pose);
    };
    input.addEventListener('input', update);
    label.append(title, output, input);
    if (joint.type === 'continuous') {
      const hint = document.createElement('small');
      hint.textContent = `${input.min}–${input.max}° 仅为模型演示范围，实机零位与限位需单独标定`;
      label.append(hint);
    }
    $('jointControls').append(label);
    update();
  }
}
async function selectModel() {
  const token = ++generation;
  config = SUPPLIED_URDF_MODELS[$('modelSelect').value];
  $('jointControls').replaceChildren();
  $('modelError').hidden = true;
  $('resetPose').disabled = true;
  $('modelDescription').textContent = config.key === 'fl-v3'
    ? '用户提供的 FL 模型：6 个旋转关节、2 个平移夹指，单位为米和弧度。'
    : 'Touch R1 V3.2 模型：七颗舵机、完整手柄与左右夹指，25 份网格。J7 驱动右夹指，左夹指按 URDF 反向联动。';
  $('urdfDownload').href = new URL(config.sourceUrdf, import.meta.url).href;
  try {
    await renderer.load(config);
    if (token !== generation) return;
    controls();
    $('resetPose').disabled = false;
  } catch (error) { if (token === generation) showError(error); }
}
try {
  renderer = createRobotModel({ canvas: $('modelCanvas'), modelConfig: SUPPLIED_URDF_MODELS['fl-v3'], statusElement: $('modelStatus') });
  $('modelSelect').addEventListener('change', selectModel);
  $('resetPose').addEventListener('click', () => { controls(); renderer.fitCamera(); });
  $('fitView').addEventListener('click', () => renderer.fitCamera());
  window.addEventListener('pagehide', () => renderer.destroy(), { once: true });
  await selectModel();
} catch (error) { showError(error); }
