// Capture the real website with local hardware/API access blocked.
// These are unconnected UI reference images, never fabricated execution results.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs/images');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const port = await freePort(), site = `http://127.0.0.1:${port}`;
  const server = spawn(process.env.PYTHON || 'python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'Browser_SDK')],
    { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
  let browser;
  const captured = [];
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch(site); await response.arrayBuffer(); if (response.ok) break; } catch {}
      if (attempt === 59) throw new Error('Screenshot server did not start');
      await pause(100);
    }
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
    // The standard guide screenshots show the Ubuntu onboarding route.
    await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' }));
    // A customer may already have the native component running. Do not contact it.
    await page.route('http://127.0.0.1:18765/**', route => route.abort());
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    async function shot(name, selector) {
      await pause(300);
      const target = selector ? page.locator(selector) : page;
      await target.screenshot({ path: path.join(OUTPUT, name), animations: 'disabled' });
      captured.push(name);
    }
    async function step(id) {
      await page.click(`.workflow [data-view="${id}"]`);
      await page.waitForFunction(id => document.querySelector('#' + id)?.classList.contains('active'), id);
      await pause(500);
    }
    await page.goto(site + '/index.html');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready');
    await pause(1800);
    await shot('console-overview.png');
    await shot('console-device-panel.png', '#teleopControls');
    await page.click('[data-tab="servo-setup"]');
    await page.waitForFunction(() => document.querySelector('#servoSetupView').classList.contains('active'));
    await shot('console-servo-setup.png');
    await page.click('[data-tab="teleop"]');
    await page.waitForFunction(() => document.querySelector('#teleopView').classList.contains('active'));
    await page.click('[data-workspace-target="act"]');
    await page.waitForSelector('#workspace-switch-screen.switch-ready');
    await page.screenshot({ path: path.join(OUTPUT, 'workspace-transition.png') });
    captured.push('workspace-transition.png');
    await page.waitForURL('**/act-workbench.html'); await pause(3300);
    await shot('act-collect-overview.png');
    await page.setViewportSize({ width: 1600, height: 1700 });
    await page.locator('.device-panel').scrollIntoViewIfNeeded();
    await shot('act-device-panel.png', '.device-panel');
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.locator('#dataset-form [name="task_name"]').fill('将积木放入收纳盒');
    await page.locator('#dataset-form [name="slug"]').fill('block-pick-v1');
    await page.locator('.setup-panel').scrollIntoViewIfNeeded();
    await shot('act-dataset-form.png', '.setup-panel');
    await page.click('#open-follower-calibration');
    await page.waitForSelector('#follower-calibration-dialog[open]');
    await shot('act-calibration-dialog.png', '#follower-calibration-dialog');
    await page.click('#calibration-close');
    await step('train');
    await page.waitForSelector('#runtime-onboarding:not([hidden])');
    await shot('act-first-setup.png');
    await step('models'); await shot('act-model-import.png');
    await step('infer'); await shot('act-execution-overview.png');
    await page.locator('.inference-readiness').scrollIntoViewIfNeeded();
    await shot('act-execution-connections.png', '.inference-readiness');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ screenshots: captured, localApiBlocked: true, hardwareConnected: false }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
