import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const htmlPath = new URL('../Browser_SDK/act-workbench.html', import.meta.url);
const jsPath = new URL('../Browser_SDK/src/act-workbench.js', import.meta.url);

test('ACT workbench exposes the approved four-stage workflow and global emergency stop', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const text of ['数据采集', '训练任务', '模型管理', '实机推理', '全局急停']) {
    assert.match(html, new RegExp(text));
  }
});

test('workbench consumes live API without page-visibility hold authorization', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /const API = getLocalApi\(\)/);
  assert.match(js, /request\(['"]\/capabilities['"]\)/);
  assert.doesNotMatch(js, /visibilitychange/);
  assert.doesNotMatch(js, /revokeInferenceAuthorization/);
  assert.doesNotMatch(js, /RTX 4060|6\.7 GB|同步正常/);
});

test('real inference workspace exposes LeRobot cameras joints performance logs and explicit controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['inference-model-name', 'inference-task', 'inference-validate', 'inference-start',
    'inference-stop', 'inference-wrist-frame', 'inference-world-frame', 'inference-joints',
    'inference-waveform', 'inference-performance', 'inference-log']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const path of ['/inference/validate', '/inference/start', '/inference/stop']) {
    assert.match(js, new RegExp(path.replaceAll('/', '\\/')));
  }
  for (const field of ['observation_state', 'raw_action', 'safe_action', 'policy_latency_ms',
    'serial_latency_ms', 'end_to_end_ms', 'executed_actions']) {
    assert.match(js, new RegExp(field));
  }
  assert.match(html, /停止推理并立即卸力/);
  assert.match(html, /末端视角/);
  assert.match(html, /世界视角/);
  assert.doesNotMatch(html + js, /虚拟 FL|闭环预演|按住以启用/);
  assert.doesNotMatch(html + js, /mockInference|fakeAction|模拟推理/);
});

test('completed ACT training auto-registers and inference uses the latest executable model without a model selector', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.doesNotMatch(html, /<select[^>]+id=["']inference-model["']/);
  assert.match(html, /id=["']inference-model-name["']/);
  assert.match(js, /latestExecutableInferenceModel/);
  assert.match(js, /job\.status === ['"]completed['"][\s\S]*?loadModels/);
  assert.doesNotMatch(js, /training-register.*classList\.toggle/);
});

test('validated idle inference remains startable until a real invalidation event', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-inference.css', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /if \(!active && snapshot\.status !== ['"]fault['"]\) state\.inferenceGate = null/);
  assert.match(js, /const previousStatus = state\.inference\?\.status/);
  assert.match(js, /terminalTransition[\s\S]*?state\.inferenceGate = null/);
  assert.doesNotMatch(js, /if \(snapshot\.status === ['"]stopped['"]\) state\.inferenceGate = null/);
  assert.match(js, /inferenceStarting:\s*false/);
  assert.match(js, /inferenceStartError:\s*null/);
  assert.match(js, /if \(state\.inferenceStartError\)[\s\S]*?启动失败/);
  assert.match(js, /state\.inferenceStarting = true[\s\S]*?正在提交启动请求/);
  assert.match(js, /finally \{[\s\S]*?state\.inferenceStarting = false[\s\S]*?renderInferenceGate\(\)[\s\S]*?启动失败/);
  for (const className of ['inference-contract-block', 'inference-readiness', 'inference-launch-zone']) {
    assert.match(html, new RegExp(`class=["'][^"']*${className}`));
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(html, /src=["']src\/act-workbench\.js\?v=[^"']+["']/);
});

test('runtime capability panel distinguishes GPU, managed runtime, and selected accelerator backend', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /ACT 运行时/);
  assert.match(js, /计算后端/);
  assert.match(js, /caps\.torch\.installed/);
  assert.match(js, /caps\.torch\.backend/);
  assert.match(js, /caps\.act_runtime\.execution_available/);
  assert.match(js, /trainingEnvironment/);
  assert.doesNotMatch(js, /RTX 4060/);
});

test('one-click training preparation is driven by real backend state without terminal instructions', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['training-prepare', 'training-retry', 'training-progress', 'training-stage']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(js, /\/training\/environment\/prepare/);
  assert.match(js, /renderTrainingEnvironment/);
  assert.doesNotMatch(html + js, /^\s*(?:sudo\s+|pip\s+install\b|\$\s+(?:python|pip)\b)/m);
});

test('training workspace exposes a live operational dashboard without fabricated metrics', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['training-overall-progress', 'training-elapsed', 'training-loss-chart',
    'training-log', 'training-checkpoint-list', 'training-failure-panel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const field of ['progress_percent', 'elapsed_ms', 'metrics', 'log_tail', 'checkpoints']) {
    assert.match(js, new RegExp(`job\\.${field}`));
  }
  assert.match(js, /window\.setTimeout\(poll,\s*1000\)/);
  assert.doesNotMatch(js, /mockLoss|fakeMetric|模拟训练/);
  assert.match(html, /src=["']src\/act-workbench\.js\?v=[^"']+["']/);
});

test('native preview has one visible stage owner and inference uses the same 30 FPS double buffer', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-inference.css', import.meta.url), 'utf8');
  assert.match(html, /id="inference-wrist-frame-buffer"/);
  assert.match(html, /id="inference-world-frame-buffer"/);
  assert.match(js, /function nativePreviewOwner\(\)/);
  assert.match(js, /const owner = nativePreviewOwner\(\)/);
  assert.match(js, /if \(owner === 'inference'\)/);
  assert.match(js, /restartNativePreviewForActiveView\(\)/);
  assert.doesNotMatch(js, /image\.src = `\$\{API\}\/cameras\/native\/\$\{role\}\/frame\?inference=/);
  assert.match(css, /\.inference-camera \.native-preview/);
});

test('inference confirmation is a validated launch authorization immediately before start', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /class="inference-launch-authorization"[\s\S]*id="inference-confirm"[\s\S]*id="inference-start"/);
  assert.match(js, /\$\('#inference-confirm'\)\.disabled = !ready \|\| active/);
  assert.match(js, /if \(!ready\) \$\('#inference-confirm'\)\.checked = false/);
});

test('native camera fault releases the stale connection and restores reconnect controls', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /cameraFaultResetting:\s*false/);
  assert.match(js, /snapshot\.cameras\?\.status === 'fault'/);
  assert.match(js, /recoverNativeCameraFault\(snapshot\.cameras\.error/);
  assert.match(js, /async function recoverNativeCameraFault\(error\)/);
  assert.match(js, /await disconnectCameras\(false/);
  assert.match(js, /摄像头连接已释放，请返回第一步重新检测并连接/);
});

test('inference confirmation uses a stable full-row authorization control', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-inference.css', import.meta.url), 'utf8');
  assert.match(html, /class="authorization-mark"[\s\S]*<svg[\s\S]*<path/);
  assert.match(html, /class="authorization-copy"[\s\S]*<b>确认工作区安全<\/b>[\s\S]*<small>/);
  assert.match(css, /\.operator-confirm input\{position:absolute;opacity:0/);
  assert.match(css, /\.authorization-mark/);
  assert.match(css, /input:checked\+\.authorization-mark/);
});

test('native dual-camera preview targets 30 FPS without allowing overlapping requests', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /NATIVE_PREVIEW_INTERVAL_MS\s*=\s*33/);
  assert.match(js, /nativePreviewInFlight/);
  assert.match(js, /if \(nativePreviewInFlight\[role\]\) return/);
  assert.match(js, /retryNativePreviewFrame\(role, image, generation\)/);
});

test('training checkpoint rendering defines HTML escaping before use and polling survives render failures', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const escapeDefinition = js.indexOf('function escapeHtml(');
  const checkpointRender = js.indexOf("$('#training-checkpoint-list').innerHTML");
  assert.ok(escapeDefinition >= 0, 'training workbench must define escapeHtml');
  assert.ok(escapeDefinition < checkpointRender, 'escapeHtml must be initialized before checkpoint rendering');
  const pollBody = js.match(/function pollTrainingJob\(jobId\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(pollBody, /let continuePolling = true/);
  assert.match(pollBody, /finally\s*\{[\s\S]*window\.setTimeout\(poll,\s*1000\)/);
});

test('device binding identifies four physical roles and never unlocks capture from candidates alone', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['leader-port', 'follower-port', 'wrist-camera-select', 'world-camera-select']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(js, /\/devices\/bind/);
  assert.match(js, /capture_ready/);
  assert.doesNotMatch(js, /cameras\.length\s*>=\s*2\s*&&\s*ports\.length\s*>=\s*2[^;]+disabled\s*=\s*false/s);
});

test('production workbench preserves the approved product shell and dense three-column capture layout', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  for (const text of ['采集 · 训练 · 模型 · 实机运行', '控制台', 'ACT 工作台']) {
    assert.match(html, new RegExp(text));
  }
  for (const region of ['capture-setup', 'capture-stage', 'capture-inspector']) {
    assert.match(html, new RegExp(`class=["'][^"']*${region}`));
  }
  assert.match(html, /class=["'][^"']*language-switch/);
  assert.match(css, /--brand-accent:\s*#8641A9/i);
  assert.match(css, /grid-template-columns:\s*300px\s+minmax\(520px,\s*1fr\)\s+286px/);
});

test('device controls expose real connect and disconnect entry points without weakening capture gate', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['connect-leader', 'disconnect-leader', 'connect-follower', 'disconnect-follower', 'connect-cameras']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(js, /\/devices\/serial\/connect/);
  assert.match(js, /\/devices\/serial\/disconnect/);
  assert.match(js, /capture_ready/);
});

test('workbench keeps desktop columns independently scrollable and mobile settings reachable', () => {
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-ui-refresh.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(min-width:901px\)[\s\S]*html,body\{[^}]*overflow:hidden/);
  assert.match(css, /\.capture-setup,\.capture-stage,\.capture-inspector\{[^}]*overflow-y:auto/);
  assert.match(css, /\.inference-setup,\.inference-stage,\.inference-inspector\{[^}]*overflow-y:auto/);
  assert.match(css, /\.capture-setup,\.capture-stage,\.capture-inspector\{[^}]*overflow:visible/);
  assert.match(css, /@media\(max-width:600px\)/);
});

test('idle scrolling surfaces avoid compositor-heavy effects that flash on Linux browsers', () => {
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  assert.match(css, /--panel:\s*#1b2326/);
  assert.match(css, /\.panel,\.workspace-panel\{[^}]*background:var\(--panel-solid\)[^}]*backdrop-filter:none/s);
  assert.match(css, /\.capture-stage:before\{[^}]*display:none/s);
  assert.doesNotMatch(css, /\.view\.active\{[^}]*animation:/s);
});

test('native preview keeps both decoded buffers composited while switching frames', () => {
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(css, /\.camera-view\.native-streaming \.native-preview\{[^}]*display:block/);
  assert.match(css, /\.camera-view\.native-streaming \.native-preview\.active\{[^}]*opacity:1/);
  assert.doesNotMatch(css, /\.camera-view \.native-preview\{[^}]*visibility:/);
  assert.doesNotMatch(css, /\.camera-view\.native-streaming \.native-preview\.active\{[^}]*display:block/);
  assert.match(js, /image\.classList\.add\(['"]active['"]\)[\s\S]*?classList\.remove\(['"]active['"]\)/);
});

test('ACT collection exposes real joint and synchronization waveform controls in the approved shell', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  for (const id of ['waveform-canvas', 'waveform-empty', 'waveform-joint-view', 'waveform-sync-view', 'waveform-status']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (let joint = 1; joint <= 7; joint += 1) {
    assert.match(html, new RegExp(`data-joint=["']${joint - 1}["'][^>]*>J${joint}<`));
  }
  assert.match(html, /等待采集/);
  assert.match(html, /Leader action/);
  assert.match(html, /Follower state/);
  assert.match(js, /EventSource\(`?\$?\{?API\}?\/telemetry\/stream`?\)/);
  assert.match(css, /--brand-accent:\s*#8641A9/i);
});

test('waveform integration does not fabricate telemetry', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const waveform = fs.readFileSync(new URL('../Browser_SDK/src/act-waveform.js', import.meta.url), 'utf8');
  for (const source of [js, waveform]) {
    assert.doesNotMatch(source, /Math\.random|Math\.sin|setInterval\s*\(/);
  }
});

test('camera controls enumerate browser devices and open two selected cameras independently', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /BrowserCameraController/);
  assert.match(js, /requestPermissionAndList\(\)/);
  assert.match(js, /openPair\(/);
  assert.doesNotMatch(js, /video\.srcObject\s*=\s*state\.cameraStream/);
  assert.match(html, />检测摄像头</);
  assert.match(html, />连接两台摄像头</);
});

test('camera controls expose automatic browser-to-Ubuntu-native fallback without removing browser capture', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /id=["']camera-backend["']/);
  for (const value of ['auto', 'browser', 'native']) assert.match(html, new RegExp(`value=["']${value}["']`));
  assert.match(html, /本机原生/);
  assert.match(html, /Ubuntu \/ Windows/);
  assert.match(js, /connectBrowserCameras/);
  assert.match(js, /connectNativeCameras/);
  assert.match(js, /\/cameras\/native\/connect/);
  assert.match(js, /浏览器双路协商失败/);
  assert.match(js, /cameraController\.openPair/);
});

test('Ubuntu native previews serialize frame requests instead of blindly replacing image URLs at 30 FPS', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(js, /scheduleNativePreviewFrame/);
  assert.match(js, /image\.addEventListener\(['"]load['"]/);
  assert.match(js, /image\.addEventListener\(['"]error['"]/);
  assert.match(html, /id="wrist-native-preview-buffer"/);
  assert.match(html, /id="world-native-preview-buffer"/);
  assert.match(js, /swapNativePreviewFrame/);
  assert.doesNotMatch(js, /scheduleNativePreviewFrame\(role, generation, 100\)/);
  assert.doesNotMatch(js, /1000\s*\/\s*30/);
});

test('joint telemetry updates stable rows without rebuilding the joint panel for every sample', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const renderBody = js.match(/function renderJoints\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(renderBody, /querySelectorAll\(['"]\.joint-row['"]\)/);
  assert.doesNotMatch(renderBody, /innerHTML\s*=/);
});

test('camera preview displays source resolution, rendered size, and fallback quality', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /streams\.quality\.wrist/);
  assert.match(js, /streams\.quality\.world/);
  assert.match(js, /video\.videoWidth/);
  assert.match(js, /getBoundingClientRect\(\)/);
  assert.match(js, /低清回退/);
});

test('camera quality diagnostics identify the selected physical device for each role', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /selectedCameraLabel\('wrist'\)/);
  assert.match(js, /selectedCameraLabel\('world'\)/);
  assert.match(js, /cameraQualityText\(quality\.cameras\.wrist, selectedCameraLabel\('wrist'\)\)/);
  assert.match(js, /cameraQualityText\(quality\.cameras\.world, selectedCameraLabel\('world'\)\)/);
});

test('camera connection rejects placeholder video dimensions before enabling capture', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /waitForValidVideoFrame/);
  assert.match(js, /video\.videoWidth\s*>=\s*640/);
  assert.match(js, /video\.videoHeight\s*>=\s*360/);
  assert.match(js, /await waitForValidVideoFrame\(video/);
  assert.match(js, /2×2|画面尺寸/);
});

test('dual camera previews preserve a 16 by 9 display surface', () => {
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  assert.match(css, /\.camera-view\{[^}]*aspect-ratio:16\/9/s);
});

test('camera preview defaults to 640 by 480 at 30 FPS and uses the active dataset locked profile', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /id=["']capture-profile["']/);
  assert.match(html, /option value=["']640,480["'] selected>640 × 480 · 30 FPS/);
  assert.match(js, /selectedCaptureProfile\(\)/);
  assert.match(js, /selectedDataset\(\)\?\.capture/);
  assert.match(js, /capture\.width/);
  assert.match(js, /capture\.height/);
  assert.match(js, /capture\.fps/);
  assert.match(js, /const profile = selectedCaptureProfile\(\)/);
  assert.match(js, /openPair\([^\n]+profile\)/);
});

test('camera detection is independent of dataset creation and active datasets cannot change while cameras are connected', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const detectBody = js.match(/async function detectCameras\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(detectBody, /selectedDataset|capture-profile|请先创建/);
  assert.match(js, /if \(state\.cameraBackend\)/);
  assert.match(js, /摄像头已连接，断开后才能切换数据集/);
});

test('device save state names the missing robot validation instead of waiting forever', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, />保存设备选择</);
  assert.match(js, /串口已打开/);
  assert.match(js, /J1–J7 实时样本尚未接入/);
  assert.doesNotMatch(js, /正在检查设备|正在检查 J1–J7|正在进行连接检查/);
});

test('operator copy uses plain connection checks instead of handshake terminology', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const source of [html, js]) {
    assert.doesNotMatch(source, /握手|身份验证|候选|适配器验证|传输已打开/);
  }
  assert.match(js, /设备检查/);
  assert.match(js, /串口已打开/);
});

test('camera flow separates detection from connecting the selected pair', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /id=["']detect-cameras["']/);
  assert.match(html, />检测摄像头</);
  assert.match(html, /id=["']camera-next-action["']/);
  assert.match(js, /detectCameras\(/);
  assert.match(js, /connectCameras\(/);
});

test('dataset creation exposes persistent inline result feedback', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /id=["']dataset-form-status["']/);
  assert.match(js, /dataset-form-status/);
  assert.match(js, /数据集已创建/);
});

test('connected transport explains the real telemetry blocker without locking unrelated setup controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /等待真实 J1–J7 样本/);
  assert.match(js, /串口已打开/);
  assert.match(js, /J1–J7 实时样本/);
  assert.match(js, /设备选择已保存/);
});

test('episode control calls the existing API when the capture gate is ready', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /request\(['"]\/episodes['"]/);
  assert.match(js, /episode-button/);
  assert.match(js, /dataset_id/);
  assert.match(js, /waveformBuffer\.clear\(\)/);
  assert.match(js, /valid_frames === 0/);
  assert.match(html, /Leader → 真实 FL 遥操作/);
  assert.match(js, /episode\.runtime\?\.status !== 'running'/);
  assert.match(js, /\/emergency-stop/);
  assert.doesNotMatch(js, /emergency-stop[^\n]+disconnectCameras/);
});

test('ACT capture renders fourteen real action and state channels beside dual camera previews', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /wrist-vision-wave|world-vision-wave|RGB 视觉色带|像素波形/);
  assert.doesNotMatch(js, /VisionWaveform|visionWaves/);
  assert.match(html, /data-joint=["']all["'][^>]*>ALL</);
  assert.equal((html.match(/data-channel=["'](?:action|state)-j[1-7]["']/g) || []).length, 14);
  assert.match(html, /Leader action · J1–J7/);
  assert.match(html, /Follower state · J1–J7/);
  assert.match(css, /\.waveform-stage\{[^}]*height:260px/s);
  assert.match(js, /setChannelVisible/);
});

test('formal capture workbench keeps devices visible and exposes round-based collection controls', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(new URL('../Browser_SDK/src/act-workbench.css', import.meta.url), 'utf8');
  for (const id of ['target-rounds', 'completed-rounds', 'capture-progress', 'episode-button', 'stop-episode']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /目标轮数/);
  assert.match(html, /已完成/);
  assert.match(js, /completedRounds/);
  assert.match(js, /targetRounds/);
  assert.match(js, /request\('\/state'\)/);
  assert.match(js, /accepted_success/);
  assert.match(html, /PHYSICAL DEVICES/);
  assert.match(html, /class="panel device-panel"/);
  assert.match(css, /\.capture-setup\{[^}]*overflow-y:auto/s);
  assert.match(css, /\.capture-setup>\.panel\{[^}]*flex:0 0 auto/s);
});

test('right inspector replaces decorative pipeline with realtime capture quality', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.doesNotMatch(html, /pipeline-panel|流程状态|01 \/ 04/);
  for (const id of ['quality-verdict', 'quality-mean-error', 'quality-max-error', 'quality-worst-joint', 'quality-sync-offset', 'quality-wrist-camera', 'quality-world-camera']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(js, /CaptureQualityMonitor/);
  assert.match(js, /requestVideoFrameCallback/);
  assert.match(js, /renderCaptureQuality/);
  assert.doesNotMatch(js, /Math\.random|模拟质量|模拟掉帧/);
});

test('formal capture workflow selects the active dataset and reviews in place without scrolling', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['active-dataset', 'episode-review', 'dataset-stats', 'dataset-import', 'dataset-export']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  const runPanel = html.match(/<section class="capture-run-panel"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(runPanel, /id=["']episode-review["']/);
  assert.equal((html.match(/id=["']episode-review["']/g) || []).length, 1);
  assert.match(js, /selectedDatasetId\(\)/);
  assert.match(js, /dataset_id:\s*selectedDatasetId\(\)/);
  assert.match(js, /CameraFrameUploader/);
  assert.match(js, /stopAndDrain\(\)/);
  assert.match(js, /\/datasets\/import/);
  assert.match(js, /\/export/);
  assert.match(js, /episode\?\.integrity\?\.ok/);
  assert.match(js, /正在校验磁盘样本与双路图像完整性/);
});

test('camera persistence captures only real video frame callbacks at JPEG quality 85', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const uploader = fs.readFileSync(new URL('../Browser_SDK/src/act-camera-frame-uploader.js', import.meta.url), 'utf8');
  assert.match(js, /frameUploader\.capture\(role, video, now,/);
  assert.match(uploader, /quality = 0\.85/);
  assert.match(uploader, /convertToBlob\(\{ type: ['"]image\/jpeg['"], quality \}\)/);
  assert.match(uploader, /frame\.toBlob\([^;]+['"]image\/jpeg['"], quality\)/s);
  assert.match(uploader, /environment\.VideoFrame/);
  assert.match(uploader, /environment\.OffscreenCanvas/);
  assert.match(uploader, /frame\.close\(\)/);
  assert.match(uploader, /freezeVideoFrame/);
  assert.match(js, /encodeConcurrency:\s*2/);
  assert.match(js, /camera-worker-6/);
  assert.doesNotMatch(uploader, /setInterval|Math\.random/);
});

test('camera JPEG encoding runs in a dedicated worker and quality rendering is animation-frame throttled', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  const workerClient = fs.readFileSync(new URL('../Browser_SDK/src/act-camera-frame-encoder-worker-client.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../Browser_SDK/src/act-camera-frame-encoder-worker.js', import.meta.url), 'utf8');
  assert.match(js, /CameraFrameEncoderWorkerClient/);
  assert.match(js, /freeze:\s*freezeVideoFrame/);
  assert.match(js, /frameEncoder\.encode/);
  assert.match(workerClient, /new Worker/);
  assert.match(workerClient, /postMessage\([^;]+\[frame\]/s);
  assert.match(worker, /OffscreenCanvas/);
  assert.match(worker, /convertToBlob\(\{ type: ['"]image\/jpeg['"], quality \}\)/);
  assert.match(js, /requestAnimationFrame\(renderCaptureQuality\)/);
  assert.doesNotMatch(js.match(/const onFrame = \(now, metadata\) => \{[\s\S]*?\n  \};/)?.[0] || '', /\n    renderCaptureQuality\(\);/);
});

test('camera disconnect and page unload stop active collection without auto acceptance', () => {
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /async function disconnectCameras/);
  assert.match(js, /request\('\/emergency-stop'/);
  assert.match(js, /sendBeacon\(`\$\{API\}\/emergency-stop`/);
  assert.doesNotMatch(js, /sendBeacon\([^\n]+\/review/);
});

test('top capture metric distinguishes cumulative samples from the 500 point waveform window', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(html, /<span>累计样本<\/span><strong id="valid-frames">0<\/strong>/);
  assert.doesNotMatch(js, /#valid-frames'\)\.textContent = String\(sampleCount\)/);
  assert.match(js, /persistedSampleCount \+= 1/);
  assert.match(js, /#valid-frames'\)\.textContent = String\(persistedSampleCount\)/);
});

test('new datasets default to the sustainable dual-camera capture profile', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const profile = html.match(/<select id="capture-profile"[\s\S]*?<\/select>/)?.[0] || '';
  assert.match(profile, /<option value="640,480" selected>640 × 480 · 30 FPS（推荐）<\/option>/);
  assert.match(profile, /<option value="1920,1080">1920 × 1080 · 30 FPS（高负载）<\/option>/);
});

test('training tasks start, stop, resume, and poll through product APIs', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  for (const id of ['training-start', 'training-stop', 'training-resume', 'training-job-status']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(js, /request\('\/training\/jobs'/);
  assert.match(js, /\/training\/jobs\/\$\{state\.trainingJob\.id\}\/stop/);
  assert.match(js, /\/training\/jobs\/\$\{state\.trainingJob\.id\}\/resume/);
  assert.match(js, /pollTrainingJob/);
  assert.doesNotMatch(js, /Math\.random/);
});

test('completed training automatically refreshes the registered ACT model', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.doesNotMatch(html, /id="training-register"/);
  assert.match(html, /id="model-list"/);
  assert.match(js, /job\.status === 'completed'\) await loadModels\(\)/);
  assert.match(js, /request\('\/models'\)/);
});
