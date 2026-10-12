import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlTrajectory } from '../../Browser_SDK/src/fl_trajectory_model.js';
import { FlTrajectoryStore } from '../../Browser_SDK/src/fl_trajectory_store.js';

const trajectory = (name = '轨迹 A') => createFlTrajectory({
  name,
  createdAt: '2026-08-03T00:00:00.000Z',
  frames: [{ t: 0, jointsRad: [0, 1, -1, 0, 0, 0, 0.4] }],
});

function memoryDb({ failPut = false } = {}) {
  let value = null;
  return {
    async get() { return value; },
    async put(next) { if (failPut) throw new Error('quota'); value = structuredClone(next); },
    async delete() { value = null; },
  };
}

test('saves, loads and deletes the current FL trajectory', async () => {
  const store = new FlTrajectoryStore({ database: memoryDb() });
  await store.save(trajectory());
  assert.equal((await store.load()).name, '轨迹 A');
  await store.delete();
  assert.equal(await store.load(), null);
});

test('keeps an in-memory exportable trajectory when IndexedDB persistence fails', async () => {
  const store = new FlTrajectoryStore({ database: memoryDb({ failPut: true }) });
  const result = await store.save(trajectory('内存轨迹'));
  assert.equal(result.persisted, false);
  assert.match(result.error.message, /quota/);
  assert.equal((await store.load()).name, '内存轨迹');
  assert.equal(JSON.parse(store.exportJson()).name, '内存轨迹');
});

test('invalid JSON import is atomic and does not replace the current trajectory', async () => {
  const store = new FlTrajectoryStore({ database: memoryDb() });
  await store.save(trajectory('有效轨迹'));
  await assert.rejects(() => store.importJson('{bad'), /JSON/);
  await assert.rejects(() => store.importJson(JSON.stringify({ ...trajectory('错误'), robotModel: 'LD' })), /FL/);
  assert.equal((await store.load()).name, '有效轨迹');
});

test('valid JSON import and export return detached schema data', async () => {
  const store = new FlTrajectoryStore({ database: memoryDb() });
  const imported = await store.importJson(JSON.stringify(trajectory('导入轨迹')));
  imported.frames[0].jointsRad[0] = 1;
  assert.equal((await store.load()).frames[0].jointsRad[0], 0);
  const exported = JSON.parse(store.exportJson());
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.source, 'manual_fl');
});
