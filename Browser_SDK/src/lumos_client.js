import { assertTeleopPairing } from './teleop_pairing.js';

export function localLumosApi(location) {
  if (!location) return null;
  const url = new URL(location.href);
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '18766'
    ? `${url.origin}/api/v1/lumos` : null;
}

export function parseLumosMapping({ jointMap, signs, gain }) {
  const parse = value => String(value).split(/[\s,，]+/).filter(Boolean).map(Number);
  const joint_map = parse(jointMap);
  const direction = parse(signs);
  const scale = Number(gain);
  if (joint_map.length !== 6 || new Set(joint_map).size !== 6 || joint_map.some(value => !Number.isInteger(value) || value < 0 || value > 5)) {
    throw new Error('六轴顺序必须是 0–5 的完整排列。');
  }
  if (direction.length !== 6 || direction.some(value => value !== 1 && value !== -1)) {
    throw new Error('六轴方向必须填写六个 +1 或 -1。');
  }
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new Error('增益必须大于 0 且不超过 1。');
  return { joint_map, signs: direction, gain: scale };
}

const activePhases = ['connected', 'calibrating', 'preview', 'running'];
const validAngles = values => Array.isArray(values) && values.length === 6 && values.every(Number.isFinite);

// Owns one explicit connection only. No reconnect, no retry of motion commands,
// and no cached Leader angle fallback. The backend also enforces a heartbeat.
export class LumosClient {
  constructor({ api = localLumosApi(globalThis.location), fetchImpl = globalThis.fetch?.bind(globalThis),
    readLeader, assertIdentity, onState = () => {}, onSample = () => {}, onFault = () => {},
    schedule = (callback, ms) => setTimeout(callback, ms), cancel = handle => clearTimeout(handle) } = {}) {
    Object.assign(this, { api, fetchImpl, readLeader, assertIdentity, onState, onSample, onFault, schedule, cancel });
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
  }
  get connected() { return Boolean(this.sessionId && activePhases.includes(this.snapshot.phase)); }
  get running() { return this.connected && this.snapshot.phase === 'running'; }
  get ready() { return this.connected && this.snapshot.phase === 'preview'; }
  notify(snapshot = this.snapshot) { this.snapshot = snapshot; this.onState(snapshot); }
  identity() {
    this.assertIdentity?.(this.leaderConnectionId);
    return { session_id: this.sessionId, leader_connection_id: this.leaderConnectionId, leader_type: 'TOUCH', follower_type: 'LUMOS' };
  }
  async checkService() {
    const status = await this.request('status');
    if (!status || typeof status.phase !== 'string' || !Object.hasOwn(status, 'connected')) {
      throw new Error('当前本地页面未提供 Ubuntu LumosTouch 服务，请运行 start_ubuntu_lumos.sh。');
    }
    this.serviceStatus = status;
    this.onState(this.snapshot);
    if (status.gripper_config_error || !status.gripper_type) {
      throw new Error(status.gripper_config_error || '未读取到 SDK 夹爪类型，请检查本机配置。');
    }
    return status;
  }
  async request(action, body, { keepalive = false } = {}) {
    if (!this.api) throw new Error('LumosTouch 实体遥操作需要 Ubuntu：请从源码运行 start_ubuntu_lumos.sh，并使用它打开的本地控制台。');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), action === 'connect' ? 10000 : 1000);
    try {
      const response = await this.fetchImpl(`${this.api}/${action}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal, keepalive, cache: 'no-store',
      });
      let result;
      try { result = await response.json(); }
      catch (error) {
        // Abort can happen after headers arrive, while the body is still being
        // read. Preserve it so a slow service is not reported as a missing one.
        if (error?.name === 'AbortError' || abort.signal.aborted) throw new DOMException('LumosTouch response aborted', 'AbortError');
        throw new Error('当前本地页面未提供 Ubuntu LumosTouch 服务。请在 Ubuntu 运行 start_ubuntu_lumos.sh，并使用它打开的控制台。');
      }
      if (!response.ok) {
        const error = new Error(typeof result.detail === 'string' ? result.detail : result.error?.message || (typeof result.error === 'string' ? result.error : null) || `LumosTouch 请求失败（${response.status}）`);
        error.code = result.error?.code;
        throw error;
      }
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('LumosTouch 本机服务响应超时，已停止发送动作；请重新连接并校准。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async connect({ leaderProfile, leaderConnectionId, canInterface, enableConfirmed }) {
    if (this.connected || this.busy || this.closing) throw new Error('LumosTouch 正在连接或已连接。');
    if (this.cleanupFailure) throw this.cleanupFailure;
    assertTeleopPairing({ followerTargetType: 'physical', connectedLeaderProfile: leaderProfile, physicalFollowerModel: 'LUMOS' });
    if (!leaderConnectionId) throw new Error('Leader 连接身份无效。');
    if (!enableConfirmed) throw new Error('请先确认连接将使能 LumosTouch 电机。');
    if (!/^[A-Za-z0-9_.:-]{1,32}$/.test(canInterface)) throw new Error('CAN 接口名称无效。');
    const epoch = ++this.epoch;
    this.busy = true;
    this.leaderConnectionId = leaderConnectionId;
    this.notify({ phase: 'connecting', connected: false });
    try {
      this.assertIdentity?.(leaderConnectionId);
      const confirmedGripperType = this.serviceStatus?.gripper_type;
      const status = await this.checkService();
      if (!confirmedGripperType || status.gripper_type !== confirmedGripperType) {
        throw new Error('请先检查本机组件并核对 SDK 夹爪类型，再确认连接；配置变化后须重新确认。');
      }
      if (epoch !== this.epoch) throw new Error('LumosTouch 连接已取消。');
      this.assertIdentity?.(leaderConnectionId);
      const snapshot = await this.request('connect', {
        leader_type: 'TOUCH', follower_type: 'LUMOS', leader_connection_id: leaderConnectionId,
        can_interface: canInterface, enable_confirmed: true,
      });
      if (!snapshot.session_id) throw new Error('本机服务未返回有效 LumosTouch 会话。');
      this.sessionId = snapshot.session_id;
      if (epoch !== this.epoch) {
        this.leaderConnectionId = leaderConnectionId;
        await this.shutdown('连接已取消');
        throw new Error('LumosTouch 连接已取消。');
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
  scheduleNext(epoch, delay = 20) {
    if (epoch !== this.epoch || !this.connected || this.busy || this.timer !== null) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      const started = performance.now();
      const operation = this.sampleOnce(epoch).catch(async error => {
        if (epoch !== this.epoch) return;
        await this.shutdown(error.message, { skipDrain: true }).catch(() => {});
        this.onFault(error);
      }).finally(() => {
        if (this.inFlight === operation) this.inFlight = null;
        this.scheduleNext(epoch, Math.max(0, 20 - (performance.now() - started)));
      });
      this.inFlight = operation;
    }, delay);
  }
  async sampleOnce(epoch = this.epoch) {
    const identity = this.identity();
    const reading = await this.readLeader();
    const leader_deg = reading?.leaderDeg;
    const leader_gripper_deg = reading?.gripperDeg;
    if (!validAngles(leader_deg)) throw new Error('Touch R1 六轴回读不完整，已停止遥操作。');
    if (!Number.isFinite(leader_gripper_deg)) throw new Error('Touch R1 夹爪回读缺失，已停止整臂与夹爪遥操作。');
    if (epoch !== this.epoch || !this.connected) return;
    this.identity();
    const snapshot = await this.request('sample', { ...identity, sequence: ++this.sequence, leader_deg, leader_gripper_deg });
    if (epoch !== this.epoch) return;
    if (snapshot.session_id !== this.sessionId || !activePhases.includes(snapshot.phase)) {
      throw new Error(snapshot.error || 'LumosTouch 会话已结束，请重新连接并校准。');
    }
    this.notify(snapshot);
    this.onSample({ leaderDeg: leader_deg, leaderGripperDeg: leader_gripper_deg, snapshot });
    return { leader_deg, leader_gripper_deg };
  }
  async command(action, extras = {}) {
    if (!this.connected || this.busy || this.closing) throw new Error('请先连接 LumosTouch，并等待当前操作完成。');
    const epoch = this.epoch;
    this.busy = true;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    this.onState(this.snapshot);
    try {
      await this.inFlight;
      if (epoch !== this.epoch || !this.connected) throw new Error('LumosTouch 会话已结束。');
      const reading = await this.sampleOnce(epoch).catch(error => { error.lumosSampleError = true; throw error; });
      if (epoch !== this.epoch || !this.connected) throw new Error('LumosTouch 会话已结束。');
      const snapshot = await this.request(action, { ...this.identity(), ...extras,
        ...(['capture-reference', 'capture-gripper'].includes(action) ? reading : {}) });
      if (epoch !== this.epoch) return;
      if (snapshot.session_id !== this.sessionId || !activePhases.includes(snapshot.phase)) throw new Error(snapshot.error || 'LumosTouch 会话已结束。');
      this.notify(snapshot);
    } catch (error) {
      // Calibration validation may fail without dropping the connection.
      // Motion start failures still close the lease instead of retrying.
      if (action === 'start' || error.lumosSampleError) await this.shutdown(error.message).catch(() => {});
      throw error;
    } finally { this.busy = false; this.onState(this.snapshot); this.scheduleNext(epoch, 0); }
  }
  shutdown(reason = '已停止，请重新连接并校准。', { skipDrain = false } = {}) {
    if (this.closing) return this.closing;
    ++this.epoch;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const identity = { session_id: this.sessionId, leader_connection_id: this.leaderConnectionId, leader_type: 'TOUCH', follower_type: 'LUMOS' };
    const inFlight = this.inFlight;
    this.notify({ ...this.snapshot, phase: 'stopping', connected: false });
    const verifyClosed = snapshot => {
      if (!['idle', 'stopped', 'disconnected', 'fault'].includes(snapshot.phase)
        || snapshot.connected || snapshot.session_id || snapshot.cleanup_pending || snapshot.cleanup_failed || snapshot.connecting
        || /SDK 关闭失败|无法确认电机已关闭/.test(snapshot.error || '')) {
        throw new Error(snapshot.error || '尚未确认 LumosTouch 电机已关闭，请检查设备。');
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
