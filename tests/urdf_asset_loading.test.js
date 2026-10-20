import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModelAssets } from '../Browser_SDK/src/model_asset_loader.js';

const parts = Array.from({ length: 21 }, (_, index) => ({
  link: `link_${index}`, url: `../assets/urdf/ld-touch/meshes/part-${index}.stl?v=7c681191`,
}));
const baseUrl = 'https://example.test/wiki/robot/Browser_SDK/src/robot_model.js?v=current';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('all 21 mesh URLs preserve a nested website path and query, with four downloads at most', async () => {
  let active = 0, maximum = 0;
  const urls = [];
  const result = await loadModelAssets(parts, {
    baseUrl,
    load: async url => {
      urls.push(url);
      maximum = Math.max(maximum, ++active);
      await tick();
      --active;
      return { url, dispose() {} };
    },
  });
  assert.equal(maximum, 4);
  assert.equal(result.length, 21);
  assert.deepEqual(result.map(item => item.link), parts.map(item => item.link));
  assert.ok(urls.every(url => url.startsWith('https://example.test/wiki/robot/Browser_SDK/assets/urdf/ld-touch/meshes/')));
  assert.ok(urls.every(url => url.endsWith('?v=7c681191')));
});

test('one transient fetch failure is retried, but persistent network failure reports the exact resource', async () => {
  let calls = 0;
  const options = {
    baseUrl, wait: async () => {},
    load: async () => { if (++calls === 1) throw new TypeError('Failed to fetch'); return { dispose() {} }; },
  };
  assert.equal((await loadModelAssets(parts.slice(0, 1), options)).length, 1);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(loadModelAssets(parts.slice(0, 1), {
    ...options, load: async () => { calls++; throw new TypeError('Failed to fetch'); },
  }), error => error.assetUrl.endsWith('part-0.stl?v=7c681191') && /part-0\.stl/.test(error.message));
  assert.equal(calls, 2);
});

test('HTTP 404 and malformed geometry are never retried or hidden as transient failures', async () => {
  for (const cause of [Object.assign(new Error('Not Found'), { response: { status: 404 } }),
    new TypeError('Invalid STL geometry')]) {
    let calls = 0;
    await assert.rejects(loadModelAssets(parts.slice(0, 1), {
      baseUrl, load: async () => { calls++; throw cause; },
    }), error => error.cause === cause && error.assetUrl.includes('part-0.stl'));
    assert.equal(calls, 1);
  }
});

test('a failed asset disposes already downloaded geometry and drains in-flight requests', async () => {
  let disposed = 0;
  await assert.rejects(loadModelAssets(parts, {
    baseUrl,
    load: async url => {
      await tick();
      if (url.includes('part-1.stl')) throw Object.assign(new Error('Not Found'), { response: { status: 404 } });
      return { dispose() { disposed++; } };
    },
  }), /HTTP 404/);
  assert.ok(disposed >= 3);
});

test('switching models discards stale downloads and suppresses their late errors', async () => {
  let current = true, disposed = 0, calls = 0;
  const result = await loadModelAssets(parts, {
    baseUrl, isCurrent: () => current,
    load: async url => {
      calls++;
      await tick();
      current = false;
      if (url.includes('part-1.stl')) throw new TypeError('Failed to fetch');
      return { dispose() { disposed++; } };
    },
  });
  assert.deepEqual(result, []);
  assert.equal(calls, 4);
  assert.equal(disposed, 3);
});
