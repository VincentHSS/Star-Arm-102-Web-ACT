// Bound both network and body waits. Mutations are never automatically retried.
export function requestTimeout(url, options = {}) {
  if (options.timeoutMs !== undefined) return options.timeoutMs;
  const path = new URL(url, 'http://localhost').pathname;
  if (/(\/import|\/export)$/.test(path)) return 180000;
  if (path.endsWith('/health')) return 2500;
  if (path.endsWith('/capabilities')) return 12000;
  return !options.method || options.method === 'GET' ? 6000 : 15000;
}

export async function fetchWithDeadline(fetcher, url, options = {}, consume = response => response) {
  const { timeoutMs, signal: externalSignal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Request timed out', 'TimeoutError'));
  }, requestTimeout(url, options));
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    return await consume(response);
  } catch (error) {
    if (timedOut) {
      const mutation = init.method && init.method !== 'GET';
      const message = mutation
        ? '本机服务响应超时，操作可能已提交。请检查设备或任务状态后再操作。'
        : '本机服务响应超时，请检查 Ubuntu 组件是否运行，再点击重试。';
      const timeout = new Error(message); timeout.code = 'request_timeout'; throw timeout;
    }
    if (externalSignal?.aborted) throw error;
    if (error instanceof TypeError) throw new Error('无法连接本机服务，请检查 Ubuntu 组件及浏览器的本机网络访问权限。');
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abort);
  }
}

export function requestJson(fetcher, url, options = {}) {
  return fetchWithDeadline(fetcher, url, options, async response => {
    let body;
    try { body = await response.json(); }
    catch (error) {
      // Aborted or stalled response bodies must not become a successful empty object.
      if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
      throw new Error(`本机服务返回无效响应（HTTP ${response.status}），请检查服务状态。`);
    }
    if (!response.ok) {
      const error = new Error(body.error?.message || `HTTP ${response.status}`);
      error.details = body.error?.details || []; error.code = body.error?.code; throw error;
    }
    return body;
  });
}
