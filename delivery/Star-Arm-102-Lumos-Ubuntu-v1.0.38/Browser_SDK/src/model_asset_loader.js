// Keep STL downloads bounded so a multi-part arm does not flood a local server.
function isTransientNetworkError(error) {
  if (error?.response || Number.isFinite(error?.status)) return false;
  return error?.name === 'NetworkError'
    || (error instanceof TypeError && /fetch|network|load failed/i.test(error.message));
}

function assetError(error, url) {
  const resource = new URL(url);
  const name = decodeURIComponent(resource.pathname.split('/').pop());
  const status = error?.response?.status ?? error?.status;
  const reason = status ? `HTTP ${status}` : error?.message || '网络读取失败';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(resource.hostname);
  const hint = resource.protocol === 'file:'
    ? '请完整解压后运行启动脚本，通过本地 HTTP 页面打开。'
    : status === 404 ? '请核对完整解压或服务器上传的 assets 目录。'
      : local ? '请检查本地启动窗口和网络连接，然后重新选择该型号。'
        : '请检查服务器 / CDN 的资源下载和网络连接，完整更新 assets 与 src 后强制刷新网页。';
  const result = new Error(`${name} 加载失败：${reason}。${hint} 资源：${url}`, { cause: error });
  result.assetUrl = url;
  result.status = status;
  return result;
}

export async function loadModelAssets(parts, {
  baseUrl, load, isCurrent = () => true, concurrency = 4,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('资源并发数无效');
  const loaded = new Array(parts.length);
  let next = 0;
  let failure = null;
  async function worker() {
    while (!failure && isCurrent() && next < parts.length) {
      const index = next++;
      const part = parts[index];
      const url = new URL(part.url, baseUrl).href;
      try {
        let geometry;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { geometry = await load(url, { isCurrent }); break; }
          catch (error) {
            if (!isCurrent()) return;
            if (attempt || !isTransientNetworkError(error)) throw error;
            await wait(200);
            if (!isCurrent()) return;
          }
        }
        loaded[index] = { ...part, geometry };
      } catch (error) {
        failure ??= assetError(error, url);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, worker));
  if (failure || !isCurrent()) {
    for (const entry of loaded) entry?.geometry?.dispose();
    if (failure && isCurrent()) throw failure;
    return [];
  }
  return loaded;
}

// Repeated UI synchronization during startup must share the same model load.
export function createModelLoadGate(load) {
  let pending = null;
  return config => {
    if (pending?.key === config.key) return pending.promise;
    const request = { key: config.key, promise: load(config) };
    pending = request;
    const clear = () => { if (pending === request) pending = null; };
    request.promise.then(clear, clear);
    return request.promise;
  };
}
