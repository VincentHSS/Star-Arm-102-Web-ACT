import { createPageNavigator, releaseWorkbenchConnections, setInteractionStatus, withButtonFeedback } from './page-lifecycle.js?v=responsive-1';
import { APP_VERSION } from './version.js';
import { isDeviceLostError, userMessageForSerialError } from './browser_serial_utils.js';
import { ServoProtocol, clampGripperAngle, parseMonitorPacket, parsePublicParametersPacket, parseInternalParametersPacket, selectParameterResponse } from './fashionstar_serial.js';
import { resetArmOrigin, verifyOriginAngles } from './reset_origin.js';
import { restoreFactoryParameters, compareParameters } from './factory_restore.js';
import { createRobotModel } from './robot_model.js?v=1.1.2-responsive-1';
import { MODEL_CONFIGS, resolveDisplayModelKey, isDisplayOnlyModelKey, PIPER_MODEL_KEY, LEADER_TYPE_PIPER } from './robot_model_configs.js';
import { mapLeaderAnglesToB601 } from './b601_model_data.js';
import { mapLeaderAnglesToA1Z } from './a1z_model_data.js';
import { modelToServoAngles, servoToModelAngles, validateJointTargets } from './joint_mapper.js';
import { solveInverseKinematics, forwardKinematics } from './ik_solver.js';
import { CommandExecutionController } from './command_execution.js';
import { getRobotProfile } from './robot_profiles.js';
import { loadSettings, saveSettings, normalizeControlSettings } from './settings.js';
import { TeleopController } from './teleop_controller.js';
import { initLanguage, setLanguage, getLanguage, t, tWithVars, autoTranslatePage } from './i18n.js';
import { SerialServoBus } from './serial_servo_bus.js';
import { ControlGeneration, connectInitializedBus, executeConfirmedTarget } from './control_safety.js';
import { TcpDragPreviewCoordinator, freezeTcpDragForExecution } from './tcp_drag_preview.js';
import { matrixToQuaternion } from './tcp_translation_gizmo.js';
import { createFlTrajectoryWorkspace } from './fl_trajectory_workspace.js';
import { createRateMeter } from './rate_meter.js';
import { createJointSliderState, parseJointInputDegrees } from './joint_slider_control.js';
import { TargetExecutionOwnership } from './target_execution_ownership.js';
import { ArmManualControlSession } from './manual_control_session.js';
import { ConnectionOperationLock, TeleopLifecycle, drainLostConnection } from './control_lifecycle.js';
import {
  FOLLOWER_TARGET_PHYSICAL,
  FOLLOWER_TARGET_VIRTUAL,
  VIRTUAL_MODEL_REBOT_B601,
  VIRTUAL_MODEL_GALAXEA_A1Z,
  VIRTUAL_MODEL_STAR_ARM_FL,
  createFollowerTargetState,
  createTeleopOutputOptions,
} from './follower_target.js';
import {
  applyHdHoverForConnectedLeader,
  connectLeaderForProfile,
  getConnectedLeaderType,
  isLeaderTypeLocked,
  writeLeaderControlFrame,
} from './runtime_integration.js';

const SERVO_IDS = [0, 1, 2, 3, 4, 5, 6];
const BAUD_RATE = 1000000;
let connectionSequence = 0;
let consoleNavigationPending = false;
const nextConnectionId = (role) => `${role}-${Date.now()}-${++connectionSequence}`;

const els = {
  appVersion: document.querySelector('#appVersion'),
  connectLeader: document.querySelector('#connectLeader'),
  connectFollower: document.querySelector('#connectFollower'),
  disconnectAll: document.querySelector('#disconnectAll'),
  start: document.querySelector('#startTeleop'),
  stop: document.querySelector('#stopTeleop'),
  leaderStatus: document.querySelector('#leaderStatus'),
  followerStatus: document.querySelector('#followerStatus'),
  runStatus: document.querySelector('#runStatus'),
  leaderType: document.querySelector('#leaderType'),
  followerType: document.querySelector('#followerType'),
  followerTypeSwitch: document.querySelector('#followerTypeSwitch'),
  followerTypePhysical: document.querySelector('#followerTypePhysical'),
  followerTypeVirtual: document.querySelector('#followerTypeVirtual'),
  virtualFollowerModelField: document.querySelector('#virtualFollowerModelField'),
  virtualFollowerModel: document.querySelector('#virtualFollowerModel'),
  virtualFollowerNotice: document.querySelector('#virtualFollowerNotice'),
  b601VirtualNotice: document.querySelector('#b601VirtualNotice'),
  loopInterval: document.querySelector('#loopInterval'),
  responseTimeout: document.querySelector('#responseTimeout'),
  rawLogEnabled: document.querySelector('#rawLogEnabled'),
  filterSize: document.querySelector('#filterSize'),
  settingsError: document.querySelector('#settingsError'),
  logs: document.querySelector('#logs'),
  angles: document.querySelector('#angles'),
  tabs: document.querySelectorAll('[data-tab]'),
  teleopView: document.querySelector('#teleopView'),
  deviceRegion: document.querySelector('.device-region'),
  robotScenePanel: document.querySelector('#robotScenePanel'),
  trajectoryDeviceHost: document.querySelector('#trajectoryDeviceHost'),
  trajectorySceneHost: document.querySelector('#trajectorySceneHost'),
  resetOriginView: document.querySelector('#resetOriginView'),
  connectResetArm: document.querySelector('#connectResetArm'),
  disconnectResetArm: document.querySelector('#disconnectResetArm'),
  resetOrigin: document.querySelector('#resetOrigin'),
  resetArmStatus: document.querySelector('#resetArmStatus'),
  resetStatus: document.querySelector('#resetStatus'),
  resetLogs: document.querySelector('#resetLogs'),
  resetOperationNotice: document.querySelector('#resetOperationNotice'),
  resetOperationIcon: document.querySelector('#resetOperationIcon'),
  resetOperationTitle: document.querySelector('#resetOperationTitle'),
  resetOperationDetail: document.querySelector('#resetOperationDetail'),
  resetConfirmDialog: document.querySelector('#resetConfirmDialog'),
  cancelResetOrigin: document.querySelector('#cancelResetOrigin'),
  confirmResetOrigin: document.querySelector('#confirmResetOrigin'),
  factoryRestoreView: document.querySelector('#factoryRestoreView'),
  servoSetupView: document.querySelector('#servoSetupView'),
  factoryModel: document.querySelector('#factoryModel'),
  connectFactoryArm: document.querySelector('#connectFactoryArm'),
  disconnectFactoryArm: document.querySelector('#disconnectFactoryArm'),
  restoreFactory: document.querySelector('#restoreFactory'),
  factoryArmStatus: document.querySelector('#factoryArmStatus'),
  factoryStatus: document.querySelector('#factoryStatus'),
  factoryLogs: document.querySelector('#factoryLogs'),

  factoryProgressSummary: document.querySelector('#factoryProgressSummary'),
  factoryProgressSteps: document.querySelectorAll('[data-factory-step]'),
  factoryManualPowerNotice: document.querySelector('#factoryManualPowerNotice'),
  factoryConfirmDialog: document.querySelector('#factoryConfirmDialog'),
  factoryConfirmModel: document.querySelector('#factoryConfirmModel'),
  cancelFactoryRestore: document.querySelector('#cancelFactoryRestore'),
  confirmFactoryRestore: document.querySelector('#confirmFactoryRestore'),
  robotCanvas: document.querySelector('#robotCanvas'),
  robotViewport: document.querySelector('#robotViewport'),
  modelLoadStatus: document.querySelector('#modelLoadStatus'),
  modelLoadError: document.querySelector('#modelLoadError'),
  displayedModelStatus: document.querySelector('#displayedModelStatus'),
  modelPermission: document.querySelector('#modelPermission'),
  poseSourceLeader: document.querySelector('#poseSourceLeader'),
  poseSourceFollower: document.querySelector('#poseSourceFollower'),
  resetCamera: document.querySelector('#resetCamera'),
  fitCamera: document.querySelector('#fitCamera'),
  fullscreenScene: document.querySelector('#fullscreenScene'),
  emergencyStop: document.querySelector('#emergencyStop'),
  emergencyStatus: document.querySelector('#emergencyStatus'),
  tcpX: document.querySelector('#tcpX'),
  tcpY: document.querySelector('#tcpY'),
  tcpZ: document.querySelector('#tcpZ'),
  targetDuration: document.querySelector('#targetDuration'),
  targetModeButtons: document.querySelectorAll('[data-target-mode]'),
  targetModeViews: document.querySelectorAll('[data-target-mode-view]'),
  targetSourceLabel: document.querySelector('#targetSourceLabel'),
  previewTarget: document.querySelector('#previewTarget'),
  exitTcpControl: document.querySelector('#exitTcpControl'),
  confirmTarget: document.querySelector('#confirmTarget'),
  cancelTarget: document.querySelector('#cancelTarget'),
  targetPermission: document.querySelector('#targetPermission'),
  targetState: document.querySelector('#targetState'),
  targetStatusTitle: document.querySelector('#targetStatusTitle'),
  targetStatusDetail: document.querySelector('#targetStatusDetail'),
  targetTcpResult: document.querySelector('#targetTcpResult'),
  targetError: document.querySelector('#targetError'),
  targetIterations: document.querySelector('#targetIterations'),
  targetAngles: document.querySelector('#targetAngles'),
  targetCalibration: document.querySelector('#targetCalibration'),
  jointSliderPermission: document.querySelector('#jointSliderPermission'),
  jointSliderInputs: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointSlider${index + 1}`)),
  jointAngleInputs: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointInput${index + 1}`)),
  jointSliderValues: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointSliderValue${index + 1}`)),
  jointActualValues: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointActualValue${index + 1}`)),
  manualModeStatus: document.querySelector('#manualModeStatus'),
  enterSliderControl: document.querySelector('#enterSliderControl'),
  exitSliderControl: document.querySelector('#exitSliderControl'),
  teleopFrequency: document.querySelector('#teleopFrequency'),
  renderFps: document.querySelector('#renderFps'),
};

class BrowserTeleopController {
  constructor() {
    const reportLostError = (cause, bus, errorLogger) => {
      try { errorLogger(userMessageForSerialError(cause, bus?.name ?? 'Serial')); }
      catch (_) {}
    };
    const busOptions = (role, errorLogger = log, onStateChange = () => {}) => ({
      errorLogger,
      onStateChange,
      onLost: (error, bus) => void this.handleBusLost(role, bus, error)
        .catch((cause) => reportLostError(cause, bus, errorLogger)),
    });
    this.leader = new SerialServoBus('Leader', busOptions('leader'));
    this.follower = null;
    this.followerBusOptions = busOptions('follower');
    this.resetBus = new SerialServoBus('Reset Arm', busOptions('reset', resetLog, renderResetState));
    this.factoryBus = new SerialServoBus('Factory Arm', busOptions('factory', factoryLog, renderFactoryState));
    this.running = false;
    this.resettingOrigin = false;
    this.restoringFactory = false;
    this.loopCount = 0;
    this.lastFreqTime = performance.now();
    this.teleopRateMeter = createRateMeter();
    this.hdButtonLocked = false;
    this.lastLeaderMonitors = {};
    this.teleop = null;
    this.connectedLeaderProfile = null;
    this.leaderConnectionId = null;
    this.followerConnectionId = null;
    this.followerTarget = createFollowerTargetState(els.followerType.value);
    this.manualSessions = { leader: null, follower: null };
    this.latestAngles = { leader: null, follower: null };
    this.controlGeneration = new ControlGeneration();
    this.leaderConnectionLock = new ConnectionOperationLock('Leader');
    this.followerConnectionLock = new ConnectionOperationLock('Follower');
    this.teleopLifecycle = new TeleopLifecycle();
    this.disconnectPromise = null;
  }

  async connectLeader() {
    if (consoleNavigationPending) throw new Error('正在切换页面，请稍候。');
    if (this.leader.connected) throw new Error(t('error.leader-serial-connected'));
    const leaderType = getLeaderProfileCode();
    const operation = this.leaderConnectionLock.begin(leaderType);
    let session = null;
    let profile = null;
    const connectionId = nextConnectionId('leader');
    renderConnectionState();
    try {
      profile = await connectLeaderForProfile({
        bus: this.leader,
        model: leaderType,
        initializeBus: async () => {},
      });
      this.leaderConnectionLock.assertCurrent(operation, getLeaderProfileCode());
      session = this.createManualSession('leader', !profile.canCommand);
      await session.connect();
      this.leaderConnectionLock.assertCurrent(operation, getLeaderProfileCode());
      this.manualSessions.leader = session;
      this.connectedLeaderProfile = profile;
      this.leaderConnectionId = connectionId;
    } catch (error) {
      this.manualSessions.leader = null;
      this.connectedLeaderProfile = null;
      this.leaderConnectionId = null;
      await Promise.allSettled([session?.disconnect(), this.leader.disconnect()]);
      throw error;
    } finally {
      this.leaderConnectionLock.finish(operation);
      renderConnectionState();
    }
    log(profile.canCommand ? t('status.leader-connected-hd') : t('status.leader-connected-ld'));
  }

  async connectFollower() {
    if (consoleNavigationPending) throw new Error('正在切换页面，请稍候。');
    const targetType = this.followerTarget.type;
    if (this.followerConnected()) throw new Error(targetType === FOLLOWER_TARGET_VIRTUAL ? t('status.virtual-fl-connected') : t('status.follower-serial-connected'));
    const operation = this.followerConnectionLock.begin(targetType);
    let session = null;
    let connectionId = null;
    let follower = null;
    renderConnectionState();
    try {
      if (targetType === FOLLOWER_TARGET_VIRTUAL) {
        this.followerConnectionLock.assertCurrent(operation, this.followerTarget.type);
        this.followerTarget.connectVirtual();
        this.latestAngles.follower ??= new Array(SERVO_IDS.length).fill(0);
        log(t('status.virtual-fl-connected-detail'));
        return;
      }

      follower = this.createFollowerBus();
      await connectInitializedBus({
        bus: follower,
        initialize: async () => {},
        identity: nextConnectionId('follower'),
        publish: (identity) => { connectionId = identity; },
      });
      this.followerConnectionLock.assertCurrent(operation, this.followerTarget.type);
      session = this.createManualSession('follower', false);
      await session.connect();
      this.followerConnectionLock.assertCurrent(operation, this.followerTarget.type);
      this.manualSessions.follower = session;
      this.followerConnectionId = connectionId;
      log(t('status.follower-connected'));
    } catch (error) {
      this.manualSessions.follower = null;
      this.followerConnectionId = null;
      await Promise.allSettled([
        session?.disconnect(),
        targetType === FOLLOWER_TARGET_PHYSICAL ? follower?.disconnect() : null,
      ]);
      if (this.follower === follower) this.follower = null;
      throw error;
    } finally {
      this.followerConnectionLock.finish(operation);
      renderConnectionState();
    }
  }

  async disconnectFollower() {
    const release = await this.followerConnectionLock.invalidateAndWait();
    try {
      const connectionId = this.followerConnectionId;
      const session = this.manualSessions.follower;
      const follower = this.follower;
      await this.teleopLifecycle.stop({ resume: false });
      this.running = false;
      await Promise.allSettled([session?.disconnect(), follower?.disconnect()]);
      if (this.manualSessions.follower === session) this.manualSessions.follower = null;
      if (this.follower === follower) this.follower = null;
      this.followerConnectionId = null;
      this.latestAngles.follower = null;
      this.followerTarget.disconnectVirtual();
      invalidateTargetPreview(t('status.connection-lost'));
      return connectionId;
    } finally {
      release();
      renderConnectionState();
      renderRunState();
      renderManualControlState();
    }
  }

  createFollowerBus() {
    this.follower ??= new SerialServoBus('Follower', this.followerBusOptions);
    return this.follower;
  }

  disconnectAll() {
    if (this.disconnectPromise) return this.disconnectPromise;
    this.disconnectPromise = this.performDisconnectAll().finally(() => {
      this.disconnectPromise = null;
      renderConnectionState();
      renderRunState();
    });
    renderConnectionState();
    renderRunState();
    return this.disconnectPromise;
  }

  async performDisconnectAll() {
    const releases = await Promise.all([
      this.leaderConnectionLock.invalidateAndWait(),
      this.followerConnectionLock.invalidateAndWait(),
    ]);
    try {
      const connectionId = this.followerConnectionId;
      const errors = [];
      const collectErrors = (results) => {
        for (const result of results) if (result.status === 'rejected') errors.push(result.reason);
      };
      collectErrors(await Promise.allSettled([
        connectionId ? trajectoryWorkspace.handleDisconnect({ connectionId }) : null,
        this.stop({ resume: false }),
      ]));
      collectErrors(await Promise.allSettled(
        Object.values(this.manualSessions).map((session) => session?.disconnect()),
      ));
      this.manualSessions = { leader: null, follower: null };
      const follower = this.follower;
      collectErrors(await Promise.allSettled([this.leader.disconnect(), follower?.disconnect()]));
      if (this.follower === follower) this.follower = null;
      this.followerTarget.disconnectVirtual();
      this.connectedLeaderProfile = null;
      this.leaderConnectionId = null;
      this.followerConnectionId = null;
      invalidateTargetPreview(t('status.connection-lost'));
      if (errors.length > 0) throw new AggregateError(errors, errors.map((error) => error.message).join('；'));
      log(t('status.all-disconnected'));
    } finally {
      for (const release of releases) release();
    }
  }

  followerConnected() {
    return this.followerTarget.connected({ physicalConnected: Boolean(this.follower?.connected) });
  }

  async connectResetArm() {
    if (consoleNavigationPending) throw new Error('正在切换页面，请稍候。');
    if (this.running) throw new Error(t('error.stop-teleop-first'));
    if (this.leader.connected || this.follower?.connected || this.factoryBus.connected) throw new Error(t('error.disconnect-other-first'));
    hideResetOperationNotice();
    await this.resetBus.connect();
    resetLog(t('log.reset-arm-connected'));
    renderResetState();
  }

  async disconnectResetArm() {
    if (this.resettingOrigin) throw new Error(t('error.resetting-origin'));
    await this.resetBus.disconnect();
    resetLog(t('log.reset-serial-disconnected'));
    renderResetState();
  }

  async resetOriginPoints() {
    if (!this.resetBus.connected) throw new Error(t('error.select-reset-arm-first'));
    if (this.running) throw new Error(t('error.stop-teleop-first'));
    this.resettingOrigin = true;
    showResetOperationNotice('busy', t('status.setting-verifying'), t('status.do-not-move'));
    resetLog(t('log.setting-verifying'));
    renderResetState();
    try {
      await resetArmOrigin((frame) => this.resetBus.write(frame), {
        delayMs: 20,
        onProgress: (servoId) => resetLog(tWithVars('log.servo-id-set', { id: servoId })),
      });
      resetLog(t('log.origin-command-sent'));
      await delay(100);
      const monitors = await this.verifyResetOriginAngles();
      verifyOriginAngles(monitors, { tolerance: 1 });
      resetLog(tWithVars('log.origin-verify-pass', { details: monitors.map((monitor) => `ID ${monitor.id} ${monitor.angle.toFixed(2)}°`).join(', ') }));
      resetLog(t('log.origin-complete'));
      showResetOperationNotice('success', t('status.success'), '');
    } finally {
      this.resettingOrigin = false;
      renderResetState();
    }
  }

  async connectFactoryArm() {
    if (consoleNavigationPending) throw new Error('正在切换页面，请稍候。');
    if (this.running || this.leader.connected || this.follower?.connected || this.resetBus.connected) {
      throw new Error(t('error.stop-and-disconnect-first'));
    }
    await this.factoryBus.connect();
    factoryLog(tWithVars('log.arm-connected', { model: factoryModelName(els.factoryModel.value) }));
    renderFactoryState();
  }

  async disconnectFactoryArm() {
    if (this.restoringFactory) throw new Error(t('error.restoring-factory'));
    await this.factoryBus.disconnect();
    factoryLog(t('log.factory-serial-disconnected'));
    renderFactoryState();
  }

  async restoreFactory() {
    if (!this.factoryBus.connected) throw new Error(t('error.select-arm-serial-first'));
    const model = els.factoryModel.value;
    const modelName = factoryModelName(model);
    this.restoringFactory = true;
    resetFactoryProgress();
    factoryLog(tWithVars('log.factory-start', { model: modelName }));
    renderFactoryState();
    try {
      await restoreFactoryParameters({
        model,
        delayMs: 500,
        write: (frame) => this.factoryBus.write(frame),
        readAndVerify: (kind, id, expected) => this.readAndVerifyFactory(kind, id, expected),
        onPhase: (phase) => {
          setFactoryProgressPhase(phase);
          factoryLog(factoryPhaseName(phase));
        },
        onProgress: (phase, id) => {
          if (phase === 'public' || phase === 'internal' || phase.startsWith('verify-')) {
            factoryLog(tWithVars('log.servo-complete', { phase: factoryPhaseName(phase), id }));
          }
        },
      });
      completeFactoryProgress();
      factoryLog(tWithVars('log.params-restored', { model: modelName }));
    } catch (error) {
      failFactoryProgress(error);
      throw error;
    } finally {
      this.restoringFactory = false;
      renderFactoryState();
    }
  }

  async readAndVerifyFactory(kind, id, expected) {
    const publicKind = kind === 'public';
    const frame = publicKind ? ServoProtocol.readPublicParameters(id) : ServoProtocol.readInternalParameters(id);
    this.factoryBus.clearRaw();
    await this.factoryBus.write(frame);
    const expectedLength = publicKind ? 38 : 31;
    const deadline = performance.now() + 3000;
    let received = new Uint8Array();
    let response = null;
    while (!response && performance.now() < deadline) {
      try {
        const chunk = await this.factoryBus.waitForRaw(Math.max(100, deadline - performance.now()));
        received = Uint8Array.from([...received, ...chunk]);
        response = selectParameterResponse(received, kind, id);
      } catch (error) {
        throw new Error(tWithVars('error.servo-timeout-detail', { id, kind: publicKind ? t('label.public') : t('label.internal'), tx: toHex(frame), rx: received.length ? toHex(received) : t('error.no-bytes') }));
      }
    }
    if (!response || response.length !== expectedLength) {
      throw new Error(tWithVars('error.params-incomplete', { id, kind: publicKind ? t('label.public') : t('label.internal') }));
    }
    const actual = publicKind ? parsePublicParametersPacket(response) : parseInternalParametersPacket(response);
    const mismatches = compareParameters(actual, expected);
    if (mismatches.length) throw new Error(tWithVars('error.params-verify-failed', { id, kind: publicKind ? t('label.public') : t('label.internal'), details: mismatches.join('; ') }));
  }

  writeLeaderControlFrame(frame, profile = this.connectedLeaderProfile) {
    return writeLeaderControlFrame({ bus: this.leader, profile, frame });
  }

  async verifyResetOriginAngles() {
    const request = ServoProtocol.syncServoMonitor(SERVO_IDS);
    if (isRawLogEnabled()) resetLog(tWithVars('log.tx-read-monitor', { name: 'Reset Arm', hex: toHex(request) }));
    await this.resetBus.write(request);
    await delay(8);
    const monitors = [];

    for (const servoId of SERVO_IDS) {
      try {
        const packet = await this.resetBus.waitForPacket((candidate) => parseMonitorPacket(candidate)?.id === servoId, getResponseTimeoutMs());
        const monitor = parseMonitorPacket(packet);
        if (!monitor) throw new Error(tWithVars('error.angle-read-failed', { id: servoId }));
        monitors.push(monitor);
      } catch (error) {
        if (/Servo ID|error.angle-read/.test(error.message)) throw error;
        throw new Error(tWithVars('error.angle-read-failed-detail', { id: servoId, detail: error.message }));
      }
    }
    return monitors;
  }

  createTeleopController(settings) {
    this.loopCount = 0;
    this.lastFreqTime = performance.now();
    this.teleopRateMeter.reset();
    this.teleopRateMeter.tick(this.lastFreqTime);
    els.teleopFrequency.textContent = t('telemetry.sampling');
    this.hdButtonLocked = false;
    const virtualFollower = this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL;
    if (virtualFollower) {
      els.poseSourceFollower.checked = true;
      syncDisplayedModel(t('status.virtual-fl-pose-source'));
    }
    const follower = this.follower;
    if (!virtualFollower && !follower?.connected) throw new Error(t('error.follower-not-connected'));
    const outputOptions = virtualFollower
      ? createTeleopOutputOptions({ type: FOLLOWER_TARGET_VIRTUAL })
      : createTeleopOutputOptions({
        type: FOLLOWER_TARGET_PHYSICAL,
        writeFollowerAngles: async (angles) => {
          try {
            await follower.write(ServoProtocol.syncMultiTurnAngleByInterval(angles, {
              interval: 100,
              tAcc: 50,
              tDec: 50,
              power: 0,
              servoIds: SERVO_IDS,
            }));
          } catch (error) {
            error.serialRole = 'follower';
            error.serialBus = follower;
            throw error;
          }
        },
      });
    return new TeleopController({
      loopIntervalMs: settings.loopIntervalMs,
      filterWindow: settings.filterWindow,
      readLeaderAngles: async () => {
        try {
          const angles = await this.readLeaderAngles(getLeaderType() === '102HD' ? [7] : []);
          await this.applyHdHoverIfNeeded();
          return angles;
        } catch (error) {
          error.serialRole = 'leader';
          error.serialBus = this.leader;
          throw error;
        }
      },
      ...outputOptions,
      onAngles: (angles) => {
        this.updateFrequency();
        this.latestAngles.leader = [...angles];
        this.latestAngles.follower = [...angles];
        renderAngles(this.latestAngles[selectedPoseRole()], selectedPoseRole());
      },
      onError: (error) => void this.handleLoopError(error, error.serialRole, error.serialBus)
        .catch(() => {}),
    });
  }

  async suspendManualSessionsForTeleop(isAllowed = () => true) {
    const suspended = [];
    try {
      for (const session of Object.values(this.manualSessions).filter(Boolean)) {
        if (!isAllowed()) {
          // 许可已撤销，回滚已暂停的会话
          const results = await Promise.allSettled(suspended.map((s) => s.resumeAfterTeleop(isAllowed)));
          for (const result of results) {
            if (result.status === 'rejected') log(tWithVars('error.startup-rollback', { detail: result.reason?.message ?? t('error.unknown') }));
          }
          throw new Error(t('error.teleop-start-aborted'));
        }
        await session.suspendForTeleop(isAllowed);
        if (!isAllowed()) {
          // 暂停后许可撤销，回滚
          const results = await Promise.allSettled(suspended.map((s) => s.resumeAfterTeleop(isAllowed)));
          for (const result of results) {
            if (result.status === 'rejected') log(tWithVars('error.startup-rollback', { detail: result.reason?.message ?? t('error.unknown') }));
          }
          throw new Error(t('error.teleop-start-aborted'));
        }
        suspended.push(session);
      }
    } catch (error) {
      const results = await Promise.allSettled(suspended.map((session) => session.resumeAfterTeleop(isAllowed)));
      for (const result of results) {
        if (result.status === 'rejected') log(tWithVars('error.startup-rollback', { detail: result.reason?.message ?? t('error.unknown') }));
      }
      throw error;
    }
  }

  async resumeManualSessionsAfterTeleop(isAllowed = () => true) {
    const results = await Promise.allSettled(Object.values(this.manualSessions).map((session) => session?.resumeAfterTeleop(isAllowed)));
    for (const result of results) {
      if (result.status === 'rejected') log(tWithVars('error.restore-damping', { detail: result.reason?.message ?? t('error.unknown') }));
    }
  }

  async start() {
    if (this.disconnectPromise
      || this.leaderConnectionLock.active
      || this.followerConnectionLock.active
      || this.leaderConnectionLock.invalidating
      || this.followerConnectionLock.invalidating) {
      throw new Error(t('error.connection-changing'));
    }
    if (!this.leader.connected || !this.followerConnected()) {
      throw new Error(this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
        ? t('error.connect-leader-and-virtual-fl')
        : t('error.connect-leader-and-follower'));
    }
    const settings = readAndPersistSettings();
    if (!settings) return;
    const leaderConnectionId = this.leaderConnectionId;
    const followerConnectionId = this.followerConnectionId;
    const followerTargetType = this.followerTarget.type;
    const follower = this.follower;
    const assertStableConnection = () => {
      const physicalFollowerStable = followerTargetType !== FOLLOWER_TARGET_PHYSICAL
        || (this.follower === follower && this.followerConnectionId === followerConnectionId && follower?.connected);
      if (this.disconnectPromise
        || this.leaderConnectionLock.active
        || this.followerConnectionLock.active
        || this.leaderConnectionLock.invalidating
        || this.followerConnectionLock.invalidating
        || this.leaderConnectionId !== leaderConnectionId
        || this.followerTarget.type !== followerTargetType
        || !this.leader.connected
        || !this.followerConnected()
        || !physicalFollowerStable) {
        throw new Error(t('error.teleop-identity-changed'));
      }
    };
    assertStableConnection();
    this.running = true;
    renderRunState();
    try {
      this.teleop = await this.teleopLifecycle.start({
        suspend: (isAllowed) => this.suspendManualSessionsForTeleop(isAllowed),
        resume: (isAllowed) => this.resumeManualSessionsAfterTeleop(isAllowed),
        createTeleop: () => {
          assertStableConnection();
          return this.createTeleopController(settings);
        },
      });
      assertStableConnection();
      this.running = this.teleopLifecycle.phase === 'running';
      if (this.running) {
        log(this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
          ? tWithVars('log.teleop-start-virtual', { type: getLeaderType() })
          : tWithVars('log.teleop-start-physical', { type: getLeaderType() }));
      }
    } catch (error) {
      this.running = false;
      await this.teleopLifecycle.stop({ resume: false });
      this.teleop = null;
      throw error;
    } finally {
      renderRunState();
    }
  }

  async stop({ resume = true } = {}) {
    const hadTeleop = this.teleopLifecycle.phase !== 'idle' || Boolean(this.teleop || this.running);
    this.running = false;
    this.teleopRateMeter.reset();
    els.teleopFrequency.textContent = t('telemetry.not-running');
    await this.teleopLifecycle.stop({ resume: resume && hadTeleop });
    this.teleop = null;
    renderRunState();
    renderManualControlState();
    log(t('log.teleop-stopped'));
  }

  async emergencyStop() {
    this.running = false;
    const failures = [];
    try { await this.teleopLifecycle.stop({ resume: false }); }
    catch (error) { failures.push(error); }
    this.teleop = null;
    const sessions = Object.values(this.manualSessions).filter(Boolean);
    const results = await Promise.allSettled(sessions.map((session) => session.emergencyStop()));
    if (this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL) {
      log(t('log.virtual-fl-stopped'));
    }
    renderRunState();
    renderManualControlState();
    failures.push(...results
      .map((result, index) => ({ result, session: sessions[index] }))
      .filter(({ result, session }) => !session.readOnly && result.status === 'rejected')
      .map(({ result }) => result.reason));
    if (failures.length) {
      throw new Error(failures.map((error) => error?.message ?? t('error.unknown')).join('; '));
    }
    return sessions.filter((session) => !session.readOnly).length;
  }

  async handleBusLost(role, bus, error) {
    if (role === 'leader' || role === 'follower') {
      const lock = role === 'leader' ? this.leaderConnectionLock : this.followerConnectionLock;
      const session = this.manualSessions[role];
      const connectionId = role === 'leader' ? this.leaderConnectionId : this.followerConnectionId;
      const isCurrent = () => {
        if (role === 'leader') {
          return this.leader === bus
            && this.manualSessions.leader === session
            && this.leaderConnectionId === connectionId;
        }
        return this.follower === bus
          && this.manualSessions.follower === session
          && this.followerConnectionId === connectionId;
      };
      if (!isCurrent()) {
        await Promise.allSettled([session?.disconnect(), bus.disconnect()]);
        return;
      }
      if (role === 'follower') await Promise.resolve().then(() => trajectoryWorkspace.handleDisconnect(connectionId));
      this.running = false;
      await drainLostConnection({
        lock,
        session,
        stop: async () => {
          await this.teleopLifecycle.stop({ resume: false });
          this.teleop = null;
        },
        disconnectSession: async (capturedSession) => {
          await Promise.allSettled([capturedSession?.disconnect(), bus.disconnect()]);
        },
        isCurrent,
        clearCurrent: () => {
          this.manualSessions[role] = null;
          if (!(role === 'leader' && this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL)) {
            this.latestAngles[role] = null;
          }
          if (role === 'leader') {
            this.connectedLeaderProfile = null;
            this.leaderConnectionId = null;
          } else {
            this.followerConnectionId = null;
            if (this.follower === bus) this.follower = null;
          }
        },
      });
      if (role === 'leader' && this.followerTarget.type === FOLLOWER_TARGET_VIRTUAL) {
        log(t('log.leader-disconnected-virtual-fl-kept'));
      }
      invalidateTargetPreview(tWithVars('status.serial-device-lost', { name: bus.name }));
      log(userMessageForSerialError(error, bus.name));
      renderConnectionState();
      renderRunState();
      renderManualControlState();
      return;
    }
    bus.errorLogger(userMessageForSerialError(error, bus.name));
    bus.onStateChange();
  }

  async handleLoopError(error, role, bus) {
    try { log(tWithVars('error.loop-error', { message: error.message })); }
    catch (_) {}
    if (isDeviceLostError(error) && (role === 'leader' || role === 'follower') && bus) {
      bus.markLost(error, { force: true });
    }
  }

  async applyHdHoverIfNeeded() {
    const button = this.lastLeaderMonitors[7];
    const wasLocked = this.hdButtonLocked;
    this.hdButtonLocked = await applyHdHoverForConnectedLeader({
      profile: this.connectedLeaderProfile,
      buttonAngle: button?.angle,
      locked: this.hdButtonLocked,
      lockFrames: SERVO_IDS.slice(0, -1).map((id) => ServoProtocol.stopOnControlMode(id, 0x11, 0)),
      unlockFrame: ServoProtocol.stopOnControlMode(0xff, 0x10, 0),
      write: (frame) => this.writeLeaderControlFrame(frame),
    });
    if (!wasLocked && this.hdButtonLocked) log(t('log.hd-hover-locked'));
    if (wasLocked && !this.hdButtonLocked) log(t('log.hd-hover-unlocked'));
  }

  createManualSession(role, readOnly) {
    const bus = role === 'leader' ? this.leader : this.follower;
    if (!bus) throw new Error(tWithVars('error.serial-not-connected', { role: role === 'leader' ? 'Leader' : 'Follower' }));
    return new ArmManualControlSession({
      readOnly,
      servoIds: SERVO_IDS,
      readAngles: () => this.readBusAngles(role),
      write: (frame) => role === 'leader' ? this.writeLeaderControlFrame(frame) : bus.write(frame),
      onAngles: (angles) => {
        this.latestAngles[role] = [...angles];
        if (role === 'follower' && this.followerConnectionId) {
          const mapped = servoToModelAngles('FL', angles);
          trajectoryWorkspace.acceptReadback({
            connectionId: this.followerConnectionId,
            jointsRad: [mapped.joint1, mapped.joint2, mapped.joint3, mapped.joint4, mapped.joint5, mapped.joint6, mapped.joint7_left],
          });
        }
        if (selectedPoseRole() === role && !this.running) renderAngles(angles, role);
      },
      onStateChange: () => {
        renderManualControlState();
        renderTargetPermission();
      },
      onError: (error) => void this.handleLoopError(error, role, bus)
        .catch(() => {}),
      invalidateTarget: () => invalidateTargetPreview(tWithVars('status.control-mode-changed', { name: bus.name })),
      schedule: (callback, delayMs = Math.max(0, Number(els.loopInterval.value || 20))) => setTimeout(callback, delayMs),
      cancelSchedule: (handle) => clearTimeout(handle),
    });
  }

  async readBusAngles(role, extraServoIds = []) {
    const bus = role === 'leader' ? this.leader : this.follower;
    if (!bus) throw new Error(tWithVars('error.serial-not-connected', { role: role === 'leader' ? 'Leader' : 'Follower' }));
    const monitorIds = [...SERVO_IDS, ...extraServoIds.filter((id) => !SERVO_IDS.includes(id))];
    // 半双工总线上某个舵机偶发停答一帧就会让“必须凑齐全部 ID”的等待超时。
    // 这里做少量重试，并在最终仍缺失时“容忍缺失”：缺失舵机沿用上次角度，采集循环继续，
    // 避免单次丢包把整个姿态源循环打成 fault（其他工具能一直读正是因为它跳过缺失、继续读）。
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const snapshot = await this.readMonitorSnapshot(bus, monitorIds, role);
      if (snapshot.missingIds.length === 0) return snapshot.angles;
      if (attempt === maxAttempts - 1) {
        this.applyFallbackAngles(snapshot.angles, snapshot.missingIds, role);
        log(tWithVars('log.leader-read-partial', {
          name: bus.name,
          ids: snapshot.missingIds.join(', '),
        }));
        return snapshot.angles;
      }
      await delay(30);
    }
    // 理论不可达：保持与历史一致的回报
    return new Array(SERVO_IDS.length).fill(0);
  }

  async readMonitorSnapshot(bus, monitorIds, role) {
    // 丢弃上一轮残留的未消费回包，避免旧包被本轮误匹配
    bus.clearPackets();
    const request = ServoProtocol.syncServoMonitor(monitorIds);
    if (isRawLogEnabled()) log(tWithVars('log.tx-read-monitor', { name: bus.name, hex: toHex(request) }));
    await bus.write(request);
    await delay(8);
    const packets = [];
    const missingIds = [];
    for (const id of monitorIds) {
      try {
        const packet = await bus.waitForPacket((candidate) => {
          const monitor = parseMonitorPacket(candidate);
          return monitor && monitorIds.includes(monitor.id) && !packets.some((item) => parseMonitorPacket(item)?.id === monitor.id);
        }, getResponseTimeoutMs());
        packets.push(packet);
      } catch (error) {
        if (isDeviceLostError(error)) throw error;
        missingIds.push(id);
      }
    }
    const angles = new Array(SERVO_IDS.length).fill(0);
    const monitors = {};
    for (const packet of packets) {
      const monitor = parseMonitorPacket(packet);
      if (!monitor) continue;
      monitors[monitor.id] = monitor;
      if (SERVO_IDS.includes(monitor.id)) angles[monitor.id] = monitor.angle;
    }
    angles[angles.length - 1] = clampGripperAngle(angles[angles.length - 1]);
    if (role === 'leader') this.lastLeaderMonitors = monitors;
    return { angles, missingIds };
  }

  applyFallbackAngles(angles, missingIds, role) {
    // 容忍缺失：缺失舵机沿用上一次已知角度，保证模型不至于因单次停答而跳变
    const last = this.latestAngles[role] ?? new Array(SERVO_IDS.length).fill(0);
    for (const id of missingIds) {
      if (SERVO_IDS.includes(id) && Number.isFinite(last[id])) angles[id] = last[id];
    }
    angles[angles.length - 1] = clampGripperAngle(angles[angles.length - 1]);
  }

  async readLeaderAngles(extraServoIds = []) {
    return this.readBusAngles('leader', extraServoIds);
  }

  updateFrequency() {
    const now = performance.now();
    const sample = this.teleopRateMeter.tick(now);
    if (sample) {
      const freq = sample.hz;
      els.teleopFrequency.textContent = `${freq.toFixed(1)} Hz`;
      log(tWithVars('log.current-frequency', { freq: freq.toFixed(1) }));
      this.lastFreqTime = now;
    }
  }
}

const controller = new BrowserTeleopController();
let currentServoAngles = new Array(SERVO_IDS.length).fill(0);
let currentModelAngles = new Array(7).fill(0);
let planningModelAngles = null;
let planningPoseRole = null;
const jointSliderState = createJointSliderState(currentModelAngles);
const targetExecutionOwnership = new TargetExecutionOwnership();
let targetControlMode = 'joint';
let target = null;
let modelLoaded = false;
const commandExecution = new CommandExecutionController({
  write: async () => { throw new Error(t('error.confirm-requires-context')); },
});
const tcpDragCoordinator = new TcpDragPreviewCoordinator({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  evaluate: evaluateTcpDragTarget,
  onValid: applyValidTcpDrag,
  onInvalid: ({ lastValid }) => {
    if (lastValid) refreshTcpDragHandle(lastValid.position);
    showTargetState('error', t('status.current-drag-unreachable'), lastValid
      ? t('status.fallback-to-last-valid')
      : t('status.no-reachable-preview'));
  },
  onEnd: (lastValid) => {
    if (lastValid) showTargetState('ready', t('target.cyan-pending'), t('target.drag-ended-hint'));
  },
});
const robotModel = createRobotModel({
  canvas: els.robotCanvas,
  statusElement: els.modelLoadStatus,
  errorElement: els.modelLoadError,
  onError: (error) => log(tWithVars('error.model-error', { message: error.message })),
  onRenderFps: (fps) => { els.renderFps.textContent = `${fps.toFixed(1)} FPS`; },
});
const trajectoryWorkspace = createFlTrajectoryWorkspace({
  adapter: {
    connect: async () => {
      if (controller.followerConnected()) throw new Error(t('status.follower-serial-connected'));
      els.followerType.value = FOLLOWER_TARGET_PHYSICAL;
      syncFollowerTypeSwitch();
      controller.followerTarget.setType(FOLLOWER_TARGET_PHYSICAL);
      await controller.connectFollower();
    },
    disconnect: () => controller.disconnectFollower(),
    connectionSnapshot: () => ({
      connected: controller.followerTarget.type === FOLLOWER_TARGET_PHYSICAL && controller.follower?.connected,
      connectionId: controller.followerConnectionId,
      connectionToken: controller.follower,
    }),
    sessionState: () => controller.manualSessions.follower?.state ?? 'disconnected',
    pauseSampling: async () => {
      invalidateTargetPreview(t('status.trajectory-started'));
      if (controller.running) await controller.stop({ resume: false });
      await controller.manualSessions.follower?.pauseSampling();
    },
    resumeSampling: () => controller.manualSessions.follower?.resumeSampling(),
    releaseTorque: async (expectedConnectionId, expectedConnectionToken) => {
      const follower = controller.follower;
      if (
        !follower?.connected
        || !expectedConnectionId
        || expectedConnectionToken !== follower
        || controller.followerConnectionId !== expectedConnectionId
      ) {
        throw new Error(t('error.physical-fl-lost'));
      }
      for (const id of SERVO_IDS) {
        if (
          controller.follower !== follower
          || expectedConnectionToken !== follower
          || !follower.connected
          || controller.followerConnectionId !== expectedConnectionId
        ) {
          throw new Error(t('error.physical-fl-lost'));
        }
        await follower.write(ServoProtocol.releaseTorque(id));
      }
    },
    writeFrame: async (jointsRad, durationMs, expectedConnectionId, expectedConnectionToken) => {
      const follower = controller.follower;
      if (
        controller.followerTarget.type !== FOLLOWER_TARGET_PHYSICAL
        || !follower?.connected
        || !expectedConnectionId
        || expectedConnectionToken !== follower
        || controller.followerConnectionId !== expectedConnectionId
      ) {
        throw new Error(t('error.physical-fl-lost'));
      }
      const targets = {
        joint1: jointsRad[0], joint2: jointsRad[1], joint3: jointsRad[2],
        joint4: jointsRad[3], joint5: jointsRad[4], joint6: jointsRad[5],
        joint7_left: jointsRad[6], joint_right: -jointsRad[6],
      };
      const validation = validateJointTargets(targets, { mode: 'reject' });
      if (!validation.valid) throw new Error(tWithVars('error.joint-limit', { errors: validation.errors.join('; ') }));
      const servoAngles = modelToServoAngles('FL', targets);
      const frame = ServoProtocol.syncMultiTurnAngleByInterval(servoAngles, {
        servoIds: SERVO_IDS,
        interval: Math.max(1, Math.round(durationMs)),
        tAcc: 50,
        tDec: 50,
        power: 0,
      });
      if (
        controller.follower !== follower
        || expectedConnectionToken !== follower
        || !follower.connected
        || controller.followerConnectionId !== expectedConnectionId
      ) {
        throw new Error(t('error.physical-fl-lost'));
      }
      await follower.write(frame);
    },
    emergencyStop: async () => {
      invalidateTargetPreview(t('status.emergency-stopped'));
      controller.running = false;
      await controller.teleopLifecycle.stop({ resume: false });
      renderRunState();
      renderManualControlState();
    },
    previewPose: (jointsRad) => robotModel.preview(modelAngleRecord(jointsRad, jointsRad[6])),
    restoreReadbackPose: () => robotModel.preview(null),
  },
});
robotModel.load().then(() => {
  modelLoaded = true;
  renderTargetPermission();
}).catch(() => {});
els.resetCamera.addEventListener('click', () => robotModel.resetCamera());
els.fitCamera.addEventListener('click', () => robotModel.fitCamera());
els.fullscreenScene.addEventListener('click', () => els.robotViewport.requestFullscreen?.());
[els.poseSourceLeader, els.poseSourceFollower].forEach((input) => input.addEventListener('change', () => {
  syncDisplayedModel(t('status.pose-source-changed'));
}));
els.leaderType.addEventListener('change', () => syncDisplayedModel(t('status.leader-type-changed')));
els.jointSliderInputs.forEach((input, index) => input.addEventListener('input', () => {
  els.jointAngleInputs[index].value = input.value;
  previewJointSliders();
}));
els.jointAngleInputs.forEach((input, index) => input.addEventListener('change', () => {
  try {
    const degrees = parseJointInputDegrees(index + 1, input.value);
    els.jointSliderInputs[index].value = String(degrees);
    previewJointSliders();
  } catch (error) {
    showTargetState('error', t('status.invalid-joint-input'), error.message);
    syncJointSliders(jointSliderState.values());
  }
}));
els.previewTarget.addEventListener('click', previewTarget);
els.exitTcpControl.addEventListener('click', () => runAction(exitWorldCoordinateControl));
els.targetModeButtons.forEach((button) => button.addEventListener('click', () => runAction(() => switchTargetControlMode(button.dataset.targetMode))));
els.confirmTarget.addEventListener('click', () => runTargetAction(confirmTarget));
els.cancelTarget.addEventListener('click', cancelTargetPreview);
els.emergencyStop.addEventListener('click', () => {
  beginEmergencyStop();
  void runEmergencyStop();
});
els.loopInterval.addEventListener('change', readAndPersistSettings);
els.filterSize.addEventListener('change', readAndPersistSettings);
window.addEventListener('beforeunload', () => {
  void trajectoryWorkspace.stop()
    .catch((error) => {
      try { log(tWithVars('error.generic', { message: error.message })); }
      catch (_) {}
    });
  robotModel.destroy();
}, { once: true });

els.connectLeader.addEventListener('click', () => withButtonFeedback(els.connectLeader, () => runAction(() => controller.connectLeader()), { label: '正在选择并连接…', restore: renderConnectionState }));
els.connectFollower.addEventListener('click', () => withButtonFeedback(els.connectFollower, () => runAction(() => controller.connectFollower()), { label: '正在选择并连接…', restore: renderConnectionState }));
function syncFollowerTypeSwitch() {
  const type = els.followerType.value;
  const disabled = els.followerType.disabled;
  els.followerTypeSwitch.dataset.followerType = type;
  els.followerTypeSwitch.dataset.disabled = String(disabled);
  els.followerTypePhysical.disabled = disabled;
  els.followerTypeVirtual.disabled = disabled;
  els.followerTypePhysical.setAttribute('aria-pressed', String(type === FOLLOWER_TARGET_PHYSICAL));
  els.followerTypeVirtual.setAttribute('aria-pressed', String(type === FOLLOWER_TARGET_VIRTUAL));
}
function selectFollowerType(type) {
  if (els.followerType.disabled || els.followerType.value === type) return;
  els.followerType.value = type;
  els.followerType.dispatchEvent(new Event('change', { bubbles: true }));
}
els.followerTypePhysical.addEventListener('click', () => selectFollowerType(FOLLOWER_TARGET_PHYSICAL));
els.followerTypeVirtual.addEventListener('click', () => selectFollowerType(FOLLOWER_TARGET_VIRTUAL));
els.followerType.addEventListener('change', () => {
  if (!controller.running && !controller.followerConnected() && !controller.followerConnectionLock.active) {
    controller.followerTarget.setType(els.followerType.value);
    invalidateTargetPreview(t('status.follower-type-changed'));
    renderConnectionState();
    renderRunState();
    renderManualControlState();
    renderTargetPermission();
    syncFollowerTypeSwitch();
    return;
  }
  els.followerType.value = controller.followerTarget.type;
  syncFollowerTypeSwitch();
});
els.virtualFollowerModel.addEventListener('change', () => {
  if (!controller.running && !controller.followerConnected() && !controller.followerConnectionLock.active) {
    controller.followerTarget.setVirtualModel(els.virtualFollowerModel.value);
    els.poseSourceFollower.checked = true;
    syncDisplayedModel(t('status.virtual-follower-model-changed'));
    renderConnectionState();
    renderRunState();
    return;
  }
  els.virtualFollowerModel.value = controller.followerTarget.virtualModel;
});
els.disconnectAll.addEventListener('click', () => runAction(() => controller.disconnectAll()));
els.enterSliderControl.addEventListener('click', () => runAction(enterSelectedSliderControl));
els.exitSliderControl.addEventListener('click', () => runAction(exitSelectedSliderControl));
els.start.addEventListener('click', () => runAction(() => controller.start()));
els.stop.addEventListener('click', () => runAction(() => controller.stop()));
els.connectResetArm.addEventListener('click', () => withButtonFeedback(els.connectResetArm, () => runResetAction(() => controller.connectResetArm()), { label: '正在选择并连接…', restore: renderResetState }));
els.disconnectResetArm.addEventListener('click', () => runResetAction(() => controller.disconnectResetArm()));
els.resetOrigin.addEventListener('click', openResetConfirmDialog);
els.cancelResetOrigin.addEventListener('click', closeResetConfirmDialog);
els.confirmResetOrigin.addEventListener('click', () => {
  closeResetConfirmDialog();
  runResetOriginAction(() => controller.resetOriginPoints());
});
els.resetConfirmDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeResetConfirmDialog(); });
els.connectFactoryArm.addEventListener('click', () => withButtonFeedback(els.connectFactoryArm, () => runFactoryAction(() => controller.connectFactoryArm()), { label: '正在选择并连接…', restore: renderFactoryState }));
els.disconnectFactoryArm.addEventListener('click', () => runFactoryAction(() => controller.disconnectFactoryArm()));
els.restoreFactory.addEventListener('click', openFactoryConfirmDialog);
els.cancelFactoryRestore.addEventListener('click', closeFactoryConfirmDialog);
els.confirmFactoryRestore.addEventListener('click', () => { closeFactoryConfirmDialog(); runFactoryAction(() => controller.restoreFactory()); });
els.factoryConfirmDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeFactoryConfirmDialog(); });
for (const tab of els.tabs) tab.addEventListener('click', () => { if (!tab.classList.contains('active')) void navigateConsoleTab(tab.dataset.tab); });

const navigateConsoleTab = createPageNavigator({
  release: () => releaseWorkbenchConnections(2),
  activate: activateTab,
  onPending: (name, busy) => {
    consoleNavigationPending = busy;
    for (const tab of els.tabs) { tab.disabled = busy; if (busy && tab.dataset.tab === name) tab.setAttribute('aria-busy', 'true'); else tab.removeAttribute('aria-busy'); }
    if (busy) setInteractionStatus('正在停止当前控制并断开串口…');
    else if (document.getElementById('interaction-status')?.dataset.kind !== 'error') setInteractionStatus('');
    renderResetState(); renderFactoryState();
  },
  onError: error => { setInteractionStatus(`切换未完成：${error.message}`, 'error'); log(error.message); },
});

const savedSettings = loadSettings(localStorage);
els.loopInterval.value = String(savedSettings.loopIntervalMs);
els.filterSize.value = String(savedSettings.filterWindow);
syncDisplayedModel(null);
renderConnectionState();
renderRunState();
renderManualControlState();
renderAngles(new Array(SERVO_IDS.length).fill(0));
syncJointSliders(currentModelAngles);
initializeTargetInput();
renderTargetControlMode();
renderVersion();
renderResetState();
renderFactoryState();

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    log(tWithVars('error.generic', { message: error.message }));
    setInteractionStatus(error.message, 'error');
  } finally {
    renderConnectionState();
    renderRunState();
    renderManualControlState();
    renderTargetPermission();
  }
}

async function runTargetAction(action) {
  try {
    await action();
  } catch (error) {
    showTargetState('error', t('error.control-command-failed'), error.message);
    log(tWithVars('error.control-command-failed-detail', { message: error.message }));
  } finally {
    renderTargetPermission();
  }
}

async function runEmergencyStop() {
  els.emergencyStatus.classList.remove('is-error', 'is-stopped');
  try {
    const emergencyErrors = [];
    try { await trajectoryWorkspace.handleEmergency(); }
    catch (error) { emergencyErrors.push(error); }
    let busCount = 0;
    try { busCount = await controller.emergencyStop(); }
    catch (error) { emergencyErrors.push(error); }
    if (emergencyErrors.length) throw new AggregateError(emergencyErrors, emergencyErrors.map((error) => error.message).join('; '));
    els.emergencyStatus.textContent = busCount
      ? tWithVars('log.emergency-sent', { count: busCount })
      : t('log.emergency-no-buses');
    els.emergencyStatus.classList.add('is-stopped');
    showTargetState('stopped', t('log.emergency-stopped'), els.emergencyStatus.textContent);
    log(els.emergencyStatus.textContent);
  } catch (error) {
    els.emergencyStatus.textContent = tWithVars('error.emergency-failed-detail', { message: error.message });
    els.emergencyStatus.classList.add('is-error');
    showTargetState('error', t('error.emergency-has-errors'), error.message);
    log(els.emergencyStatus.textContent);
  } finally {
    controller.controlGeneration.finishEmergencyStop();
    renderManualControlState();
    renderTargetPermission();
  }
}

function beginEmergencyStop() {
  controller.controlGeneration.beginEmergencyStop();
  invalidateTargetPreview(t('status.emergency-triggered'));
}

async function runResetAction(action) {
  try {
    await action();
  } catch (error) {
    resetLog(tWithVars('error.generic', { message: error.message }));
    if (isDeviceLostError(error)) controller.resetBus.markLost(error);
  } finally {
    renderResetState();
    renderRunState();
  }
}

async function runResetOriginAction(action) {
  try {
    await action();
  } catch (error) {
    resetLog(tWithVars('error.generic', { message: error.message }));
    showResetOperationNotice('error', t('error.setting-failed'), error.message);
    if (isDeviceLostError(error)) controller.resetBus.markLost(error);
  } finally {
    renderResetState();
    renderRunState();
  }
}

async function runFactoryAction(action) {
  try {
    await action();
  } catch (error) {
    factoryLog(tWithVars('error.generic', { message: error.message }));
    if (isDeviceLostError(error)) controller.factoryBus.markLost(error);
  } finally {
    renderFactoryState();
    renderConnectionState();
    renderRunState();
  }
}

function openFactoryConfirmDialog() {
  if (!controller.factoryBus.connected || controller.restoringFactory) return;
  els.factoryConfirmModel.textContent = factoryModelName(els.factoryModel.value);
  els.factoryConfirmDialog.showModal();
}

function closeFactoryConfirmDialog() {
  if (els.factoryConfirmDialog.open) els.factoryConfirmDialog.close();
}

function openResetConfirmDialog() {
  if (!controller.resetBus.connected || controller.resettingOrigin) return;
  els.resetConfirmDialog.showModal();
}

function closeResetConfirmDialog() {
  if (els.resetConfirmDialog.open) els.resetConfirmDialog.close();
}

const sharedPanelHomes = {
  scene: { parent: els.robotScenePanel.parentNode, next: els.robotScenePanel.nextSibling },
};
let teleopPoseRoleBeforeTrajectory = selectedPoseRole();

function mountSharedTrajectoryPanels(name) {
  if (name === 'trajectory') {
    teleopPoseRoleBeforeTrajectory = selectedPoseRole();
    els.poseSourceFollower.checked = true;
    syncDisplayedModel(t('status.trajectory-fixed-model'));
    els.trajectorySceneHost.append(els.robotScenePanel);
  } else {
    if (selectedPoseRole() !== teleopPoseRoleBeforeTrajectory) {
      (teleopPoseRoleBeforeTrajectory === 'follower' ? els.poseSourceFollower : els.poseSourceLeader).checked = true;
      syncDisplayedModel(t('status.restored-pose-source'));
    }
    sharedPanelHomes.scene.parent.insertBefore(els.robotScenePanel, sharedPanelHomes.scene.next);

  }
  requestAnimationFrame(() => robotModel.resize());
}

async function activateTab(name) {
  if ((controller.resettingOrigin && name !== 'reset-origin') || (controller.restoringFactory && name !== 'factory-restore')) {
    (controller.restoringFactory ? factoryLog : resetLog)(t('error.operation-in-progress'));
    return;
  }
  if (name !== 'trajectory' && document.querySelector('#trajectoryView').classList.contains('active')) {
    await trajectoryWorkspace.stop();
  }
  applyTab(name);
}

function applyTab(name) {
  if (name !== 'trajectory') trajectoryWorkspace.revokePreview('navigation');
  for (const tab of els.tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  mountSharedTrajectoryPanels(name);
  els.teleopView.classList.toggle('active', name === 'teleop');
  document.querySelector('#trajectoryView').classList.toggle('active', name === 'trajectory');
  els.resetOriginView.classList.toggle('active', name === 'reset-origin');
  els.factoryRestoreView.classList.toggle('active', name === 'factory-restore');
  els.servoSetupView.classList.toggle('active', name === 'servo-setup');
}

function renderVersion() {
  els.appVersion.textContent = APP_VERSION;
}

function renderConnectionState() {
  const virtualFollower = controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL;
  const virtualB601 = virtualFollower && controller.followerTarget.virtualModel === VIRTUAL_MODEL_REBOT_B601;
  const followerConnected = controller.followerConnected();
  const leaderConnecting = controller.leaderConnectionLock.active;
  const followerConnecting = controller.followerConnectionLock.active;
  const connectionPending = leaderConnecting || followerConnecting;
  const disconnecting = Boolean(controller.disconnectPromise);
  els.leaderStatus.textContent = leaderConnecting ? t('status.leader-connecting') : (controller.leader.connected ? t('status.leader-connected') : t('status.leader-not-connected'));
  els.followerStatus.textContent = followerConnecting
    ? (virtualFollower ? t('status.virtual-fl-connecting') : t('status.physical-fl-connecting'))
    : virtualFollower
      ? (followerConnected
        ? (virtualB601 ? t('status.connected-virtual-b601') : t('status.connected-virtual-fl'))
        : (virtualB601 ? t('status.not-connected-virtual-b601') : t('status.not-connected-virtual-fl')))
      : (controller.follower?.connected ? t('status.physical-fl-connected') : t('status.physical-fl-not-connected'));
  els.connectFollower.textContent = virtualFollower ? t('btn.connect-virtual-fl') : t('btn.connect-follower');
  els.virtualFollowerNotice.hidden = controller.followerTarget.type !== FOLLOWER_TARGET_VIRTUAL;
  els.virtualFollowerModelField.hidden = !virtualFollower;
  els.b601VirtualNotice.hidden = !virtualB601;
  els.connectLeader.disabled = controller.leader.connected || leaderConnecting || disconnecting || controller.resetBus.connected || controller.factoryBus.connected;
  els.connectFollower.disabled = followerConnected || followerConnecting || disconnecting || controller.resetBus.connected || controller.factoryBus.connected;
  els.disconnectAll.disabled = disconnecting || (!controller.leader.connected && !followerConnected && !connectionPending);
  els.leaderType.disabled = disconnecting || isLeaderTypeLocked({ leaderConnected: controller.leader.connected || leaderConnecting, running: controller.running });
  els.followerType.disabled = disconnecting || followerConnected || followerConnecting || controller.running;
  syncFollowerTypeSwitch();
  els.virtualFollowerModel.disabled = !virtualFollower || disconnecting || followerConnected || followerConnecting || controller.running;
  trajectoryWorkspace.refreshConnection();
}

function renderRunState() {
  const followerConnected = controller.followerConnected();
  const leaderConnecting = controller.leaderConnectionLock.active;
  const followerConnecting = controller.followerConnectionLock.active;
  const disconnecting = Boolean(controller.disconnectPromise);
  els.runStatus.textContent = controller.running
    ? (controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
      ? (controller.followerTarget.virtualModel === VIRTUAL_MODEL_REBOT_B601
        ? t('status.leader-to-virtual-b601')
        : t('status.leader-to-virtual-fl-running'))
      : t('status.leader-to-physical-fl-running'))
    : (controller.leaderReadRunning ? t('status.readonly-testing') : t('status.not-started'));
  els.start.disabled = disconnecting || controller.running || followerConnecting || controller.leaderReadRunning || controller.resetBus.connected || controller.factoryBus.connected || !controller.leader.connected || !followerConnected;
  els.stop.disabled = !controller.running;
  els.connectLeader.disabled = controller.leader.connected || leaderConnecting || disconnecting || controller.resetBus.connected || controller.factoryBus.connected;
  els.connectFollower.disabled = followerConnected || followerConnecting || disconnecting || controller.resetBus.connected || controller.factoryBus.connected;
  els.loopInterval.disabled = controller.running || controller.leaderReadRunning;
  els.filterSize.disabled = controller.running || controller.leaderReadRunning;
  els.leaderType.disabled = disconnecting || isLeaderTypeLocked({ leaderConnected: controller.leader.connected || leaderConnecting, running: controller.running || controller.leaderReadRunning });
  els.followerType.disabled = disconnecting || followerConnected || followerConnecting || controller.running;
  syncFollowerTypeSwitch();
  els.virtualFollowerModel.disabled = controller.followerTarget.type !== FOLLOWER_TARGET_VIRTUAL || disconnecting || followerConnected || followerConnecting || controller.running;
  trajectoryWorkspace.refreshConnection();
}

function selectedPoseRole() {
  return els.poseSourceFollower.checked ? 'follower' : 'leader';
}

function selectedManualSession() {
  if (selectedPoseRole() === 'follower' && controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL) return null;
  return controller.manualSessions[selectedPoseRole()];
}

function selectedDisplayModelKey() {
  if (selectedPoseRole() === 'follower'
    && controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
    && controller.followerTarget.virtualModel === VIRTUAL_MODEL_REBOT_B601) return MODEL_CONFIGS.b601.key;
  if (selectedPoseRole() === 'follower'
    && controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
    && controller.followerTarget.virtualModel === VIRTUAL_MODEL_GALAXEA_A1Z) return MODEL_CONFIGS.a1z.key;
  return resolveDisplayModelKey({ role: selectedPoseRole(), leaderType: getLeaderType() });
}

function selectedDisplayModelName() {
  if (selectedPoseRole() === 'follower') {
    return controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
      && controller.followerTarget.virtualModel === VIRTUAL_MODEL_REBOT_B601
      ? 'reBot Arm B601'
      : controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL
        && controller.followerTarget.virtualModel === VIRTUAL_MODEL_GALAXEA_A1Z
        ? t('model.a1z')
        : 'Star Arm 102-FL';
  }
  // Leader 型号：直接返回 select 中显示的文本（如 "U25", "U45" 等）
  const selectedOption = els.leaderType.options[els.leaderType.selectedIndex];
  return selectedOption ? selectedOption.text.split('(')[0].trim() : 'Star Arm 102-LD';
}

function selectedDisplayProfile() {
  if (selectedDisplayModelKey() === MODEL_CONFIGS.b601.key) {
    return {
      code: 'B601',
      name: 'reBot Arm B601',
      role: 'follower',
      canCommand: false,
      permissionNote: t('notice.virtual-b601'),
    };
  }
  if (selectedDisplayModelKey() === MODEL_CONFIGS.a1z.key) {
    return {
      code: 'A1Z',
      name: t('model.a1z'),
      role: 'follower',
      canCommand: false,
      permissionNote: t('notice.virtual-a1z'),
    };
  }
  return getRobotProfile(selectedPoseRole() === 'leader' ? getLeaderProfileCode() : 'FL');
}

function selectedRoleMatchesModel() {
  const profile = selectedDisplayProfile();
  return (selectedPoseRole() === 'leader' && profile.code === 'HD')
    || (selectedPoseRole() === 'leader' && profile.code === 'LD')
    || (selectedPoseRole() === 'follower' && ['FL', 'B601', 'A1Z'].includes(profile.code));
}

async function enterSelectedSliderControl() {
  const session = selectedManualSession();
  if (!session) throw new Error(t('error.connect-pose-source-first'));
  if (!selectedRoleMatchesModel()) throw new Error(t('error.model-mismatch'));
  const angles = await session.enterSliderControl();
  if (angles) {
    renderAngles(angles, selectedPoseRole());
    syncJointSliders(currentModelAngles);
  }
  log(tWithVars('log.entered-slider-control', { role: selectedPoseRole() === 'leader' ? 'HD Leader' : 'FL Follower' }));
  renderManualControlState();
}

async function exitSelectedSliderControl() {
  const session = selectedManualSession();
  if (!session) throw new Error(t('error.pose-source-not-connected'));
  await session.exitSliderControl();
  log(tWithVars('log.exited-slider-control', { role: selectedPoseRole() === 'leader' ? 'HD Leader' : 'FL Follower' }));
  renderManualControlState();
}

async function exitWorldCoordinateControl() {
  invalidateTargetPreview(t('status.exited-tcp-control'));
  await exitSelectedSliderControl();
  targetControlMode = 'joint';
  renderTargetControlMode();
  renderTargetPermission();
}

function renderManualControlState() {
  const session = selectedManualSession();
  const states = {
    disconnected: t('status.waiting'), connecting: t('status.establishing-damping'), manual_readback: t('status.damping-readback'),
    entering_slider: t('status.entering-slider'), slider_control: t('status.slider-control-locked'), exiting_slider: t('status.exiting-slider'),
    teleoperation: t('status.teleop-occupied'), fault: t('status.mode-fault'),
  };
  els.manualModeStatus.textContent = session?.readOnly && session?.state === 'manual_readback'
    ? t('status.ld-readonly')
    : (states[session?.state ?? 'disconnected'] ?? session?.state);
  const matches = selectedRoleMatchesModel();
  els.enterSliderControl.disabled = !session || session.readOnly || session.state !== 'manual_readback' || !matches || controller.running;
  els.exitSliderControl.disabled = !session || session.state !== 'slider_control' || controller.running;
  renderJointSliderPermission();
}

function readAndPersistSettings() {
  try {
    const normalized = normalizeControlSettings({
      loopIntervalMs: els.loopInterval.valueAsNumber,
      filterWindow: els.filterSize.valueAsNumber,
    });
    saveSettings(localStorage, normalized);
    els.loopInterval.value = String(normalized.loopIntervalMs);
    els.filterSize.value = String(normalized.filterWindow);
    els.settingsError.hidden = true;
    els.settingsError.textContent = '';
    return normalized;
  } catch (error) {
    const fallback = loadSettings(localStorage);
    els.loopInterval.value = String(fallback.loopIntervalMs);
    els.filterSize.value = String(fallback.filterWindow);
    els.settingsError.textContent = tWithVars('error.settings-invalid', { message: error.message });
    els.settingsError.hidden = false;
    return null;
  }
}

function renderModelPermission() {
  const profile = selectedDisplayProfile();
  const roleText = selectedPoseRole() === 'leader' ? 'Leader' : 'Follower';
  els.displayedModelStatus.textContent = `${roleText} · ${profile.name}`;
  els.modelPermission.textContent = profile.permissionNote ?? tWithVars('model.allows-control', { name: profile.name });
  els.modelPermission.dataset.canCommand = String(profile.canCommand);
  renderTargetPermission();
}

function syncDisplayedModel(reason = t('status.display-model-changed')) {
  if (reason) invalidateTargetPreview(reason);
  if (targetControlMode === 'tcp' && selectedDisplayProfile().code !== 'FL') targetControlMode = 'joint';
  const role = selectedPoseRole();
  const angles = controller.latestAngles[role] ?? new Array(SERVO_IDS.length).fill(0);
  robotModel.setModel(MODEL_CONFIGS[selectedDisplayModelKey()]).then(() => {
    if (selectedPoseRole() !== role) return;
    renderAngles(angles, role);
    renderTargetPermission();
  }).catch((error) => log(tWithVars('error.model-switch-failed', { model: selectedDisplayModelName(), message: error.message })));
  renderAngles(angles, role);
  renderModelPermission();
  renderManualControlState();
}

function syncJointSliders(angles = currentModelAngles) {
  const normalized = jointSliderState.replace(angles);
  els.jointSliderInputs.forEach((input, index) => {
    const degrees = normalized[index] * 180 / Math.PI;
    input.value = degrees.toFixed(1);
    els.jointAngleInputs[index].value = degrees.toFixed(1);
    els.jointSliderValues[index].textContent = `${degrees.toFixed(1)}°`;
  });
}

function renderTargetControlMode() {
  const busy = targetExecutionOwnership.locked || commandExecution.status === 'sending';
  for (const button of els.targetModeButtons) {
    const active = button.dataset.targetMode === targetControlMode;
    const tcpUnavailable = button.dataset.targetMode === 'tcp' && selectedDisplayProfile().code !== 'FL';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.disabled = busy || tcpUnavailable;
    button.title = tcpUnavailable ? t('notice.tcp-fl-only') : '';
  }
  for (const view of els.targetModeViews) view.hidden = view.dataset.targetModeView !== targetControlMode;
  els.targetSourceLabel.textContent = targetControlMode === 'joint' ? t('control.current-joint') : t('control.current-tcp');
  els.confirmTarget.textContent = targetControlMode === 'joint' ? t('control.confirm-joint') : t('control.confirm-tcp');
}

async function switchTargetControlMode(mode) {
  if (!['joint', 'tcp'].includes(mode) || mode === targetControlMode) return;
  if (mode === 'tcp' && selectedDisplayProfile().code !== 'FL') {
    showTargetState('error', t('error.tcp-unavailable'), t('notice.tcp-fl-only'));
    return;
  }
  if (targetExecutionOwnership.locked || commandExecution.status === 'sending') return;
  const session = selectedManualSession();
  if (mode === 'tcp' && session?.state === 'manual_readback') {
    await enterSelectedSliderControl();
  }
  if (mode === 'tcp' && session && session.state !== 'slider_control') return;
  invalidateTargetPreview(t('status.control-mode-switched'));
  targetControlMode = mode;
  renderTargetControlMode();
  renderTargetPermission();
}

function renderJointSliderPermission(resolved = resolveTargetConnection()) {
  const busy = targetExecutionOwnership.locked || commandExecution.status === 'sending';
  const session = selectedManualSession();
  const sliderReady = session?.state === 'slider_control' && selectedRoleMatchesModel();
  const enabled = Boolean(targetControlMode === 'joint' && resolved.profile.canCommand && !resolved.reason && sliderReady && !busy && !controller.controlGeneration.emergencyStopping);
  const reason = targetControlMode !== 'joint'
    ? t('control.current-tcp-mode')
    : resolved.reason
      ?? (!sliderReady ? t('control.enter-slider-first') : null)
      ?? (busy ? t('control.command-sending') : t('control.emergency-processing'));
  els.jointSliderPermission.textContent = enabled ? tWithVars('control.edit-preview', { name: resolved.profile.name }) : reason;
  els.jointSliderPermission.dataset.canCommand = String(enabled);
  for (const input of els.jointSliderInputs) input.disabled = !enabled;
  for (const input of els.jointAngleInputs) input.disabled = !enabled;
}

function previewJointSliders() {
  if (targetControlMode !== 'joint') return;
  const resolved = resolveTargetConnection();
  if (resolved.reason || controller.controlGeneration.emergencyStopping || targetExecutionOwnership.locked || commandExecution.status === 'sending') {
    renderJointSliderPermission(resolved);
    return;
  }
  const requestedDegrees = els.jointSliderInputs.map((input) => input.valueAsNumber);
  invalidateTargetPreview(t('status.generating-slider-preview'));
  try {
    const angles = requestedDegrees.map((degrees, index) => jointSliderState.setJoint(index + 1, degrees * Math.PI / 180)[index]);
    syncJointSliders(angles);
    const durationMs = els.targetDuration.valueAsNumber;
    const pending = commandExecution.preview({
      profileCode: resolved.profile.code,
      connectionId: resolved.connectionId,
      modelAngles: angles,
      currentGripperAngle: currentServoAngles[6],
      durationMs,
    });
    const targetPosition = forwardKinematics(angles.slice(0, 6)).position;
    target = {
      ...resolved,
      pending,
      solution: { angles, positionError: 0, iterations: 0 },
      targetPosition,
      millimetres: targetPosition.map((value) => value * 1000),
      durationMs,
      source: 'joint',
      controlToken: controller.controlGeneration.capture(),
    };
    robotModel.preview(modelAngleRecord(angles));
    renderTargetSolution(target);
    showTargetState('ready', t('status.slider-target-pending'), t('status.slider-drag-preview'));
  } catch (error) {
    invalidateTargetPreview(error.message);
    showTargetState('error', t('error.slider-preview-failed'), error.message);
  } finally {
    renderTargetPermission();
  }
}

function initializeTargetInput() {
  const position = forwardKinematics(currentModelAngles.slice(0, 6)).position;
  [els.tcpX, els.tcpY, els.tcpZ].forEach((input, index) => { input.value = (position[index] * 1000).toFixed(1); });
}

function modelAngleRecord(angles, gripperRadians = angles[6] ?? currentServoAngles[6] * Math.PI / 180) {
  const displayKey = selectedDisplayModelKey();
  const a1z = displayKey === MODEL_CONFIGS.a1z.key;
  const b601 = displayKey === MODEL_CONFIGS.b601.key;

  if (displayKey === PIPER_MODEL_KEY) {
    // PiPER Mate 姿态源：滑块预览不会出现在该型号上，防御性按映射生成记录（角度按度传入）
    return servoToModelAngles('PIPER', angles.map((angle) => angle * 180 / Math.PI));
  }
  if (a1z) {
    // A1Z: 6 自由度 + 夹爪跟随
    return {
      arm_joint1: angles[0], arm_joint2: angles[1], arm_joint3: angles[2],
      arm_joint4: angles[3], arm_joint5: angles[4], arm_joint6: angles[5],
      // 夹爪跟随 Leader J7
      gripper_finger_left_joint: gripperRadians,
      gripper_finger_right_joint: -gripperRadians,
    };
  }
  
  if (b601) {
    // B601: 6 自由度，夹爪固定
    return {
      joint1: angles[0], joint2: angles[1], joint3: angles[2],
      joint4: angles[3], joint5: angles[4], joint6: angles[5],
      // 夹爪固定为 0
    };
  }
  
  // Star Arm 102 FL/LD: 7 自由度（含夹爪）
  return {
    joint1: angles[0], joint2: angles[1], joint3: angles[2],
    joint4: angles[3], joint5: angles[4], joint6: angles[5],
    joint7_left: gripperRadians, joint_right: -gripperRadians,
  };
}

function resolveTargetConnection() {
  const profile = selectedDisplayProfile();
  const role = selectedPoseRole();
  const session = selectedManualSession();
  if (role === 'follower' && controller.followerTarget.type === FOLLOWER_TARGET_VIRTUAL) {
    return { profile, bus: null, connectionId: null, role, session: null, reason: t('reason.virtual-fl-only') };
  }
  if (targetControlMode === 'tcp' && profile.code !== 'FL') return { profile, bus: null, connectionId: null, role, session, reason: t('reason.tcp-fl-only') };
  if (!profile.canCommand) return { profile, bus: null, connectionId: null, role, session, reason: t('reason.no-power-leader') };
  if (!selectedRoleMatchesModel()) return { profile, bus: null, connectionId: null, role, session, reason: t('reason.model-mismatch') };
  if (profile.code === 'HD') {
    if (!controller.leader.connected) return { profile, bus: null, connectionId: null, role, session, reason: t('reason.hd-leader-not-connected') };
    if (controller.connectedLeaderProfile?.code !== 'HD') return { profile, bus: null, connectionId: null, role, session, reason: t('reason.not-hd-leader') };
    if (session?.state !== 'slider_control') return { profile, bus: controller.leader, connectionId: controller.leaderConnectionId, role, session, reason: t('reason.enter-hd-slider-first') };
    return { profile, bus: controller.leader, connectionId: controller.leaderConnectionId, role, session, reason: null };
  }
  if (!controller.follower?.connected) return { profile, bus: null, connectionId: null, role, session, reason: t('reason.fl-follower-not-connected') };
  if (session?.state !== 'slider_control') return { profile, bus: controller.follower, connectionId: controller.followerConnectionId, role, session, reason: t('reason.enter-fl-slider-first') };
  return { profile, bus: controller.follower, connectionId: controller.followerConnectionId, role, session, reason: null };
}

function currentPlanningAngles() {
  return planningModelAngles ?? currentModelAngles;
}

function adoptConfirmedTargetAsPlanningPose(executionOwner) {
  const commandedAngles = executionOwner.solution.angles;
  planningModelAngles = commandedAngles.length >= 7
    ? commandedAngles.slice(0, 7)
    : [...commandedAngles.slice(0, 6), currentModelAngles[6]];
  planningPoseRole = executionOwner.role;
  const position = forwardKinematics(planningModelAngles.slice(0, 6)).position;
  robotModel.update(modelAngleRecord(planningModelAngles));
  robotModel.preview(null);
  syncJointSliders(planningModelAngles);
  [els.tcpX, els.tcpY, els.tcpZ].forEach((input, index) => { input.value = (position[index] * 1000).toFixed(1); });
  refreshTcpDragHandle(position);
}

function refreshTcpDragHandle(position = target?.targetPosition ?? forwardKinematics(currentPlanningAngles().slice(0, 6)).position) {
  const resolved = resolveTargetConnection();
  const busy = targetExecutionOwnership.locked || commandExecution.status === 'sending';
  const dragEnabled = Boolean(targetControlMode === 'tcp' && modelLoaded && !resolved.reason && !busy && !controller.controlGeneration.emergencyStopping);
  const orientationAngles = target?.source === 'tcp' && target.solution?.angles
    ? target.solution.angles
    : currentPlanningAngles().slice(0, 6);
  const orientation = matrixToQuaternion(forwardKinematics(orientationAngles.slice(0, 6)).matrix);
  tcpDragCoordinator.setEnabled(dragEnabled, resolved.reason ?? t('reason.target-control-unavailable'));
  robotModel.setTcpDragHandle({
    position,
    orientation,
    enabled: dragEnabled,
    visible: targetControlMode === 'tcp' && modelLoaded,
    onDrag: (nextPosition) => {
      if (!tcpDragCoordinator.dragging) tcpDragCoordinator.begin({ hitHandle: true });
      tcpDragCoordinator.move(nextPosition);
    },
    onDragEnd: (nextPosition) => {
      if (!tcpDragCoordinator.dragging) tcpDragCoordinator.begin({ hitHandle: true });
      tcpDragCoordinator.end(nextPosition);
    },
    onDragError: (error) => {
      if (tcpDragCoordinator.dragging) tcpDragCoordinator.cancel(error.message);
    },
  });
  return { resolved, busy, dragEnabled };
}

function renderTargetPermission() {
  const { resolved, busy, dragEnabled } = refreshTcpDragHandle();
  renderJointSliderPermission(resolved);
  renderTargetControlMode();
  els.targetPermission.textContent = targetControlMode !== 'tcp' ? t('control.joint-mode') : (resolved.reason ?? tWithVars('control.drag-confirm', { name: resolved.profile.name }));
  els.targetPermission.dataset.canCommand = String(targetControlMode === 'tcp' && dragEnabled);
  const tcpDisabled = targetControlMode !== 'tcp' || Boolean(resolved.reason) || busy;
  for (const input of [els.tcpX, els.tcpY, els.tcpZ]) input.disabled = tcpDisabled;
  els.targetDuration.disabled = Boolean(resolved.reason) || busy;
  els.previewTarget.disabled = tcpDisabled;
  els.exitTcpControl.disabled = targetControlMode !== 'tcp' || selectedManualSession()?.state !== 'slider_control' || busy || controller.running;
  els.confirmTarget.disabled = !target || target.source !== targetControlMode || commandExecution.status !== 'pending' || Boolean(resolved.reason) || busy;
  els.cancelTarget.disabled = !target || busy;
  if (!target && resolved.reason && !els.targetState.classList.contains('is-error')) {
    showTargetState('idle', t('status.target-control-readonly'), resolved.reason);
  }
}

function readTargetInput() {
  const millimetres = [els.tcpX, els.tcpY, els.tcpZ].map((input) => input.valueAsNumber);
  const durationMs = els.targetDuration.valueAsNumber;
  if (!millimetres.every(Number.isFinite)) throw new Error(t('error.tcp-must-be-finite'));
  if (!Number.isInteger(durationMs) || durationMs <= 0) throw new Error(t('error.duration-must-be-positive'));
  return { targetPosition: millimetres.map((value) => value / 1000), millimetres, durationMs };
}

function evaluateTcpDragTarget(position) {
  if (targetControlMode !== 'tcp') return { valid: false, error: t('error.switch-to-tcp-first') };
  if (selectedDisplayProfile().code !== 'FL' || selectedPoseRole() !== 'follower') return { valid: false, error: t('reason.tcp-fl-only') };
  if (targetExecutionOwnership.locked || commandExecution.status === 'sending') {
    return { valid: false, error: t('error.command-sending') };
  }
  const resolved = resolveTargetConnection();
  if (resolved.reason || controller.controlGeneration.emergencyStopping) {
    return { valid: false, error: resolved.reason ?? t('control.emergency-processing') };
  }
  const millimetres = position.map((value) => value * 1000);
  [els.tcpX, els.tcpY, els.tcpZ].forEach((input, index) => { input.value = millimetres[index].toFixed(1); });
  const durationMs = els.targetDuration.valueAsNumber;
  if (!Number.isInteger(durationMs) || durationMs <= 0) return { valid: false, error: t('error.duration-must-be-positive') };
  const solution = solveInverseKinematics(position, currentPlanningAngles().slice(0, 6), { tolerance: 0.001, maxIterations: 120 });
  if (!solution.success) return { valid: false, error: solution.reason };
  return { valid: true, value: { resolved, solution, millimetres, durationMs } };
}

function applyValidTcpDrag(valid) {
  if (targetExecutionOwnership.locked || commandExecution.status === 'sending') return false;
  if (target && commandExecution.status === 'pending') commandExecution.cancel(target.pending);
  const controlToken = controller.controlGeneration.capture();
  const pending = commandExecution.preview({
    profileCode: valid.resolved.profile.code,
    connectionId: valid.resolved.connectionId,
    modelAngles: valid.solution.angles,
    currentGripperAngle: currentServoAngles[6],
    durationMs: valid.durationMs,
  });
  target = {
    ...valid.resolved, pending, solution: valid.solution, targetPosition: valid.position,
    millimetres: valid.millimetres, durationMs: valid.durationMs, source: 'tcp', controlToken,
  };
  robotModel.preview(modelAngleRecord(valid.solution.angles));
  renderTargetSolution(target);
  refreshTcpDragHandle(valid.position);
  showTargetState('ready', t('target.cyan-pending'), t('target.drag-only-preview-hint'));
  renderTargetPermission();
}

function renderTargetSolution(value) {
  els.targetTcpResult.textContent = `${value.millimetres.map((item) => item.toFixed(1)).join(' / ')} mm`;
  els.targetError.textContent = `${(value.solution.positionError * 1000).toFixed(2)} mm`;
  els.targetIterations.textContent = String(value.solution.iterations);
  els.targetAngles.textContent = value.solution.angles.map((angle, index) => `J${index + 1} ${(angle * 180 / Math.PI).toFixed(1)}°`).join(' · ');
  els.targetCalibration.textContent = value.pending.metadata.calibrationWarning;
}

function previewTarget() {
  if (targetControlMode !== 'tcp') {
    showTargetState('error', t('status.cannot-preview'), t('error.switch-to-tcp-first'));
    return;
  }
  if (targetExecutionOwnership.locked) {
    showTargetState('error', t('status.cannot-preview'), t('error.command-in-progress'));
    return;
  }
  const resolved = resolveTargetConnection();
  if (resolved.reason) {
    invalidateTargetPreview(resolved.reason);
    showTargetState('error', t('status.cannot-preview'), resolved.reason);
    return;
  }
  invalidateTargetPreview(t('status.calculating-target'));
  try {
    const controlToken = controller.controlGeneration.capture();
    const { targetPosition, millimetres, durationMs } = readTargetInput();
    const seedAngles = currentPlanningAngles().slice(0, 6);
    const solution = solveInverseKinematics(targetPosition, seedAngles, { tolerance: 0.001, maxIterations: 120 });
    if (!solution.success) {
      const reason = ({ unreachable: t('error.target-out-of-reach'), 'max-iterations': t('error.did-not-converge'), 'invalid-input': t('error.invalid-input') })[solution.reason] ?? solution.reason;
      invalidateTargetPreview(tWithVars('error.ik-solve-failed-reason', { reason }));
      showTargetState('error', t('error.ik-solve-failed'), `${reason}${Number.isFinite(solution.positionError) ? `; error ${(solution.positionError * 1000).toFixed(2)} mm` : ''}`);
      return;
    }
    const pending = commandExecution.preview({
      profileCode: resolved.profile.code,
      connectionId: resolved.connectionId,
      modelAngles: solution.angles,
      currentGripperAngle: currentServoAngles[6],
      durationMs,
    });
    target = { ...resolved, pending, solution, targetPosition, millimetres, durationMs, source: 'tcp', controlToken };
    robotModel.preview(modelAngleRecord(solution.angles));
    renderTargetSolution(target);
    showTargetState('ready', t('status.target-pending'), t('status.preview-phase-no-write'));
    log(tWithVars('log.target-preview-generated', { tcp: els.targetTcpResult.textContent }));
  } catch (error) {
    invalidateTargetPreview(error.message);
    showTargetState('error', t('error.preview-failed'), error.message);
  } finally {
    renderTargetPermission();
  }
}

async function confirmTarget() {
  if (!target) throw new Error(t('error.no-target-to-confirm'));
  if (target.source !== targetControlMode) throw new Error(t('error.target-source-mismatch'));
  const executionOwner = target;
  let confirmed = null;
  targetExecutionOwnership.acquire(executionOwner);
  renderTargetPermission();
  try {
  freezeTcpDragForExecution({
    coordinator: tcpDragCoordinator,
    cancelModelDrag: (reason) => robotModel.cancelTcpDrag(reason),
    setHandleEnabled: (enabled) => robotModel.setTcpDragHandle({
      position: target?.targetPosition ?? forwardKinematics(currentModelAngles.slice(0, 6)).position,
      orientation: matrixToQuaternion(forwardKinematics(
        target?.solution?.angles?.slice(0, 6) ?? currentModelAngles.slice(0, 6),
      ).matrix),
      enabled,
      visible: targetControlMode === 'tcp' && modelLoaded,
    }),
  });
  const current = resolveTargetConnection();
  if (current.reason) throw new Error(current.reason);
  if (current.profile.code !== target.profile.code || current.connectionId !== target.connectionId || current.bus !== target.bus) {
    invalidateTargetPreview(t('status.model-connection-changed'));
    throw new Error(t('error.model-identity-changed'));
  }
  confirmed = Object.freeze({
    pending: target.pending,
    profileCode: target.profile.code,
    connectionId: target.connectionId,
    bus: target.bus,
    session: target.session,
    durationMs: target.durationMs,
    controlToken: target.controlToken,
  });
  if (controller.running) {
    showTargetState('stopped', t('status.stopping-teleop'), t('status.must-release-teleop'));
  }
  showTargetState('ready', t('status.sending-target'), t('status.sending-once-only'));
  await executeConfirmedTarget({
    confirmed,
    stopAndDrain: async () => {
      if (controller.running) await controller.stop();
      await confirmed.session?.pauseSampling();
    },
    resolveCurrent: () => {
      const resolved = resolveTargetConnection();
      return { ...resolved, profileCode: resolved.profile.code };
    },
    assertControlActive: (token) => controller.controlGeneration.assertActive(token),
    commandExecution,
  });
  controller.controlGeneration.assertActive(confirmed.controlToken);
  adoptConfirmedTargetAsPlanningPose(executionOwner);
  target = null;
  robotModel.preview(null);
  showTargetState('sent', t('status.command-sent'), t('status.serial-write-complete'));
  log(t('log.target-pose-sent'));
  } finally {
    if (confirmed?.session) {
      if (commandExecution.status === 'sent') confirmed.session.resumeSamplingAfter(confirmed.durationMs);
      else confirmed.session.resumeSampling();
    }
    targetExecutionOwnership.release(executionOwner);
    renderTargetPermission();
  }
}

function cancelTargetPreview() {
  if (targetExecutionOwnership.locked) return;
  cancelTcpDragState(t('status.user-cancelled-preview'));
  if (target && commandExecution.status === 'pending') commandExecution.cancel(target.pending);
  target = null;
  robotModel.preview(null);
  syncJointSliders(currentModelAngles);
  clearTargetResults();
  showTargetState('idle', t('status.preview-cancelled'), t('status.preview-cleared'));
  renderTargetPermission();
}

function cancelTcpDragState(reason) {
  robotModel.cancelTcpDrag(reason);
  tcpDragCoordinator.cancel(reason);
}

function invalidateTargetPreview(reason = t('status.target-preview-invalidated')) {
  cancelTcpDragState(reason);
  if (target && commandExecution.status === 'pending') {
    try { commandExecution.cancel(target.pending); } catch (_) {}
  }
  target = null;
  robotModel.preview(null);
  syncJointSliders(currentModelAngles);
  clearTargetResults();
  if (reason && reason !== t('status.calculating-target')) showTargetState('idle', t('status.target-preview-cleared'), reason);
  renderTargetPermission();
}

function clearTargetResults() {
  els.targetTcpResult.textContent = '—';
  els.targetError.textContent = '—';
  els.targetIterations.textContent = '—';
  els.targetAngles.textContent = '—';
  els.targetCalibration.textContent = t('confirm.calibration-status');
}

function showTargetState(state, title, detail) {
  els.targetState.className = `target-state is-${state}`;
  els.targetStatusTitle.textContent = title;
  els.targetStatusDetail.textContent = detail;
}

function hideResetOperationNotice() {
  els.resetOperationNotice.hidden = true;
  els.resetOperationNotice.classList.remove('is-busy', 'is-success', 'is-error');
  els.resetOperationIcon.textContent = '';
  els.resetOperationTitle.textContent = '';
  els.resetOperationDetail.textContent = '';
}

function showResetOperationNotice(state, title, detail) {
  const icon = ({ busy: '…', success: '✓', error: '!' })[state] ?? '';
  els.resetOperationNotice.classList.remove('is-busy', 'is-success', 'is-error');
  els.resetOperationNotice.classList.add(`is-${state}`);
  els.resetOperationIcon.textContent = icon;
  els.resetOperationTitle.textContent = title;
  els.resetOperationDetail.textContent = detail;
  els.resetOperationNotice.hidden = false;
}

function renderResetState() {
  els.resetArmStatus.textContent = controller.resetBus.connected ? t('status.connected') : t('status.not-connected');
  els.resetStatus.textContent = controller.resettingOrigin ? t('status.setting-calibrating') : (controller.resetBus.connected ? t('status.ready-to-set') : t('status.waiting-connection'));
  els.connectResetArm.disabled = controller.running || controller.leader.connected || controller.follower?.connected || controller.resetBus.connected || controller.factoryBus.connected || controller.resettingOrigin;
  els.disconnectResetArm.disabled = !controller.resetBus.connected || controller.resettingOrigin;
  els.resetOrigin.disabled = !controller.resetBus.connected || controller.running || controller.resettingOrigin;
}

function renderFactoryState() {
  const busy = controller.restoringFactory;
  els.factoryArmStatus.textContent = controller.factoryBus.connected ? t('status.connected') : t('status.not-connected');
  els.factoryStatus.textContent = busy ? t('status.restoring-calibrating') : (controller.factoryBus.connected ? t('status.ready-to-restore') : t('status.waiting-connection'));
  els.connectFactoryArm.disabled = controller.running || controller.leader.connected || controller.follower?.connected || controller.resetBus.connected || controller.factoryBus.connected || busy;
  els.disconnectFactoryArm.disabled = !controller.factoryBus.connected || busy;
  els.restoreFactory.disabled = !controller.factoryBus.connected || busy;
  els.factoryModel.disabled = controller.factoryBus.connected || busy;
}

function renderAngles(angles, role = selectedPoseRole()) {
  if (planningPoseRole === role) {
    planningModelAngles = null;
    planningPoseRole = null;
  }
  currentServoAngles = [...angles];
  const modelName = selectedDisplayModelName();
  const modelKey = selectedDisplayModelKey();
  const b601 = modelKey === MODEL_CONFIGS.b601.key;
  const a1z = modelKey === MODEL_CONFIGS.a1z.key;
  const piper = modelKey === PIPER_MODEL_KEY;

  let mapped;
  if (piper) {
    // PiPER Mate 为姿态源：按真实手臂关节角跟随（映射到 piper 模型关节；方向/零点为占位，待实机校准）
    mapped = servoToModelAngles('PIPER', angles);
  } else if (b601) {
    // B601 需要传入 7 个关节角（含 J7 夹爪）
    const anglesRad = angles.slice(0, 7).map((angle) => angle * Math.PI / 180);
    mapped = mapLeaderAnglesToB601(anglesRad);
  } else if (a1z) {
    // A1Z 需要传入 7 个关节角（含 J7 夹爪）
    const anglesRad = angles.slice(0, 7).map((angle) => angle * Math.PI / 180);
    mapped = mapLeaderAnglesToA1Z(anglesRad);
  } else {
    mapped = servoToModelAngles(modelName, angles);
  }
  
  // 提取 6 个关节角 + J7
  let jointAngles;
  let gripperAngle;
  if (a1z) {
    jointAngles = [mapped.arm_joint1, mapped.arm_joint2, mapped.arm_joint3, mapped.arm_joint4, mapped.arm_joint5, mapped.arm_joint6];
    // A1Z 夹爪位移转换为等效角度显示（0..48mm 映射为 0..90°）
    const gripperTravel = mapped.gripper_finger_left_joint ?? 0;
    gripperAngle = (gripperTravel / 0.048) * (Math.PI / 2);
  } else if (b601) {
    jointAngles = [mapped.joint1, mapped.joint2, mapped.joint3, mapped.joint4, mapped.joint5, mapped.joint6];
    // B601 夹爪位移转换为等效角度显示（0..71.5mm 映射为 0..90°）
    const gripperTravel = mapped.gripper_joint1 ?? 0;
    gripperAngle = (gripperTravel / 0.0715) * (Math.PI / 2);
  } else {
    jointAngles = Array.from({ length: 6 }, (_, index) => mapped[`joint${index + 1}`]);
    gripperAngle = mapped.joint7_left ?? 0;
  }
  
  currentModelAngles = [...jointAngles, gripperAngle];
  els.jointActualValues.forEach((output, index) => { output.textContent = `${(currentModelAngles[index] * 180 / Math.PI).toFixed(1)}°`; });
  const session = controller.manualSessions[role];
  const followsHardware = controller.running || !session || session.state === 'manual_readback';
  if (followsHardware && (!target || commandExecution.status !== 'pending')) syncJointSliders(currentModelAngles);
  if (controller.running || selectedPoseRole() === role) robotModel.update(mapped);
}

function getLeaderType() {
  const value = els.leaderType.value;
  // 防御性处理：如果 value 包含括号（说明错误地使用了显示文本），提取型号部分
  if (value && value.includes('(')) {
    const match = value.match(/^102(LD|HD)/);
    if (match) return match[0];
  }
  return getConnectedLeaderType(controller.connectedLeaderProfile, value);
}

function getLeaderProfileCode() {
  return getLeaderType().replace(/^102/, '');
}

function getResponseTimeoutMs() {
  return Math.max(100, Number(els.responseTimeout.value || 800));
}

function isRawLogEnabled() {
  return els.rawLogEnabled.value === 'on';
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  els.logs.textContent = `${els.logs.textContent}\n${line}`.trim();
  els.logs.scrollTop = els.logs.scrollHeight;
}

function resetLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  els.resetLogs.textContent = `${els.resetLogs.textContent}\n${line}`.trim();
  els.resetLogs.scrollTop = els.resetLogs.scrollHeight;
}

function factoryLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  els.factoryLogs.textContent = `${els.factoryLogs.textContent}\n${line}`.trim();
  els.factoryLogs.scrollTop = els.factoryLogs.scrollHeight;
}

function factoryProgressKey(phase) {
  return ({ stop: 'stop', public: 'public', internal: 'internal', 'verify-public': 'verify', 'verify-internal': 'verify' })[phase];
}

function updateFactoryStep(step, state, detail) {
  step.classList.remove('is-pending', 'is-active', 'is-complete', 'is-failed');
  step.classList.add(`is-${state}`);
  step.querySelector('small').textContent = detail;
  step.querySelector('.factory-step-state').textContent = state === 'complete' ? '✓' : (state === 'failed' ? '!' : '');
}

function resetFactoryProgress() {
  for (const step of els.factoryProgressSteps) updateFactoryStep(step, 'pending', t('status.waiting-execution'));
  els.factoryManualPowerNotice.hidden = true;
  els.factoryProgressSummary.textContent = t('status.preparing-start');
}

function setFactoryProgressPhase(phase) {
  const key = factoryProgressKey(phase);
  if (!key) return;
  const order = ['stop', 'public', 'internal', 'verify'];
  const activeIndex = order.indexOf(key);
  for (const step of els.factoryProgressSteps) {
    const index = order.indexOf(step.dataset.factoryStep);
    if (index < activeIndex) updateFactoryStep(step, 'complete', t('status.completed'));
    else if (index === activeIndex) updateFactoryStep(step, 'active', factoryPhaseName(phase));
    else updateFactoryStep(step, 'pending', t('status.waiting-execution'));
  }
  els.factoryProgressSummary.textContent = factoryPhaseName(phase);
}

function completeFactoryProgress() {
  for (const step of els.factoryProgressSteps) updateFactoryStep(step, 'complete', t('status.completed'));
  els.factoryManualPowerNotice.hidden = false;
  els.factoryProgressSummary.textContent = t('status.parameter-restore-complete');
}

function failFactoryProgress(error) {
  const active = Array.from(els.factoryProgressSteps).find((step) => step.classList.contains('is-active'));
  if (active) updateFactoryStep(active, 'failed', t('status.execution-failed-check-log'));
  els.factoryManualPowerNotice.hidden = true;
  els.factoryProgressSummary.textContent = tWithVars('status.restore-failed', {msg: error.message});
}

function factoryModelName(model) {
  // 根据型号返回正确的显示名称
  const modelMap = {
    'FL': 'Star Arm 102-FL',
    'HD': 'Star Arm 102-HD',
    'U25': 'Violin-U25',
    'U45': 'Violin-U45',
  };
  return modelMap[model] || `Star Arm 102-${model}`;
}

function factoryPhaseName(phase) {
  return ({ stop: t('status.releasing-force'), public: t('status.writing-public-params'), internal: t('status.writing-internal-params'),
    'verify-public': t('status.verifying-public-params'), 'verify-internal': t('status.verifying-internal-params') })[phase] ?? phase;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==================== 国际化支持 ====================

/**
 * 更新页面上所有带 data-i18n 属性的元素
 */
function updatePageLanguage() {
  // 更新文本内容
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  
  // 更新 title 属性
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('title', t(key));
  });
  
  // 更新 placeholder 属性
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });
  
  // 更新 aria-label
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    el.setAttribute('aria-label', t(key));
  });
  
  // 更新 HTML lang 属性
  document.documentElement.lang = getLanguage();
  
  // 重新渲染动态内容
  renderModelPermission();
}

/**
 * 初始化语言切换功能
 */
function initLanguageSwitch() {
  // 初始化语言
  initLanguage();
  
  const langSwitchBtn = document.getElementById('langSwitch');
  const langZh = document.getElementById('langZh');
  const langEn = document.getElementById('langEn');
  const selectLanguage = (lang) => {
    setLanguage(lang);
    langSwitchBtn.dataset.language = lang;
    langZh.setAttribute('aria-pressed', String(lang === 'zh'));
    langEn.setAttribute('aria-pressed', String(lang === 'en'));
    updatePageLanguage();
    autoTranslatePage();
  };
  if (langSwitchBtn && langZh && langEn) {
    langZh.addEventListener('click', () => selectLanguage('zh'));
    langEn.addEventListener('click', () => selectLanguage('en'));
    selectLanguage(getLanguage());
  }
  
  // 监听语言切换事件
  window.addEventListener('language-change', () => {
    updatePageLanguage();
    autoTranslatePage(); // 自动翻译未标记的元素
  });
  
  // 初始更新页面语言
  updatePageLanguage();
  autoTranslatePage(); // 首次加载时自动翻译
}

// 在 DOM 加载完成后初始化语言切换
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanguageSwitch);
} else {
  initLanguageSwitch();
}

// Workbench navigation uses the existing PiPER control shutdown paths.
window.addEventListener('workbench:before-switch', event => {
  event.detail.waits.push((async () => {
    if (controller.resettingOrigin || controller.restoringFactory || targetExecutionOwnership.locked || commandExecution.status === 'sending') {
      throw new Error('当前正在写入或执行，请等待操作完成后再切换工作台。');
    }
    await trajectoryWorkspace.stop();
    await controller.disconnectAll();
    if (controller.resetBus.connected) await controller.disconnectResetArm();
    if (controller.factoryBus.connected) await controller.disconnectFactoryArm();
  })());
});
