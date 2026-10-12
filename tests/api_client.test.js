import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson, requestTimeout } from '../Browser_SDK/src/api-client.js';

const stalled = signal => new Promise((resolve, reject) => {
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('hung reads time out, including a response whose body never finishes', async () => {
  await assert.rejects(requestJson((url, { signal }) => stalled(signal), '/state', { timeoutMs: 20 }), /响应超时/);
  await assert.rejects(requestJson(async (url, { signal }) => ({ ok: true, status: 200, json: () => stalled(signal) }), '/state', { timeoutMs: 20 }), /响应超时/);
});

test('timed-out mutations are sent once and explain their uncertain completion', async () => {
  let calls = 0;
  await assert.rejects(requestJson((url, { signal }) => { calls++; return stalled(signal); }, '/devices/serial/connect', { method: 'POST', timeoutMs: 20 }), /操作可能已提交/);
  assert.equal(calls, 1);
});

test('external cancellation is preserved and completed calls remove their listener', async () => {
  const controller = new AbortController();
  const pending = requestJson((url, { signal }) => stalled(signal), '/state', { signal: controller.signal });
  controller.abort(new DOMException('Cancelled', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(await requestJson(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) }), '/models'), { items: [] });
});

test('large imports get a longer deadline and API errors retain their details', async () => {
  assert(requestTimeout('/datasets/import', { method: 'POST' }) > requestTimeout('/devices'));
  await assert.rejects(requestJson(async () => ({ ok: false, status: 409, json: async () => ({ error: { message: '设备忙', code: 'busy', details: ['串口'] } }) }), '/state'), error => error.code === 'busy' && error.details[0] === '串口');
});
