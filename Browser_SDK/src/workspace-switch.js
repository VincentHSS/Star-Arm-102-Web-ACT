import { getLocalApi, localFetch } from './local-service.js?v=responsive-1';
const names = { act: 'ACT 工作台', piper: '控制台' };
const overlay = document.createElement('section');
overlay.id = 'workspace-switch-screen';
overlay.hidden = true;
overlay.setAttribute('role', 'dialog');overlay.setAttribute('aria-modal', 'true');overlay.setAttribute('aria-label', '切换工作台');overlay.tabIndex = -1;
overlay.innerHTML = `<div class="switch-atmosphere" aria-hidden="true"><div class="switch-horizon"></div><div class="switch-aurora"></div><div class="switch-particles"><i style="--particle:0"></i><i style="--particle:1"></i><i style="--particle:2"></i><i style="--particle:3"></i><i style="--particle:4"></i><i style="--particle:5"></i><i style="--particle:6"></i><i style="--particle:7"></i><i style="--particle:8"></i><i style="--particle:9"></i><i style="--particle:10"></i><i style="--particle:11"></i><i style="--particle:12"></i><i style="--particle:13"></i><i style="--particle:14"></i><i style="--particle:15"></i><i style="--particle:16"></i><i style="--particle:17"></i><i style="--particle:18"></i><i style="--particle:19"></i><i style="--particle:20"></i><i style="--particle:21"></i><i style="--particle:22"></i><i style="--particle:23"></i></div><div class="switch-sweep"></div><div class="switch-light left"></div><div class="switch-light right"></div></div><div class="switch-scene"><header><span class="switch-brand"><img src="assets/logo-icon.png" alt="">STAR ARM 102</span><span class="switch-label">LOCAL WORKSPACE / SYSTEM LINK</span></header><div class="switch-hero"><div class="switch-emblem" aria-hidden="true"><svg viewBox="0 0 260 180"><defs><linearGradient id="switch-spectrum" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c6a5f6"/><stop offset=".45" stop-color="#94abed"/><stop offset="1" stop-color="#61e0dc"/></linearGradient><radialGradient id="switch-core-glow"><stop stop-color="#77dce9" stop-opacity=".22"/><stop offset=".38" stop-color="#95a0e7" stop-opacity=".12"/><stop offset="1" stop-color="#77dce9" stop-opacity="0"/></radialGradient></defs><circle cx="130" cy="90" r="80" fill="url(#switch-core-glow)" stroke="none"/><g class="energy-orbit"><circle cx="130" cy="90" r="70" stroke-dasharray="70 10 18 12"/><ellipse cx="130" cy="90" rx="80" ry="38"/><circle cx="200" cy="90" r="2.5" fill="#a5dce9"/></g><g class="energy-orbit reverse"><circle cx="130" cy="90" r="52" stroke-dasharray="24 6"/><ellipse cx="130" cy="90" rx="58" ry="74" opacity=".4"/></g><g class="energy-core"><circle cx="130" cy="90" r="25" stroke-width="1.6"/><circle cx="130" cy="90" r="11" stroke-width=".75"/><circle cx="130" cy="90" r="3" fill="#d1f6fa" stroke="none"/></g><path class="energy-axis" d="M18 90h35m154 0h35M130 7v12m0 142v12"/></svg></div><p class="switch-kicker">CONNECTING YOUR WORKSPACE</p><h2 id="switch-title"></h2><p id="switch-message" role="status" aria-live="polite"></p><div class="switch-timeline"><div class="switch-stages"><span data-switch-phase="0">释放设备</span><i></i><span data-switch-phase="1">加载页面</span><i></i><span data-switch-phase="2">进入工作台</span></div><div class="switch-scan" aria-hidden="true"><i></i></div><div class="switch-delay" hidden><span>页面已准备</span><b id="switch-delay-label">5 秒后进入</b></div></div></div><footer><span class="switch-local-dot">本机工作台 · 配置与模型保留</span><button id="switch-cancel" type="button">返回当前页面</button></footer></div>`;
document.body.append(overlay);
let busy = false;
let cancelled = false;
let generation = 0;
let originFocus = null;
function phase(index, message) {
  overlay.querySelectorAll('[data-switch-phase]').forEach((node, i) => { node.classList.toggle('active', i === index);node.classList.toggle('done', i < index); });
  overlay.querySelector('#switch-message').textContent = message;
}
function show(target) {
  overlay.classList.remove('switch-error', 'switch-ready');overlay.hidden = false;
  overlay.querySelector('.switch-delay').hidden = true;
  overlay.style.setProperty('--switch-countdown', '0');
  overlay.querySelector('#switch-title').textContent = names[target];
  overlay.querySelector('#switch-cancel').textContent = '返回当前页面';
  originFocus = document.activeElement;
  overlay.focus({ preventScroll: true });
}
function hide() {
  overlay.hidden = true;busy = false;
  originFocus?.focus?.({ preventScroll: true });
}
async function response(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const result = await (url.startsWith(getLocalApi()) ? localFetch : fetch)(url, { cache: 'no-cache', signal: controller.signal });
    if (!result.ok) throw new Error(`页面加载失败（${result.status}）`);
    return result;
  } finally { clearTimeout(timeout); }
}
async function holdReady(operation) {
  overlay.classList.add('switch-ready');
  overlay.querySelector('.switch-delay').hidden = false;
  const duration = 5000;
  const started = performance.now();
  while (true) {
    if (cancelled || operation !== generation) return;
    const elapsed = performance.now() - started;
    const remaining = Math.max(0, duration - elapsed);
    overlay.querySelector('#switch-delay-label').textContent = remaining > 0 ? `${Math.ceil(remaining / 1000)} 秒后进入` : '正在切换';
    overlay.style.setProperty('--switch-countdown', String(Math.min(1, elapsed / duration)));
    if (remaining <= 0) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(125, remaining)));
  }
}
async function switchTo(link) {
  if (busy) return;
  const target = link.dataset.workspaceTarget;
  if (!names[target]) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  const operation = ++generation;
  busy = true;cancelled = false;show(target);
  phase(0, '正在结束当前控制并释放设备连接…');
  try {
    const waits = [];
    window.dispatchEvent(new CustomEvent('workbench:before-switch', { detail: { waits } }));
    const expected = document.getElementById('teleopView') ? 2 : 1;
    if (waits.length < expected) throw new Error('当前工作台还在初始化，请稍后再切换。');
    await Promise.all(waits);
    if (cancelled || operation !== generation) return;
    phase(1, '正在载入工作台页面与本机服务…');
    await response(url.href);
    // The static site can open the ACT setup page before the computer-side service is started.
    if (target === 'act') void localFetch(`${getLocalApi()}/health`, { signal: AbortSignal.timeout(1800) }).catch(() => {});
    if (cancelled || operation !== generation) return;
    phase(2, '页面已准备，稍候进入工作台');
    await holdReady(operation);
    if (cancelled || operation !== generation) return;
    location.assign(url.href);
  } catch (error) {
    if (cancelled || operation !== generation) return;
    overlay.classList.add('switch-error');
    phase(-1, error.name === 'AbortError' ? '页面加载超时，请检查本机服务后重试。' : error.message);
    overlay.querySelector('#switch-cancel').textContent = '返回并检查';
    busy = false;
  }
}
document.addEventListener('click', event => {
  const link = event.target.closest('[data-workspace-target]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();void switchTo(link);
});
overlay.querySelector('#switch-cancel').addEventListener('click', () => { cancelled = true;++generation;hide(); });
overlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') { cancelled = true;++generation;hide(); }
  if (event.key === 'Tab') { event.preventDefault();overlay.querySelector('#switch-cancel').focus(); }
});
window.addEventListener('pageshow', event => { if (event.persisted) { cancelled = true;++generation;hide(); } });
// Clear legacy handoff tickets without replaying the launch scene on the destination.
try { sessionStorage.removeItem('star-arm-workspace-transition'); } catch {}
