// Software-only browser checks. Native Ubuntu installation and robots are not exercised.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const site = 'http://127.0.0.1:18765';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'star-arm-browser-'));
  const output = path.join(ROOT, 'dist'); fs.mkdirSync(output, { recursive: true });
  let browser, page, logs = '';
  const errors = [], missing = [];
  // Never accidentally exercise an existing customer's runtime.
  let occupied = false;
  try { await fetch(site + '/api/v1/health', { signal: AbortSignal.timeout(1000) }); occupied = true; } catch {}
  assert.equal(occupied, false, 'Stop the existing runtime on port 18765 before testing');
  const service = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', path.join(ROOT, 'tools/serve_local.py'), '--no-browser', '--state-dir', state],
    { cwd: ROOT, env: { ...process.env, NO_PROXY: 'localhost,127.0.0.1,::1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  service.stdout.on('data', value => { logs += value.toString(); });
  service.stderr.on('data', value => { logs += value.toString(); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (service.exitCode !== null) throw new Error(logs);
      try {
        const response = await fetch(site + '/api/v1/health');
        const data = await response.json();
        if (data.browser_bridge && data.authorized) { ready = true; break; }
      } catch {}
      await pause(100);
    }
    assert(ready, logs || 'Runtime did not become ready');
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) missing.push(r.url()); });
    let environment = 'not_prepared', prepares = 0;
    const snapshot = () => ({ status: environment, backend: 'cuda', job_id: 'browser-check', progress: environment === 'ready' ? 100 : 65,
      stage_label: '安装 ACT / LeRobot', training_profile: {}, error: null });
    await page.route('**/api/v1/training/environment', r => r.fulfill({ json: snapshot() }));
    await page.route('**/api/v1/training/environment/prepare', r => { prepares++; environment = 'preparing'; return r.fulfill({ json: snapshot() }); });
    await page.route('**/api/v1/training/environment/prepare/browser-check', r => r.fulfill({ json: snapshot() }));
    const serial = { leader: { connected: true, port: '/dev/mock-leader', baudrate: 1000000 },
      follower: { connected: true, port: '/dev/mock-follower', baudrate: 1000000 } };
    const disconnected = [], shutdownOrder = []; let failDisconnect = false;
    const inferenceBase = await (await fetch(site + '/api/v1/inference')).json();
    let inference = { ...inferenceBase, status: 'running' }, recording = null;
    await page.route('**/api/v1/inference', r => r.fulfill({ json: inference }));
    await page.route('**/api/v1/inference/stop', r => {
      shutdownOrder.push('stop-inference'); inference = { ...inference, status: 'stopped' };
      return r.fulfill({ json: inference });
    });
    await page.route('**/api/v1/state', async r => {
      const response = await r.fetch(); const body = await response.json();
      if (recording) body.episodes = [recording];
      return r.fulfill({ json: body });
    });
    await page.route('**/api/v1/episodes/mock-recording/stop', r => {
      shutdownOrder.push('stop-recording');
      recording = { ...recording, status: 'review', valid_frames: 0, camera_frames: { wrist: 0, world: 0 }, integrity: { ok: false, errors: ['模拟轮次无样本'] } };
      return r.fulfill({ json: recording });
    });
    await page.route('**/api/v1/devices', r => r.fulfill({ json: { binding: null, serial_connections: serial } }));
    await page.route('**/api/v1/devices/serial/disconnect', async r => {
      const role = r.request().postDataJSON().role;
      await pause(150);
      if (failDisconnect) return r.fulfill({ status: 409, json: { error: { message: '模拟串口释放失败', code: 'busy' } } });
      serial[role] = null; disconnected.push(role); shutdownOrder.push('disconnect-' + role);
      return r.fulfill({ json: { role, connected: false } });
    });
    await page.route('**/api/v1/devices/serial/connect', r => {
      const payload = r.request().postDataJSON();
      assert.equal(payload.role, 'follower');
      serial.follower = { role: 'follower', port: payload.port, connected: true, baudrate: 1000000 };
      return r.fulfill({ json: serial.follower });
    });
    await page.goto(site + '/act-workbench.html');
    await page.waitForFunction(() => document.querySelector('#service-state').textContent.includes('已连接'));
    await page.locator('#dataset-form [name=task_name]').fill('浏览器验证任务');
    await page.locator('#dataset-form [name=slug]').fill('browser-check');
    await page.locator('#dataset-form [type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#active-dataset').value !== '');
    const datasetResponse = await page.request.get(site + '/api/v1/datasets');
    const datasets = (await datasetResponse.json()).items;
    assert.equal(datasets.length, 1);
    recording = { id: 'mock-recording', dataset_id: datasets[0].id, status: 'recording' };
    await page.click('#refresh');
    await page.waitForFunction(() => !document.querySelector('#stop-episode').disabled);
    await page.click('.workflow [data-view="train"]');
    await page.waitForFunction(() => document.querySelector('#training-title').textContent.includes('正在自动准备'));
    assert.deepEqual(disconnected, ['leader', 'follower'], 'ACT step changes must release both serial roles');
    assert.deepEqual(shutdownOrder, ['stop-recording', 'stop-inference', 'disconnect-leader', 'disconnect-follower']);
    assert.equal(recording.status, 'review', 'Stopped recording must be preserved for review');
    recording = null;
    assert.equal(prepares, 1);
    environment = 'ready';
    await page.waitForFunction(() => document.querySelector('#training-title').textContent.includes('已就绪'));
    await page.click('.workflow [data-view="models"]');
    await page.waitForFunction(() => document.querySelector('#models').classList.contains('active'));
    assert(await page.locator('#models').isVisible());
    serial.leader = { connected: true, port: '/dev/mock-leader', baudrate: 1000000 }; failDisconnect = true;
    await page.click('.workflow [data-view="infer"]');
    await page.waitForFunction(() => document.querySelector('#interaction-status')?.textContent.includes('模拟串口释放失败'));
    assert(await page.locator('#models').isVisible(), 'A failed release must keep the previous page');
    failDisconnect = false;
    await page.click('.workflow [data-view="infer"]');
    await page.waitForFunction(() => document.querySelector('#infer').classList.contains('active'));
    assert.equal(serial.leader, null);
    await page.evaluate(() => { document.querySelector('#inference-follower-port').add(new Option('Mock follower', '/dev/mock-follower')); });
    await page.selectOption('#inference-follower-port', '/dev/mock-follower');
    await page.click('#inference-connect-follower');
    await page.waitForFunction(() => document.querySelector('#inference-serial-status').textContent.includes('从臂已连接'));
    assert(serial.follower?.connected, 'Execution page must be able to reconnect without returning to another step');
    await page.click('.workflow [data-view="train"]'); await pause(400); assert.equal(prepares, 1);
    assert.equal(await page.locator('a[href^="star-arm-act:"]').count(), 0);
    const installer = await page.evaluate(async () => {
      const module = await import('./src/act-installer.js');
      const result = await module.createWebsiteInstaller('https://control.example.com');
      return { origin: result.origin, filename: result.filename, bytes: Array.from(new Uint8Array(await result.blob.arrayBuffer())) };
    });
    assert.equal(installer.origin, 'https://control.example.com');
    assert(installer.bytes.length > 100000);
    fs.writeFileSync(path.join(output, 'browser-generated.deb'), Buffer.from(installer.bytes));
    const denied = await page.request.post(site + '/api/v1/emergency-stop', { headers: { Origin: 'https://other.example' }, data: {} });
    assert.equal(denied.status(), 403);
    for (const [target, destination] of [['piper', 'index.html'], ['act', 'act-workbench.html']]) {
      const started = Date.now(); await page.click(`[data-workspace-target="${target}"]`);
      await page.waitForURL('**/' + destination);
      assert(Date.now() - started >= 4800, 'Ready transition should hold for about 5 seconds');
      assert.equal(await page.locator('#workspace-switch-screen').isVisible(), false, 'Destination must not replay the loader');
      if (target === 'piper') {
        await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready');
        await page.evaluate(async () => {
          const THREE = await import('./assets/vendor/three.module.js');
          window.testSceneDraws = 0;
          THREE.Object3D.prototype.onBeforeRender = function () { window.testSceneDraws++; };
        });
        await pause(1600); await page.evaluate(() => { window.testSceneDraws = 0; }); await pause(350);
        assert.equal(await page.evaluate(() => window.testSceneDraws), 0, 'An unchanged scene should not keep drawing meshes');
        await page.locator('#robotCanvas').hover(); await page.mouse.wheel(0, 150);
        await page.waitForFunction(() => window.testSceneDraws > 0);
        // Simulate open console buses without exposing or moving any physical hardware.
        await page.evaluate(async () => {
          const { SerialServoBus } = await import('./src/serial_servo_bus.js');
          const descriptor = Object.getOwnPropertyDescriptor(SerialServoBus.prototype, 'connected');
          const disconnect = SerialServoBus.prototype.disconnect, closed = new WeakSet();
          window.testClosedPorts = [];
          Object.defineProperty(SerialServoBus.prototype, 'connected', { configurable: true,
            get() { return !closed.has(this) || descriptor.get.call(this); } });
          SerialServoBus.prototype.disconnect = async function (...args) {
            window.testClosedPorts.push(this.name); closed.add(this); return disconnect.apply(this, args);
          };
          window.restoreTestBuses = () => { Object.defineProperty(SerialServoBus.prototype, 'connected', descriptor); SerialServoBus.prototype.disconnect = disconnect; };
        });
        await page.click('[data-tab="reset-origin"]');
        await page.waitForFunction(() => document.querySelector('#resetOriginView').classList.contains('active'));
        assert.deepEqual(await page.evaluate(() => window.testClosedPorts), ['Leader', 'Reset Arm', 'Factory Arm']);
        await page.evaluate(() => window.restoreTestBuses());
        await page.click('[data-tab="teleop"]');
        await page.waitForFunction(() => document.querySelector('#teleopView').classList.contains('active'));
      }
    }
    await page.waitForFunction(() => document.querySelector('#service-state').textContent.includes('已连接'));
    const bad = fs.readFileSync(path.join(ROOT, 'Browser_SDK/downloads/act-runtime-template.deb')); bad[10] ^= 1;
    await page.route('**/downloads/act-runtime-template.deb', r => r.fulfill({ body: bad }));
    assert(await page.evaluate(async () => {
      try { const m = await import('./src/act-installer.js'); await m.createWebsiteInstaller(); return false; }
      catch (e) { return e.message.includes('版本不一致'); }
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, 'browser-check.png') });
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log(JSON.stringify({ localStartup: true, datasetCreated: true, environmentAutomaticallyPrepared: true,
      readyEnvironmentReused: true, modelView: true, installerGenerated: true, unauthorizedOriginBlocked: true,
      fiveSecondTransitions: true, noDuplicateLoader: true, corruptTemplateRejected: true, mobileFits: true,
      actStepPortsReleased: true, releaseFailureKeepsPage: true, consoleTabPortsReleased: true,
      recordingPreservedForReview: true, controlStoppedBeforeDisconnect: true,
      executionPageCanReconnectFollower: true,
      idleSceneDoesNotRedraw: true, interactiveSceneStillDraws: true,
      nativeUbuntuInstallationTested: false, hardwareTested: false, pageErrors: errors, missingAssets: missing }, null, 2));
  } catch (error) {
    if (page) {
      console.error(JSON.stringify({ url: page.url(), pageErrors: errors, missingAssets: missing,
        switchMessage: await page.locator('#switch-message').textContent().catch(() => ''),
        interaction: await page.locator('#interaction-status').textContent().catch(() => '') }));
      await page.screenshot({ path: path.join(output, 'browser-failure.png') }).catch(() => {});
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (service.exitCode === null) {
      const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited;
    }
    assert.equal(path.dirname(path.resolve(state)), path.resolve(os.tmpdir()));
    assert(path.basename(state).startsWith('star-arm-browser-'));
    fs.rmSync(state, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
