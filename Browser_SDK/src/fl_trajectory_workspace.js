import { FlTrajectoryController } from './fl_trajectory_controller.js';
import { FlTrajectoryPreview } from './fl_trajectory_preview.js';
import { FlTrajectoryStore } from './fl_trajectory_store.js';
import { t } from './i18n.js';

const JOINT_LIMITS_DEG = [[-130.06, 130.06], [0, 179.91], [-179.91, 0], [-89.95, 126.05], [-68.75, 68.75], [-179.91, 179.91], [0, 89.95]];
const query = (root, selector) => root.querySelector(selector);
const formatDuration = (ms) => {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(safe % 1000).padStart(3, '0')}`;
};
const downloadJson = (text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = Object.assign(document.createElement('a'), { href: url, download: 'star-arm-102-fl-trajectory.json' });
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const PREVIEW_ACTIVE_STATES = ['moving_to_start', 'playing', 'completed'];

export function createFlTrajectoryWorkspace({ root = document, adapter, store = new FlTrajectoryStore() } = {}) {
  if (!adapter) throw new TypeError('FL 轨迹工作台需要应用适配器');
  const els = {
    connect: query(root, '#flTrajectoryConnect'), disconnect: query(root, '#flTrajectoryDisconnect'),
    emergency: query(root, '#flTrajectoryEmergency'), connection: query(root, '#flTrajectoryConnection'),
    armState: query(root, '#flTrajectoryArmState'), rate: query(root, '#flTrajectoryRate'),
    name: query(root, '#flTrajectoryName'), start: query(root, '#flTrajectoryStart'),
    stopRecord: query(root, '#flTrajectoryStopRecord'), exportButton: query(root, '#flTrajectoryExport'),
    importInput: query(root, '#flTrajectoryImport'), startPreview: query(root, '#flTrajectoryStartPreview'),
    approvePreview: query(root, '#flTrajectoryApprovePreview'), stopPreview: query(root, '#flTrajectoryStopPreview'),
    prepare: query(root, '#flTrajectoryPreparePlayback'), stopPlayback: query(root, '#flTrajectoryStopPlayback'),
    releaseTorque: query(root, '#flTrajectoryReleaseTorque'),
    status: query(root, '#flTrajectoryStatus'), badge: query(root, '#flTrajectoryRecordBadge'),
    summary: query(root, '#flTrajectorySummary'), elapsed: query(root, '#flTrajectoryElapsed'),
    progress: query(root, '#flTrajectoryProgress'), playhead: query(root, '#flTrajectoryPlayhead'),
    previewGate: query(root, '#flTrajectoryPreviewGate'), modelNotice: query(root, '#flTrajectoryModelNotice'),
    joints: Array.from(root.querySelectorAll('[data-fl-joint]')),
    dialog: query(root, '#flTrajectoryPlaybackDialog'), confirmName: query(root, '#flTrajectoryConfirmName'),
    confirmFrames: query(root, '#flTrajectoryConfirmFrames'), confirmDuration: query(root, '#flTrajectoryConfirmDuration'),
    cancelPlayback: query(root, '#flTrajectoryCancelPlayback'), confirmPlayback: query(root, '#flTrajectoryConfirmPlayback'),
  };
  if (Object.values(els).some((value) => !value) || els.joints.length !== 7) throw new Error('FL 轨迹工作台页面结构不完整');

  let trajectory = null;
  let pending = null;
  let latestJoints = null;
  let readbackCount = 0;
  let rateStartedAt = performance.now();
  const controller = new FlTrajectoryController({
    store,
    playbackUpdateIntervalMs: 20,
    pauseSampling: () => adapter.pauseSampling(),
    resumeSampling: () => adapter.resumeSampling(),
    currentJoints: () => latestJoints,
    writeFrame: (jointsRad, durationMs, connectionId, connectionToken) => adapter.writeFrame(jointsRad, durationMs, connectionId, connectionToken),
    releaseTorque: (connectionId, connectionToken) => adapter.releaseTorque(connectionId, connectionToken),
    connectionSnapshot: () => adapter.connectionSnapshot(),
    onStateChange: ({ state, detail }) => renderControllerState(state, detail),
    onProgress: (progress) => renderProgress(progress),
  });
  const preview = new FlTrajectoryPreview({
    onPose: (jointsRad) => adapter.previewPose(jointsRad),
    onRestore: () => adapter.restoreReadbackPose(),
    onStateChange: ({ state }) => renderPreviewState(state),
    onProgress: (progress) => renderPreviewProgress(progress),
  });

  const showStatus = (state, title, detail) => {
    els.status.dataset.state = state;
    query(els.status, 'strong').textContent = title;
    query(els.status, 'p').textContent = detail;
  };
  const currentConnection = () => adapter.connectionSnapshot();
  const connected = () => {
    const value = currentConnection();
    return Boolean(value.connected && value.connectionId);
  };
  const manualReadback = () => adapter.sessionState() === 'manual_readback';
  const previewActive = () => PREVIEW_ACTIVE_STATES.includes(preview.state);
  const previewApproved = () => {
    const snapshot = currentConnection();
    return Boolean(trajectory && preview.isApproved({ trajectory, connectionId: snapshot.connectionId }));
  };

  function renderControls() {
    const isRecording = controller.state === 'recording';
    const isPlaying = ['moving_to_start', 'playing'].includes(controller.state);
    const isHolding = controller.state === 'holding';
    const isReleasing = controller.state === 'releasing';
    const canRetryRelease = controller.canRetryTorqueRelease();
    const torqueBusy = isHolding || isReleasing || canRetryRelease;
    const isPreviewing = previewActive();
    const isConnected = connected();
    const hasTrajectory = Boolean(trajectory?.frames.length);
    els.connect.disabled = isConnected || isRecording || isPlaying || torqueBusy || isPreviewing;
    els.disconnect.disabled = !isConnected || isRecording || isPlaying || isReleasing;
    els.start.disabled = !isConnected || !manualReadback() || isRecording || isPlaying || torqueBusy || isPreviewing;
    els.stopRecord.disabled = !isRecording;
    els.startPreview.disabled = !isConnected || !manualReadback() || !hasTrajectory || isRecording || isPlaying || torqueBusy || isPreviewing;
    els.approvePreview.disabled = !isPreviewing;
    els.stopPreview.disabled = !isPreviewing;
    els.prepare.disabled = !isConnected || !manualReadback() || !hasTrajectory || !previewApproved() || isRecording || isPlaying || torqueBusy || isPreviewing;
    els.stopPlayback.disabled = !isPlaying;
    els.releaseTorque.disabled = !(isHolding || canRetryRelease);
    els.exportButton.disabled = !trajectory;
    els.name.disabled = isRecording || isPlaying || torqueBusy || isPreviewing;
    els.connection.textContent = isConnected ? t('fltraj.connected') : t('status.not-connected');
    els.armState.textContent = !isConnected
      ? t('fltraj.waiting')
      : (torqueBusy ? t(isHolding ? 'fltraj.holding-arm' : 'fltraj.releasing') : (manualReadback() ? t('fltraj.released') : t('fltraj.busy')));
    els.previewGate.dataset.state = previewApproved() ? 'approved' : (isPreviewing ? 'playing' : 'locked');
    els.previewGate.textContent = previewApproved()
      ? t('fltraj.preview-approved')
      : (isPreviewing ? t('fltraj.preview-running') : t('fltraj.preview-required'));
  }

  function renderTrajectory(value = trajectory) {
    if (!value) {
      els.summary.textContent = t('fltraj.empty');
      els.elapsed.textContent = formatDuration(0);
      els.progress.style.width = '0%';
      els.playhead.style.left = '0%';
      renderControls();
      return;
    }
    const duration = value.frames.at(-1)?.t ?? 0;
    els.name.value = value.name;
    els.summary.textContent = t('fltraj.summary').replace('{frames}', value.frames.length).replace('{duration}', formatDuration(duration));
    els.elapsed.textContent = formatDuration(duration);
    els.progress.style.width = '100%';
    els.playhead.style.left = '100%';
    renderControls();
  }

  function renderJoints(jointsRad) {
    jointsRad.forEach((radians, index) => {
      const degrees = radians * 180 / Math.PI;
      const [minimum, maximum] = JOINT_LIMITS_DEG[index];
      const percentage = Math.max(0, Math.min(100, (degrees - minimum) / (maximum - minimum) * 100));
      query(els.joints[index], 'i').style.width = `${percentage}%`;
      query(els.joints[index], 'output').textContent = `${degrees.toFixed(1)}°`;
    });
  }

  function renderControllerState(state, detail) {
    switch (state) {
      case 'holding': showStatus('warning', t('fltraj.holding'), t('fltraj.holding-detail')); break;
      default: break;
    }
    if (state === 'holding') {
      els.badge.textContent = t('fltraj.holding');
      renderControls();
      return;
    }
    const states = {
      recording: ['recording', t('fltraj.recording'), t('fltraj.recording-detail')],
      ready: ['ready', t('fltraj.saved'), detail?.persisted === false ? t('fltraj.memory-fallback') : t('fltraj.saved-detail')],
      interrupted: ['error', t('fltraj.interrupted'), t('fltraj.interrupted-detail')],
      pending_confirmation: ['ready', t('fltraj.confirm-pending'), t('fltraj.confirm-pending-detail')],
      moving_to_start: ['recording', t('fltraj.moving-start'), t('fltraj.moving-start-detail')],
      playing: ['recording', t('fltraj.playing'), t('fltraj.playing-detail')],
      holding: ['warning', t('fltraj.holding'), t('fltraj.holding-detail')],
      releasing: ['recording', t('fltraj.releasing'), t('fltraj.releasing-detail')],
      completed: ['completed', t('fltraj.sent'), t('fltraj.sent-detail')],
      stopped: ['ready', t('fltraj.stopped'), t('fltraj.stopped-detail')],
      disconnected: ['idle', t('fltraj.waiting'), t('fltraj.waiting-detail')],
      fault: ['error', t('fltraj.emergency'), t('fltraj.emergency-detail')],
    };
    const [visual, title, description] = states[state] ?? ['idle', t('fltraj.idle'), ''];
    els.badge.textContent = title;
    showStatus(visual, title, description);
    renderControls();
  }

  function renderPreviewState(state) {
    const previewing = PREVIEW_ACTIVE_STATES.includes(state);
    els.status.dataset.previewState = previewing ? 'playing' : state;
    els.modelNotice.textContent = previewing ? t('fltraj.preview-model') : t('fltraj.fixed-model');
    if (state === 'moving_to_start') showStatus('recording', t('fltraj.preview-starting'), t('fltraj.preview-starting-detail'));
    if (state === 'playing') showStatus('recording', t('fltraj.preview-playing'), t('fltraj.preview-playing-detail'));
    if (state === 'completed') showStatus('ready', t('fltraj.preview-completed'), t('fltraj.preview-completed-detail'));
    if (state === 'approved') showStatus('completed', t('fltraj.preview-approved-title'), t('fltraj.preview-approved-detail'));
    if (state === 'stopped') showStatus('ready', t('fltraj.preview-stopped'), t('fltraj.preview-stopped-detail'));
    renderControls();
  }

  function renderProgress(progress) {
    if (progress.mode === 'recording') {
      trajectory = progress.trajectory;
      renderTrajectory();
      return;
    }
    const percent = progress.durationMs ? progress.elapsedMs / progress.durationMs * 100 : 0;
    els.progress.style.width = `${percent}%`;
    els.playhead.style.left = `${percent}%`;
    els.elapsed.textContent = formatDuration(progress.elapsedMs);
  }

  function renderPreviewProgress(progress) {
    const percent = progress.durationMs ? progress.elapsedMs / progress.durationMs * 100 : 100;
    els.progress.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.playhead.style.left = els.progress.style.width;
    els.elapsed.textContent = formatDuration(progress.elapsedMs);
  }

  async function run(action) {
    try { return await action(); }
    catch (error) {
      try { showStatus('error', t('fltraj.failed'), error.message); }
      catch (_) {}
    } finally {
      try { renderControls(); }
      catch (_) {}
    }
  }

  function revokePreview(reason) {
    pending = null;
    preview.revoke(reason);
  }

  async function startRecording() {
    revokePreview('recording_started');
    const snapshot = currentConnection();
    trajectory = controller.startRecording({
      name: els.name.value.trim(), connectionId: snapshot.connectionId,
      sessionState: adapter.sessionState(), initialJointsRad: latestJoints,
    });
    renderTrajectory();
  }

  async function stopRecording() {
    const snapshot = currentConnection();
    const result = await controller.stopRecording({ connectionId: snapshot.connectionId, finalJointsRad: latestJoints });
    trajectory = result.trajectory;
    revokePreview('trajectory_changed');
    renderTrajectory();
  }

  function startPreview() {
    const snapshot = currentConnection();
    preview.start({ trajectory, connectionId: snapshot.connectionId, currentJointsRad: latestJoints });
  }

  function approvePreview() {
    preview.approve();
  }

  function preparePlayback() {
    const snapshot = currentConnection();
    if (!preview.isApproved({ trajectory, connectionId: snapshot.connectionId })) throw new Error(t('fltraj.preview-required-error'));
    pending = controller.preparePlayback({ trajectory, connectionId: snapshot.connectionId });
    els.confirmName.textContent = trajectory.name;
    els.confirmFrames.textContent = String(trajectory.frames.length);
    els.confirmDuration.textContent = formatDuration(trajectory.frames.at(-1).t);
    els.dialog.showModal();
  }

  async function confirmPlayback() {
    els.dialog.close();
    const snapshot = currentConnection();
    if (!preview.isApproved({ trajectory, connectionId: snapshot.connectionId })) throw new Error(t('fltraj.preview-required-error'));
    const result = await controller.confirmPlayback({ pending, connectionId: snapshot.connectionId });
    pending = null;
    preview.revoke('hardware_playback_started');
    return result;
  }

  async function initialize() {
    trajectory = await store.load();
    renderTrajectory();
    renderControls();
  }

  els.connect.addEventListener('click', () => void run(async () => { await adapter.connect(); renderControls(); }));
  els.disconnect.addEventListener('click', () => void run(async () => {
    const connectionId = currentConnection().connectionId;
    preview.disconnect();
    let safetyError = null;
    try {
      await controller.handleDisconnect({ connectionId });
    } catch (error) {
      safetyError = error;
    }
    try {
      await adapter.disconnect();
    } catch (error) {
      if (safetyError) throw new AggregateError([safetyError, error], `${safetyError.message}; ${error.message}`);
      throw error;
    }
    if (safetyError) throw safetyError;
    renderControls();
  }));
  els.emergency.addEventListener('click', () => void run(async () => { preview.revoke('emergency'); await controller.emergencyStop(); await adapter.emergencyStop(); }));
  els.start.addEventListener('click', () => void run(startRecording));
  els.stopRecord.addEventListener('click', () => void run(stopRecording));
  els.startPreview.addEventListener('click', () => void run(startPreview));
  els.approvePreview.addEventListener('click', () => void run(approvePreview));
  els.stopPreview.addEventListener('click', () => void run(() => preview.stop()));
  els.prepare.addEventListener('click', () => void run(preparePlayback));
  els.stopPlayback.addEventListener('click', () => void run(() => controller.stopPlayback()));
  els.releaseTorque.addEventListener('click', () => void run(() => controller.releasePlaybackTorque()));
  els.cancelPlayback.addEventListener('click', () => { els.dialog.close(); pending = null; void run(() => controller.stopPlayback()); });
  els.confirmPlayback.addEventListener('click', () => void run(confirmPlayback));
  els.dialog.addEventListener('cancel', (event) => { event.preventDefault(); els.cancelPlayback.click(); });
  els.exportButton.addEventListener('click', () => void run(() => downloadJson(store.exportJson())));
  els.importInput.addEventListener('change', () => void run(async () => {
    const file = els.importInput.files?.[0];
    if (!file) return;
    trajectory = await store.importJson(await file.text());
    revokePreview('trajectory_imported');
    renderTrajectory();
    showStatus('ready', t('fltraj.imported'), t('fltraj.imported-detail'));
    els.importInput.value = '';
  }));
  window.addEventListener('language-change', () => {
    renderTrajectory();
    if (PREVIEW_ACTIVE_STATES.includes(preview.state) || ['approved', 'stopped'].includes(preview.state)) renderPreviewState(preview.state);
    else renderControllerState(controller.state);
  });
  void run(initialize);

  return {
    acceptReadback({ connectionId, jointsRad }) {
      latestJoints = [...jointsRad];
      renderJoints(latestJoints);
      readbackCount += 1;
      const now = performance.now();
      if (now - rateStartedAt >= 1000) {
        els.rate.textContent = `${(readbackCount * 1000 / (now - rateStartedAt)).toFixed(1)} Hz`;
        readbackCount = 0;
        rateStartedAt = now;
      }
      return controller.acceptReadback({ connectionId, jointsRad: latestJoints });
    },
    refreshConnection() { renderControls(); },
    revokePreview(reason = 'external_state_changed') { revokePreview(reason); renderControls(); },
    async handleDisconnect(connectionId) { preview.disconnect(); await controller.handleDisconnect({ connectionId }); renderControls(); },
    async handleEmergency() { preview.revoke('emergency'); await controller.emergencyStop(); renderControls(); },
    async stop() {
      try {
        preview.revoke('workspace_stopped');
        if (controller.state === 'recording') {
          const snapshot = currentConnection();
          await controller.stopRecording({
            connectionId: snapshot.connectionId,
            finalJointsRad: latestJoints,
            interrupted: true,
          });
        }
        await controller.stopPlayback();
        if (controller.state === 'holding' || controller.canRetryTorqueRelease()) {
          await controller.releasePlaybackTorque();
        }
      } catch (error) {
        showStatus('error', t('fltraj.failed'), error.message);
        renderControls();
        throw error;
      }
    },
  };
}
