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
  const windows = health?.platform === 'win32' || /Win/i.test(navigator.platform || '');
  const install = panel.querySelector('[data-runtime-install]');
  const authorize = panel.querySelector('[data-runtime-authorize]');
  const download = panel.querySelector('.runtime-download');
  if (windows) {
    panel.querySelector('.runtime-onboarding-head > span').textContent = 'Windows 模型执行';
    install.querySelector('h4').textContent = '启动本机工作台';
    install.querySelector('p').textContent = '下载并完整解压源码，双击根目录 start_windows.bat。脚本会打开本机网页；需要 Python 3.10～3.12。';
    download.textContent = present ? '允许当前网站连接' : '下载 Windows 源码';
    authorize.querySelector('h4').textContent = '连接当前网站';
    authorize.querySelector('p').textContent = '可使用脚本打开的本机网页。使用服务器网站时，在这里点击连接，并在本机确认页允许当前网站；以后自动复用连接。';
    panel.querySelector('[data-runtime-environment] p').textContent = '第 2 步自动准备 Windows ACT 执行环境，第 3 步导入 Ubuntu 训练好的完整模型，第 4 步连接 COM 从臂与双相机。';
  }
  panel.querySelector('[data-runtime-install]').classList.toggle('done', present);
  panel.querySelector('[data-runtime-authorize]').classList.toggle('done', online);
  if (online) return;
  const button = document.getElementById('training-prepare');
  button.classList.remove('hidden');button.textContent = '检查并自动配置环境';
  document.getElementById('training-title').textContent = '自动检测并配置 ACT 环境';
  document.getElementById('training-reason').textContent = '本机组件安装后自动连接，环境准备统一在第 2 步完成。';
  document.getElementById('training-tag').textContent = present ? (windows ? '等待网站连接' : '网站配置不匹配') : (windows ? '等待本机启动' : '等待系统安装');
  const status = panel.querySelector('#runtime-setup-status');
  panel.dataset.state = downloadError || present ? 'error' : 'waiting';
  if (windows) {
    document.getElementById('training-reason').textContent = '先启动 Windows 本机网页，后续运行环境在第 2 步自动准备。训练仍使用 Ubuntu。';
    status.textContent = downloadError || (present ? '本机服务已启动，点击“允许当前网站连接”，在打开的本机页面确认后返回这里。' : '下载源码并解压后双击 start_windows.bat。可在自动打开的网页操作，也可返回本网站完成一次连接确认。');
    return;
  }
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
    if (health?.platform === 'win32' || /Win/i.test(navigator.platform || '')) {
      if (health?.browser_bridge && health.authorized === false) {
        window.open(`${LOCAL_ORIGIN}/connect-website?origin=${encodeURIComponent(location.origin)}`, '_blank', 'noopener,noreferrer');
        requested = true; return;
      }
      const anchor=document.createElement('a');anchor.href='https://github.com/VincentHSS/Star-Arm-102-Web-ACT/archive/refs/heads/main.zip';anchor.download='Star-Arm-102-Web-ACT-main.zip';document.body.append(anchor);anchor.click();anchor.remove();return;
    }
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
