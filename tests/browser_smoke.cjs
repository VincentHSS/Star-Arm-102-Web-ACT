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
  let browser, logs = '';
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
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], missing = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) missing.push(r.url()); });
    let environment = 'not_prepared', prepares = 0;
    const snapshot = () => ({ status: environment, backend: 'cuda', job_id: 'browser-check', progress: environment === 'ready' ? 100 : 65,
      stage_label: '安装 ACT / LeRobot', training_profile: {}, error: null });
    await page.route('**/api/v1/training/environment', r => r.fulfill({ json: snapshot() }));
    await page.route('**/api/v1/training/environment/prepare', r => { prepares++; environment = 'preparing'; return r.fulfill({ json: snapshot() }); });
    await page.route('**/api/v1/training/environment/prepare/browser-check', r => r.fulfill({ json: snapshot() }));
    await page.goto(site + '/act-workbench.html');
    await page.waitForFunction(() => document.querySelector('#service-state').textContent.includes('已连接'));
    await page.locator('#dataset-form [name=task_name]').fill('浏览器验证任务');
    await page.locator('#dataset-form [name=slug]').fill('browser-check');
    await page.locator('#dataset-form [type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#active-dataset').value !== '');
    const datasetResponse = await page.request.get(site + '/api/v1/datasets');
    assert.equal((await datasetResponse.json()).items.length, 1);
    await page.click('.workflow [data-view="train"]');
    await page.waitForFunction(() => document.querySelector('#training-title').textContent.includes('正在自动准备'));
    assert.equal(prepares, 1);
    environment = 'ready';
    await page.waitForFunction(() => document.querySelector('#training-title').textContent.includes('已就绪'));
    await page.click('.workflow [data-view="models"]');
    assert(await page.locator('#models').isVisible());
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
      nativeUbuntuInstallationTested: false, hardwareTested: false, pageErrors: errors, missingAssets: missing }, null, 2));
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
