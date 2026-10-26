import { MESH_TRANSPORT_MANIFEST } from './mesh_transport_manifest.js?v=server-1.0.35';
import { downloadResource } from './resource_download.js?v=server-1.0.35';
import { gunzipSync } from '../assets/vendor/fflate/browser.js';
import { meshAssetCache } from './mesh_asset_cache.js?v=server-1.0.35';

const resources = new Map(Object.entries(MESH_TRANSPORT_MANIFEST).map(([path, entry]) =>
  [new URL(path, import.meta.url).href, entry]));

function checkCurrent(isCurrent) {
  if (!isCurrent()) throw new DOMException('模型已切换，停止读取旧模型', 'AbortError');
}

async function verify(bytes, length, digest) {
  if (bytes.length !== length) throw new Error('模型大小校验失败，请完整更新 assets 目录');
  if (globalThis.crypto?.subtle) {
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== digest) throw new Error('模型内容校验失败，请清理 CDN 缓存并完整更新 assets 目录');
  }
}

// Display data only: the same STL bytes are parsed after decompression.
export function createStlAssetLoader(parse, {
  fetchImpl = (...args) => fetch(...args), timeout = 60000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  cache = meshAssetCache,
} = {}) {
  return async (url, { isCurrent = () => true } = {}) => {
    const source = new URL(url);
    source.search = '';
    source.hash = '';
    const entry = resources.get(source.href);
    if (!entry) throw new Error('模型传输清单中缺少资源，请完整更新网页文件');
    const options = { fetchImpl, timeout, wait, isCurrent, preferFullFile: true, cache: 'default' };
    let packedError;
    try {
      const packedUrl = new URL(entry.packed, import.meta.url);
      packedUrl.searchParams.set('v', entry.packedSha256.slice(0, 16));
      let packed = null;
      try { packed = await cache?.get(packedUrl.href); } catch {}
      if (packed) {
        try { await verify(packed, entry.packedBytes, entry.packedSha256); }
        catch { packed = null; try { await cache?.delete(packedUrl.href); } catch {} }
      }
      checkCurrent(isCurrent);
      const cached = Boolean(packed);
      packed ??= await downloadResource(packedUrl.href, { ...options, size: entry.packedBytes });
      await verify(packed, entry.packedBytes, entry.packedSha256);
      checkCurrent(isCurrent);
      // Bundled decoder also supports Ubuntu browsers without native gzip streams.
      const raw = gunzipSync(packed);
      await verify(raw, entry.bytes, entry.sha256);
      checkCurrent(isCurrent);
      const geometry = parse(raw.buffer);
      if (!cached) {
        try { void Promise.resolve(cache?.put(packedUrl.href, packed)).catch(() => {}); } catch {}
      }
      return geometry;
    } catch (error) {
      checkCurrent(isCurrent);
      packedError = error;
    }
    try {
      source.searchParams.set('v', entry.sha256.slice(0, 16));
      const raw = await downloadResource(source.href, { ...options, size: entry.bytes });
      await verify(raw, entry.bytes, entry.sha256);
      checkCurrent(isCurrent);
      return parse(raw.buffer);
    } catch (error) {
      checkCurrent(isCurrent);
      const failure = new Error(`压缩模型：${packedError.message}；原始模型：${error.message}`, { cause: error });
      failure.status = error.status;
      throw failure;
    }
  };
}
