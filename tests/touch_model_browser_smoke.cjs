// Own static server on an ephemeral port. Never access real serial or CAN.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'Browser_SDK');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.urdf': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png' };

(async () => {
  let browser;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const file = path.resolve(WEB, '.' + decodeURIComponent(url.pathname));
      assert(file.startsWith(WEB + path.sep));
      const bytes = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(bytes);
    } catch (_) { response.writeHead(404); response.end(); }
  });
  try {
    await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [], assets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/ld-touch/meshes/')) assets.push({ url: response.url(), status: response.status() });
    });
    await page.addInitScript(() => {
      window.__touchHardwareAttempts = 0;
      const denied = () => { window.__touchHardwareAttempts++; throw new Error('Hardware access forbidden in model preview test'); };
      Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: denied, getPorts: async () => [] } });
    });
    await page.route('http://127.0.0.1:18765/**', route => route.abort());
    await page.goto(base + '/index.html');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready');
    await page.selectOption('#leaderType', '102TOUCH');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#displayedModelStatus')?.textContent.includes('Touch R1'));
    assert.equal(new Set(assets.map(item => item.url)).size, 25);
    assert(assets.every(item => item.status === 200 && item.url.endsWith('?v=e264ed0d')));
    assert(assets.some(item => item.url.includes('link_6-servo.stl')));
    assert(assets.some(item => item.url.includes('right_finger-finger.stl')));
    assert(assets.some(item => item.url.includes('left_finger-finger.stl')));
    assert(!assets.some(item => item.url.includes('gripper-servo.stl')));
    await page.screenshot({ path: path.join(ROOT, 'dist/touch-v32-console.png') });

    await page.goto(base + '/urdf-preview.html');
    await page.waitForFunction(() => document.querySelector('#modelStatus')?.dataset.state === 'ready');
    await page.selectOption('#modelSelect', 'ld-touch');
    await page.waitForFunction(() => document.querySelector('#modelStatus')?.dataset.state === 'ready'
      && document.querySelectorAll('#jointControls input').length === 7);
    assert.equal(await page.locator('#jointControls input[aria-label="left_finger_joint"]').count(), 0);
    const finger = page.locator('#jointControls input[aria-label="joint_7"]');
    assert.equal(await finger.getAttribute('min'), '0');
    assert.equal(await finger.getAttribute('max'), '25');
    await finger.fill('25');
    assert.match(await finger.locator('..').textContent(), /25\.0/);
    await page.screenshot({ path: path.join(ROOT, 'dist/touch-v32-finger-open.png') });
    await page.locator('#resetPose').click();
    assert.equal(await finger.inputValue(), '0');
    assert.equal(await page.locator('#jointControls input').count(), 7);
    await page.screenshot({ path: path.join(ROOT, 'dist/touch-v32-preview.png') });
    assert.equal(await page.evaluate(() => window.__touchHardwareAttempts), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ meshes: 25, previewSliders: 7, gripperPreviewDegrees: 25,
      mimicTestedByUnitChecks: true, hardwareAccesses: 0, browserErrors: errors }));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
