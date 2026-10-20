import { SerialServoBus } from './serial_servo_bus.js';
import { readServoPublicConfig, writeAndVerifyServoConfig, reconcileServoMutation, ServoSetupError } from './servo_setup_flow.js';
import { ServoBusWizard } from './servo_bus_wizard.js';
import { createServoSetupModel } from './servo_setup_model.js';
import { ss, servoSetupErrorMessage } from './servo_setup_i18n.js';
import { getLanguage, tWithVars } from './i18n.js';

const $ = id => document.getElementById(id);
const view = $('servoSetupView');
const ui = { port: $('portStatus'), param: $('paramStatus'), state: $('workState'), initialIdInput: $('initialId'),
  initialBaudRate: $('initialBaudRate'), idInput: $('targetId'), targetBaudRate: $('targetBaudRate'), check: $('singleCheck'),
  btnConnect: $('btnConnect'), btnDisconnect: $('btnDisconnect'), btnWrite: $('btnWrite'), log: $('servoLog'),
  dialog: $('confirmDialog'), confirmInitialId: $('confirmInitialId'), confirmId: $('confirmId'), btnConfirm: $('btnConfirm'), btnCancel: $('btnCancel'),
  progress: $('progressBar'), progressText: $('progressText') };
const STORAGE_KEY = 'star-arm-servo-studio-v1';
let bus = null, selectedPort = null, connected = false, currentBaud = 115200, working = false;
let initialConfig = null, initialId = 0, initialBaudRate = 115200, targetId = Number(ui.idInput.value);
let selected = 0, mode = 'assembly', model = null, loadingModel = false, modelFailed = false, issue = null, manualPending = null;
let confirmAction = null, activeOperation = null, lineCount = 0, transition = null, stageKey = '';
const visibilityChanges = new WeakMap();
const verified = new Set(), records = Array.from({ length: 7 }, (_, index) => ({ index, id: null, baud: 115200 }));
let saved;
try { saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
if (Array.isArray(saved?.records) && saved.records.length === 7) for (let i = 0; i < 7; i++) {
  const row = saved.records[i];
  if (row?.index === i && (row.id === null || Number.isInteger(row.id) && row.id >= 0 && row.id <= 253) && [115200, 1000000].includes(row.baud)) records[i] = row;
}
if (saved?.manualPending) {
  const p = saved.manualPending;
  if (Number.isInteger(p.slot) && p.slot >= 0 && p.slot < 7
    && [p.initialId, p.targetId].every(id => Number.isInteger(id) && id >= 0 && id <= 253)
    && [p.initialBaudRate, p.targetBaudRate].every(baud => [115200, 1000000].includes(baud))) manualPending = p;
  else issue = new ServoSetupError('bad-record');
}

function animateText(node, value) {
  if (node.textContent === String(value)) return;
  node.textContent = value;
  if (view.classList.contains('active') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.getAnimations().forEach(animation => animation.cancel());
    node.animate([{ opacity: 0.35, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 230, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
}
function showElement(node, show) {
  if (node.dataset.ssVisible === String(show)) return;
  node.dataset.ssVisible = String(show); visibilityChanges.get(node)?.cancel();
  if (show) node.hidden = false;
  if (!view.classList.contains('active') || matchMedia('(prefers-reduced-motion: reduce)').matches) { node.hidden = !show; return; }
  const animation = node.animate(show ? [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }]
    : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: show ? 240 : 160, easing: 'ease-out' });
  visibilityChanges.set(node, animation);
  void animation.finished.then(() => { if (visibilityChanges.get(node) === animation) node.hidden = !show; }).catch(() => {});
}
function morph(update) {
  if (!document.startViewTransition || !view.classList.contains('active') || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return; }
  transition?.skipTransition(); document.documentElement.dataset.ssTransition = '1';
  const current = document.startViewTransition(update); transition = current;
  void current.finished.catch(() => {}).finally(() => { if (transition === current) { transition = null; delete document.documentElement.dataset.ssTransition; } });
}
function log(message) {
  ui.log.textContent += (ui.log.textContent ? '\n' : '') + `[${new Date().toLocaleTimeString(getLanguage() === 'en' ? 'en-GB' : 'zh-CN', { hour12: false })}] ${message}`;
  if (++lineCount > 250) { ui.log.textContent = ui.log.textContent.split('\n').slice(-200).join('\n'); lineCount = 200; }
  $('ssLogCount').textContent = lineCount; ui.log.scrollTop = ui.log.scrollHeight;
}
function persist() {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ wizard: wizard.checkpoint(), records, manualPending, mode })); }
  catch { /* A pending write remains tracked in memory if storage is unavailable. */ }
}
async function reconnect(baud) {
  if (!bus || !selectedPort) throw new ServoSetupError('disconnected');
  if (bus.connected && currentBaud === baud) return;
  await bus.disconnect(); await bus.connect(selectedPort, { baudRate: baud }); currentBaud = baud; connected = true;
  render();
}
async function readAt(id, baud) {
  await reconnect(baud);
  const config = await readServoPublicConfig(bus, id);
  const slot = records.find(row => row.id === id && row.baud === baud);
  if (slot) verified.add(slot.index);
  return config;
}
function wizardChanged(snapshot) {
  for (const row of snapshot.slots) if (row.id !== null) {
    if (records[row.index].id !== row.id || records[row.index].baud !== row.baud) {
      records[row.index] = { ...row }; verified.add(row.index);
      log(ss('logVerified', { number: row.index + 1, id: row.id, baud: row.baud }));
    }
  }
  persist();
  const key = `${snapshot.phase}/${snapshot.assigned}`;
  if (stageKey && stageKey !== key) {
    $('ssNewServoCheck').checked = false;
    if (snapshot.phase === 'adding') selected = snapshot.assigned;
    stageKey = key; morph(render);
  } else { stageKey = key; render(); }
}
let wizard;
const dependencies = { readAt, changeConfig: options => writeAndVerifyServoConfig({ bus, reconnect, ...options }),
  reconcile: mutation => reconcileServoMutation({ bus, reconnect, mutation }), onChange: wizardChanged };
try { wizard = new ServoBusWizard({ ...dependencies, checkpoint: saved?.wizard }); }
catch { wizard = new ServoBusWizard(dependencies); issue = new ServoSetupError('bad-record'); }
if (saved?.mode === 'single' && (wizard.state.assigned === 0 || wizard.state.phase === 'complete')) mode = 'single';

const cardNodes = [], labelNodes = [], labelLines = [];
const svgNS = 'http://www.w3.org/2000/svg', labelSvg = document.createElementNS(svgNS, 'svg');
labelSvg.classList.add('ss-label-lines'); labelSvg.setAttribute('aria-hidden', 'true'); $('ssModelLabels').append(labelSvg);
for (let slot = 0; slot < 7; slot++) {
  const card = document.createElement('button'); card.type = 'button'; card.className = 'ss-motor-card'; card.dataset.slot = slot;
  card.innerHTML = `<div><b>J${slot + 1}</b><span class="ss-motor-state"></span></div><div><strong>—</strong><small></small></div>`;
  card.onclick = () => selectSlot(slot); $('ssMotorList').append(card); cardNodes.push(card);
  const label = document.createElement('button'); label.type = 'button'; label.textContent = slot + 1; label.dataset.slot = slot;
  label.onclick = () => selectSlot(slot); $('ssModelLabels').append(label); labelNodes.push(label);
  const line = document.createElementNS(svgNS, 'line'); labelSvg.append(line); labelLines.push(line);
}
function guidedActive() { return wizard.state.assigned > 0 && wizard.state.phase !== 'complete' || Boolean(wizard.state.pending); }
function selectSlot(slot) {
  if (working) return;
  selected = slot; initialConfig = null; ui.check.checked = false; issue = null;
  if (!guidedActive()) {
    const row = records[slot];
    if (row.id !== null) { ui.initialIdInput.value = row.id; ui.initialBaudRate.value = row.baud; }
    ui.idInput.value = row.id ?? slot; ui.targetBaudRate.value = row.id === null ? 1000000 : row.baud;
    if (mode !== 'single') { mode = 'single'; morph(render); } else render();
  } else render();
  persist();
}
function setMode(next) {
  if (working) return;
  if (next === 'single' && guidedActive()) { issue = new ServoSetupError('finish-first'); render(); return; }
  mode = next; issue = null; initialConfig = null; ui.check.checked = false;
  if (mode === 'single') {
    const row = records[selected]; if (row.id !== null) { ui.initialIdInput.value = row.id; ui.initialBaudRate.value = row.baud; }
    ui.idInput.value = row.id ?? selected;
  }
  morph(render); persist();
}
function translateStatic() {
  for (const node of document.querySelectorAll('#servoSetupView [data-ss], #confirmDialog [data-ss]')) node.textContent = ss(node.dataset.ss);
  for (const node of view.querySelectorAll('[data-ss-title]')) { node.title = ss(node.dataset.ssTitle); node.setAttribute('aria-label', node.title); }
}
function render() {
  const state = wizard.state, pending = state.pending;
  connected = Boolean(bus?.connected);
  document.body.dataset.servoSetupConnected = connected || working ? '1' : '0';
  translateStatic();
  $('ssModelState').textContent = loadingModel ? ss('modelLoading') : modelFailed ? ss('modelFailed') : '';
  $('ssAssemblyPanel').hidden = mode !== 'assembly'; $('ssManualPanel').hidden = mode !== 'single';
  $('ssModeAssembly').setAttribute('aria-selected', String(mode === 'assembly')); $('ssModeSingle').setAttribute('aria-selected', String(mode === 'single'));
  $('ssModeAssembly').disabled = working; $('ssModeSingle').disabled = working;
  animateText(ui.port, working ? ss('busy') : ss(connected ? 'online' : 'offline'));
  ui.param.textContent = currentBaud; $('ssConnectionDot').dataset.online = String(connected || working);
  $('ssConnectLabel').textContent = mode === 'assembly' ? ss('connect') : ss(connected ? 'reread' : 'read');
  ui.btnConnect.disabled = working || (mode === 'assembly' && connected);
  ui.btnDisconnect.disabled = working || !connected;
  ui.btnConnect.setAttribute('aria-busy', String(working && !wizard.busy));
  const sourceId = Number(ui.initialIdInput.value), destination = Number(ui.idInput.value);
  const validId = value => Number.isInteger(value) && value >= 0 && value <= 253;
  const sourceValid = ui.initialIdInput.value.trim() !== '' && validId(sourceId);
  const targetValid = ui.idInput.value.trim() !== '' && validId(destination);
  ui.initialIdInput.disabled = working; ui.initialBaudRate.disabled = working; ui.idInput.disabled = working; ui.targetBaudRate.disabled = working; ui.check.disabled = working;
  ui.btnWrite.disabled = working || !connected || !ui.check.checked || (!manualPending && (!initialConfig || !sourceValid || !targetValid));
  ui.btnWrite.setAttribute('aria-busy', String(working && mode === 'single'));
  ui.btnWrite.lastElementChild.textContent = ss(manualPending ? 'retry' : 'write');
  $('ssSelectedJoint').textContent = `J${selected + 1}`;
  const activePhase = state.phase === 'complete' ? 'baud' : state.phase;
  for (const step of view.querySelectorAll('[data-ss-phase]')) {
    const order = ['adding', 'restore', 'baud']; const index = order.indexOf(step.dataset.ssPhase);
    step.dataset.active = String(step.dataset.ssPhase === activePhase && state.phase !== 'complete');
    step.dataset.done = String(index < order.indexOf(activePhase) || state.phase === 'complete');
  }
  let title, detail, action, from = 0, to = 253;
  if (state.phase === 'adding') {
    const number = state.assigned + 1;
    title = ss('addTitle', { number }); detail = ss(state.assigned === 0 ? 'addFirst' : 'addNext', { number });
    action = ss('next', { number }); to = state.assigned === 0 ? 253 : state.assigned;
    $('ssStageNumber').textContent = `MOTOR ${String(number).padStart(2, '0')} / 07`;
  } else {
    title = ss(state.phase + 'Title'); detail = ss(state.phase === 'complete' && !connected ? 'completeSaved' : state.phase + 'Detail');
    if (state.phase === 'complete' && state.slots.some(slot => slot.id !== slot.index || slot.baud !== 1000000)) detail = ss('completeCustom');
    action = ss(state.phase === 'restore' ? 'restoreButton' : state.phase === 'baud' ? 'baudButton' : 'completed');
    from = state.phase === 'restore' ? 253 : 0; to = state.phase === 'restore' ? 0 : 6;
    $('ssStageNumber').textContent = state.phase === 'complete' ? 'ALL MOTORS / 07' : state.phase === 'restore' ? 'FINAL ADDRESS / 00' : 'BUS SPEED / 1 MBPS';
  }
  animateText($('ssStageTitle'), title); animateText($('ssStageDetail'), detail);
  showElement(view.querySelector('.ss-route'), state.phase !== 'complete');
  $('ssFromId').textContent = from; $('ssToId').textContent = to;
  $('ssRouteTarget').textContent = ss(state.phase === 'adding' && state.assigned === 0 ? 'temporary' : 'targetId');
  $('ssRouteBaud').firstChild.textContent = state.phase === 'baud' || state.phase === 'complete' ? '1000000 ' : '115200 ';
  showElement($('ssFactoryNote'), state.phase !== 'baud' && state.phase !== 'complete');
  showElement($('ssNewServoConfirmation'), state.phase === 'adding' && !pending);
  $('ssNewServoCheck').disabled = working;
  $('ssNextLabel').textContent = pending ? ss('retry') : action;
  $('ssNext').disabled = working || !connected || state.phase === 'complete' || (!pending && state.phase === 'adding' && !$('ssNewServoCheck').checked);
  $('ssNext').setAttribute('aria-busy', String(working && wizard.busy));
  showElement($('ssPause'), working && state.phase === 'baud'); $('ssPause').disabled = wizard.pauseRequested;
  const issueValue = issue || (state.error ? { ...state.error } : null);
  showElement($('ssIssue'), Boolean(issueValue || pending || manualPending));
  $('ssIssueText').textContent = issueValue ? servoSetupErrorMessage(issueValue) : ss('readOnlyRecovery');
  const count = state.slots.filter(slot => slot.baud === 1000000 && slot.id !== null).length;
  const percent = state.phase === 'complete' ? 100 : state.phase === 'baud' ? 55 + count / 7 * 45 : state.phase === 'restore' ? 50 : state.assigned / 7 * 45;
  ui.progress.style.width = `${percent}%`;
  ui.progress.setAttribute('role', 'progressbar'); ui.progress.setAttribute('aria-valuemin', '0'); ui.progress.setAttribute('aria-valuemax', '100');
  ui.progress.setAttribute('aria-valuenow', String(Math.round(percent))); ui.progress.setAttribute('aria-label', ss('progress'));
  ui.progressText.textContent = mode === 'single' ? ss(initialConfig ? 'ready' : 'waitingRead') : ss(state.phase === 'baud' || state.phase === 'complete' ? 'speedCount' : 'statusCount', { count: state.phase === 'baud' || state.phase === 'complete' ? count : state.assigned });
  ui.state.textContent = working ? ss('writing') : mode === 'single' ? ss(initialConfig ? 'ready' : 'waitingRead') : ss('phase' + state.phase[0].toUpperCase() + state.phase.slice(1));
  const activeSlot = mode === 'assembly' && state.phase === 'adding' ? state.assigned : selected;
  for (let slot = 0; slot < 7; slot++) {
    const row = records[slot], card = cardNodes[slot];
    card.setAttribute('aria-pressed', String(slot === activeSlot)); card.disabled = working;
    card.dataset.verified = String(connected && verified.has(slot));
    card.querySelector('strong').textContent = row.id === null ? '—' : `ID ${row.id}`;
    card.querySelector('small').textContent = row.id === null ? ss('unconfigured') : `${row.baud === 1000000 ? '1 Mbps' : '115200'} · ${ss(connected && verified.has(slot) ? 'verified' : 'recorded')}`;
    card.title = `J${slot + 1} · ${row.id === null ? ss('unconfigured') : 'ID ' + row.id}`;
    labelNodes[slot].setAttribute('aria-pressed', String(slot === activeSlot)); labelNodes[slot].disabled = working;
    labelNodes[slot].setAttribute('aria-label', card.title);
  }
  model?.setSelected(activeSlot);
  $('ssNewRecord').disabled = working; $('ssSaveRecord').disabled = working;
}

async function ensurePort(baud) {
  if (bus?.connected) { await reconnect(baud); return; }
  if (bus) await bus.disconnect();
  bus = new SerialServoBus('ServoSetup', {
    onStateChange: () => { connected = bus.connected; render(); },
    onLost: error => { issue = error; initialConfig = null; verified.clear(); wizard.requestPause(); persist(); render(); },
  });
  await bus.connect(null, { baudRate: baud }); selectedPort = bus.port; currentBaud = baud; connected = true;
  log(ss('logConnected', { baud }));
}
async function connect() {
  if (working) return;
  working = true; issue = null; initialConfig = null; render();
  try {
    initialId = Number(ui.initialIdInput.value); initialBaudRate = Number(ui.initialBaudRate.value);
    await ensurePort(mode === 'assembly' ? wizard.state.phase === 'complete' ? 1000000 : 115200 : initialBaudRate);
    if (mode === 'single') {
      if (manualPending) await recoverManual();
      else {
        initialConfig = await readAt(initialId, initialBaudRate);
        if (initialConfig.baudrate !== (initialBaudRate === 115200 ? 5 : 8)) throw new ServoSetupError('baud-mismatch', { id: initialId });
        records[selected] = { index: selected, id: initialId, baud: initialBaudRate }; verified.add(selected);
        log(ss('logRead', { id: initialId, baud: initialBaudRate }));
      }
    } else if (!wizard.state.pending) await wizard.verifyKnown();
  } catch (e) {
    initialConfig = null; issue = e;
    log(tWithVars('error.connection-failed-detail', { detail: e.message }));
  } finally { working = false; persist(); render(); }
}
async function disconnect() {
  if (working) return;
  working = true; render();
  try { if (bus) await bus.disconnect(); bus = null; selectedPort = null; connected = false; initialConfig = null; verified.clear(); log(ss('logDisconnected')); }
  finally { working = false; persist(); render(); }
}
async function runWizard() {
  if (working || !connected) return;
  working = true; issue = null; render();
  const wasPending = Boolean(wizard.state.pending);
  const operation = wizard.advance({ newServoConfirmed: $('ssNewServoCheck').checked }); activeOperation = operation;
  try { const result = await operation; if (wasPending) log(ss(result.recovered ? 'logRecovered' : 'logUnchanged')); }
  catch (e) { issue = e; log(servoSetupErrorMessage(e)); }
  finally { working = false; $('ssNewServoCheck').checked = false; activeOperation = null; persist(); render(); }
}
async function recoverManual() {
  const result = await reconcileServoMutation({ bus, reconnect, mutation: manualPending });
  const slot = manualPending.slot;
  records[slot] = { index: slot, id: result.config.id, baud: result.baudRate }; verified.add(slot);
  if (wizard.state.phase === 'complete') wizard.state.slots[slot] = { ...records[slot] };
  selected = slot; ui.initialIdInput.value = result.config.id; ui.initialBaudRate.value = result.baudRate;
  initialConfig = result.config; manualPending = null; persist();
  log(ss(result.applied ? 'logRecovered' : 'logUnchanged'));
}
async function writeConfig(plan) {
  if (working || !connected) return;
  working = true; issue = null; render();
  try {
    if (manualPending) { await recoverManual(); return; }
    if (!initialConfig || initialConfig.id !== plan.initialId || selected !== plan.slot) throw new ServoSetupError('source-changed');
    const actual = await writeAndVerifyServoConfig({ bus, reconnect, values: initialConfig, ...plan,
      onMutation: mutation => { manualPending = { ...mutation, slot: plan.slot }; persist(); render(); } });
    records[plan.slot] = { index: plan.slot, id: actual.id, baud: plan.targetBaudRate }; verified.add(plan.slot);
    if (wizard.state.phase === 'complete') wizard.state.slots[plan.slot] = { ...records[plan.slot] };
    initialConfig = actual; ui.initialIdInput.value = actual.id; ui.initialBaudRate.value = plan.targetBaudRate;
    manualPending = null; log(ss('logVerified', { number: plan.slot + 1, id: actual.id, baud: plan.targetBaudRate }));
  } catch (e) { initialConfig = null; issue = e; log(tWithVars('error.write-failed-detail', { detail: e.message })); }
  finally { working = false; ui.check.checked = false; persist(); render(); }
}
function showConfirm({ description, from, to, baud, action, numbers = true }) {
  confirmAction = action; $('ssConfirmDescription').textContent = description;
  ui.confirmInitialId.textContent = from; ui.confirmId.textContent = to; $('ssConfirmBaud').textContent = baud;
  $('ssConfirmNumbers').hidden = !numbers; ui.dialog.showModal();
  delete ui.dialog.dataset.closing;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) ui.dialog.animate([{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
}
async function closeConfirm() {
  if (!ui.dialog.open) return;
  ui.dialog.dataset.closing = 'true';
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await ui.dialog.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'translateY(5px) scale(.98)' }], { duration: 140 }).finished.catch(() => {});
  ui.dialog.close();
}
ui.btnConnect.onclick = connect; ui.btnDisconnect.onclick = disconnect;
ui.btnWrite.onclick = () => {
  targetId = Number(ui.idInput.value);
  if (ui.btnWrite.disabled) return;
  const plan = { slot: selected, initialId: Number(ui.initialIdInput.value), targetId, initialBaudRate: Number(ui.initialBaudRate.value), targetBaudRate: Number(ui.targetBaudRate.value) };
  showConfirm({ description: manualPending ? ss('readOnlyRecovery') : ss('confirmDetail', { number: selected + 1, from: plan.initialId, to: plan.targetId, baud: plan.targetBaudRate }), from: plan.initialId, to: targetId, baud: plan.targetBaudRate, action: () => writeConfig(plan) });
};
ui.btnConfirm.onclick = async () => { const action = confirmAction; confirmAction = null; ui.btnConfirm.disabled = true; await closeConfirm(); ui.btnConfirm.disabled = false; if (action) await action(); };
ui.btnCancel.onclick = () => { confirmAction = null; void closeConfirm(); };
ui.dialog.addEventListener('cancel', event => { event.preventDefault(); confirmAction = null; void closeConfirm(); });
$('ssModeAssembly').onclick = () => setMode('assembly'); $('ssModeSingle').onclick = () => setMode('single');
view.querySelector('.ss-modes').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || working) return;
  event.preventDefault(); const next = event.key === 'Home' ? 'assembly' : event.key === 'End' ? 'single' : mode === 'assembly' ? 'single' : 'assembly';
  setMode(next); $(mode === 'assembly' ? 'ssModeAssembly' : 'ssModeSingle').focus();
});
$('ssNewServoCheck').onchange = render; ui.check.onchange = render;
for (const input of [ui.initialIdInput, ui.initialBaudRate]) input.addEventListener('input', () => { initialConfig = null; render(); });
for (const input of [ui.idInput, ui.targetBaudRate]) input.addEventListener('input', render);
$('ssNext').onclick = () => {
  if ($('ssNext').disabled) return;
  if (wizard.state.pending || wizard.state.phase === 'adding') { void runWizard(); return; }
  showConfirm({ description: wizard.state.phase === 'restore' ? ss('restoreDetail') : ss('confirmBaud'), from: wizard.state.phase === 'restore' ? 253 : 0,
    to: wizard.state.phase === 'restore' ? 0 : 6, baud: wizard.state.phase === 'restore' ? 115200 : 1000000, action: runWizard });
};
$('ssPause').onclick = async () => {
  wizard.requestPause();
  try { await activeOperation; } catch { /* runWizard displays and retains the failed operation. */ }
  await disconnect(); log(ss('paused'));
};
$('ssNewRecord').onclick = () => showConfirm({ description: ss('confirmReset'), numbers: false, action: async () => {
  if (working) return; await disconnect();
  wizard = new ServoBusWizard(dependencies); records.forEach((row, index) => { records[index] = { index, id: null, baud: 115200 }; });
  manualPending = null; verified.clear(); selected = 0; mode = 'assembly'; initialConfig = null; issue = null; stageKey = '';
  $('ssNewServoCheck').checked = false; persist(); morph(render);
} });
$('ssSaveRecord').onclick = () => {
  const blob = new Blob([JSON.stringify({ model: 'Star Arm 102-LD', savedAt: new Date().toISOString(), wizard: wizard.checkpoint(), records, manualPending }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'Star-Arm-102-LD-servo-configuration.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('ssFitModel').onclick = () => model?.fit();
async function ensureModel() {
  if (!view.classList.contains('active') || model || loadingModel) { model?.resize(); return; }
  loadingModel = true; modelFailed = false; render();
  try {
    model = await createServoSetupModel({ canvas: $('ssModelCanvas'), onSelect: selectSlot,
      onLabels: points => points.forEach(point => {
        const node = labelNodes[point.slot]; node.style.left = `${point.x * 100}%`; node.style.top = `${point.y * 100}%`; node.hidden = !point.visible;
        const line = labelLines[point.slot];
        for (const [key, value] of Object.entries({ x1: point.anchorX, y1: point.anchorY, x2: point.x, y2: point.y })) line.setAttribute(key, `${value * 100}%`);
        line.style.opacity = point.visible && Math.hypot(point.x - point.anchorX, point.y - point.anchorY) > 0.005 ? '1' : '0';
      }), onError: e => { $('ssModelState').textContent = ss('modelFailed'); log(e.message); } });
    $('ssModelState').textContent = ''; render();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $('ssModelCanvas').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
  } catch (e) { modelFailed = true; }
  finally { loadingModel = false; render(); }
}
const observer = new MutationObserver(() => { if (view.classList.contains('active')) void ensureModel(); }); observer.observe(view, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('language-change', () => { render(); model?.resize(); });
window.addEventListener('workbench:before-switch', event => {
  event.detail.waits.push((async () => {
    if (working) throw new Error(ss('error.leave'));
    if (bus) await disconnect();
    if (view.classList.contains('active') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await $('servoSetupView').animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 170 }).finished.catch(() => {});
    }
  })());
});
window.addEventListener('pagehide', () => { persist(); model?.destroy(); observer.disconnect(); if (bus) void bus.disconnect(); }, { once: true });
render(); void ensureModel();
