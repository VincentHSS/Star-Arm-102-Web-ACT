import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageNavigator, withButtonFeedback } from '../Browser_SDK/src/page-lifecycle.js';

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

function fakeButton() {
  const attributes = new Map([['aria-description', '原说明']]);
  return { disabled: false, dataset: {}, textContent: '连接主臂', childNodes: [{ type: 'svg' }, { type: 'label' }],
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
}

test('button feedback immediately opens the action, preserves label and children, and coalesces repeated clicks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const button = fakeButton(), children = button.childNodes;
  let invoked = false, finish;
  const first = withButtonFeedback(button, () => { invoked = true; return new Promise(resolve => { finish = resolve; }); },
    { label: '正在选择并连接…', restore: () => { button.disabled = true; } });
  assert.equal(invoked, true, 'serial picker must retain the click user activation');
  assert.equal(button.textContent, '连接主臂');
  assert.equal(button.childNodes, children);
  assert.equal(button.getAttribute('aria-description'), '正在选择并连接…');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.dataset.feedback, 'pending');
  assert.equal(withButtonFeedback(button, () => assert.fail('duplicate action')), first);
  finish(true); await first;
  assert.equal(button.dataset.feedback, 'success');
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(button.getAttribute('aria-description'), '原说明');
  assert.equal(button.disabled, true, 'business state owns the final disabled value');
  t.mock.timers.tick(1300); assert.equal(button.dataset.feedback, undefined);
});

test('handled failure and unknown results never receive a success flash', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failed = fakeButton();
  await withButtonFeedback(failed, async () => false, { isSuccessful: () => true });
  assert.equal(failed.dataset.feedback, 'error');
  assert.equal(failed.disabled, false);
  const unknown = fakeButton();
  await withButtonFeedback(unknown, async () => {});
  assert.equal(unknown.dataset.feedback, undefined);
  const unverified = fakeButton();
  await withButtonFeedback(unverified, async () => true, { isSuccessful: () => false });
  assert.equal(unverified.dataset.feedback, undefined);
});

test('thrown button errors retain visible details and release the operation for retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = globalThis.document;
  const status = { dataset: {}, hidden: true, setAttribute() {} };
  globalThis.document = { getElementById: () => status };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const button = fakeButton();
  await withButtonFeedback(button, () => { throw new Error('串口回读缺失'); });
  assert.equal(button.dataset.feedback, 'error');
  assert.equal(status.textContent, '串口回读缺失');
  assert.equal(status.dataset.kind, 'error');
  assert.equal(status.hidden, false);
  await withButtonFeedback(button, async () => true);
  assert.equal(button.dataset.feedback, 'success');
});

test('a prior result timer cannot clear a newer pending action', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const button = fakeButton();
  await withButtonFeedback(button, async () => true);
  let finish;
  const next = withButtonFeedback(button, () => new Promise(resolve => { finish = resolve; }));
  t.mock.timers.tick(1800);
  assert.equal(button.dataset.feedback, 'pending');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  finish(true); await next;
  assert.equal(button.dataset.feedback, 'success');
});
