import { createWebsiteInstaller } from './act-installer.js?v=server-1.0.35';
import { downloadPublishedInstaller } from './published_installers.js?v=server-1.0.35';
import { getLanguage } from './i18n.js?v=server-1.0.35';

const say = (zh, en) => getLanguage() === 'en' ? en : zh;
export function chooseCan(devices, preferred) {
  if (devices.some(item => item.name === preferred)) return preferred;
  const saved = devices.filter(item => item.saved);
  if (saved.length === 1) return saved[0].name;
  return devices.length === 1 ? devices[0].name : '';
}

export async function companionRequest(api, path, body, { fetchImpl = fetch, timeout = 4000 } = {}) {
  const response = await fetchImpl(`${api}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store', targetAddressSpace: 'loopback', signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || say('本机组件请求失败', 'Local component request failed'));
  return result;
}

export function initLumosSetup({ client, selected, locked, canInput, onChange, onCheck, onDeviceChanged = () => {} }) {
  const el = id => document.getElementById(id);
  const status = el('lumosSetupStatus'), install = el('lumosInstall'), repair = el('lumosConfigureCan');
  const retry = el('lumosRetrySetup'), devices = el('lumosCanDevices');
  let health = null, items = [], pending = false, checking = false, error = '', checked = false;
  let preferredCan = '';
  const api = () => client.api;
  const localSource = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) && location.port === '18766';
  function render() {
    const active = locked();
    const companion = health?.service === 'star-arm-lumos-companion';
    install.hidden = localSource || companion && health.authorized;
    install.disabled = pending || active || !api();
    retry.hidden = !companion || health?.setup?.stage !== 'failed' || health.authorized === false;
    retry.disabled = pending || active;
    devices.hidden = !companion || health.authorized === false;
    devices.disabled = pending || active;
    const item = items.find(item => item.name === canInput.value);
    repair.hidden = !companion || health.authorized === false;
    repair.disabled = pending || active || health?.setup?.stage !== 'ready' || !item?.supported;
    repair.textContent = item?.ready ? say('保存 CAN 配置', 'Save CAN configuration') : say('配置 CAN · 系统授权', 'Configure CAN · system authorization');
    status.textContent = error || (pending ? say('正在处理，请完成系统授权后等待…', 'Working; complete system authorization and wait…')
      : companion ? health.authorized === false ? say(`本机组件尚未授权当前网站（${location.origin}）。请点击下方“安装 Ubuntu 连接组件”，在 Ubuntu 中安装下载的 .deb 后返回此页；仅上传网页不能更新本机授权。`, `The local component has not authorized this website (${location.origin}). Download the Ubuntu component below, install the .deb on Ubuntu, then return here. Uploading website files does not update local authorization.`)
        : health?.setup?.stage !== 'ready' ? health?.setup?.message
          : !items.length ? say('组件已就绪，未发现 CAN。请连接 USB-CAN 后重新检测；也请检查适配器驱动。', 'Component ready; no CAN found. Connect USB-CAN and check its driver, then detect again.')
            : !item ? say('发现多个 CAN 接口，请选择这台机械臂使用的设备。', 'Multiple CAN interfaces found; select the one for this arm.')
              : item.ready ? say(`组件和 ${item.name} 已就绪 · CAN 1 Mbps${item.saved ? ' · 已保存' : ''}`, `Component and ${item.name} ready · CAN 1 Mbps`)
                : item.reason || say(`${item.name} 尚未就绪，请点击配置 CAN 并完成系统授权。`, `${item.name} is not ready. Configure CAN with system authorization.`)
      : checked ? localSource ? say('源码本地控制台；CAN 由现场配置。', 'Source console; CAN is configured locally.')
        : say('未连接组件。首次请下载安装；安装后会自动准备环境。浏览器询问本机网络访问时请选择允许。', 'Component unavailable. Download and install it first; allow local network access when the browser asks.')
      : say('首次安装组件后，网页会自动检测连接。', 'Install the component once; this page will detect it automatically.'));
    status.classList.toggle('is-error', Boolean(error) || health?.authorized === false);
    canInput.hidden = companion && health.authorized !== false;
  }
  function showDevices(list) {
    const previousName = canInput.value;
    const previous = items.find(item => item.name === previousName);
    items = list;
    const choice = chooseCan(items, preferredCan);
    const current = items.find(item => item.name === choice);
    if (choice !== previousName || previous?.device_key !== current?.device_key || previous?.ready && !current?.ready) onDeviceChanged();
    devices.replaceChildren(new Option(say('选择 USB-CAN', 'Select USB-CAN'), ''));
    for (const item of items) devices.add(new Option(`${item.label} · ${item.ready ? '1 Mbps' : say('待配置', 'Setup needed')}`, item.name));
    devices.value = choice;
    canInput.value = choice;
    preferredCan = choice;
  }
  async function check({ explicit = false } = {}) {
    if (checking || pending || locked() || !api()) return;
    checking = true;
    try {
      if (localSource) {
        // Preserve the source console without requiring installed-package APIs.
        if (explicit) await onCheck();
        checked = true;
        return;
      }
      health = await companionRequest(api().replace(/\/lumos$/, ''), 'health');
      checked = true; error = '';
      if (health.service !== 'star-arm-lumos-companion') {
        health = null;
        throw new Error(say('检测到源码版或其他服务，请先在原终端正常退出，再打开已安装的 Lumos 连接助手。', 'Source or other service detected. Exit it normally before opening the installed Lumos assistant.'));
      }
      if (health.authorized && health?.setup?.stage === 'ready') {
        showDevices((await companionRequest(api(), 'devices')).items);
        await onCheck();
      }
    } catch (problem) {
      checked = true;
      if (explicit || health) error = problem.message;
      if (!client.connected) client.serviceStatus = null;
    } finally { checking = false; render(); onChange(); }
  }
  install.addEventListener('click', async () => {
    if (pending || locked()) return;
    pending = true; error = ''; render(); onChange();
    try {
      if (!downloadPublishedInstaller(location.origin, { kind: 'lumos' })) {
        const result = await createWebsiteInstaller(location.origin, { kind: 'lumos' });
        const url = URL.createObjectURL(result.blob), link = document.createElement('a');
        link.href = url; link.download = result.filename;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      error = say('下载已发起，请检查浏览器下载列表。完成后在 Ubuntu 中打开 .deb，安装并完成系统授权，再返回此页。', 'Download started; check the browser download list. Open the completed .deb on Ubuntu, install with system authorization, then return here.');
    } catch (problem) { error = problem.message; }
    finally { pending = false; render(); onChange(); }
  });
  devices.addEventListener('change', () => { preferredCan = devices.value; canInput.value = devices.value; onDeviceChanged(); render(); onChange(); });
  retry.addEventListener('click', async () => {
    if (pending || locked()) return;
    pending = true; error = ''; render(); onChange();
    try { await companionRequest(api(), 'setup/retry', {}); }
    catch (problem) { error = problem.message; }
    finally { pending = false; await check({ explicit: true }); }
  });
  repair.addEventListener('click', async () => {
    if (pending || locked()) return;
    const interfaceName = canInput.value;
    if (!items.some(item => item.name === interfaceName && item.supported)) return;
    pending = true; error = ''; render(); onChange();
    try {
      showDevices((await companionRequest(api(), 'configure-can', { interface: interfaceName, confirmed: true }, { timeout: 125000 })).items);
    } catch (problem) { error = problem.message; }
    finally { pending = false; render(); onChange(); }
  });
  // Poll only detection/preparation, never connection or motion operations.
  setInterval(() => { if (selected() && !document.hidden && !localSource) void check(); }, 2500);
  render();
  return { check, render, get busy() { return pending; }, get canReady() {
    return localSource || Boolean(health?.authorized && health?.setup?.stage === 'ready' && items.some(item => item.name === canInput.value && item.ready));
  } };
}
