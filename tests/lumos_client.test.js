import test from 'node:test';
import assert from 'node:assert/strict';
import { LumosClient, localLumosApi, parseLumosMapping } from '../Browser_SDK/src/lumos_client.js';

const identity = { leaderProfile: { code: 'TOUCH', role: 'leader' }, leaderConnectionId: 'touch-1', canInterface: 'can0', enableConfirmed: true };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ fetchHook, readLeader = async () => ({ leaderDeg: [1, 2, 3, 4, 5, 6], gripperDeg: 123.4 }), assertIdentity = () => {} } = {}) {
  const calls = [], timers = new Map(), faults = [];
  let index = 0;
  let state = { phase: 'idle', connected: false, session_id: null };
  const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => structuredClone({ gripper_type: 'TypeLJ', gripper_config_error: null, ...body }) });
  const client = new LumosClient({
    api: 'http://127.0.0.1:18766/api/v1/lumos', readLeader, assertIdentity,
    onFault: error => faults.push(error.message),
    schedule: callback => { timers.set(++index, callback); return index; }, cancel: token => timers.delete(token),
    fetchImpl: async (url, options) => {
      const action = url.split('/').at(-1), body = options.body && JSON.parse(options.body);
      calls.push({ action, body });
      const custom = await fetchHook?.({ action, body, state, respond });
      if (custom) return custom;
      if (action === 'status') return respond(state);
      if (action === 'connect') state = { phase: 'connected', connected: true, session_id: 'session-1', positions_rad: [0, 0, 0, 0, 0, 0] };
      else if (!state.session_id || state.session_id !== body.session_id) return respond({ error: { code: 'stale_session', message: '会话已过期' } }, false);
      else if (action === 'stop' || action === 'disconnect') state = { phase: 'stopped', connected: false, session_id: null };
      else if (action === 'capture-reference') state.phase = 'calibrating';
      else if (action === 'finish-calibration') state.phase = 'preview';
      else if (action === 'start') state.phase = 'running';
      return respond(state);
    },
  });
  client.serviceStatus = { phase: 'idle', connected: false, gripper_type: 'TypeLJ' };
  const tick = async () => {
    const [token, callback] = timers.entries().next().value || [];
    if (!callback) throw new Error('No scheduled sample');
    timers.delete(token); callback(); await client.inFlight;
  };
  return { client, calls, timers, faults, tick };
}

test('Lumos API is limited to the separate loopback launcher origin', () => {
  assert.equal(localLumosApi({ href: 'http://127.0.0.1:18766/index.html' }), 'http://127.0.0.1:18766/api/v1/lumos');
  assert.equal(localLumosApi({ href: 'http://localhost:18766/' }), 'http://localhost:18766/api/v1/lumos');
  for (const href of ['https://fashionstar.com.cn/index.html', 'http://127.0.0.1:18765/', 'http://example.com:18766/']) assert.equal(localLumosApi({ href }), null);
});

test('mapping must be a complete permutation, six signs, and bounded gain', () => {
  assert.deepEqual(parseLumosMapping({ jointMap: '0,1,2,3,4,5', signs: '-1,1,1,1,-1,-1', gain: '0.3' }), {
    joint_map: [0, 1, 2, 3, 4, 5], signs: [-1, 1, 1, 1, -1, -1], gain: 0.3,
  });
  for (const override of [{ jointMap: '0,0,2,3,4,5' }, { jointMap: '0,1,2,3,4,6' }, { signs: '1,1,0,1,1,1' }, { gain: '0' }, { gain: '1.01' }]) {
    assert.throws(() => parseLumosMapping({ jointMap: '0,1,2,3,4,5', signs: '1,1,1,1,1,1', gain: 0.3, ...override }));
  }
});

test('construction, denied pairing, and unchecked enable perform zero requests', async () => {
  const { client, calls } = fixture();
  assert.deepEqual(calls, []);
  await assert.rejects(client.connect({ ...identity, leaderProfile: { code: 'LD', role: 'leader' } }), /仅允许/);
  await assert.rejects(client.connect({ ...identity, enableConfirmed: false }), /确认/);
  assert.deepEqual(calls, []);
});

test('calibration samples do not start motion; start is explicit and stop revokes once', async () => {
  const { client, calls, timers, tick } = fixture();
  await client.connect(identity);
  assert.equal(timers.size, 1);
  await tick();
  await client.command('capture-reference', { joint_map: [0, 1, 2, 3, 4, 5], signs: [1, 1, 1, 1, 1, 1], gain: 0.3 });
  await client.command('capture-gripper', { position: 'closed' });
  await client.command('capture-gripper', { position: 'open' });
  await client.command('finish-calibration');
  assert.equal(client.ready, true);
  assert.equal(calls.some(call => call.action === 'start'), false);
  assert.equal(timers.size, 1, 'command completion must not create duplicate poll timers');
  await client.command('start', { confirmed: true });
  assert.equal(client.running, true);
  const samples = calls.filter(call => call.action === 'sample');
  assert.deepEqual(samples.map(call => call.body.sequence), samples.map((_, index) => index + 1));
  assert(samples.every(call => call.body.leader_deg.length === 6));
  assert(samples.every(call => call.body.leader_gripper_deg === 123.4), 'gripper channel is raw, never clamped or scaled');
  assert(calls.filter(call => ['capture-reference', 'capture-gripper'].includes(call.action)).every(call => call.body.leader_gripper_deg === 123.4));
  await client.shutdown();
  assert.equal(client.connected, false);
  assert.equal(timers.size, 0);
  assert.equal(calls.filter(call => call.action === 'stop').length, 1);
  assert.equal(calls.filter(call => call.action === 'disconnect').length, 0, 'stop already closes and revokes the backend lease');
});

test('fresh Leader failure ends sampling, stops the lease, and never retries motion', async () => {
  const { client, calls, timers, tick, faults } = fixture({ readLeader: async () => { throw new Error('本次六轴缺失'); } });
  await client.connect(identity);
  await tick();
  assert.equal(client.connected, false);
  assert.equal(timers.size, 0);
  assert.deepEqual(faults, ['本次六轴缺失']);
  assert.equal(calls.some(call => call.action === 'sample'), false);
  assert.equal(calls.filter(call => call.action === 'stop').length, 1);
});

test('connection identity is checked again after a pending Leader read', async () => {
  const wait = deferred();
  let current = true;
  const { client, calls, tick } = fixture({
    readLeader: () => wait.promise,
    assertIdentity: () => { if (!current) throw new Error('Leader身份变化'); },
  });
  await client.connect(identity);
  const sampling = tick();
  current = false; wait.resolve({ leaderDeg: [1, 2, 3, 4, 5, 6], gripperDeg: 30 });
  await sampling;
  assert.equal(client.connected, false);
  assert.equal(calls.some(call => call.action === 'sample'), false);
});

test('late connect after cancellation is stopped with its original Leader identity', async () => {
  const wait = deferred();
  const { client, calls, timers } = fixture({ fetchHook: async ({ action }) => { if (action === 'connect') await wait.promise; } });
  const connecting = client.connect(identity);
  while (!calls.some(call => call.action === 'connect')) await Promise.resolve();
  await client.shutdown('急停');
  wait.resolve();
  await assert.rejects(connecting, /取消/);
  const stop = calls.find(call => call.action === 'stop');
  assert.equal(stop.body.session_id, 'session-1');
  assert.equal(stop.body.leader_connection_id, 'touch-1');
  assert.equal(client.connected, false);
  assert.equal(timers.size, 0);
});

test('structured API error messages remain readable', async () => {
  const { client } = fixture({ fetchHook: async ({ action, respond }) => action === 'connect'
    ? respond({ error: { code: 'can_unavailable', message: 'CAN 接口未启动' } }, false) : null });
  await assert.rejects(client.connect(identity), error => error.message === 'CAN 接口未启动' && error.code === 'can_unavailable');
});

test('backend cleanup failure stays visible and blocks reconnect', async () => {
  const { client } = fixture({ fetchHook: async ({ action, respond }) => ['stop', 'disconnect', 'status'].includes(action)
    ? respond({ phase: 'fault', connected: false, session_id: null, cleanup_failed: true, error: 'SDK 关闭失败' }) : null });
  await client.connect(identity);
  await assert.rejects(client.shutdown(), /SDK 关闭失败/);
  assert.equal(client.snapshot.phase, 'fault');
  await assert.rejects(client.connect(identity), /SDK 关闭失败/);
  await assert.rejects(client.shutdown(), /SDK 关闭失败/);
});

test('missing gripper feedback stops the complete session even with six valid arm axes', async () => {
  const { client, calls, timers, tick, faults } = fixture({ readLeader: async () => ({ leaderDeg: [1, 2, 3, 4, 5, 6] }) });
  await client.connect(identity); await tick();
  assert.equal(client.connected, false);
  assert.equal(timers.size, 0);
  assert.match(faults[0], /夹爪回读缺失/);
  assert.equal(calls.some(call => call.action === 'sample'), false);
  assert.equal(calls.filter(call => call.action === 'stop').length, 1);
});

test('checking SDK gripper configuration is read-only and a changed type blocks enable', async () => {
  const { client, calls } = fixture();
  client.serviceStatus = null;
  await client.checkService();
  assert.deepEqual(calls.map(call => call.action), ['status']);
  client.serviceStatus.gripper_type = 'TypeFZ';
  await assert.rejects(client.connect(identity), /类型/);
  assert.equal(calls.some(call => call.action === 'connect'), false);
});
