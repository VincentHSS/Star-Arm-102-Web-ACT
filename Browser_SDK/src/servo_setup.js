// Star Arm 102 更换舵机 - 全新设计版
// 功能：按初始参数连接并读取 → 写入目标 ID + 1 Mbps → 重连回读校验
import { SerialServoBus } from './serial_servo_bus.js';
import { readServoPublicConfig, writeAndVerifyServoConfig } from './servo_setup_flow.js';
import { t, tWithVars } from './i18n.js';

const $ = (s) => document.querySelector(s);

// 状态
let bus = null;
let connected = false;
let working = false;
let initialConfig = null;
let initialId = 0;
let initialBaudRate = 115200;
let targetId = null;

// DOM
const ui = {
  port: $('#portStatus'),
  param: $('#paramStatus'),
  state: $('#workState'),
  initialIdInput: $('#initialId'),
  initialBaudRate: $('#initialBaudRate'),
  idInput: $('#targetId'),
  check: $('#singleCheck'),
  btnConnect: $('#btnConnect'),
  btnDisconnect: $('#btnDisconnect'),
  btnWrite: $('#btnWrite'),
  log: $('#servoLog'),
  dialog: $('#confirmDialog'),
  confirmInitialId: $('#confirmInitialId'),
  confirmId: $('#confirmId'),
  btnConfirm: $('#btnConfirm'),
  btnCancel: $('#btnCancel'),
  progress: $('#progressBar'),
  progressText: $('#progressText'),
};

targetId = Number(ui.idInput.value);

// 日志
function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '•';
  ui.log.textContent += (ui.log.textContent ? '\n' : '') + `[${time}] ${icon} ${msg}`;
  ui.log.scrollTop = ui.log.scrollHeight;
}

// 更新 UI
function render() {
  document.body.dataset.servoSetupConnected = connected || working ? '1' : '0';
  const currentId = Number(ui.initialIdInput.value);
  const newId = Number(ui.idInput.value);
  const initialOk = Number.isInteger(currentId) && currentId >= 0 && currentId <= 253;
  const targetOk = Number.isInteger(newId) && newId >= 0 && newId <= 6;
  
  ui.btnConnect.disabled = connected || working;
  ui.btnDisconnect.disabled = !connected || working;
  ui.btnWrite.disabled = !connected || !initialConfig || !ui.check.checked || !initialOk || !targetOk || working;
  ui.initialIdInput.disabled = connected || working;
  ui.initialBaudRate.disabled = connected || working;
  ui.idInput.disabled = working;
  ui.check.disabled = working;

  if (!initialOk) {
    ui.state.textContent = t('servo-setup.initial-id-invalid');
    ui.state.style.color = '#ff6b6b';
  } else if (!targetOk) {
    ui.state.textContent = t('servo-setup.id-invalid');
    ui.state.style.color = '#ff6b6b';
  } else if (working) {
    ui.state.textContent = t('servo-setup.writing');
    ui.state.style.color = '#feca57';
  } else if (connected && initialConfig) {
    ui.state.textContent = t('servo-setup.ready');
    ui.state.style.color = '#48dbfb';
  } else if (connected) {
    ui.state.textContent = t('servo-setup.initial-read-failed');
    ui.state.style.color = '#ff6b6b';
  } else {
    ui.state.textContent = t('status.waiting');
    ui.state.style.color = '#8395a7';
  }
}

// 进度条
function setProgress(pct, text) {
  ui.progress.style.width = `${pct}%`;
  ui.progressText.textContent = text;
}

function formatBaudRate(baudRate) {
  return `${Number(baudRate).toLocaleString('en-US')} bps`;
}

async function reconnectAtBaudRate(baudRate) {
  const port = bus?.port;
  if (!port) throw new Error(t('servo-setup.port-missing'));
  await bus.disconnect();
  await bus.connect(port, { baudRate });
  connected = true;
  ui.port.textContent = t('status.connected');
  ui.param.textContent = formatBaudRate(baudRate);
}

// 连接并读取初始参数
async function connect() {
  if (document.body.dataset.ratioConnected === '1') { log('请先断开 LD 比例适配设备', 'error'); return; }
  if (bus) try { await bus.disconnect(); } catch {}
  initialId = Number(ui.initialIdInput.value);
  initialBaudRate = Number(ui.initialBaudRate.value);
  initialConfig = null;
  
  bus = new SerialServoBus('ServoSetup', {
    errorLogger: (e) => log(e.message, 'error'),
    onStateChange: () => { connected = bus.connected; render(); },
  });

  try {
    log(tWithVars('servo-setup.searching-with-params', { id: initialId, baudrate: formatBaudRate(initialBaudRate) }));
    await bus.connect(null, { baudRate: initialBaudRate });
    connected = true;
    ui.port.textContent = t('status.connected');
    ui.param.textContent = formatBaudRate(initialBaudRate);
    log(tWithVars('servo-setup.connected-with-params', { id: initialId, baudrate: formatBaudRate(initialBaudRate) }), 'success');
    initialConfig = await readServoPublicConfig(bus, initialId);
    log(tWithVars('servo-setup.initial-read-success', { id: initialConfig.id }), 'success');
    render();
  } catch (e) {
    initialConfig = null;
    if (!bus.connected) {
      ui.port.textContent = t('status.not-connected');
      ui.param.textContent = '-';
      connected = false;
    }
    log(tWithVars('error.connection-failed-detail', { detail: e.message }), 'error');
    render();
  }
}

// 断开
async function disconnect() {
  if (bus) {
    await bus.disconnect();
    bus = null;
  }
  ui.port.textContent = t('status.not-connected');
  ui.param.textContent = '-';
  log(t('servo-setup.disconnected'));
  connected = false;
  initialConfig = null;
  setProgress(0, t('servo-setup.waiting-start'));
  render();
}

// 写入
async function writeConfig() {
  working = true;
  render();
  setProgress(0, t('servo-setup.start-write'));
  log(tWithVars('servo-setup.start-setting-detail', { initialId, targetId }));

  try {
    if (!initialConfig || initialConfig.id !== initialId) {
      throw new Error(t('servo-setup.initial-config-missing'));
    }
    setProgress(25, t('servo-setup.preparing'));
    log(t('servo-setup.writing-id-baudrate'));
    setProgress(55, t('servo-setup.sending'));
    const verifiedConfig = await writeAndVerifyServoConfig({
      bus,
      initialId,
      targetId,
      values: initialConfig,
      reconnect: reconnectAtBaudRate,
    });
    setProgress(90, t('servo-setup.waiting-confirm'));
    log(tWithVars('servo-setup.verify-success', { id: targetId }), 'success');

    setProgress(100, t('servo-setup.complete'));
    ui.param.textContent = t('servo-setup.1mbps-set');
    log(tWithVars('servo-setup.config-success', { id: targetId }), 'success');
    log(t('servo-setup.can-install'));
    initialId = targetId;
    initialBaudRate = 1000000;
    initialConfig = verifiedConfig;
    ui.initialIdInput.value = String(initialId);
    ui.initialBaudRate.value = String(initialBaudRate);
    
  } catch (e) {
    initialConfig = null;
    setProgress(0, t('servo-setup.write-failed'));
    log(tWithVars('error.write-failed-detail', { detail: e.message }), 'error');
    log(t('servo-setup.check-retry'));
  } finally {
    working = false;
    render();
  }
}

// 事件
ui.btnConnect.onclick = connect;
ui.btnDisconnect.onclick = disconnect;

ui.initialIdInput.oninput = () => {
  initialId = Number(ui.initialIdInput.value);
  render();
};

ui.initialBaudRate.onchange = () => {
  initialBaudRate = Number(ui.initialBaudRate.value);
  render();
};

ui.idInput.oninput = () => {
  targetId = Number(ui.idInput.value);
  render();
};

ui.check.onchange = render;

ui.btnWrite.onclick = () => {
  targetId = Number(ui.idInput.value);
  ui.confirmInitialId.textContent = initialId;
  ui.confirmId.textContent = targetId;
  ui.dialog.showModal();
};

ui.btnCancel.onclick = () => ui.dialog.close();
ui.dialog.oncancel = (e) => { e.preventDefault(); ui.dialog.close(); };
ui.btnConfirm.onclick = () => {
  ui.dialog.close();
  writeConfig();
};

// 初始化
log(t('servo-setup.tool-ready'));
log(t('servo-setup.confirm-single-servo-configurable'));
render();

window.addEventListener('workbench:before-switch', event => {
  event.detail.waits.push((async () => {
    if (working) throw new Error('正在写入舵机配置，请等待完成后再切换工作台。');
    if (bus) await disconnect();
  })());
});
