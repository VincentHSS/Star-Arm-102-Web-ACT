const INITIAL_CHUNK = 64 * 1024;
const MIN_CHUNK = 8 * 1024;

function checkCurrent(isCurrent) {
  if (!isCurrent()) throw new DOMException('模型已切换，停止读取旧模型', 'AbortError');
}

function retryable(error) {
  if (error.retryable === false) return false;
  if (Number.isFinite(error.status)) return [408, 429].includes(error.status) || error.status >= 500;
  return ['TimeoutError', 'NetworkError', 'AbortError'].includes(error.name)
    || (error instanceof TypeError && /fetch|network|load|terminated|传输不完整/i.test(error.message));
}

// Keep a verified contiguous prefix in memory. A failed stream resumes at its
// next byte, rather than discarding data received before a connection reset.
export async function downloadResource(url, {
  size, fetchImpl = (...args) => fetch(...args), timeout = 60000,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  isCurrent = () => true,
  preferFullFile = false, cache = 'no-store',
} = {}) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 64 * 1024 * 1024) throw new TypeError('资源大小无效');
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError('网络等待时间无效');
  const output = new Uint8Array(size);
  let downloaded = 0, chunkBytes = INITIAL_CHUNK, failures = 0;
  let useRange = !preferFullFile, rangeSupported = true;
  while (downloaded < size) {
    checkCurrent(isCurrent);
    const start = downloaded, end = Math.min(size - 1, start + chunkBytes - 1);
    const controller = new AbortController();
    let timer, poll, stopped = null, reader, response;
    const stop = error => { stopped ??= error; controller.abort(); };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const error = new Error(`网络连续 ${Math.round(timeout / 1000)} 秒未收到数据`);
        error.name = 'TimeoutError'; stop(error);
      }, timeout);
    };
    arm();
    poll = setInterval(() => {
      if (!isCurrent()) stop(new DOMException('模型已切换，停止读取旧模型', 'AbortError'));
    }, 250);
    try {
      response = await fetchImpl(url, {
        headers: useRange ? { Range: `bytes=${start}-${end}` } : {},
        cache, signal: controller.signal,
      });
      checkCurrent(isCurrent);
      if (useRange && [400, 405, 416].includes(response.status)) {
        useRange = false; rangeSupported = false;
        continue;
      }
      if (![200, 206].includes(response.status)) {
        const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error;
      }
      if (/text\/html/i.test(response.headers.get('Content-Type') || '')) {
        const error = new Error('服务器把资源返回为首页 HTML，请完整上传文件并检查网站路由');
        error.retryable = false; throw error;
      }
      let wireStart = 0, expected = size;
      if (response.status === 206) {
        const range = response.headers.get('Content-Range')?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
        if (!range || Number(range[1]) !== start || Number(range[2]) !== end || Number(range[3]) !== size) {
          const error = new Error('服务器返回的分段范围不正确，请检查 CDN / 代理缓存');
          error.retryable = false; throw error;
        }
        wireStart = start; expected = end - start + 1;
      }
      let received = 0;
      const accept = bytes => {
        checkCurrent(isCurrent);
        if (received + bytes.length > expected) {
          const error = new Error('服务器返回的数据超过预期大小'); error.retryable = false; throw error;
        }
        if (bytes.length) arm();
        const position = wireStart + received;
        const skip = Math.max(0, downloaded - position);
        if (skip < bytes.length) {
          output.set(bytes.subarray(skip), position + skip);
          downloaded = position + bytes.length;
        }
        received += bytes.length;
      };
      if (response.body?.getReader) {
        reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accept(value);
        }
      } else {
        accept(new Uint8Array(await response.arrayBuffer()));
      }
      if (received !== expected) throw new TypeError('资源网络传输不完整');
      checkCurrent(isCurrent);
      failures = 0;
    } catch (problem) {
      checkCurrent(isCurrent);
      const error = stopped || problem;
      if (!retryable(error)) throw error;
      // Healthy connections use one continuous request. Only a broken stream
      // needs small Range requests to resume its already received prefix.
      if (preferFullFile && rangeSupported) useRange = true;
      failures = downloaded > start ? 0 : failures + 1;
      // Smaller requests tolerate slow Ubuntu links and intermediaries better.
      chunkBytes = Math.max(MIN_CHUNK, Math.floor(chunkBytes / 2));
      if (failures >= 4) throw error;
      // End this request's watchdog before retry backoff.
      clearTimeout(timer); clearInterval(poll); controller.abort();
      await wait(200 * 2 ** Math.min(failures, 3));
    } finally {
      clearTimeout(timer); clearInterval(poll);
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      else if (response?.body) void response.body.cancel().catch(() => {});
      controller.abort();
    }
  }
  return output;
}
