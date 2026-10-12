import { createWebsiteInstaller } from './act-installer.js?v=upload-only-1';
const LOCAL_ORIGIN = 'http://127.0.0.1:18765';
export function getLocalOrigin() { return LOCAL_ORIGIN; }
export function getLocalApi() { return `${LOCAL_ORIGIN}/api/v1`; }
export function localFetch(url, options = {}) { return fetch(url, { targetAddressSpace: 'loopback', ...options }); }

const panel = document.getElementById('runtime-onboarding');
let health = null, checking = null, announced = false, requested = false, downloaded = false, environment = null;
let buildingInstaller = false, downloadError = '';
export function publicationConfigured() { return true; }
const connected = () => health?.status === 'ok' && health.browser_bridge === true && health.authorized !== false;
function render() {
  if (!panel) return;
  const online = connected(), present = Boolean(health?.browser_bridge);
  panel.hidden = online;
  panel.querySelector('[data-runtime-install]').classList.toggle('done', present);
  panel.querySelector('[data-runtime-authorize]').classList.toggle('done', online);
  if (online) return;
  const button = document.getElementById('training-prepare');
  button.classList.remove('hidden');button.textContent = '检查并自动配置环境';
  document.getElementById('training-title').textContent = '自动检测并配置 ACT 环境';
  document.getElementById('training-reason').textContent = '本机组件安装后自动连接，环境准备统一在第 2 步完成。';
  document.getElementById('training-tag').textContent = present ? '网站配置不匹配' : '等待系统安装';
  const status = panel.querySelector('#runtime-setup-status');
  panel.dataset.state = downloadError || present ? 'error' : 'waiting';
  status.textContent = buildingInstaller ? '正在生成适用于当前网站的 Ubuntu 安装文件…' : downloadError || (present ? '本机组件尚未允许当前网站。请下载这里自动生成的安装文件更新，网页会自动写入当前网址；无需填写地址或手动连接。' : downloaded ? '已生成并发起下载。请在 Ubuntu 系统安装器中打开 .deb，点击“安装”并完成系统授权。安装后组件会自动在后台运行，网页正在持续检测；不需要打开软件或点击启动。' : '首次在 Ubuntu 安装器中安装一次运行组件，网页会自动写入当前网址。安装后自动连接并准备 ACT 环境，无需填写地址。');
}
async function detect() {
  if (checking) return checking;
  checking = (async()=>{
    try {
      const response = await localFetch(`${getLocalApi()}/health`, {signal:AbortSignal.timeout(1800)});
      const value = response.ok ? await response.json() : null;
      health = value?.status === 'ok' && value.browser_bridge === true ? value : null;
    } catch { health = null; }
    finally { checking = null; }
    if (connected()) {
      if (!announced) { announced = true;window.dispatchEvent(new Event('act:runtime-connected')); }
      if (requested) { requested = false;queueMicrotask(()=>window.dispatchEvent(new Event('act:runtime-auto-prepare'))); }
    }
    if (!connected()) announced = false;
    render();return connected();
  })();
  return checking;
}
export async function ensureRuntime() {
  if (await detect()) { requested = false;return true; }
  requested = true;
  document.querySelector('.workflow [data-view="train"]')?.click();
  render();return false;
}
export function renderRuntimeEnvironment(value) {
  environment = value;
  if (panel) panel.querySelector('[data-runtime-environment]').classList.toggle('done', value.status === 'ready');
  render();
}
if (panel) {
  const download=panel.querySelector('.runtime-download');
  download.addEventListener('click',async event=>{
    event.preventDefault();if(buildingInstaller)return;
    buildingInstaller=true;downloadError='';download.setAttribute('aria-disabled','true');render();
    try {
      const installer=await createWebsiteInstaller();const url=URL.createObjectURL(installer.blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=installer.filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);downloaded=true;
    } catch(error){downloadError=`安装文件生成失败：${error.message}`;}
    finally {buildingInstaller=false;download.removeAttribute('aria-disabled');render();}
  });
  const poll = setInterval(() => { if (!document.hidden || requested) void detect(); }, 3500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void detect(); });
  window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
  detect();
}
