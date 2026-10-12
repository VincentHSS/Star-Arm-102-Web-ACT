import { requestJson, fetchWithDeadline } from './api-client.js?v=responsive-1';
import { createSingleFlight, createPageNavigator, withButtonFeedback, setInteractionStatus } from './page-lifecycle.js?v=responsive-1';
import { getLocalApi, localFetch, ensureRuntime, renderRuntimeEnvironment, publicationConfigured } from './local-service.js?v=responsive-1';
import { installWorkbenchMotion, switchWorkbenchView } from './act-motion.js?v=2026-10-12-motion-icons-13';
import { effectiveCameraBackend, cameraConnectionSignature, nativeCameraReady, cameraRolePresentation } from './act-camera-state.js?v=2026-10-09-camera-ui-7';
import { WaveformBuffer, WaveformChart } from './act-waveform.js?v=0.1.0-camera-reconnect-1';
import { BrowserCameraController } from './act-cameras.js';
import { CaptureQualityMonitor } from './act-capture-quality.js';
import { CameraFrameUploader, encodeFrozenFrame, freezeVideoFrame } from './act-camera-frame-uploader.js?v=0.1.0-camera-worker-6';
import { CameraFrameEncoderWorkerClient } from './act-camera-frame-encoder-worker-client.js?v=0.1.0-camera-worker-6';

const API = getLocalApi();
const state = { navigationPending: false, deviceEpoch: 0, capabilities: null, trainingEnvironment: null, trainingPoll: null, trainingJob: null, trainingJobPoll: null, datasets: [], episodes: [], episode: null, selectedDatasetId: null, datasetStats: null, deviceBinding: null, serial: { leader: null, follower: null }, browserCameras: [], nativeCameras: [], cameraBackend: null, cameraFaultResetting: false, telemetryStream: null, completedRounds: 0, targetRounds: 20, cameraFrameCallbacks: { wrist: null, world: null }, cameraFrameSupport: { wrist: null, world: null }, frameDrain: null, models: [], selectedInferenceModelId: null, modelImporting: false, inference: null, inferenceGate: null, inferencePoll: null, inferenceStarting: false, inferenceStartError: null, inferenceLastActionCount: 0 };
const $ = (selector) => document.querySelector(selector);
const cameraController = navigator.mediaDevices ? new BrowserCameraController(navigator.mediaDevices) : null;
const qualityMonitor = new CaptureQualityMonitor({ windowSize: 250 });
const frameEncoder = new CameraFrameEncoderWorkerClient();

const serialOperations = new Set();
let refreshRevision = 0;
function request(path, options = {}) {
  const operation = requestJson(localFetch, `${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }).then(body => {
    if (options.method && options.method !== 'GET' && /^(\/datasets$|\/episodes\/[^/]+\/(start|stop|review)$|\/devices\/|\/settings\/data-dir$)/.test(path)) refreshRevision++;
    return body;
  });
  if (path === '/devices/serial/connect') {
    const tracked = operation.finally(() => serialOperations.delete(tracked));
    serialOperations.add(tracked); return tracked;
  }
  return operation;
}

const frameUploader = new CameraFrameUploader({
  quality: 0.85,
  batchSize: 6,
  maxQueue: 24,
  encodeConcurrency: 2,
  freeze: freezeVideoFrame,
  encode: (frame, quality) => typeof frame?.close === 'function' ? frameEncoder.encode(frame, quality) : encodeFrozenFrame(frame, quality),
  upload: (episodeId, role, frames) => request(`/episodes/${episodeId}/camera-frames`, {
    method: 'POST', body: JSON.stringify({ role, frames }),
  }),
});

function selectedDatasetId() { return $('#active-dataset').value || state.selectedDatasetId || null; }
function selectedDataset() { const id = selectedDatasetId(); return state.datasets.find(item => item.id === id) || null; }
function formatBytes(value) { const bytes = Number(value || 0); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(2)} GB`; }
function setTransferStatus(message, mode = '') { const target = $('#dataset-transfer-status'); target.textContent = message; target.className = `form-status ${mode}`.trim(); }
async function downloadDataset() {
  const dataset = selectedDataset();
  if (!dataset || state.episode || state.frameDrain) return toast('当前状态不能导出数据集');
  const button = $('#dataset-export');
  button.disabled = true;
  setTransferStatus('正在校验并生成完整数据集 ZIP…', 'pending');
  try {
    const blob = await fetchWithDeadline(localFetch, `${API}/datasets/${dataset.id}/export`, {}, async response => {
      if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message || `HTTP ${response.status}`); }
      return response.blob();
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${dataset.slug}.zip`; link.click();
    URL.revokeObjectURL(url);
    setTransferStatus(`已导出 ${dataset.slug}.zip（${formatBytes(blob.size)}）。`, 'success');
  } catch (error) { setTransferStatus(`导出失败：${error.message}`, 'error'); }
  finally { renderDatasetStats(state.datasetStats); }
}

async function importDataset(file) {
  if (!file || state.episode || state.frameDrain) return toast('当前状态不能导入数据集');
  $('#dataset-import').disabled = true;
  setTransferStatus(`正在校验并导入 ${file.name}…`, 'pending');
  try {
    const body = await requestJson(localFetch, `${API}/datasets/import`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    state.selectedDatasetId = body.dataset.id;
    setTransferStatus(`已作为副本导入：${body.dataset.task_name} · ${body.dataset.slug}`, 'success');
    await refreshAfterMutation();
  } catch (error) { setTransferStatus(`导入失败：${error.message}`, 'error'); }
  finally { $('#dataset-import').disabled = false; $('#dataset-import-file').value = ''; }
}
function toast(message) { const target = $('#toast'); target.textContent = message; target.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => target.classList.remove('show'), 2800); }
function capabilityRow(label, value, ok) { return `<div class="cap-row"><span>${label}</span><b class="${ok ? 'ok' : 'bad'}">${value}</b></div>`; }
function populateSelect(selector, items, valueOf, labelOf) { const select = $(selector); const selected = select.value; select.innerHTML = '<option value="">未检测</option>' + items.map(item => `<option value="${valueOf(item)}">${labelOf(item)}</option>`).join(''); if ([...select.options].some(option => option.value === selected)) select.value = selected; }
function setDeviceCard(role, connected, detail, verification = '') { const prefix = role === 'leader' ? 'leader' : 'follower'; $(`#${prefix}-badge`).textContent = connected ? (verification === 'transport_open' ? 'OPEN / VERIFY' : 'ONLINE') : 'OFFLINE'; $(`#${prefix}-badge`).className = `status-badge ${connected ? (verification === 'transport_open' ? 'pending' : 'on') : 'off'}`; $(`#${prefix}-transport`).textContent = connected ? detail : '未连接 · 1 Mbps'; $(`#connect-${prefix}`).disabled = connected; $(`#disconnect-${prefix}`).disabled = !connected; }
function setDatasetFormStatus(message, mode = '') { const target = $('#dataset-form-status'); target.textContent = message; target.className = `form-status ${mode}`.trim(); }
function updateNextAction() { const target = $('#camera-next-action'); const leaderConnected = Boolean(state.serial.leader?.connected); const followerConnected = Boolean(state.serial.follower?.connected); const camerasConnected = $('#camera-badge').classList.contains('on'); let message = '下一步：连接 Leader 和真实 FL。'; let ready = false; if (leaderConnected && !followerConnected) message = '下一步：连接真实 FL。'; else if (!leaderConnected && followerConnected) message = '下一步：连接 Leader。'; else if (leaderConnected && followerConnected && Math.max(state.browserCameras.length, state.nativeCameras.length) < 2) message = '机械臂已连接。下一步：点击“检测摄像头”。'; else if (leaderConnected && followerConnected && !camerasConnected) message = '已检测到摄像头。下一步：选择末端与世界视角，然后连接两台摄像头。'; else if (leaderConnected && followerConnected && camerasConnected && !state.deviceBinding) message = '全部设备已连接。下一步：保存设备选择。'; else if (state.deviceBinding?.capture_ready) { message = '设备检查通过。下一步：创建或选择数据集，然后开始 Episode。'; ready = true; } else if (state.deviceBinding) message = '设备选择已保存。串口已打开，等待真实 J1–J7 样本；现在可以创建数据集并开始 Episode。'; target.textContent = message; target.className = `next-action${ready ? ' ready' : ''}`; }
function renderDeviceBinding(binding) { state.deviceBinding = binding; const bound = Boolean(binding); const ready = Boolean(binding?.capture_ready); const recording = state.episode?.status === 'recording'; $('#episode-button').disabled = !bound || !state.datasets.length || Boolean(state.episode) || state.completedRounds >= state.targetRounds; $('#stop-episode').disabled = !recording; $('#capture-gate').textContent = ready ? '设备检查通过' : bound ? '串口已打开 · 等待样本' : '等待设备'; $('#capture-gate').className = `tag ${ready ? 'ready' : bound ? 'pending' : 'blocked'}`; $('#binding-status').textContent = ready ? 'Leader、真实 FL 和两台摄像头均已检查，可以开始 Episode。' : bound ? '设备选择已保存。串口已打开，等待真实 J1–J7 样本；波形没有样本时不会显示模拟数据。' : '请先连接 Leader、真实 FL 和两台不同的摄像头。'; updateNextAction(); }
function renderSerialState(connections = {}) { for (const role of ['leader', 'follower']) { const connection = connections[role]; state.serial[role] = connection || null; setDeviceCard(role, Boolean(connection?.connected), connection ? `${connection.port} · ${connection.baudrate / 1000} kbps` : '', connection?.verification); } renderInferenceSerialState(); }
function renderInferenceSerialState() {
  const connection = state.serial.follower;
  const active = state.inferenceStarting || ['loading', 'running', 'stopping'].includes(state.inference?.status);
  $('#inference-follower-port').disabled = Boolean(connection?.connected) || active || state.navigationPending;
  $('#inference-connect-follower').disabled = Boolean(connection?.connected) || active || state.navigationPending;
  $('#inference-disconnect-follower').disabled = !connection?.connected || state.navigationPending;
  $('#inference-serial-status').textContent = connection?.connected
    ? `从臂已连接 · ${connection.port} · 1 Mbps`
    : '切换页面后串口已释放，请在这里连接从臂。';
}

function renderCapabilities(caps) { state.capabilities = caps; const ports = caps.serial_ports || []; const cameraCount = state.browserCameras.length; const backend = caps.torch.backend ? caps.torch.backend.toUpperCase() : '未准备'; $('#capability-list').innerHTML = [capabilityRow('GPU', caps.gpu.available ? caps.gpu.name : '等待后端检测', caps.gpu.available), capabilityRow('训练运行时', caps.torch.installed ? '已安装' : '未准备', caps.torch.installed), capabilityRow('加速后端', backend, Boolean(caps.torch.backend)), capabilityRow('ACT 执行链', caps.act_runtime.execution_available ? `LeRobot ${caps.act_runtime.lerobot_version || ''}`.trim() : '未准备', caps.act_runtime.execution_available), capabilityRow('ACT 训练', caps.training_ready ? '可用' : '不可用', caps.training_ready), capabilityRow('浏览器摄像头', cameraCount ? `${cameraCount} 台` : '等待授权', cameraCount >= 2), capabilityRow('机械臂串口', `${ports.length} 个设备`, ports.length >= 2)].join(''); populateSelect('#leader-port', ports, item => item, item => item); populateSelect('#follower-port', ports, item => item, item => item); populateSelect('#inference-follower-port', ports, item => item, item => item); if (!$('#inference-follower-port').value) $('#inference-follower-port').value = $('#follower-port').value; renderInferenceSerialState(); $('#bind-devices').disabled = !(state.serial.leader?.connected && state.serial.follower?.connected && $('#camera-badge').classList.contains('on')); updateNextAction(); }

function renderTrainingEnvironment(environment) {
  const wasReady = state.trainingEnvironment?.status === 'ready';
  state.trainingEnvironment = environment;
  renderRuntimeEnvironment(environment);
  const preparing = environment.status === 'preparing';
  const ready = environment.status === 'ready';
  const failed = environment.status === 'failed';
  const runButton = $('#inference-prepare-runtime');
  runButton.classList.toggle('hidden', ready);
  runButton.disabled = preparing;
  runButton.textContent = preparing ? `正在准备运行环境 · ${environment.progress || 0}%` : failed ? '重新准备 ACT 运行环境' : '准备 ACT 运行环境';
  if (ready && !wasReady && state.selectedInferenceModelId) void validateInference();
  $('#training-tag').textContent = ready ? 'ACT 训练可用' : preparing ? '正在准备' : failed ? '准备失败' : '尚未准备';
  $('#training-tag').className = `tag ${ready ? 'cyan' : preparing ? 'pending' : 'blocked'}`;
  $('#training-title').textContent = ready ? '训练环境已就绪' : preparing ? '正在自动准备训练环境' : failed ? '训练环境准备失败' : '准备 ACT 训练环境';
  $('#training-reason').textContent = ready ? `已通过 ${String(environment.backend || '').toUpperCase()} 与 ACT 真实自检。` : failed ? environment.error : '点击一次即可自动安装隔离训练环境，无需终端、sudo 或系统 Python 配置。';
  $('#training-environment-progress').classList.toggle('hidden', !preparing);
  $('#training-stage').textContent = environment.stage_label || '等待开始';
  $('#training-percent').textContent = `${environment.progress || 0}%`;
  $('.environment-progress-rail').style.setProperty('--prepare-progress', String(Math.max(0, Math.min(100, Number(environment.progress) || 0))));
  $('#training-environment-progress').dataset.running = String(preparing);
  $('#training-progress').value = environment.progress || 0;
  $('#training-prepare').classList.toggle('hidden', preparing || ready || failed);
  $('#training-retry').classList.toggle('hidden', !failed);
  $('#training-ready-controls').classList.toggle('hidden', !ready);
  const profile = environment.training_profile || {};
  if (ready) {
    $('#training-batch-size').value = profile.batch_size || 1;
    $('#training-steps').value = profile.steps || 100000;
    $('#training-save-freq').value = profile.save_freq || 10000;
    $('#training-start').disabled = !state.datasets.length || Boolean(state.trainingJob?.status === 'running');
    $('#training-start').title = state.datasets.length ? '' : '请先创建并采集训练数据集';
  }
}

function formatTrainingDuration(milliseconds = 0) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function drawTrainingLoss(metrics = []) {
  const canvas = $('#training-loss-chart');
  const empty = $('#training-chart-empty');
  const valid = metrics.filter(item => Number.isFinite(item.step) && Number.isFinite(item.loss));
  empty.classList.toggle('hidden', valid.length > 1);
  if (valid.length < 2) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  const width = bounds.width;
  const height = bounds.height;
  const pad = { left: 46, right: 16, top: 18, bottom: 26 };
  const losses = valid.map(item => item.loss);
  const minLoss = Math.min(...losses);
  const maxLoss = Math.max(...losses);
  const lossRange = Math.max(maxLoss - minLoss, 0.000001);
  const firstStep = valid[0].step;
  const stepRange = Math.max(valid.at(-1).step - firstStep, 1);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#293537';
  context.lineWidth = 1;
  context.fillStyle = '#778487';
  context.font = '10px ui-monospace, monospace';
  context.textAlign = 'right';
  for (let index = 0; index <= 4; index += 1) {
    const y = pad.top + (height - pad.top - pad.bottom) * index / 4;
    context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
    context.fillText((maxLoss - lossRange * index / 4).toFixed(4), pad.left - 8, y + 3);
  }
  context.strokeStyle = '#46d1d8';
  context.lineWidth = 2;
  context.beginPath();
  valid.forEach((item, index) => {
    const x = pad.left + (item.step - firstStep) / stepRange * (width - pad.left - pad.right);
    const y = pad.top + (maxLoss - item.loss) / lossRange * (height - pad.top - pad.bottom);
    if (index) context.lineTo(x, y); else context.moveTo(x, y);
  });
  context.stroke();
  context.fillStyle = '#8b9698';
  context.textAlign = 'left'; context.fillText(`Step ${firstStep}`, pad.left, height - 8);
  context.textAlign = 'right'; context.fillText(`Step ${valid.at(-1).step}`, width - pad.right, height - 8);
}

function renderTrainingJob(job) {
  state.trainingJob = job;
  const active = job && ['running', 'stopping'].includes(job.status);
  $('#training-job').classList.toggle('hidden', !job);
  if (!job) return;
  const statuses = { running: '训练中', stopping: '正在停止', stopped: '已停止', failed: '失败', interrupted: '已中断', completed: '已完成' };
  const targetSteps = Number(job.parameters?.steps || 0);
  const step = Number(job.step || 0);
  const progress = Number(job.progress_percent || 0);
  const metrics = job.metrics || [];
  const checkpoints = job.checkpoints || [];
  const failed = job.status === 'failed' || job.status === 'interrupted';
  const beforeMetrics = step === 0 && !metrics.length;
  $('#training-run-title').textContent = `${job.dataset_id || '训练数据集'} · ${job.id || ''}`;
  $('#training-job-status').textContent = statuses[job.status] || job.status;
  $('#training-job-status').className = `training-state ${failed ? 'failed' : active ? 'running' : job.status === 'completed' ? 'completed' : ''}`;
  $('#training-live-dot').className = `training-live-dot${active ? ' active' : failed ? ' failed' : ''}`;
  $('#training-phase').textContent = failed ? (beforeMetrics ? '启动阶段失败' : '训练循环异常退出') : active ? (beforeMetrics ? '正在启动训练器' : '正在优化模型') : job.status === 'completed' ? '训练与保存完成' : '任务未运行';
  $('#training-job-step').textContent = `${step.toLocaleString()} / ${targetSteps.toLocaleString()}`;
  $('#training-step-rate').textContent = job.step_rate == null ? '等待训练速度' : `${Number(job.step_rate).toFixed(2)} step/s`;
  $('#training-job-loss').textContent = job.loss == null ? '—' : Number(job.loss).toFixed(6);
  const previousLoss = metrics.length > 1 ? metrics.at(-2).loss : null;
  $('#training-loss-trend').textContent = previousLoss == null || job.loss == null ? '等待真实指标' : `${job.loss <= previousLoss ? '下降' : '上升'} ${Math.abs(job.loss - previousLoss).toFixed(6)}`;
  $('#training-elapsed').textContent = formatTrainingDuration(job.elapsed_ms);
  $('#training-job-checkpoint').textContent = String(checkpoints.length);
  $('#training-checkpoint-latest').textContent = checkpoints.length ? `最近 Step ${checkpoints.at(-1).step ?? checkpoints.at(-1).name}` : '尚未生成';
  $('#training-overall-progress').value = progress;
  $('#training-overall-label').textContent = `${progress.toFixed(1)}%`;
  $('#training-progress-copy').textContent = beforeMetrics
    ? '训练器尚未输出 Step；请查看下方启动日志'
    : `Step ${step.toLocaleString()} / ${targetSteps.toLocaleString()}${job.loss == null ? '，等待真实 Loss 指标' : `，Loss ${Number(job.loss).toFixed(6)}`}`;
  $('#training-metric-count').textContent = `${metrics.length} 个指标`;
  drawTrainingLoss(metrics);
  $('#training-checkpoint-list').innerHTML = checkpoints.length ? checkpoints.slice().reverse().map(item => `<div><span></span><b>Step ${escapeHtml(item.step ?? item.name)}</b><small>${new Date(item.updated_at_ms).toLocaleString()}</small></div>`).join('') : '<p>尚未生成 Checkpoint</p>';
  const log = job.log_tail || '';
  const logElement = $('#training-log');
  logElement.textContent = log || (failed ? '训练器未产生日志，请查看失败诊断。' : '等待训练器输出日志…');
  logElement.scrollTop = logElement.scrollHeight;
  $('#training-log-status').textContent = log ? `最近 ${log.split('\n').length} 行 · 每秒刷新` : '等待训练输出';
  $('#training-failure-panel').classList.toggle('hidden', !failed);
  $('#training-failure-stage').textContent = beforeMetrics ? 'Step 0 · 尚未进入训练循环' : `Step ${step} · 训练异常退出`;
  $('#training-failure-message').textContent = job.error || '训练任务异常退出，请查看实时日志。';
  $('#training-stop').disabled = !active;
  $('#training-resume').classList.toggle('hidden', !['stopped', 'failed', 'interrupted'].includes(job.status) || !job.checkpoint);
  $('#training-start').disabled = active || !state.datasets.length;
  if (job.status === 'completed') {
    $('#training-result').textContent = job.model_id
      ? '训练完成，ACT 模型已自动注册并可在实机推理中使用。'
      : `训练完成，但 ACT 模型自动注册失败：${job.registration_error || '未找到有效模型文件'}`;
  }
}

const inferenceWaveformBuffer = new WaveformBuffer({ limit: 300 });
let inferenceWaveformChart = null;

function latestExecutableInferenceModel() {
  const runningId = state.inference?.model_id;
  if (runningId && ['loading', 'running', 'stopping'].includes(state.inference?.status)) {
    const running = state.models.find(model => model.id === runningId);
    if (running) return running;
  }
  const chosen = state.models.find(model => model.id === state.selectedInferenceModelId);
  if (chosen) return chosen;
  return state.models
    .slice()
    .sort((left, right) => (right.registered_at_ms || 0) - (left.registered_at_ms || 0))
    .find(model => model.execution_ready)
    || state.models.slice().sort((left, right) => (right.registered_at_ms || 0) - (left.registered_at_ms || 0))[0]
    || null;
}

function selectedInferenceModel() {
  return latestExecutableInferenceModel();
}

function populateInferenceTasks() {
  const model = selectedInferenceModel();
  const tasks = model?.tasks || [];
  const select = $('#inference-task');
  select.innerHTML = tasks.length
    ? tasks.map(task => `<option value="${escapeHtml(task)}">${escapeHtml(task)}</option>`).join('')
    : '<option value="">模型没有可用任务</option>';
  state.inferenceGate = null;
  const normalized = model?.coordinate_contract === 'starai_0_0_4_calibrated';
  const button = $('#inference-calibration-import');
  if (button) button.hidden = !normalized;
  const roles = cameraRolePresentation(model?.camera_feature_map);
  const note = $('#inference-camera-instructions');
  if (note) note.textContent = roles.wrist.feature === 'up' && roles.world.feature === 'front'
    ? '两页使用同一组设备：第一路固定俯视 UP，第二路固定正面 FRONT。请按模型的实际机位连接。'
    : model?.camera_instructions || '';
  for (const role of ['wrist', 'world']) {
    const { name, caption } = roles[role];
    $(`#${role}-role-label`).textContent = name;
    $(`#inference-${role}-label`).textContent = caption;
    const collection = $(`#${role}-preview`).closest('.camera-view');
    collection.querySelector('footer span').textContent = caption;
    collection.querySelector('.camera-empty b').textContent = name;
    collection.querySelectorAll('img').forEach(image => { if (!image.hasAttribute('aria-hidden')) image.alt = `${name}实时画面`; });
    const inference = $(`#inference-${role}-frame`).closest('.inference-camera');
    inference.querySelector('.inference-camera-empty b').textContent = name;
    $(`#inference-${role}-frame`).alt = `${name}实时画面`;
    $(`#quality-${role}-camera`).previousElementSibling.textContent = caption;
  }
  if (!state.cameraBackend) $('#camera-transport').textContent = `${roles.wrist.name} + ${roles.world.name} · 30 FPS`;
  renderInferenceGate();
}

function renderInferenceGate(gate = state.inferenceGate) {
  renderInferenceSerialState();
  const model = selectedInferenceModel();
  const blockers = gate?.blockers || model?.blockers || [];
  const rows = [
    ['模型及执行配置', model ? (model.execution_ready ? '完整' : model.coordinate_contract === 'starai_0_0_4_calibrated' ? '待补充校准' : '待完善') : '等待模型'],
    ['推理双相机', nativeCameraReady(state.inference?.cameras) ? '已连接' : state.cameraBackend === 'browser' ? '仅浏览器预览' : '等待连接'],
    ['真实 FL / J1–J7 限位', state.inference?.serial_connections?.follower?.connected && model?.joint_limits?.length === 7 ? '已就绪' : '等待连接'],
  ];
  $('#inference-gates').innerHTML = rows.map(([label, value]) => `<div><span>${label}</span><b class="${['完整', '已连接', '已就绪'].includes(value) ? 'ok' : ''}">${value}</b></div>`).join('');
  const ready = Boolean(gate?.ready) && nativeCameraReady(state.inference?.cameras);
  const active = state.inferenceStarting || ['loading', 'running', 'stopping'].includes(state.inference?.status);
  $('#model-import').disabled = active || state.modelImporting;
  $('#inference-model-import').disabled = active || state.modelImporting;
  const calibrationButton = $('#inference-calibration-import');
  if (calibrationButton) calibrationButton.disabled = active || state.modelImporting;
  $('#inference-validate').disabled = !model || !$('#inference-task').value || active;
  $('#inference-confirm').disabled = !ready || active;
  if (!ready) $('#inference-confirm').checked = false;
  $('#inference-task').disabled = active;
  $('#inference-start').disabled = !ready || !$('#inference-confirm').checked || active || state.modelImporting;
  $('#inference-stop').disabled = !active;
  $('#inference-camera-help').textContent = nativeCameraReady(state.inference?.cameras)
    ? '两路画面已接入推理服务。请检查视角对应是否正确。'
    : state.cameraBackend === 'browser' ? '浏览器画面已连接；ACT 需要本机相机通道。点击相机设置，选择 Ubuntu 原生并连接两台相机。'
    : '点击相机设置，选择两台不同设备并连接；插入 USB 后仍需启动视频流。';
  const message = $('#inference-message');
  message.className = `form-status${blockers.length ? ' error' : ready ? ' success' : ''}`;
  if (blockers.length) message.textContent = blockers.join('；');
  else if (ready) message.textContent = '执行条件已通过。请扶稳机械臂并确认后启动。';
  else message.textContent = '请选择任务并验证执行条件。';
  if (state.inferenceStartError) {
    message.className = 'form-status error';
    message.textContent = `启动失败：${state.inferenceStartError}`;
  }
}

function formatJointValues(values) {
  return Array.isArray(values) ? values.map((value, index) => `J${index + 1} ${Number(value).toFixed(1)}°`).join('  ') : '等待数据';
}

function renderInferenceJoints(snapshot) {
  const observation_state = snapshot.observation_state;
  const raw_action = snapshot.raw_action;
  const safe_action = snapshot.safe_action;
  $('#inference-joints').innerHTML = Array.from({ length: 7 }, (_, index) => `<div><b>J${index + 1}</b><span>OBS ${Array.isArray(observation_state) ? Number(observation_state[index]).toFixed(1) + '°' : '—'}</span><span>RAW ${Array.isArray(raw_action) ? Number(raw_action[index]).toFixed(1) + '°' : '—'}</span><strong>SAFE ${Array.isArray(safe_action) ? Number(safe_action[index]).toFixed(1) + '°' : '—'}</strong></div>`).join('');
}

function renderInference(snapshot) {
  const previousStatus = state.inference?.status;
  const terminalTransition = ['loading', 'running', 'stopping'].includes(previousStatus)
    && ['stopped', 'fault'].includes(snapshot.status);
  state.inference = snapshot;
  syncNativeCameraSession(snapshot.cameras);
  if (snapshot.cameras?.status === 'idle' && state.cameraBackend === 'native' && !state.cameraFaultResetting) recoverNativeCameraFault('本机相机视频流已关闭');
  const signature = cameraConnectionSignature(snapshot.cameras, snapshot.serial_connections) + JSON.stringify([state.trainingEnvironment?.status, selectedInferenceModel()?.id]);
  if (signature !== inferenceDeviceSignature) {
    inferenceDeviceSignature = signature;
    state.inferenceGate = null;
    inferenceValidationGeneration += 1;
    if (selectedInferenceModel() && $('#inference-task').value && !['loading', 'running', 'stopping'].includes(snapshot.status)) validateInference();
  }
  if (terminalTransition) state.inferenceGate = null;
  if (snapshot.cameras?.status === 'fault' && state.cameraBackend === 'native') {
    recoverNativeCameraFault(snapshot.cameras.error || 'Ubuntu 原生双摄像头视频流已停止');
  }
  const labels = { idle: '等待验证', loading: '正在加载', running: '真实 FL 运行中', stopping: '正在停止并卸力', stopped: '已停止并卸力', fault: '故障 · 已卸力' };
  $('#inference-status').textContent = labels[snapshot.status] || snapshot.status;
  $('#inference-status').className = `tag ${snapshot.status === 'running' ? 'ready' : snapshot.status === 'fault' ? 'blocked' : 'pending'}`;
  const metrics = snapshot.metrics || {};
  const values = [
    ['目标频率', Number.isFinite(metrics.target_hz) ? `${metrics.target_hz.toFixed(1)} Hz` : '—'],
    ['循环频率', Number.isFinite(metrics.loop_hz) ? `${metrics.loop_hz.toFixed(1)} Hz` : '—'],
    ['Policy 延迟', Number.isFinite(metrics.policy_latency_ms) ? `${metrics.policy_latency_ms.toFixed(1)} ms` : '—'],
    ['串口提交耗时', Number.isFinite(metrics.serial_latency_ms) ? `${metrics.serial_latency_ms.toFixed(2)} ms` : '—'],
    ['端到端', Number.isFinite(metrics.end_to_end_ms) ? `${metrics.end_to_end_ms.toFixed(1)} ms` : '—'],
    ['已发送目标', String(metrics.executed_actions || 0)],
    ['加速后端', snapshot.backend ? String(snapshot.backend).toUpperCase() : '—'],
    ['剩余动作', String(metrics.buffered_actions || 0)],
    ['执行驱动', metrics.driver ? `官方 SDK ${metrics.driver.version}` : '等待启动'],
    ['舵机运动时间', Number.isFinite(metrics.servo_motion_time_ms) ? `${metrics.servo_motion_time_ms} ms` : '—'],
    ['加速 / 减速', Number.isFinite(metrics.servo_acc_ms) ? `${metrics.servo_acc_ms} / ${metrics.servo_dec_ms} ms` : '—'],
    ['融合预测数', String(metrics.ensemble_predictions || 0)],
    ['错过的节拍', String(metrics.missed_ticks || 0)],
  ];
  if (metrics.diagnostic) {
    const diag = metrics.diagnostic;
    const fmt = (value) => (value == null ? '—' : `${Number(value).toFixed(1)}°`);
    values.push(['模型请求移动', fmt(diag.commanded_delta_deg)]);
    values.push(['每帧角度变化', fmt(diag.actual_move_deg)]);
    values.push(['指令跟随误差', fmt(diag.follow_error_deg)]);
    if ((diag.tracked_cycles || 0) >= 10) {
      const verdict = (diag.attempting_move_cycles || 0) === 0
        ? '当前下发目标接近读回角度；需结合任务进度判断'
        : (diag.responsive_cycles || 0) === 0
          ? '目标与读回有偏差，逐帧位移较小；检查驱动参数与坐标映射，不能据此判定锁力失败'
          : '检测到读回角度变化；请继续核对轨迹是否正确';
      values.push(['判定', verdict]);
    }
  }
  const motorMonitors = snapshot.serial_connections?.follower?.act_driver?.monitors || [];
  const warnings = motorMonitors.filter(item => item.status & 0xfc);
  if (warnings.length) values.push(['舵机保护状态', warnings.map(item => `ID ${item.id}: 0x${item.status.toString(16).padStart(2, '0')}`).join(' · ')]);
  if (motorMonitors.length) values.push(['从臂最低电压', `${Math.min(...motorMonitors.map(item => item.voltage_v)).toFixed(2)} V`]);
  $('#inference-performance').innerHTML = values.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
  $('#inference-raw-action').textContent = formatJointValues(snapshot.raw_action);
  $('#inference-safe-action').textContent = formatJointValues(snapshot.safe_action);
  renderInferenceJoints(snapshot);
  const logs = snapshot.logs || [];
  $('#inference-log').textContent = logs.length ? logs.map(item => `${new Date(item.timestamp_ms).toLocaleTimeString()} [${String(item.level).toUpperCase()}] ${item.message}`).join('\n') : '尚无推理日志';
  $('#inference-log').scrollTop = $('#inference-log').scrollHeight;
  for (const role of ['wrist', 'world']) {
    const roleState = snapshot.cameras?.roles?.[role];
    const image = $(`#inference-${role}-frame`);
    image.closest('.inference-camera').classList.toggle('streaming', Boolean(roleState));
    if (roleState) {
      $(`#inference-${role}-status`).textContent = `${roleState.device_name || roleState.device_id} · ${roleState.mode?.width || 0}×${roleState.mode?.height || 0}@${roleState.mode?.fps || 0} · ${Number(roleState.actual_fps || 0).toFixed(1)} FPS`;
    } else {
      image.removeAttribute('src');
      $(`#inference-${role}-status`).textContent = '未连接';
    }
  }
  const actionCount = Number(metrics.executed_actions || 0);
  if (actionCount > state.inferenceLastActionCount && Array.isArray(snapshot.observation_state) && Array.isArray(snapshot.safe_action)) {
    inferenceWaveformBuffer.append({ timestamp_ms: Date.now(), observation_state: snapshot.observation_state, action: snapshot.safe_action, state_offset_ms: 0, action_offset_ms: Number(metrics.end_to_end_ms || 0) });
    state.inferenceLastActionCount = actionCount;
    $('#inference-wave-empty').classList.add('hidden');
    inferenceWaveformChart?.schedule();
  }
  renderCaptureQuality();
  renderInferenceGate();
  if (snapshot.error) {
    $('#inference-message').className = 'form-status error';
    $('#inference-message').textContent = snapshot.error;
  }
}

let inferenceValidationGeneration = 0;
let inferenceDeviceSignature = null;
function syncNativeCameraSession(cameras) {
  if (!nativeCameraReady(cameras) || state.cameraBackend === 'native') return;
  state.cameraBackend = 'native';
  $('#camera-backend').value = 'native';
  const mode = cameras.roles.wrist.mode;
  if (mode) $('#capture-profile').value = `${mode.width},${mode.height}`;
  for (const role of ['wrist', 'world']) {
    const camera = cameras.roles[role];
    const select = $(`#${role}-camera-select`);
    if (![...select.options].some(option => option.value === camera.device_id)) select.add(new Option(camera.device_name || camera.device_id, camera.device_id));
    select.value = camera.device_id;
    select.disabled = true;
    $(`#${role}-camera`).textContent = `本机相机 · ${camera.device_name || camera.device_id}`;
  }
  $('#camera-badge').textContent = '已连接';
  $('#camera-badge').className = 'status-badge on';
  $('#camera-transport').textContent = '双路视频流已恢复 · 可用于 ACT 推理';
  for (const id of ['detect-cameras', 'connect-cameras', 'camera-backend', 'capture-profile']) $(`#${id}`).disabled = true;
  $('#disconnect-cameras').disabled = false;
  startNativePreviewPolling();
}
async function validateInference() {
  const generation = ++inferenceValidationGeneration;
  const modelId = selectedInferenceModel()?.id || '';
  const task = $('#inference-task').value;
  try {
    state.inferenceStartError = null;
    const gate = await request('/inference/validate', { method: 'POST', body: JSON.stringify({ model_id: modelId, task }) });
    if (generation !== inferenceValidationGeneration || selectedInferenceModel()?.id !== modelId || $('#inference-task').value !== task) return;
    state.inferenceGate = gate;
    renderInferenceGate();
  } catch (error) {
    if (generation !== inferenceValidationGeneration) return;
    state.inferenceGate = { ready: false, blockers: [error.message] }; renderInferenceGate();
  }
}

function pollInference(delay = 500) {
  clearTimeout(state.inferencePoll);
  state.inferencePoll = window.setTimeout(async () => {
    try { renderInference(await request('/inference')); }
    catch (error) { $('#inference-message').textContent = `推理状态刷新失败：${error.message}`; }
    finally { pollInference(document.hidden ? 5000 : document.querySelector('#infer.view.active') || ['loading','running','stopping'].includes(state.inference?.status) ? 500 : 2500); }
  }, delay);
}

async function startInference() {
  if (state.navigationPending) return toast('正在切换页面，请稍候。');
  if (state.inferenceStarting || ['loading', 'running', 'stopping'].includes(state.inference?.status)) return;
  let startError = null;
  state.inferenceStartError = null;
  state.inferenceStarting = true;
  renderInferenceGate();
  $('#inference-status').textContent = '正在提交启动请求';
  $('#inference-status').className = 'tag pending';
  $('#inference-message').className = 'form-status pending';
  $('#inference-message').textContent = '正在加载 ACT 模型并建立真实 FL 执行链，请勿重复操作。';
  try {
    inferenceWaveformBuffer.clear(); state.inferenceLastActionCount = 0; $('#inference-wave-empty').classList.remove('hidden');
    const model = selectedInferenceModel();
    const snapshot = await request('/inference/start', { method: 'POST', body: JSON.stringify({ model_id: model?.id || '', task: $('#inference-task').value, operator_confirmed: $('#inference-confirm').checked }) });
    state.inferenceStarting = false;
    renderInference(snapshot); pollInference(100);
  } catch (error) { startError = error; state.inferenceStartError = error.message; }
  finally {
    state.inferenceStarting = false;
    renderInferenceGate();
    if (startError) {
      $('#inference-message').className = 'form-status error';
      $('#inference-message').textContent = `启动失败：${startError.message}`;
    }
  }
}

async function stopInference() {
  $('#inference-stop').disabled = true;
  $('#inference-message').textContent = '正在停止动作输出并对 J1–J7 立即卸力…';
  try { renderInference(await request('/inference/stop', { method: 'POST', body: JSON.stringify({ reason: 'operator' }) })); }
  catch (error) { $('#inference-message').textContent = `停止失败：${error.message}`; setInteractionStatus(error.message, 'error'); }
  finally { $('#inference-stop').disabled = !['loading', 'running', 'stopping'].includes(state.inference?.status); }
}

async function loadModels(result = null) {
  result = result || await request('/models');
  state.models = result.items || [];
  const root = $('#model-list');
  if (!state.models.length) {
    root.innerHTML = '<div class="empty-state"><div class="status-mark">ACT</div><h2>尚无本机模型</h2><p>可导入已有 ACT 模型，无需重新训练；本机训练完成后也会自动注册。</p></div>';
    $('#inference-model-name').textContent = '尚无已完成模型';
    $('#inference-model-meta').textContent = '导入模型或完成 ACT 训练后加载';
    populateInferenceTasks();
    return;
  }
  root.innerHTML = state.models.map(model => `<article class="model-row"><div><strong>${escapeHtml(model.id)}</strong><small>数据集 ${escapeHtml(model.dataset_id)} · Step ${model.step ?? 0}</small></div><span>Loss ${model.loss ?? '—'}</span><b class="${model.execution_ready ? '' : 'bad'}">${model.execution_ready ? '可执行' : model.coordinate_contract === 'starai_0_0_4_calibrated' ? '待补充校准' : '缺少执行合同'}</b><button type="button" class="secondary" data-use-model="${escapeHtml(model.id)}">用于推理</button><button type="button" class="secondary" data-export-model="${escapeHtml(model.id)}">导出模型</button></article>`).join('');
  const selected = latestExecutableInferenceModel();
  $('#inference-model-name').textContent = selected?.id || '尚无已完成模型';
  $('#inference-model-meta').textContent = selected
    ? `ACT · Step ${selected.step ?? 0} · Loss ${selected.loss ?? '—'}${selected.execution_ready ? '' : ' · 当前不可执行'}`
    : '导入模型或完成 ACT 训练后加载';
  populateInferenceTasks();
}

function setModelImportStatus(message, mode = '') {
  for (const selector of ['#model-import-status', '#inference-import-status']) {
    const target = $(selector);
    target.textContent = message;
    target.className = `form-status ${mode}`.trim();
  }
}

function inferenceIsActive() {
  return state.inferenceStarting || ['loading', 'running', 'stopping'].includes(state.inference?.status);
}

async function useInferenceModel(modelId) {
  if (inferenceIsActive()) return toast('请先停止当前推理，再切换模型');
  state.selectedInferenceModelId = modelId;
  state.inferenceStartError = null;
  $('#inference-confirm').checked = false;
  await loadModels();
  if (document.querySelector('.view.active')?.id !== 'infer' && !await navigateActView('infer')) return;
  await validateInference();
}

async function importActModel(file) {
  if (!file || state.modelImporting) return;
  if (inferenceIsActive()) return toast('请先停止推理，再导入模型');
  if (!/\.(zip|tar|tar\.gz|tgz)$/i.test(file.name)) return setModelImportStatus('请选择完整 ACT 模型 ZIP 或 TAR.GZ，不能只导入权重文件。', 'error');
  if (file.size > 2_000_000_000) return setModelImportStatus('模型包不能超过 2 GB。', 'error');
  state.modelImporting = true;
  renderInferenceGate();
  setModelImportStatus(`正在导入 ${file.name}（${formatBytes(file.size)}）…`, 'pending');
  try {
    const model = await request('/models/import', { method: 'POST', headers: { 'Content-Type': file.name.toLowerCase().endsWith('.zip') ? 'application/zip' : 'application/octet-stream' }, body: file });
    state.selectedInferenceModelId = model.id;
    state.inferenceStartError = null;
    $('#inference-confirm').checked = false;
    await loadModels();
    state.modelImporting = false;
    if (document.querySelector('.view.active')?.id !== 'infer' && !await navigateActView('infer')) return;
    await validateInference();
    setModelImportStatus(state.inferenceGate?.ready
      ? `已导入 ${model.id}，执行条件已通过，确认工作区后即可启动。`
      : model.blockers?.length ? `已导入 ${model.id}；${model.blockers.join('；')}` : `已导入 ${model.id}，无需重新训练。请按执行条件提示完成连接或准备运行环境。`, 'success');
  } catch (error) {
    setModelImportStatus(`导入失败：${error.message}`, 'error');
  } finally {
    state.modelImporting = false;
    $('#model-import-file').value = '';
    renderInferenceGate();
  }
}

async function importArmCalibration(file) {
  const model = selectedInferenceModel();
  if (!file || !model || inferenceIsActive() || state.modelImporting) return;
  if (file.size > 1_000_000) return setModelImportStatus('校准 JSON 不能超过 1 MB。', 'error');
  state.modelImporting = true;
  renderInferenceGate();
  try {
    await request(`/models/${encodeURIComponent(model.id)}/calibration`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(await file.text()))
    });
    await loadModels();
    await validateInference();
    setModelImportStatus('校准文件已导入。请连接固定俯视、固定正面相机，并验证执行条件。', 'success');
  } catch (error) {
    setModelImportStatus(`校准导入失败：${error.message}`, 'error');
  } finally {
    state.modelImporting = false;
    $('#inference-calibration-file').value = '';
    renderInferenceGate();
  }
}

async function exportActModel(modelId) {
  try {
    const blob = await fetchWithDeadline(localFetch, `${API}/models/${encodeURIComponent(modelId)}/export`, {}, async response => {
      if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message || `HTTP ${response.status}`); }
      return response.blob();
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${modelId}.zip`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { setModelImportStatus(`导出失败：${error.message}`, 'error'); }
}

function pollTrainingJob(jobId) {
  if (state.trainingJobPoll) clearTimeout(state.trainingJobPoll);
  const poll = async () => {
    let continuePolling = true;
    try {
      const job = await request(`/training/jobs/${jobId}`);
      renderTrainingJob(job);
      continuePolling = ['running', 'stopping'].includes(job.status);
      if (job.status === 'completed') await loadModels();
    } catch (error) {
      $('#training-result').textContent = `训练状态刷新失败：${error.message}；正在重试…`;
    } finally {
      state.trainingJobPoll = continuePolling ? window.setTimeout(poll, 1000) : null;
    }
  };
  state.trainingJobPoll = window.setTimeout(poll, 500);
}

async function startTraining() {
  const datasetId = $('#training-dataset').value;
  if (!datasetId) return toast('请先选择包含成功 Episode 的数据集');
  const button = $('#training-start'); button.disabled = true;
  $('#training-result').textContent = '正在校验并转换训练数据…';
  try {
    const job = await request('/training/jobs', { method: 'POST', body: JSON.stringify({
      dataset_id: datasetId,
      parameters: { batch_size: Number($('#training-batch-size').value), steps: Number($('#training-steps').value), save_freq: Number($('#training-save-freq').value) },
    }) });
    $('#training-result').textContent = '';
    renderTrainingJob(job); pollTrainingJob(job.id);
  } catch (error) { $('#training-result').textContent = [error.message, ...(error.details || [])].join('\n'); button.disabled = false; }
}

async function stopTraining() {
  if (!state.trainingJob) return;
  try { renderTrainingJob(await request(`/training/jobs/${state.trainingJob.id}/stop`, { method: 'POST', body: '{}' })); }
  catch (error) { $('#training-result').textContent = error.message; }
}

async function resumeTraining() {
  if (!state.trainingJob) return;
  try { const job = await request(`/training/jobs/${state.trainingJob.id}/resume`, { method: 'POST', body: '{}' }); renderTrainingJob(job); pollTrainingJob(job.id); }
  catch (error) { $('#training-result').textContent = error.message; }
}

async function loadTrainingEnvironment() {
  const environment = await request('/training/environment');
  renderTrainingEnvironment(environment);
  if (environment.status === 'preparing' && !state.trainingPoll) {
    const poll = async () => {
      try {
        const latest = await request(`/training/environment/prepare/${environment.job_id}`);
        renderTrainingEnvironment(latest);
        if (latest.status === 'preparing') state.trainingPoll = window.setTimeout(poll, 1000);
        else { state.trainingPoll = null; await refreshAfterMutation(); }
      } catch (error) { state.trainingPoll = null; $('#training-result').textContent = error.message; }
    };
    state.trainingPoll = window.setTimeout(poll, 1000);
  }
}

let environmentConfigurationBusy = false;
async function prepareTrainingEnvironment(retry = false, allowLaunch = true) {
  if (environmentConfigurationBusy) return;
  environmentConfigurationBusy = true;
  const button = retry ? $('#training-retry') : $('#training-prepare');
  button.disabled = true;
  $('#training-result').textContent = '';
  try {
    if (!await ensureRuntime({ allowLaunch })) return;
    const current = await request('/training/environment');
    if (['ready','preparing'].includes(current.status)) {
      renderTrainingEnvironment(current);await loadTrainingEnvironment();return;
    }
    if (current.status === 'failed' && !retry) {
      renderTrainingEnvironment(current);return;
    }
    const environment = await request(retry && current.status === 'failed' ? '/training/environment/retry' : '/training/environment/prepare', { method: 'POST', body: '{}' });
    renderTrainingEnvironment(environment);
    await loadTrainingEnvironment();
  } catch (error) { $('#training-result').textContent = error.message; }
  finally { button.disabled = !publicationConfigured();environmentConfigurationBusy = false; }
}
function renderDatasets(items) {
  state.datasets = items;
  const select = $('#active-dataset');
  const prior = state.selectedDatasetId || select.value;
  select.innerHTML = items.length ? items.map(item => `<option value="${item.id}">${item.task_name} · ${item.slug}</option>`).join('') : '<option value="">尚未创建数据集</option>';
  state.selectedDatasetId = items.some(item => item.id === prior) ? prior : items[0]?.id || null;
  select.value = state.selectedDatasetId || '';
  $('#dataset-list').innerHTML = items.length ? items.map(item => `<div class="dataset"><b>${item.task_name}</b><span>${item.slug} · ${item.capture.width}×${item.capture.height}@${item.capture.fps} FPS</span></div>`).join('') : '<p class="notice">尚未创建数据集。</p>';
  $('#training-dataset').innerHTML = items.map(item => `<option value="${item.id}">${item.task_name} · ${item.slug}</option>`).join('');
  renderSelectedDataset();
}

function renderDatasetStats(stats) {
  state.datasetStats = stats;
  const episodes = stats?.episodes || [];
  const success = episodes.filter(item => item.status === 'accepted_success').length;
  const failure = episodes.filter(item => item.status === 'accepted_failure').length;
  const review = episodes.filter(item => item.status === 'review').length;
  const totals = stats?.totals || {};
  $('#dataset-stats').innerHTML = `<span>成功 ${success}</span><span>失败 ${failure}</span><span>待审核 ${review}</span><span>样本 ${totals.samples || 0}</span><span>图像 ${totals.wrist || 0} / ${totals.world || 0}</span><span>容量 ${formatBytes(totals.bytes)}</span><span class="${stats?.integrity_ok ? 'ok' : 'bad'}">${stats ? (stats.integrity_ok ? '完整' : '需检查') : '等待数据'}</span>`;
  $('#dataset-export').disabled = !stats || !stats.integrity_ok || Boolean(state.episode) || Boolean(state.frameDrain);
  if (state.episode?.status === 'review') {
    const episode = episodes.find(item => item.id === state.episode.id);
    const successButton = $('#episode-review [data-decision="success"]');
    const integrityOk = Boolean(episode?.integrity?.ok);
    successButton.disabled = !integrityOk;
    successButton.title = integrityOk ? '' : (episode?.integrity?.errors || ['磁盘完整性尚未通过']).join('；');
    if (episode) {
      const cameras = episode.integrity.camera_frames || { wrist: 0, world: 0 };
      const errors = episode.integrity.errors || [];
      $('#episode-summary').textContent = `${episode.integrity.samples} 个真实 J1–J7 样本 · 末端 ${cameras.wrist || 0} 帧 · 世界 ${cameras.world || 0} 帧${errors.length ? ` · ${errors.join('；')}` : ' · 完整性通过'}`;
      $('#episode-control-status').textContent = integrityOk ? '磁盘完整性通过，请在此处审核 Episode' : '磁盘完整性未通过，只能保存失败记录或删除';
    }
  }
}

function renderSelectedDataset() {
  const dataset = selectedDataset();
  state.selectedDatasetId = dataset?.id || null;
  $('#active-dataset-name').textContent = dataset ? `${dataset.task_name} · ${dataset.slug}` : '请选择数据集';
  $('#capture-format').textContent = dataset ? `${dataset.capture.width}×${dataset.capture.height}@${dataset.capture.fps} · JPEG 85` : '创建或选择数据集后显示采集规格';
  $('#dataset-export').disabled = !dataset || Boolean(state.episode) || Boolean(state.frameDrain);
  if (dataset) {
    $('#capture-profile').value = `${dataset.capture.width},${dataset.capture.height}`;
    $('#training-dataset').value = dataset.id;
  }
}

async function refreshDatasetStats() {
  const datasetId = selectedDatasetId();
  if (!datasetId) { renderDatasetStats(null); return; }
  try { renderDatasetStats(await request(`/datasets/${datasetId}/stats`)); }
  catch (error) { renderDatasetStats(null); setTransferStatus(`统计读取失败：${error.message}`, 'error'); }
}
function renderJoints(values = []) {
  const joints = values.length === 7 ? values : [0, 0, 0, 0, 0, 0, 0];
  const root = $('#joint-bars');
  let rows = root.querySelectorAll('.joint-row');
  if (rows.length !== 7) {
    const fragment = document.createDocumentFragment();
    joints.forEach((_value, index) => {
      const row = document.createElement('div');
      row.className = 'joint-row';
      const label = document.createElement('b');
      label.textContent = `J${index + 1}`;
      const track = document.createElement('div');
      track.className = 'joint-track';
      track.append(document.createElement('i'));
      row.append(label, track, document.createElement('output'));
      fragment.append(row);
    });
    root.replaceChildren(fragment);
    rows = root.querySelectorAll('.joint-row');
  }
  rows.forEach((row, index) => {
    const value = Number(joints[index]);
    row.querySelector('i').style.width = `${Math.min(100, Math.max(8, Math.abs(value) / 1.8 + 8))}%`;
    row.querySelector('output').textContent = `${value.toFixed(1)}°`;
  });
}

const waveformBuffer = new WaveformBuffer({ limit: 500, toleranceMs: 16 });
const waveformChart = new WaveformChart($('#waveform-canvas'), waveformBuffer);
let lastWaveformTimestamp = null;
let waveformFps = null;
let persistedSampleCount = 0;

function setWaveformStatus(label, mode = 'waiting') {
  const target = $('#waveform-status');
  target.textContent = label;
  target.className = `waveform-status ${mode}`;
}

function renderRoundProgress() {
  state.targetRounds = Math.max(1, Math.min(100, Number($('#target-rounds').value) || 1));
  $('#target-rounds').value = String(state.targetRounds);
  $('#target-rounds-display').textContent = String(state.targetRounds);
  $('#completed-rounds').textContent = String(state.completedRounds);
  const percent = Math.min(100, state.completedRounds / state.targetRounds * 100);
  $('#capture-progress').style.width = `${percent}%`;
  $('#capture-progress-percent').textContent = `${Math.round(percent)}%`;
  $('.round-progress-rail').setAttribute('aria-valuenow', String(percent));
  const recording = state.episode?.status === 'recording';
  const reviewing = Boolean(state.episode && !recording);
  $('#target-rounds').disabled = recording || reviewing;
  $('#round-status').textContent = state.completedRounds >= state.targetRounds ? `已完成 ${state.targetRounds} 轮成功采集` : recording ? `正在采集第 ${state.completedRounds + 1} 轮` : reviewing ? `第 ${state.completedRounds + 1} 轮等待审核` : !selectedDataset() ? '请先创建或选择数据集' : !state.deviceBinding ? '连接并保存设备后即可开始' : `可开始第 ${state.completedRounds + 1} 轮`;
  $('.capture-run-panel').dataset.phase = recording ? 'recording' : reviewing ? 'review' : state.completedRounds >= state.targetRounds ? 'complete' : selectedDataset() ? 'ready' : 'empty';
  $('#episode-button').textContent = state.completedRounds >= state.targetRounds ? '采集任务完成' : state.completedRounds ? '开始下一轮' : '开始数据采集';
}

function selectedCameraLabel(role) {
  const deviceId = $(`#${role}-camera-select`).value;
  return state.browserCameras.find(item => item.deviceId === deviceId)?.label || '未识别设备';
}

function cameraQualityText(camera, deviceLabel) {
  if (!camera) return `${deviceLabel} · 等待连接`;
  if (camera.fps === null) return `${deviceLabel} · ${camera.width}×${camera.height} · 计算中`;
  return `${deviceLabel} · ${camera.width}×${camera.height} · 实际 ${camera.fps.toFixed(1)} FPS · 缺帧 ${camera.dropped}`;
}

function renderCaptureQuality() {
  captureQualityRenderPending = false;
  const quality = qualityMonitor.snapshot();
  const verdict = $('#quality-verdict');
  const labels = { waiting: '等待采集', good: '质量良好', retry: '建议重采' };
  verdict.textContent = labels[quality.status];
  verdict.className = `quality-verdict ${quality.status}`;
  $('#quality-mean-error').textContent = quality.meanError === null ? '—' : `${quality.meanError.toFixed(2)}°`;
  $('#quality-max-error').textContent = quality.maxError === null ? '—' : `${quality.maxError.toFixed(2)}°`;
  $('#quality-worst-joint').textContent = quality.worstJoint === null ? '—' : `J${quality.worstJoint}`;
  $('#quality-sync-offset').textContent = quality.syncOffsetMs === null ? '—' : `${quality.syncOffsetMs.toFixed(1)} ms`;
  $('#quality-samples').textContent = String(quality.sampleCount);
  $('#quality-wrist-camera').textContent = state.cameraFrameSupport.wrist === false ? '帧监测不可用' : cameraQualityText(quality.cameras.wrist, selectedCameraLabel('wrist'));
  $('#quality-world-camera').textContent = state.cameraFrameSupport.world === false ? '帧监测不可用' : cameraQualityText(quality.cameras.world, selectedCameraLabel('world'));
  if (state.cameraBackend === 'native') {
    for (const role of ['wrist', 'world']) {
      const camera = state.inference?.cameras?.roles?.[role];
      $(`#quality-${role}-camera`).textContent = camera && nativeCameraReady(state.inference?.cameras)
        ? `${camera.device_name || camera.device_id} · ${camera.mode?.width}×${camera.mode?.height} · 实际 ${Number(camera.actual_fps || 0).toFixed(1)} FPS · 缺帧 ${camera.dropped || 0}`
        : '本机相机 · 等待有效视频流';
    }
  }
  $('#mismatch-rate').textContent = quality.sampleCount ? `${(quality.meanError / 180 * 100).toFixed(2)}%` : '0.00%';
}

let captureQualityRenderPending = false;
function scheduleCaptureQualityRender() {
  if (captureQualityRenderPending) return;
  captureQualityRenderPending = true;
  requestAnimationFrame(renderCaptureQuality);
}

function stopCameraFrameMonitor(role) {
  const video = $(`#${role}-preview`);
  const callback = state.cameraFrameCallbacks[role];
  if (callback !== null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callback);
  state.cameraFrameCallbacks[role] = null;
}

function startCameraFrameMonitor(role) {
  const video = $(`#${role}-preview`);
  stopCameraFrameMonitor(role);
  if (typeof video.requestVideoFrameCallback !== 'function') {
    state.cameraFrameSupport[role] = false;
    renderCaptureQuality();
    return;
  }
  state.cameraFrameSupport[role] = true;
  const onFrame = (now, metadata) => {
    qualityMonitor.updateCamera(role, { nowMs: now, presentedFrames: metadata.presentedFrames, width: video.videoWidth, height: video.videoHeight });
    if (state.episode?.status === 'recording' && frameUploader.snapshot().active) {
      frameUploader.capture(role, video, now, { ...metadata, width: video.videoWidth, height: video.videoHeight })
        .catch(error => { $('#episode-control-status').textContent = `相机帧持久化失败：${error.message}；请停止 Episode。`; });
    }
    scheduleCaptureQualityRender();
    state.cameraFrameCallbacks[role] = video.requestVideoFrameCallback(onFrame);
  };
  state.cameraFrameCallbacks[role] = video.requestVideoFrameCallback(onFrame);
}

function renderWaveformSample(sample) {
  const normalized = waveformBuffer.append(sample);
  qualityMonitor.appendTelemetry(sample);
  scheduleCaptureQualityRender();
  const sampleCount = waveformBuffer.stats().samples;
  persistedSampleCount += 1;
  if (lastWaveformTimestamp !== null) {
    const elapsed = normalized.timestampMs - lastWaveformTimestamp;
    if (elapsed > 0) waveformFps = 1000 / elapsed;
  }
  lastWaveformTimestamp = normalized.timestampMs;
  waveformChart.setCursor(normalized.timestampMs);
  $('#waveform-empty').classList.add('hidden');
  $('#waveform-matched').textContent = String(sampleCount);
  $('#valid-frames').textContent = String(persistedSampleCount);
  $('#waveform-fps').textContent = waveformFps === null ? '—' : waveformFps.toFixed(1);
  const joint = waveformBuffer.joint;
  $('#leader-state').textContent = joint === null ? 'J1–J7 全通道' : `J${joint + 1} · ${normalized.action[joint].toFixed(1)}°`;
  $('#follower-state').textContent = joint === null ? 'J1–J7 全通道' : `J${joint + 1} · ${normalized.state[joint].toFixed(1)}°`;
  renderJoints(normalized.state);
  setWaveformStatus('采集中', 'live');
  $('#waveform-a11y').textContent = `已接收 ${sampleCount} 个真实同步样本，当前显示 ${joint === null ? '全部 J1–J7' : `J${joint + 1}`}`;
  waveformChart.schedule();
}

function connectTelemetryStream() {
  if (!window.EventSource || state.telemetryStream) return;
  const stream = new EventSource(`${API}/telemetry/stream`);
  state.telemetryStream = stream;
  stream.addEventListener('status', () => {
    if (!waveformBuffer.stats().samples) setWaveformStatus('等待采集');
  });
  stream.addEventListener('sample', event => {
    try {
      renderWaveformSample(JSON.parse(event.data));
    } catch (error) {
      setWaveformStatus('样本无效', 'error');
      console.error('Invalid telemetry sample', error);
    }
  });
  stream.onerror = () => { setWaveformStatus('遥测流中断', 'error'); if (state.episode?.status === 'recording') $('#episode-control-status').textContent = '遥测流中断，请停止 Episode 并检查本机服务。'; };
}

function closeTelemetryStream() {
  state.telemetryStream?.close();
  state.telemetryStream = null;
  waveformChart.destroy();
}

function setWaveformView(view) {
  waveformBuffer.setView(view);
  document.querySelectorAll('[data-waveform-view]').forEach(button => {
    const active = button.dataset.waveformView === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#waveform-joints').classList.toggle('hidden', view === 'sync');
  $('#waveform-channel-legend').classList.toggle('hidden', view === 'sync');
  $('.waveform-workspace').classList.toggle('sync-view', view === 'sync');
  waveformChart.schedule();
}

function selectWaveformJoint(joint) {
  if (joint === 'all') waveformBuffer.selectAllJoints(); else waveformBuffer.selectJoint(Number(joint));
  const selected = waveformBuffer.joint;
  document.querySelectorAll('[data-joint]').forEach(button => {
    const active = button.dataset.joint === 'all' ? selected === null : Number(button.dataset.joint) === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const latest = waveformBuffer.stats().latest;
  if (latest) {
    $('#leader-state').textContent = selected === null ? 'J1–J7 全通道' : `J${selected + 1} · ${latest.action[selected].toFixed(1)}°`;
    $('#follower-state').textContent = selected === null ? 'J1–J7 全通道' : `J${selected + 1} · ${latest.state[selected].toFixed(1)}°`;
  }
  waveformChart.schedule();
}

function setWaveformChannel(key, visible) {
  waveformBuffer.setChannelVisible(key, visible);
  waveformChart.schedule();
}

function restoreCollectionState(workspace) {
  state.episodes = workspace.episodes || [];
  const datasetId = selectedDatasetId();
  const episodes = (workspace.episodes || []).filter(item => item.dataset_id === datasetId);
  state.completedRounds = episodes.filter(item => item.status === 'accepted_success').length;
  state.episode = episodes.find(item => item.status === 'recording' || item.status === 'review') || null;
  $('#episode-review').classList.toggle('hidden', state.episode?.status !== 'review');
  if (state.episode) $('#episode-index').textContent = state.episode.id.slice(0, 8);
  if (state.episode?.status === 'recording') {
    $('#episode-control-status').textContent = '检测到服务端正在录制的 Episode；浏览器图像上传无法跨刷新恢复，请立即停止并审核。';
    setWaveformStatus('遥操作运行中', 'live');
  } else if (state.episode?.status === 'review') {
    const successButton = $('#episode-review [data-decision="success"]');
    successButton.disabled = true;
    successButton.title = '正在重新校验磁盘样本与双路图像完整性';
    $('#episode-summary').textContent = '正在校验磁盘样本与双路图像完整性…';
    $('#episode-control-status').textContent = '已恢复待审核 Episode，正在校验完整性。';
  }
  renderRoundProgress();
}

const refresh = createSingleFlight(async () => {
  let revision;
  do { revision = refreshRevision; await refreshState(revision); }
  while (revision !== refreshRevision);
});
function refreshAfterMutation() { refreshRevision++; return refresh(); }
async function refreshState(revision) {
  const deviceEpoch = state.deviceEpoch;
  try {
    const [health, caps, workspace, devices, trainingEnvironment, trainingJobs, models, inference] = await Promise.all([
      request('/health'), request('/capabilities'), request('/state'), request('/devices'),
      request('/training/environment'), request('/training/jobs'), request('/models'), request('/inference'),
    ]);
    $('#service-state').className = 'service-state ok';
    $('#service-state span').textContent = `本机服务已连接 · ${health.version}`;
    if (deviceEpoch === state.deviceEpoch) state.deviceBinding = devices.binding;
    state.data_dir = workspace.data_dir;
    state.data_dir_explicit = Boolean(workspace.data_dir_explicit);
    if (revision === refreshRevision) { renderDatasets(workspace.datasets || []); restoreCollectionState(workspace); }
    await refreshDatasetStats();
    if (deviceEpoch === state.deviceEpoch) renderSerialState(devices.serial_connections);
    renderCapabilities(caps);
    renderTrainingEnvironment(trainingEnvironment);
    if (trainingEnvironment.status === 'preparing') await loadTrainingEnvironment();
    const latestJob = (trainingJobs.items || []).slice().sort((left, right) => (right.created_at_ms || 0) - (left.created_at_ms || 0))[0] || null;
    renderTrainingJob(latestJob);
    if (latestJob && ['running', 'stopping'].includes(latestJob.status)) pollTrainingJob(latestJob.id);
    await loadModels(models);
    if (deviceEpoch === state.deviceEpoch) renderInference(inference);
    if (deviceEpoch === state.deviceEpoch) renderDeviceBinding(devices.binding);
    renderJoints();
    maybeShowDataDirSetup();
  } catch (error) {
    $('#service-state').className = 'service-state error';
    $('#service-state span').textContent = state.capabilities ? 'ACT 连接已中断' : '请到第 2 步配置环境';
    toast(state.capabilities ? error.message : '首次环境配置已合并到第 2 步，按页面提示完成系统安装与授权后，会自动准备运行环境。');
  }
}
async function connectSerial(role, selectedPort = null) { if (state.navigationPending) return toast('正在切换页面，请稍候。'); state.deviceEpoch++; const prefix = role === 'leader' ? 'leader' : 'follower'; const port = selectedPort ?? $(`#${prefix}-port`).value; if (!port) return toast(`请先选择${role === 'leader' ? ' Leader' : '真实 FL'}串口`); try { const result = await request('/devices/serial/connect', { method: 'POST', body: JSON.stringify({ role, port, leader_type: $('#leader-type').value }) }); state.serial[role] = result; state.deviceBinding = null; setDeviceCard(role, true, `${result.port} · ${result.baudrate / 1000} kbps`, result.verification); $(`#${role}-state`).textContent = result.port; toast(`${role === 'leader' ? 'Leader' : '真实 FL'}串口已连接；J1–J7 实时样本尚未接入`); renderCapabilities(state.capabilities); } catch (error) { toast(error.message); } }
async function disconnectSerial(role) { try { await request('/devices/serial/disconnect', { method: 'POST', body: JSON.stringify({ role }) }); state.serial[role] = null; state.deviceBinding = null; setDeviceCard(role, false, ''); $('#bind-devices').disabled = true; updateNextAction(); toast(`${role === 'leader' ? 'Leader' : '真实 FL'}已断开，采集权限已撤销`); } catch (error) { toast(error.message); } }
function updateCameraSelectionState() {
  const backend = effectiveCameraBackend($('#camera-backend').value, state.nativeCameras);
  const devices = backend === 'native' ? state.nativeCameras : state.browserCameras;
  const selectable = devices.length >= 2;
  $('#wrist-camera-select').disabled = !selectable;
  $('#world-camera-select').disabled = !selectable;
  $('#connect-cameras').disabled = !selectable || !$('#wrist-camera-select').value || !$('#world-camera-select').value || $('#wrist-camera-select').value === $('#world-camera-select').value;
}
function populateCameraChoices() {
  const backend = effectiveCameraBackend($('#camera-backend').value, state.nativeCameras);
  const devices = backend === 'native' ? state.nativeCameras : state.browserCameras;
  populateSelect('#wrist-camera-select', devices, item => backend === 'native' ? item.stable_id : item.deviceId, item => item.label || item.name);
  populateSelect('#world-camera-select', devices, item => backend === 'native' ? item.stable_id : item.deviceId, item => item.label || item.name);
  if (devices.length >= 2) {
    $('#wrist-camera-select').value = backend === 'native' ? devices[0].stable_id : devices[0].deviceId;
    $('#world-camera-select').value = backend === 'native' ? devices[1].stable_id : devices[1].deviceId;
  }
  updateCameraSelectionState();
  renderCapabilities(state.capabilities);
}
function populateBrowserCameras(devices) { state.browserCameras = devices; populateCameraChoices(); }
async function detectCameras() {
  const button = $('#detect-cameras');
  button.disabled = true; button.textContent = '检测中…'; $('#camera-transport').textContent = '正在检测浏览器与 Ubuntu 原生摄像头';
  try {
    const nativeResult = await request('/cameras/native');
    state.nativeCameras = nativeResult.devices || [];
    // Native devices remain usable even if browser permission is denied or devices are busy.
    if (cameraController && (effectiveCameraBackend($('#camera-backend').value, state.nativeCameras) === 'browser')) {
      try { state.browserCameras = await cameraController.requestPermissionAndList(); }
      catch (error) { state.browserCameras = []; if (state.nativeCameras.length < 2) throw error; }
    }
    populateCameraChoices();
    const count = Math.max(state.browserCameras.length, state.nativeCameras.length);
    if (count < 2) throw new Error(`本机只检测到 ${count} 台可用摄像头`);
    $('#camera-badge').textContent = `${count} FOUND`; $('#camera-badge').className = 'status-badge pending';
    $('#camera-transport').textContent = `浏览器 ${state.browserCameras.length} 台 · Ubuntu 原生 ${state.nativeCameras.length} 台，请选择两个不同设备`;
    toast(`已检测到 ${count} 台可用摄像头`);
  } catch (error) {
    state.browserCameras = []; state.nativeCameras = []; populateCameraChoices();
    $('#camera-badge').textContent = 'NOT FOUND'; $('#camera-badge').className = 'status-badge off'; $('#camera-transport').textContent = `摄像头检测失败：${error.message}`; toast(`摄像头检测失败：${error.message}`);
  } finally { button.disabled = false; button.textContent = '重新检测摄像头'; updateNextAction(); }
}
function selectedCaptureProfile() {
  const contract = ($('#infer').classList.contains('active') || state.inferenceCameraSetup) ? selectedInferenceModel()?.camera_contract : null;
  if (contract?.width && contract?.height) return { width: Number(contract.width), height: Number(contract.height), fps: Number(contract.fps || 30), frameRate: Number(contract.fps || 30) };
  const capture = selectedDataset()?.capture;
  if (capture) return { width: Number(capture.width), height: Number(capture.height), fps: Number(capture.fps), frameRate: Number(capture.fps) };
  const [width, height] = $('#capture-profile').value.split(',').map(Number);
  return { width, height, fps: 30, frameRate: 30 };
}
function selectedNativeCameraName(id) { return state.nativeCameras.find(item => item.stable_id === id)?.name || id; }
function setNativePreview(role, active) {
  const collectionImages = nativePreviewImages(role, 'collection');
  const inferenceImages = nativePreviewImages(role, 'inference');
  if (!active) [...collectionImages, ...inferenceImages].forEach(image => {
    image.removeAttribute('src'); image.classList.remove('frame-ready');
    image.closest('article').classList.remove('has-frame');
  });
  for (const image of [collectionImages[0], inferenceImages[0]]) {
    const card = image.closest('article');
    card.querySelector('.camera-placeholder-tag').textContent = active ? '等待画面' : '等待连接';
    card.querySelector('.camera-placeholder-help').textContent = active ? '已连接设备，正在等待有效视频帧' : '连接相机后，实时画面将在这里显示';
  }
  collectionImages[0].closest('.camera-view').classList.toggle('native-streaming', active);
  inferenceImages[0].closest('.inference-camera').classList.toggle('streaming', active);
}
const nativePreviewTimers = { wrist: null, world: null };
const nativePreviewFront = { wrist: 0, world: 0 };
const nativePreviewInFlight = { wrist: false, world: false };
const nativePreviewNextAllowedAt = { wrist: 0, world: 0 };
const NATIVE_PREVIEW_INTERVAL_MS = 33;
let nativePreviewGeneration = 0;
let nativePreviewActiveOwner = null;
function nativePreviewOwner() {
  if ($('#infer').classList.contains('active')) return 'inference';
  if ($('#collect').classList.contains('active')) return 'collection';
  return null;
}
function nativePreviewImages(role, owner = nativePreviewActiveOwner || nativePreviewOwner()) {
  if (owner === 'inference') {
    return [$(`#inference-${role}-frame`), $(`#inference-${role}-frame-buffer`)];
  }
  return [$(`#${role}-native-preview`), $(`#${role}-native-preview-buffer`)];
}
function scheduleNativePreviewFrame(role, generation, delay = 0) {
  clearTimeout(nativePreviewTimers[role]);
  if (nativePreviewInFlight[role]) return;
  const wait = Math.max(delay, nativePreviewNextAllowedAt[role] - Date.now(), 0);
  nativePreviewTimers[role] = window.setTimeout(() => {
    if (generation !== nativePreviewGeneration || state.cameraBackend !== 'native' || nativePreviewActiveOwner !== nativePreviewOwner()) return;
    const image = nativePreviewImages(role)[1 - nativePreviewFront[role]];
    image.dataset.previewGeneration = String(generation);
    nativePreviewInFlight[role] = true;
    nativePreviewNextAllowedAt[role] = Date.now() + NATIVE_PREVIEW_INTERVAL_MS;
    image.src = `${API}/cameras/native/${role}/frame?ts=${Date.now()}`;
  }, wait);
}
function swapNativePreviewFrame(role, image, generation) {
  nativePreviewInFlight[role] = false;
  if (generation !== nativePreviewGeneration || state.cameraBackend !== 'native' || image.dataset.previewGeneration !== String(generation)) return;
  const images = nativePreviewImages(role);
  const next = images.indexOf(image);
  image.classList.add('frame-ready');
  image.classList.add('active');
  image.closest('article').classList.add('has-frame');
  images[nativePreviewFront[role]].classList.remove('active');
  nativePreviewFront[role] = next;
  scheduleNativePreviewFrame(role, generation);
}
function retryNativePreviewFrame(role, generation) {
  nativePreviewInFlight[role] = false;
  scheduleNativePreviewFrame(role, generation, 250);
}
function startNativePreviewPolling() {
  stopNativePreviewPolling();
  const owner = nativePreviewOwner();
  if (!owner || state.cameraBackend !== 'native') return;
  nativePreviewActiveOwner = owner;
  const generation = nativePreviewGeneration;
  for (const role of ['wrist', 'world']) {
    const images = nativePreviewImages(role);
    nativePreviewFront[role] = 0;
    images[0].classList.add('active');
    images[1].classList.remove('active');
    for (const image of images) {
      image.addEventListener('load', () => swapNativePreviewFrame(role, image, generation), { signal: nativePreviewAbort.signal });
      image.addEventListener('error', () => { image.classList.remove('frame-ready'); retryNativePreviewFrame(role, generation); }, { signal: nativePreviewAbort.signal });
    }
    setNativePreview(role, true);
    scheduleNativePreviewFrame(role, generation);
  }
}
let nativePreviewAbort = new AbortController();
function stopNativePreviewPolling() {
  nativePreviewGeneration += 1;
  nativePreviewAbort.abort();
  nativePreviewAbort = new AbortController();
  for (const role of ['wrist', 'world']) {
    clearTimeout(nativePreviewTimers[role]);
    nativePreviewTimers[role] = null;
    nativePreviewInFlight[role] = false;
    nativePreviewNextAllowedAt[role] = 0;
  }
  nativePreviewActiveOwner = null;
}
function restartNativePreviewForActiveView() {
  if (state.cameraBackend === 'native') startNativePreviewPolling();
}
async function connectBrowserCameras(profile) {
  if (!cameraController) throw new Error('当前浏览器不支持摄像头访问');
  const wristDeviceId = $('#wrist-camera-select').value; const worldDeviceId = $('#world-camera-select').value;
  const streams = await cameraController.openPair(wristDeviceId, worldDeviceId, profile);
  const previews = [['wrist-preview', 'wrist', '#wrist-camera', wristDeviceId, streams.quality.wrist, '末端视角相机'], ['world-preview', 'world', '#world-camera', worldDeviceId, streams.quality.world, '世界视角相机']];
  for (const [id, role, labelSelector, deviceId, quality, label] of previews) {
    const video = $(`#${id}`); video.srcObject = streams[role]; await video.play(); await waitForValidVideoFrame(video, label); video.closest('.camera-view').classList.add('streaming');
    const camera = state.browserCameras.find(item => item.deviceId === deviceId); $(labelSelector).textContent = `浏览器 · ${cameraQualityLabel(camera, quality, video, profile)}`; startCameraFrameMonitor(role);
  }
  state.cameraBackend = 'browser';
}
async function connectNativeCameras(profile) {
  const result = await request('/cameras/native/connect', { method: 'POST', body: JSON.stringify({ wrist_camera_id: $('#wrist-camera-select').value, world_camera_id: $('#world-camera-select').value, width: profile.width, height: profile.height, fps: profile.fps }) });
  for (const role of ['wrist', 'world']) { const camera = result.roles[role]; $(`#${role}-camera`).textContent = `Ubuntu 原生 · ${camera.device_name} · ${camera.mode.pixel_format} · ${camera.mode.width}×${camera.mode.height}@${camera.mode.fps}`; setNativePreview(role, true); }
  const mode = result.roles.wrist.mode;
  if (mode) $('#capture-profile').value = `${mode.width},${mode.height}`;
  state.inference = { ...(state.inference || {}), cameras: result };
  state.cameraBackend = 'native'; state.cameraFrameSupport.wrist = false; state.cameraFrameSupport.world = false; startNativePreviewPolling();
}
async function connectCameras() {
  const backend = effectiveCameraBackend($('#camera-backend').value, state.nativeCameras); const profile = selectedCaptureProfile();
  if ($('#wrist-camera-select').value === $('#world-camera-select').value) return toast('两路画面必须选择不同摄像头');
  try {
    if (backend === 'native') await connectNativeCameras(profile);
    else {
      try { await connectBrowserCameras(profile); }
      catch (error) {
        if (backend !== 'auto') throw error;
        await disconnectCameras(false); toast(`浏览器双路协商失败，正在切换 Ubuntu 原生：${error.message}`);
        $('#camera-backend').value = 'native'; populateCameraChoices();
        await connectNativeCameras(profile);
      }
    }
    state.inferenceCameraSetup = false;
    state.deviceBinding = null; $('#camera-badge').textContent = 'STREAMING'; $('#camera-badge').className = 'status-badge on'; $('#camera-transport').textContent = `${state.cameraBackend === 'native' ? 'Ubuntu 原生 MJPEG' : '浏览器'} 双路已连接 · 目标 ${profile.width}×${profile.height} / 30 FPS`; $('#detect-cameras').disabled = true; $('#connect-cameras').disabled = true; $('#disconnect-cameras').disabled = false; $('#wrist-camera-select').disabled = true; $('#world-camera-select').disabled = true; $('#capture-profile').disabled = true; $('#camera-backend').disabled = true; renderCapabilities(state.capabilities); toast(`${state.cameraBackend === 'native' ? 'Ubuntu 原生 MJPEG' : '浏览器'}双摄像头已连接`);
    renderInference(await request('/inference'));
    if (selectedInferenceModel()) await validateInference();
  } catch (error) { await disconnectCameras(false); toast(`摄像头连接失败：${error.message}`); }
}
async function disconnectCameras(showToast = true) {
  const wasRecording = state.episode?.status === 'recording';
  if (wasRecording) { if (frameUploader.snapshot().active) frameUploader.stopAndDrain().catch(() => {}); try { await request('/emergency-stop', { method: 'POST', body: JSON.stringify({ reason: 'camera_disconnected' }) }); } catch (error) { toast(`相机断开后的采集停止失败：${error.message}`); } }
  stopNativePreviewPolling(); if (state.cameraBackend === 'native') await request('/cameras/native/disconnect', { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
  cameraController?.close(); state.cameraBackend = null; state.deviceBinding = null;
  state.inferenceGate = null; inferenceValidationGeneration += 1;
  if (state.inference) state.inference.cameras = { status: 'idle', roles: {} };
  renderInferenceGate();
  for (const role of ['wrist', 'world']) { stopCameraFrameMonitor(role); qualityMonitor.clearCamera(role); state.cameraFrameSupport[role] = null; setNativePreview(role, false); }
  renderCaptureQuality();
  for (const [id, labelSelector] of [['wrist-preview', '#wrist-camera'], ['world-preview', '#world-camera']]) { const video = $(`#${id}`); video.srcObject = null; video.closest('.camera-view').classList.remove('streaming', 'native-streaming'); $(labelSelector).textContent = '未连接'; }
  $('#camera-badge').textContent = Math.max(state.browserCameras.length, state.nativeCameras.length) >= 2 ? 'FOUND' : 'LOCKED'; $('#camera-badge').className = `status-badge ${Math.max(state.browserCameras.length, state.nativeCameras.length) >= 2 ? 'pending' : 'off'}`; $('#camera-transport').textContent = '末端视角 + 世界视角 · 30 FPS'; $('#detect-cameras').disabled = false; $('#disconnect-cameras').disabled = true; $('#capture-profile').disabled = false; $('#camera-backend').disabled = false; $('#bind-devices').disabled = true; populateCameraChoices(); updateNextAction();
  if (wasRecording) await refreshAfterMutation();
  if (showToast) toast(wasRecording ? '相机已断开，Episode 已停止并保留待审核数据' : '相机预览已关闭');
}
async function recoverNativeCameraFault(error) {
  if (state.cameraFaultResetting) return;
  state.cameraFaultResetting = true;
  state.inferenceGate = null;
  try {
    await disconnectCameras(false);
    const message = `摄像头连接已释放，请返回第一步重新检测并连接：${error}`;
    $('#camera-transport').textContent = message;
    $('#camera-next-action').textContent = '下一步：重新检测摄像头并连接末端与世界视角。';
    $('#camera-next-action').className = 'next-action';
    $('#inference-message').className = 'form-status error';
    $('#inference-message').textContent = message;
    toast('原生相机视频流已停止，请返回第一步重新连接');
  } finally {
    state.cameraFaultResetting = false;
  }
}
function waitForValidVideoFrame(video, label, timeoutMs = 5000) {
  const valid = () => video.videoWidth >= 640 && video.videoHeight >= 360;
  if (valid()) return Promise.resolve({ width: video.videoWidth, height: video.videoHeight });
  return new Promise((resolve, reject) => {
    let callbackId = null;
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('resize', check);
      if (error) reject(error);
      else resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    const check = () => {
      if (valid()) return finish();
      if (typeof video.requestVideoFrameCallback === 'function') callbackId = video.requestVideoFrameCallback(check);
    };
    const timer = setTimeout(() => {
      const actual = `${video.videoWidth || 0}×${video.videoHeight || 0}`;
      finish(new Error(`${label}画面尺寸无效：实际 ${actual}，最低需要 640×360；2×2 占位画面不能用于采集`));
    }, timeoutMs);
    video.addEventListener('loadeddata', check);
    video.addEventListener('resize', check);
    check();
  });
}
function cameraQualityLabel(_camera, quality, video, profile) { const sourceWidth = video.videoWidth || quality?.width || 0; const sourceHeight = video.videoHeight || quality?.height || 0; if (!sourceWidth || !sourceHeight) return '已连接 · 等待视频尺寸'; const box = video.getBoundingClientRect(); const renderWidth = Math.round(box.width); const renderHeight = Math.round(box.height); const scale = Math.max(renderWidth / sourceWidth, renderHeight / sourceHeight); const fps = quality?.frameRate ? `@${Math.round(quality.frameRate)}` : ''; const fallback = sourceWidth < profile.width || sourceHeight < profile.height ? ' · 低清回退' : ''; return `源 ${sourceWidth}×${sourceHeight}${fps} · 显示 ${renderWidth}×${renderHeight} · ${scale.toFixed(2)}×${fallback}`; }


$('#dataset-form').addEventListener('submit', async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const taskName = String(form.get('task_name') || '').trim();
  const slug = String(form.get('slug') || '').trim();
  if (!taskName) { setDatasetFormStatus('请输入任务名称。', 'error'); formElement.querySelector('[name="task_name"]').focus(); return; }
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(slug)) { setDatasetFormStatus('数据集标识需为 3–48 位小写字母、数字或连字符，并以字母或数字开头。', 'error'); formElement.querySelector('[name="slug"]').focus(); return; }
  const submit = formElement.querySelector('[type="submit"]');
  submit.disabled = true;
  setDatasetFormStatus('正在创建数据集…', 'pending');
  try {
    // Disabled controls are omitted from FormData when cameras are connected.
    const [width, height] = $('#capture-profile').value.split(',').map(Number);
    if (![width, height].every(Number.isFinite)) throw new Error('请选择有效的采集分辨率');
    const created = await request('/datasets', { method: 'POST', body: JSON.stringify({ task_name: taskName, slug, width, height, fps: 30 }) });
    state.selectedDatasetId = created.id;
    renderDatasets([...state.datasets.filter(item => item.id !== created.id), created]);
    formElement.querySelector('[name="task_name"]').value = '';
    formElement.querySelector('[name="slug"]').value = '';
    setDatasetFormStatus(`数据集“${created.task_name}”已创建并锁定 ${created.capture.width}×${created.capture.height}@${created.capture.fps} FPS。`, 'success');
    toast('数据集已创建');
    await refreshAfterMutation();
  } catch (error) {
    setDatasetFormStatus(`创建失败：${error.message}`, 'error');
    toast(`创建失败：${error.message}`);
  } finally { submit.disabled = false; }
});

for (const role of ['leader', 'follower']) for (const operation of ['connect', 'disconnect']) {
  const button = $(`#${operation}-${role}`);
  button.addEventListener('click', () => withButtonFeedback(button,
    () => operation === 'connect' ? connectSerial(role) : disconnectSerial(role),
    { label: operation === 'connect' ? '正在连接…' : '正在断开…', restore: () => renderSerialState(state.serial) }));
}  $('#detect-cameras').addEventListener('click', detectCameras); $('#connect-cameras').addEventListener('click', connectCameras); $('#disconnect-cameras').addEventListener('click', disconnectCameras); $('#wrist-camera-select').addEventListener('change', updateCameraSelectionState); $('#world-camera-select').addEventListener('change', updateCameraSelectionState);
$('#bind-devices').addEventListener('click', () => withButtonFeedback($('#bind-devices'), async () => { if (state.navigationPending) return toast('正在切换页面，请稍候。'); const payload = { leader_type: $('#leader-type').value, leader_port: $('#leader-port').value, follower_port: $('#follower-port').value, wrist_camera_id: $('#wrist-camera-select').value, world_camera_id: $('#world-camera-select').value }; try { const binding = await request('/devices/bind', { method: 'POST', body: JSON.stringify(payload) }); renderDeviceBinding(binding); toast('设备选择已保存；机械臂 J1–J7 实时校验尚未接入'); } catch (error) { toast(error.message); } }, { label: '正在保存…', restore: () => renderCapabilities(state.capabilities) }));
$('#inference-connect-follower').addEventListener('click', () => withButtonFeedback($('#inference-connect-follower'), async () => {
  await connectSerial('follower', $('#inference-follower-port').value);
  if (state.serial.follower?.connected && selectedInferenceModel()) await validateInference();
}, { label: '正在连接…', restore: () => renderSerialState(state.serial) }));
$('#inference-disconnect-follower').addEventListener('click', () => withButtonFeedback($('#inference-disconnect-follower'), async () => {
  await disconnectSerial('follower'); state.inferenceGate = null; renderInferenceGate();
}, { label: '正在断开…', restore: () => renderSerialState(state.serial) }));
$('#inference-refresh-ports').addEventListener('click', () => withButtonFeedback($('#inference-refresh-ports'), refreshAfterMutation));
$('#training-prepare').addEventListener('click', () => prepareTrainingEnvironment(false));
$('#training-retry').addEventListener('click', () => prepareTrainingEnvironment(true));
$('#training-start').addEventListener('click', startTraining);
$('#training-stop').addEventListener('click', stopTraining);
$('#training-resume').addEventListener('click', resumeTraining);

$('#inference-task').addEventListener('change', () => { state.inferenceGate = null; state.inferenceStartError = null; renderInferenceGate(); });
$('#model-import').addEventListener('click', () => $('#model-import-file').click());
$('#inference-model-import').addEventListener('click', () => $('#model-import-file').click());
$('#model-import-file').addEventListener('change', event => importActModel(event.target.files?.[0]));
$('#inference-prepare-runtime').addEventListener('click', () => prepareTrainingEnvironment(state.trainingEnvironment?.status === 'failed'));
$('#model-list').addEventListener('click', event => {
  const use = event.target.closest('[data-use-model]');
  const download = event.target.closest('[data-export-model]');
  if (use) void withButtonFeedback(use, () => useInferenceModel(use.dataset.useModel), { label: '正在准备…' });
  if (download) void withButtonFeedback(download, () => exportActModel(download.dataset.exportModel), { label: '正在导出…' });
});
$('#inference-confirm').addEventListener('change', () => renderInferenceGate());
$('#inference-validate').addEventListener('click', () => withButtonFeedback($('#inference-validate'), validateInference, { label: '检查中…', restore: renderInferenceGate }));
$('#inference-start').addEventListener('click', startInference);
$('#inference-stop').addEventListener('click', stopInference);
$('#emergency-stop').addEventListener('click', async () => { try { if (frameUploader.snapshot().active) frameUploader.stopAndDrain().catch(() => {}); await request('/emergency-stop', { method: 'POST', body: JSON.stringify({ reason: 'operator' }) }); await refreshAfterMutation(); $('#stop-episode').disabled = true; $('#episode-control-status').textContent = '已急停：硬件控制已立即停止，当前 Episode 等待审核。'; setWaveformStatus('已急停', 'error'); toast('急停已触发，硬件控制已停止'); } catch (error) { toast(`急停失败：${error.message}`); } });
window.addEventListener('resize', () => { waveformChart.schedule(); inferenceWaveformChart?.schedule(); }); window.addEventListener('beforeunload', () => { if (state.trainingPoll) clearTimeout(state.trainingPoll); if (state.trainingJobPoll) clearTimeout(state.trainingJobPoll); if (state.inferencePoll) clearTimeout(state.inferencePoll); closeTelemetryStream(); frameEncoder.terminate(); cameraController?.close(); if (state.episode?.status === 'recording') navigator.sendBeacon(`${API}/emergency-stop`, JSON.stringify({ reason: 'page_unload' })); });
installWorkbenchMotion();
$('.workflow').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (!button || button.dataset.view === document.querySelector('.view.active')?.id) return; void navigateActView(button.dataset.view); });
$('.waveform-mode').addEventListener('click', event => { const button = event.target.closest('[data-waveform-view]'); if (button) setWaveformView(button.dataset.waveformView); });
$('#waveform-joints').addEventListener('click', event => { const button = event.target.closest('[data-joint]'); if (button) selectWaveformJoint(button.dataset.joint); });
$('#waveform-channel-legend').addEventListener('change', event => { const input = event.target.closest('[data-channel]'); if (input) setWaveformChannel(input.dataset.channel, input.checked); });
async function startEpisode() {
  if (state.navigationPending) return toast('正在切换页面，请稍候。');
  const datasetId = selectedDatasetId();
  if (!datasetId) return toast('请先创建并选择数据集');
  if (!state.deviceBinding) return toast('请先保存设备选择');
  if (state.cameraBackend !== 'native' && !['wrist', 'world'].every(role => state.cameraFrameSupport[role] === true)) return toast('当前浏览器必须支持两路真实视频帧回调才能采集视觉 ACT 数据');
  if (state.completedRounds >= state.targetRounds) return toast('目标采集轮数已完成');
  const button = $('#episode-button');
  button.disabled = true;
  $('#episode-control-status').textContent = '正在读取 Leader 与真实 FL 的 J1–J7，并启动双相机持久化…';
  setWaveformStatus('正在启动', 'waiting');
  try {
    waveformBuffer.clear(); qualityMonitor.resetTelemetry(); renderCaptureQuality();
    lastWaveformTimestamp = null; waveformFps = null; persistedSampleCount = 0;
    $('#valid-frames').textContent = '0'; $('#waveform-matched').textContent = '0'; $('#waveform-empty').classList.remove('hidden');
    const episode = await request('/episodes', { method: 'POST', body: JSON.stringify({ dataset_id: selectedDatasetId() }) });
    if (episode.runtime?.status !== 'running') throw new Error(episode.runtime?.error || '机械臂控制循环未启动');
    frameUploader.start(episode.id);
    state.episode = episode;
    $('#episode-index').textContent = episode.id.slice(0, 8);
    $('#stop-episode').disabled = false;
    $('#episode-review').classList.add('hidden');
    renderRoundProgress(); renderSelectedDataset();
    setWaveformStatus('遥操作运行中', 'live');
    $('#episode-control-status').textContent = 'Leader → 真实 FL、J1–J7 与双路 JPEG 85 正在同步采集';
    $('#binding-status').textContent = 'Episode 已启动：真实 action/state 与双相机帧将写入当前数据集。';
    toast('Episode 多模态采集已启动');
  } catch (error) {
    state.episode = null; button.disabled = false; renderRoundProgress(); renderSelectedDataset();
    $('#stop-episode').disabled = true; setWaveformStatus('启动失败', 'error');
    $('#episode-control-status').textContent = `启动失败：${error.message}`;
    $('#binding-status').textContent = `Episode 未启动：${error.message}`;
    toast(`Episode 启动失败：${error.message}`);
  }
}

async function stopEpisode() {
  if (state.episode?.status !== 'recording') return;
  const button = $('#stop-episode');
  button.disabled = true;
  $('#episode-control-status').textContent = '正在停止接收新图像并排空上传队列…';
  const episodeId = state.episode.id;
  try {
    state.frameDrain = frameUploader.stopAndDrain();
    renderSelectedDataset();
    const drain = await state.frameDrain;
    $('#episode-control-status').textContent = drain.ok ? `图像已排空：末端 ${drain.frames.wrist}，世界 ${drain.frames.world}；正在停止遥操作…` : `图像上传失败：${drain.error}；正在安全停止遥操作…`;
    const quality = qualityMonitor.snapshot();
    const mismatchRate = quality.meanError === null ? 0 : Math.min(100, quality.meanError / 180 * 100);
    const result = await request(`/episodes/${episodeId}/stop`, { method: 'POST', body: JSON.stringify({ mismatch_rate: mismatchRate }) });
    state.episode = result;
    renderRoundProgress(); $('#episode-review').classList.remove('hidden');
    const integrityOk = Boolean(result.integrity?.ok) && drain.ok;
    const successButton = $('#episode-review [data-decision="success"]');
    successButton.disabled = result.valid_frames === 0 || Boolean(result.runtime_error) || !integrityOk;
    const blockers = [result.runtime_error && `控制循环故障：${result.runtime_error}`, drain.error && `图像上传失败：${drain.error}`, ...(result.integrity?.errors || [])].filter(Boolean);
    successButton.title = blockers.join('；') || (result.valid_frames === 0 ? '没有真实 J1–J7 样本，不能保存为成功示教' : '');
    const cameras = result.camera_frames || { wrist: 0, world: 0 };
    $('#episode-summary').textContent = `${result.valid_frames} 个真实 J1–J7 样本 · 末端 ${cameras.wrist || 0} 帧 · 世界 ${cameras.world || 0} 帧${blockers.length ? ` · ${blockers.join('；')}` : ' · 完整性通过'}`;
    $('#episode-control-status').textContent = integrityOk ? '采集已完整落盘，请在此处审核 Episode' : '采集已停止但完整性未通过，只能保存失败记录或删除';
    renderDeviceBinding(state.deviceBinding); renderSelectedDataset();
    toast('Episode 已停止，等待原位审核');
  } catch (error) {
    button.disabled = false;
    $('#episode-control-status').textContent = `停止失败：${error.message}`;
    toast(`Episode 停止失败：${error.message}`);
  } finally {
    state.frameDrain = null;
    renderSelectedDataset();
  }
}
$('#refresh').addEventListener('click', () => withButtonFeedback($('#refresh'), refreshAfterMutation)); $('#episode-button').addEventListener('click', startEpisode); $('#stop-episode').addEventListener('click', stopEpisode);
document.querySelectorAll('#episode-review [data-decision]').forEach(button => button.addEventListener('click', async () => { if (!state.episode?.id) return; try { const result = await request(`/episodes/${state.episode.id}/review`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decision }) }); state.episode = null; $('#episode-review').classList.add('hidden'); await refreshAfterMutation(); toast(result.status === 'accepted_success' ? '成功示教已保存' : result.status === 'accepted_failure' ? '失败记录已保存' : 'Episode 已删除'); } catch (error) { toast(`Episode 审核失败：${error.message}`); } }));
$('#target-rounds').addEventListener('change', () => { renderRoundProgress(); renderDeviceBinding(state.deviceBinding); });
$('#active-dataset').addEventListener('change', async () => { if (state.episode) { $('#active-dataset').value = state.selectedDatasetId || ''; return toast('Episode 运行或待审核时不能切换数据集'); } if (state.cameraBackend) { $('#active-dataset').value = state.selectedDatasetId || ''; return toast('摄像头已连接，断开后才能切换数据集'); } state.selectedDatasetId = $('#active-dataset').value || null; renderSelectedDataset(); restoreCollectionState({ datasets: state.datasets, episodes: state.episodes }); await refreshDatasetStats(); renderDeviceBinding(state.deviceBinding); });
$('#dataset-export').addEventListener('click', downloadDataset);
$('#dataset-import').addEventListener('click', () => $('#dataset-import-file').click());
$('#dataset-import-file').addEventListener('change', event => importDataset(event.target.files?.[0]));
function maybeShowDataDirSetup() {
  const overlay = $('#data-dir-setup');
  if (!overlay) return;
  if (state.data_dir_explicit === false) {
    if (!state.data_dir || state.data_dir === 'data') {
      $('#data-dir-current').textContent = '尚未配置，将保存到工程目录下的 data/ 目录。';
    } else {
      $('#data-dir-current').textContent = `当前将使用：${state.data_dir}`;
    }
    $('#data-dir-error').textContent = '';
    overlay.classList.remove('hidden');
    $('#data-dir-input').focus();
  } else {
    overlay.classList.add('hidden');
  }
}
$('#data-dir-save').addEventListener('click', async () => {
  const dir = ($('#data-dir-input').value || '').trim();
  if (!dir) { $('#data-dir-error').textContent = '请填写数据存储目录。'; return; }
  $('#data-dir-save').disabled = true;
  $('#data-dir-error').textContent = '';
  try {
    await request('/settings/data-dir', { method: 'POST', body: JSON.stringify({ data_dir: dir }) });
    location.reload();
  } catch (error) {
    $('#data-dir-error').textContent = error.message;
    $('#data-dir-save').disabled = false;
  }
});
window.addEventListener('act:runtime-connected', () => { connectTelemetryStream(); refresh(); });
window.addEventListener('act:runtime-auto-prepare', () => { if (!environmentConfigurationBusy) void prepareTrainingEnvironment(false, false); });
renderJoints(); renderRoundProgress(); renderCaptureQuality(); waveformChart.draw(); inferenceWaveformChart = new WaveformChart($('#inference-waveform'), inferenceWaveformBuffer); inferenceWaveformChart.draw(); connectTelemetryStream(); refresh(); pollInference();

$('#inference-calibration-import').addEventListener('click', () => $('#inference-calibration-file').click());
$('#inference-calibration-file').addEventListener('change', event => importArmCalibration(event.target.files?.[0]));

let followerCalibrationState = null;
let followerCalibrationTimer = null;
let followerCalibrationBusy = false;
let followerCalibrationPollBusy = false;
let followerCalibrationGeneration = 0;
let followerCalibrationPendingCancel = false;
function setCalibrationStatus(message) {
  $('#calibration-status').textContent = message;
  const live = $('#calibration-live-status');
  if (live) live.textContent = message;
}

let followerCalibrationNotice = null;
let followerCalibrationNetworkFailures = 0;
async function calibrationRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const data = await request(path, { ...options, signal: controller.signal });
    if (controller.signal.aborted) {
      const error = new Error('校准请求超时'); error.name = 'AbortError'; throw error;
    }
    const valid = path.endsWith('/apply') ? typeof data.id === 'string'
      : ['idle', 'recording', 'paused', 'saved', 'cancelled', 'fault'].includes(data.status);
    if (!valid) throw new Error('后台没有返回有效校准状态，请确认后台与页面使用同一版工程。');
    return data;
  }
  finally { clearTimeout(timeout); }
}
function renderFollowerCalibration(data) {
  followerCalibrationState = data;
  const recording = data.status === 'recording';
  const paused = data.status === 'paused';
  const saved = data.status === 'saved';
  $('#calibration-joints').innerHTML = (data.joints || []).map(joint => `<div class="calibration-joint-row"><b>J${joint.id + 1}</b><span>当前 ${Number(joint.angle).toFixed(1)}°</span><span>原始跨度 ${Number(joint.raw_span_deg ?? joint.span_deg).toFixed(1)}° · 模型跨度 ${Number(joint.span_deg).toFixed(1)}°</span></div>`).join('');
  setCalibrationStatus(followerCalibrationNotice || data.error || data.warning || (paused ? '记录已暂停，范围保留。检查连接后，确认同一台从臂并继续。' : recording ? `正在记录（${data.samples} 次）。请缓慢活动各关节。` : saved ? '已保存本台从臂校准，可用于当前归一化模型或下载。' : data.status === 'cancelled' ? '记录已取消，未覆盖之前保存的校准。' : '连接从臂并确认扶稳后，点击开始记录。'));
  $('#calibration-start').disabled = recording || paused;
  const resume = $('#calibration-resume');
  const reconnect = $('#calibration-reconnect');
  if (resume) resume.disabled = !(paused || recording);
  if (reconnect) reconnect.disabled = !(paused || recording);
  $('#calibration-save').disabled = !recording;
  $('#calibration-apply').disabled = !saved || selectedInferenceModel()?.coordinate_contract !== 'starai_0_0_4_calibrated';
  $('#calibration-download').disabled = !saved;
}
function scheduleFollowerCalibration() {
  clearTimeout(followerCalibrationTimer);
  if (followerCalibrationState?.status !== 'recording') return;
  const delay = followerCalibrationNetworkFailures ? 1000 : 250;
  followerCalibrationTimer = setTimeout(async () => {
    if (followerCalibrationBusy || followerCalibrationPollBusy) return scheduleFollowerCalibration();
    const generation = followerCalibrationGeneration;
    followerCalibrationPollBusy = true;
    try {
      const data = await calibrationRequest('/follower-calibration/sample', { method: 'POST', body: '{}' });
      if (generation !== followerCalibrationGeneration) return;
      renderFollowerCalibration(data);
      followerCalibrationNetworkFailures = 0;
    } catch (error) {
      if (generation !== followerCalibrationGeneration) return;
      followerCalibrationNetworkFailures += 1;
      const detail = error.name === 'AbortError' ? '读取请求超过 4 秒未响应' : error.message;
      try {
        const actual = await calibrationRequest('/follower-calibration');
        if (generation !== followerCalibrationGeneration) return;
        renderFollowerCalibration({ ...actual, warning: actual.warning || `通信暂时失败，正在重试，已有范围保留：${detail}` });
      } catch {
        if (generation !== followerCalibrationGeneration) return;
        renderFollowerCalibration({ ...followerCalibrationState, status: 'recording',
          warning: `页面通信失败（连续 ${followerCalibrationNetworkFailures} 次），正在持续重试，范围保留：${detail}` });
      }
    }
    finally {
      followerCalibrationPollBusy = false;
      if (generation === followerCalibrationGeneration) scheduleFollowerCalibration();
    }
  }, delay);
}

async function openFollowerCalibration() {
  const dialog = $('#follower-calibration-dialog');
  if (!dialog.open) dialog.showModal();
  setCalibrationStatus('正在读取本机校准状态…');
  try { renderFollowerCalibration(await calibrationRequest('/follower-calibration')); scheduleFollowerCalibration(); }
  catch (error) { setCalibrationStatus(error.message); }
}
async function followerCalibrationOperation(operation) {
  if (followerCalibrationBusy) {
    if (operation === 'cancel') {
      followerCalibrationPendingCancel = true;
      setCalibrationStatus('取消已收到，正在等待当前请求结束（最多 4 秒）…');
    } else setCalibrationStatus('正在处理上一个操作（最多 4 秒），请稍候。');
    return;
  }
  followerCalibrationBusy = true;
  followerCalibrationGeneration += 1;
  followerCalibrationNotice = null;
  clearTimeout(followerCalibrationTimer);
  try {
    const body = { operator_confirmed: $('#calibration-support-confirm').checked,
      range_confirmed: $('#calibration-range-confirm').checked, same_arm_confirmed: $('#calibration-same-arm-confirm').checked,
      model_id: selectedInferenceModel()?.id };
    const result = await calibrationRequest(`/follower-calibration/${operation}`, { method: 'POST', body: JSON.stringify(body) });
    if (operation === 'apply') {
      await loadModels(); await validateInference();
      setCalibrationStatus('校准已用于当前模型，请连接模型要求的双相机并验证执行条件。');
    } else renderFollowerCalibration(result);
    followerCalibrationNetworkFailures = 0;
    if (['start', 'resume', 'reconnect'].includes(operation)) $('#calibration-range-confirm').checked = false;
  } catch (error) { followerCalibrationNotice = error.name === 'AbortError' ? '操作等待超过 4 秒，请检查后台服务连接，随后重试。' : error.message; setCalibrationStatus(followerCalibrationNotice); }
  finally {
    followerCalibrationBusy = false;
    if (followerCalibrationPendingCancel) {
      followerCalibrationPendingCancel = false;
      await followerCalibrationOperation('cancel');
    } else scheduleFollowerCalibration();
  }
}
$('#open-follower-calibration').addEventListener('click', openFollowerCalibration);
$('#open-inference-calibration').addEventListener('click', openFollowerCalibration);
for (const [id, operation] of [['calibration-start','start'],['calibration-save','finish'],['calibration-resume','resume'],['calibration-reconnect','reconnect'],['calibration-cancel','cancel'],['calibration-apply','apply']]) {
  document.getElementById(id).addEventListener('click', () => followerCalibrationOperation(operation));
}
$('#calibration-download').addEventListener('click', async () => {
  try {
    const calibration = await request('/follower-calibration/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(calibration, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'stararm102_follower_calibration.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { setCalibrationStatus(error.message); }
});
$('#calibration-close').addEventListener('click', () => {
  if (followerCalibrationBusy || ['recording', 'paused'].includes(followerCalibrationState?.status)) { setCalibrationStatus('请先保存或取消校准，再关闭。'); return; }
  $('#follower-calibration-dialog').close();
});
$('#follower-calibration-dialog').addEventListener('cancel', event => {
  if (['recording', 'paused'].includes(followerCalibrationState?.status)) { event.preventDefault(); setCalibrationStatus('请先保存或取消正在记录的校准。'); }
});
$('#follower-calibration-dialog').addEventListener('close', () => {
  clearTimeout(followerCalibrationTimer);
  if (['recording', 'paused'].includes(followerCalibrationState?.status)) {
    request('/follower-calibration/cancel', { method: 'POST', body: '{}' }).then(renderFollowerCalibration).catch(() => {});
  }
});

$('#inference-camera-settings').addEventListener('click', async () => {
  document.querySelector('.workflow [data-view="collect"]').click();
  state.inferenceCameraSetup = true;
  const contract = selectedInferenceModel()?.camera_contract;
  if (contract?.width) toast(`推理相机将按模型使用 ${contract.width}×${contract.height}，请核对视角对应。`);
  const card = document.querySelector('.cameras-card');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (state.episode || ['loading', 'running', 'stopping'].includes(state.inference?.status)) return toast('请先停止采集或推理，再调整相机。');
  if (state.cameraBackend === 'browser') await disconnectCameras(false);
  if (state.cameraBackend !== 'native') {
    $('#camera-backend').value = 'native';
    await detectCameras();
  }
  toast('请核对两个视角，连接两台摄像头后返回实机推理。');
});

$('#capture-configure').addEventListener('click', () => {
  const target = state.datasets.length ? $('#active-dataset') : $('#dataset-form input[name="task_name"]');
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
});

// Fullscreen magnifies existing camera elements without reconnecting or cloning streams.
document.querySelectorAll('[data-camera-enlarge]').forEach(button => button.addEventListener('click', async () => {
  const cameras = button.dataset.cameraEnlarge === 'collect' ? $('.camera-grid') : $('.inference-cameras');
  try {
    if (!cameras.requestFullscreen) throw new Error('当前浏览器不支持全屏，请使用浏览器缩放查看');
    await cameras.requestFullscreen();
  } catch (error) { toast(`无法放大视频：${error.message}`); }
}));
document.querySelectorAll('[data-camera-exit]').forEach(button => button.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(error => toast(error.message));
}));

const releaseActSerialPorts = createSingleFlight(async () => {
  state.deviceEpoch++;
  await Promise.allSettled([...serialOperations]);
  if (followerCalibrationBusy || ['recording', 'paused'].includes(followerCalibrationState?.status)) {
    throw new Error('请先保存或取消从臂校准，再切换页面。');
  }
  if (state.modelImporting || state.frameDrain || state.inferenceStarting) {
    throw new Error('当前操作尚未完成，请稍后再切换页面。');
  }
  if (state.episode?.status === 'recording') {
    await stopEpisode();
    if (state.episode?.status === 'recording') throw new Error('采集尚未停止，页面与串口连接已保留。');
  }
  if (!state.capabilities && !Object.values(state.serial).some(port => port?.connected)) return;
  const inference = await request('/inference');
  if (['loading', 'running', 'stopping'].includes(inference.status)) {
    const stopped = await request('/inference/stop', { method: 'POST', body: JSON.stringify({ reason: 'page_switch' }) });
    renderInference(stopped);
    if (['loading', 'running', 'stopping'].includes(stopped.status)) throw new Error('推理尚未停止，请稍后再切换。');
  }
  const devices = await request('/devices');
  for (const role of ['leader', 'follower']) {
    if (devices.serial_connections?.[role]?.connected || state.serial[role]?.connected) {
      await request('/devices/serial/disconnect', { method: 'POST', body: JSON.stringify({ role }) });
      state.serial[role] = null; setDeviceCard(role, false, '');
    }
  }
  state.deviceBinding = null; state.inferenceGate = null;
  renderDeviceBinding(null); renderInferenceGate();
});

const navigateActView = createPageNavigator({
  release: releaseActSerialPorts,
  activate: id => {
    switchWorkbenchView(id); restartNativePreviewForActiveView();
    if (id === 'infer') pollInference(0);
    if (id === 'train' && !['ready', 'preparing', 'failed'].includes(state.trainingEnvironment?.status)) void prepareTrainingEnvironment(false, false);
  },
  onPending: (id, busy) => {
    state.navigationPending = busy;
    renderInferenceSerialState();
    document.querySelectorAll('.workflow [data-view]').forEach(button => {
      button.disabled = busy;
      if (busy && button.dataset.view === id) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    });
    if (busy) setInteractionStatus('正在停止当前控制并断开串口…');
    else if (document.getElementById('interaction-status')?.dataset.kind !== 'error') setInteractionStatus('');
  },
  onError: error => setInteractionStatus(`切换未完成：${error.message}`, 'error'),
});

window.addEventListener('workbench:before-switch', event => {
  event.detail.waits.push((async () => {
    await releaseActSerialPorts();
    if (state.cameraBackend) await disconnectCameras(false);
  })());
});
