import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageNavigator } from '../Browser_SDK/src/page-lifecycle.js';

test('navigation waits for stopped control and released ports, coalescing repeat clicks', async () => {
  const calls = []; let finish;
  const navigate = createPageNavigator({ release: () => { calls.push('release'); return new Promise(resolve => { finish = resolve; }); }, activate: page => calls.push(page) });
  const first = navigate('models'); const second = navigate('models');
  assert.equal(first, second);
  await Promise.resolve(); assert.deepEqual(calls, ['release']);
  finish(); assert.equal(await first, true); assert.deepEqual(calls, ['release', 'models']);
});

test('release failures keep the current page and clear busy state for another attempt', async () => {
  const calls = []; let fail = true;
  const navigate = createPageNavigator({ release: async () => { if (fail) throw new Error('串口未释放'); }, activate: page => calls.push(page),
    onPending: (page, busy) => calls.push(busy), onError: error => calls.push(error.message) });
  assert.equal(await navigate('train'), false); assert.deepEqual(calls, [true, '串口未释放', false]);
  fail = false; assert.equal(await navigate('train'), true); assert.deepEqual(calls.slice(3), [true, 'train', false]);
});
