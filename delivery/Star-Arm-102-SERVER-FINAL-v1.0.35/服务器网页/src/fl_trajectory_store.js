import { createFlTrajectory, validateFlTrajectory } from './fl_trajectory_model.js?v=server-1.0.35';

const DATABASE_NAME = 'star-arm-102-fl-trajectories';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'current';
const CURRENT_KEY = 'trajectory';

const clone = (value) => value == null ? null : structuredClone(value);

function validatedCopy(value) {
  const validation = validateFlTrajectory(value);
  if (!validation.valid) throw new TypeError(validation.errors.join('; '));
  return createFlTrajectory(value);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
  });
}

export function createIndexedDbTrajectoryDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('当前浏览器不支持 IndexedDB');
  let databasePromise = null;
  const open = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
    });
    return databasePromise;
  };
  const transaction = async (mode, operation) => {
    const database = await open();
    const tx = database.transaction(OBJECT_STORE, mode);
    const result = await operation(tx.objectStore(OBJECT_STORE));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务已中止'));
    });
    return result;
  };
  return {
    get: () => transaction('readonly', (store) => requestResult(store.get(CURRENT_KEY))),
    put: (value) => transaction('readwrite', (store) => requestResult(store.put(value, CURRENT_KEY))),
    delete: () => transaction('readwrite', (store) => requestResult(store.delete(CURRENT_KEY))),
  };
}

export class FlTrajectoryStore {
  constructor({ database } = {}) {
    this.database = database ?? createIndexedDbTrajectoryDatabase();
    this.current = null;
    this.loaded = false;
    this.persistenceError = null;
  }

  async load() {
    if (this.loaded) return clone(this.current);
    try {
      const stored = await this.database.get();
      this.current = stored == null ? null : validatedCopy(stored);
      this.persistenceError = null;
    } catch (error) {
      this.persistenceError = error;
    }
    this.loaded = true;
    return clone(this.current);
  }

  async save(value) {
    const copied = validatedCopy(value);
    this.current = copied;
    this.loaded = true;
    try {
      await this.database.put(clone(copied));
      this.persistenceError = null;
      return { trajectory: clone(copied), persisted: true, error: null };
    } catch (error) {
      this.persistenceError = error;
      return { trajectory: clone(copied), persisted: false, error };
    }
  }

  async delete() {
    this.current = null;
    this.loaded = true;
    try {
      await this.database.delete();
      this.persistenceError = null;
      return { persisted: true, error: null };
    } catch (error) {
      this.persistenceError = error;
      return { persisted: false, error };
    }
  }

  exportJson(value = this.current) {
    if (!value) throw new Error('没有可导出的轨迹');
    return JSON.stringify(validatedCopy(value), null, 2);
  }

  async importJson(text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new TypeError('轨迹 JSON 格式无效'); }
    const copied = validatedCopy(parsed);
    const saved = await this.save(copied);
    if (!saved.persisted) return clone(copied);
    return clone(saved.trajectory);
  }
}
