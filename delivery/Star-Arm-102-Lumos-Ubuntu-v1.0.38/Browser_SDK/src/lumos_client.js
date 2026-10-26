import { t, tWithVars } from './i18n.js?v=server-1.0.38';
import { assertTeleopPairing } from './teleop_pairing.js?v=server-1.0.38';

export const CONTROL_RATE_HZ = 200;
export const DEFAULT_LUMOS_CONTROL = Object.freeze({ control_rate_hz: CONTROL_RATE_HZ,
  filter_min_cutoff_hz: 5, filter_beta: 0.15, filter_speed_cutoff_hz: 5 });

export function parseLumosControl(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(t('lumos.error.control-settings'));
  const settings = {};
  for (const [key, low, high] of [['control_rate_hz', 20, 200], ['filter_min_cutoff_hz', 0.1, 50],
    ['filter_beta', 0, 2], ['filter_speed_cutoff_hz', 0.1, 50]]) {
    const raw = Object.hasOwn(value, key) ? value[key] : DEFAULT_LUMOS_CONTROL[key];
    const number = typeof raw === 'number' || typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(number) || number < low || number > high) throw new Error(t('lumos.error.control-settings'));
    settings[key] = number;
  }
  return settings;
}

export function localLumosApi(location) {
  if (!location) return null;
  const url = new URL(location.href);
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    ? `${url.origin}/api/v1/lumos` : null;
}

export function parseLumosMapping({ jointMap, signs, gain }) {
  const parse = value => String(value).split(/[\s,，]+/).filter(Boolean).map(Number);
  const joint_map = parse(jointMap);
  const direction = parse(signs);
  const scale = Number(gain);
  if (joint_map.length !== 6 || new Set(joint_map).size !== 6 || joint_map.some(value => !Number.isInteger(value) || value < 0 || value > 5)) {
    throw new Error(t('lumos.error.mapping-permutation'));
  }
  if (direction.length !== 6 || direction.some(value => value !== 1 && value !== -1)) {
    throw new Error(t('lumos.error.mapping-directions'));
  }
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error(t('lumos.error.mapping-gain'));
  return { joint_map, signs: direction, gain: scale };
}

const activePhases = ['connected', 'calibrating', 'preview', 'running'];
const validAngles = values => Array.isArray(values) && values.length === 6 && values.every(Number.isFinite);
// Only explicit, non-motion validation failures can keep a confirmed live lease.
const recoverableCodes = new Set([
  'leader_not_at_reference', 'follower_not_at_reference', 'gripper_not_aligned',
  'outside_calibrated_range', 'target_out_of_range', 'gripper_outside_calibrated_range',
  'calibration_missing', 'calibration_busy', 'calibration_range_small',
  'gripper_calibration_missing', 'gripper_calibration_range_small', 'gripper_endpoint_changed',
  'invalid_joint_map', 'invalid_signs', 'invalid_gain', 'invalid_angles', 'invalid_gripper',
  'invalid_gripper_endpoint', 'invalid_control_settings', 'start_confirmation_required', 'restore_confirmation_required',
  'saved_calibration_changed', 'saved_calibration_incompatible',
].map(code => `lumos_${code}`));

// Owns one explicit connection only. No reconnect, no retry of motion commands,
// and no cached Leader angle fallback. The backend also enforces a heartbeat.
export class LumosClient {
  constructor({ api = localLumosApi(globalThis.location), fetchImpl = globalThis.fetch?.bind(globalThis),
    readLeader, assertIdentity, onState = () => {}, onSample = () => {}, onFault = () => {},
    schedule = (callback, ms) => setTimeout(callback, ms), cancel = handle => clearTimeout(handle),
    now = () => performance.now() } = {}) {
    Object.assign(this, { api, fetchImpl, readLeader, assertIdentity, onState, onSample, onFault, schedule, cancel, now });
    this.snapshot = { phase: 'idle', connected: false };
    this.sessionId = null;
    this.leaderConnectionId = null;
    this.sequence = 0;
    this.epoch = 0;
    this.timer = null;
    this.inFlight = null;
    this.busy = false;
    this.closing = null;
    this.cleanupFailure = null;
    this.serviceStatus = null;
    this.validationMessage = null;
    this.controlRateHz = CONTROL_RATE_HZ;
  }
  get connected() { return Boolean(this.sessionId && activePhases.includes(this.snapshot.phase)); }
  get running() { return this.connected && this.snapshot.phase === 'running'; }
  get ready() { return this.connected && this.snapshot.phase === 'preview'; }
  notify(snapshot = this.snapshot) {
    this.snapshot = { ...snapshot, notice: this.validationMessage };
    this.onState(this.snapshot);
  }
  identity() {
    this.assertIdentity?.(this.leaderConnectionId);
    return { session_id: this.sessionId, leader_connection_id: this.leaderConnectionId, leader_type: 'TOUCH', follower_type: 'LUMOS' };
  }
  async checkService() {
    const status = await this.request('status');
    if (!status || typeof status.phase !== 'string' || !Object.hasOwn(status, 'connected')) {
      throw new Error(t('lumos.error.missing-service'));
    }
    this.serviceStatus = status;
    this.onState(this.snapshot);
    if (status.gripper_config_error || !status.gripper_type) {
      throw new Error(status.gripper_config_error || t('lumos.error.missing-gripper-type'));
    }
    return status;
  }
  async request(action, body, { keepalive = false } = {}) {
    if (!this.api) throw new Error(t('lumos.error.ubuntu-required'));
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), action === 'connect' ? 10000 : 1000);
    try {
      const response = await this.fetchImpl(`${this.api}/${action}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal, keepalive, cache: 'no-store',
        targetAddressSpace: 'loopback',
      });
      let result;
      try { result = await response.json(); }
      catch (error) {
        // Abort can happen after headers arrive, while the body is still being
        // read. Preserve it so a slow service is not reported as a missing one.
        if (error?.name === 'AbortError' || abort.signal.aborted) throw new DOMException('LumosTouch response aborted', 'AbortError');
        throw new Error(t('lumos.error.missing-service-page'));
      }
      if (!response.ok) {
        const error = new Error(typeof result.detail === 'string' ? result.detail : result.error?.message || (typeof result.error === 'string' ? result.error : null) || tWithVars('lumos.error.request-failed', { status: response.status }));
        error.code = result.error?.code;
        throw error;
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(t('lumos.error.service-timeout'));
      throw error;
    } finally { clearTimeout(timer); }
  }
  async connect({ leaderProfile, leaderConnectionId, canInterface, enableConfirmed }) {
    if (this.connected || this.busy || this.closing) throw new Error(t('lumos.error.already-connected'));
    if (this.cleanupFailure) throw this.cleanupFailure;
    assertTeleopPairing({ followerTargetType: 'physical', connectedLeaderProfile: leaderProfile, physicalFollowerModel: 'LUMOS' });
    if (!leaderConnectionId) throw new Error(t('lumos.error.leader-identity'));
    if (!enableConfirmed) throw new Error(t('lumos.error.enable-confirmation'));
    if (!/^[A-Za-z0-9_.:-]{1,32}$/.test(canInterface)) throw new Error(t('lumos.error.invalid-can-interface'));
    const epoch = ++this.epoch;
    this.validationMessage = null;
    this.busy = true;
    this.leaderConnectionId = leaderConnectionId;
    this.notify({ phase: 'connecting', connected: false });
    try {
      this.assertIdentity?.(leaderConnectionId);
      const confirmedGripperType = this.serviceStatus?.gripper_type;
      const status = await this.checkService();
      if (!confirmedGripperType || status.gripper_type !== confirmedGripperType) {
        throw new Error(t('lumos.error.gripper-configuration-changed'));
      }
      if (epoch !== this.epoch) throw new Error(t('lumos.error.connection-cancelled'));
      this.assertIdentity?.(leaderConnectionId);
      const snapshot = await this.request('connect', {
        leader_type: 'TOUCH', follower_type: 'LUMOS', leader_connection_id: leaderConnectionId,
        can_interface: canInterface, enable_confirmed: true,
      });
      if (!snapshot.session_id) throw new Error(t('lumos.error.invalid-session'));
      this.sessionId = snapshot.session_id;
      if (epoch !== this.epoch) {
        this.leaderConnectionId = leaderConnectionId;
        await this.shutdown(t('lumos.error.cancelled'));
        throw new Error(t('lumos.error.connection-cancelled'));
      }
      this.sequence = 0;
      this.identity();
      this.notify(snapshot);
      this.scheduleNext(epoch, 0);
      return snapshot;
    } catch (error) {
      if (this.sessionId) await this.shutdown(error.message).catch(() => {});
      this.notify({ phase: 'fault', connected: false, error: error.message });
      throw error;
    } finally { this.busy = false; this.onState(this.snapshot); this.scheduleNext(epoch, 0); }
  }
  scheduleNext(epoch, delay = 1000 / this.controlRateHz) {
    if (epoch !== this.epoch || !this.connected || this.busy || this.timer !== null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      const started = this.now();
      const operation = this.sampleOnce(epoch).catch(async error => {
        if (epoch !== this.epoch) return;
        await this.shutdown(error.message, { skipDrain: true }).catch(() => {});
        this.onFault(error);
      }).finally(() => {
        if (this.inFlight === operation) this.inFlight = null;
        this.scheduleNext(epoch, Math.max(0, 1000 / this.controlRateHz - (this.now() - started)));
      });
      this.inFlight = operation;
    }, delay);
  }
  async sampleOnce(epoch = this.epoch) {
    const identity = this.identity();
    const reading = await this.readLeader();
    const leader_deg = reading?.leaderDeg;
    const leader_gripper_deg = reading?.gripperDeg;
    if (!validAngles(leader_deg)) throw new Error(t('lumos.error.missing-six-axes'));
    if (!Number.isFinite(leader_gripper_deg)) throw new Error(t('lumos.error.missing-gripper'));
    if (epoch !== this.epoch || !this.connected) return;
    this.identity();
    const snapshot = await this.request('sample', { ...identity, sequence: ++this.sequence, leader_deg, leader_gripper_deg });
    if (epoch !== this.epoch) return;
    if (snapshot.session_id !== this.sessionId || !activePhases.includes(snapshot.phase)) {
      throw new Error(snapshot.error || t('lumos.error.session-ended-reconnect'));
    }
    this.notify(snapshot);
    this.onSample({ leaderDeg: leader_deg, leaderGripperDeg: leader_gripper_deg, snapshot });
    return { leader_deg, leader_gripper_deg };
  }
  async command(action, extras = {}) {
    if (!this.connected || this.busy || this.closing) throw new Error(t('lumos.error.wait-for-connection'));
    if (action === 'start') extras = { ...extras, control_settings: parseLumosControl(extras.control_settings) };
    const epoch = this.epoch;
    this.busy = true;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.onState(this.snapshot);
    try {
      await this.inFlight;
      if (epoch !== this.epoch || !this.connected) throw new Error(t('lumos.error.session-ended'));
      const reading = await this.sampleOnce(epoch).catch(error => { error.lumosSampleError = true; throw error; });
      if (epoch !== this.epoch || !this.connected) throw new Error(t('lumos.error.session-ended'));
      const snapshot = await this.request(action, { ...this.identity(), ...extras,
        ...(['capture-reference', 'capture-gripper'].includes(action) ? reading : {}) });
      if (epoch !== this.epoch) return;
      if (snapshot.session_id !== this.sessionId || !activePhases.includes(snapshot.phase)) throw new Error(snapshot.error || t('lumos.error.session-ended'));
      if (action === 'start') this.controlRateHz = parseLumosControl(snapshot.control_settings || extras.control_settings).control_rate_hz;
      this.validationMessage = null;
      this.notify(snapshot);
    } catch (error) {
      let recovered = false;
      if (!error.lumosSampleError && recoverableCodes.has(error.code) && epoch === this.epoch) {
        try {
          // A rejected command must still belong to the same, non-running
          // server session. Unknown outcomes and sensor faults always close.
          const status = await this.request('status');
          if (epoch === this.epoch && status.session_id === this.sessionId && status.connected
            && ['connected', 'calibrating', 'preview'].includes(status.phase)
            && !status.cleanup_pending && !status.cleanup_failed && !status.error) {
            this.validationMessage = error.message;
            this.notify(status);
            recovered = true;
          }
        } catch {}
      }
      if (!recovered) await this.shutdown(error.message).catch(() => {});
      throw error;
    } finally { this.busy = false; this.onState(this.snapshot); this.scheduleNext(epoch, 0); }
  }
  shutdown(reason = t('lumos.error.stopped-reconnect'), { skipDrain = false } = {}) {
    if (this.closing) return this.closing;
    ++this.epoch;
    this.validationMessage = null;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const identity = { session_id: this.sessionId, leader_connection_id: this.leaderConnectionId, leader_type: 'TOUCH', follower_type: 'LUMOS' };
    const inFlight = this.inFlight;
    this.notify({ ...this.snapshot, phase: 'stopping', connected: false });
    const verifyClosed = snapshot => {
      if (!['idle', 'stopped', 'disconnected', 'fault'].includes(snapshot.phase)
        || snapshot.connected || snapshot.session_id || snapshot.cleanup_pending || snapshot.cleanup_failed || snapshot.connecting
        || /SDK 关闭失败|无法确认电机已关闭/.test(snapshot.error || '')) {
        throw new Error(snapshot.error || t('lumos.error.shutdown-unconfirmed'));
      }
    };
    const operation = (async () => {
      let failure = this.cleanupFailure;
      if (identity.session_id) {
        // Revoke server output immediately; do not wait for a pending read first.
        try { verifyClosed(await this.request('stop', identity)); failure = null; } catch (error) {
          failure = error;
          try { verifyClosed(await this.request('disconnect', identity)); failure = null; } catch {}
          if (failure) {
            try {
              const status = await this.request('status');
              verifyClosed(status);
              failure = null;
            } catch {}
          }
        }
      } else if (failure) {
        try { verifyClosed(await this.request('status')); failure = null; } catch {}
      }
      if (!skipDrain) await inFlight?.catch(() => {});
      this.sessionId = null;
      this.leaderConnectionId = null;
      this.cleanupFailure = failure;
      this.notify({ phase: failure ? 'fault' : 'stopped', connected: false,
        error: failure ? `${reason} ${failure.message}` : reason });
      if (failure) throw failure;
    })().finally(() => {
      if (this.closing === operation) this.closing = null;
      this.onState(this.snapshot);
    });
    this.closing = operation;
    return operation;
  }
  unload() {
    ++this.epoch;
    if (this.timer !== null) this.cancel(this.timer);
    if (this.sessionId) void this.request('stop', {
      session_id: this.sessionId, leader_connection_id: this.leaderConnectionId,
      leader_type: 'TOUCH', follower_type: 'LUMOS',
    }, { keepalive: true }).catch(() => {});
  }
}
