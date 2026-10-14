// Run the actual console with synthetic Web Serial; never contact customer hardware/API.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const net = require('node:net'), path = require('node:path'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const site = `http://127.0.0.1:${port}`;
  const service = spawn(process.env.PYTHON || 'python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'Browser_SDK')], { windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) { try { const r = await fetch(site); await r.arrayBuffer(); if (r.ok) { ready = true; break; } } catch {} await pause(100); }
    assert(ready);
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://127.0.0.1:18765/**', r => r.abort());
    await page.addInitScript(() => {
      const state = { opened: 0, closed: 0, rounds: [], pendingMissing: [], recoverMissing: false, first: true, manualPause: false };
      window.__consoleSerial = state;
      const response = id => {
        const bytes = new Uint8Array(21); bytes.set([5, 28, 22, 16]); bytes[4] = id;
        new DataView(bytes.buffer).setInt32(14, (id + 10) * 10, true);
        bytes[20] = bytes.slice(0, 20).reduce((a, b) => a + b, 0) & 255;
        return bytes;
      };
      Object.defineProperty(navigator, 'serial', { value: {
        requestPort: async () => {
          let incoming;
          return { async open() {
            state.opened++; state.first = true;
            this.readable = new ReadableStream({ start(c) { incoming = c; } });
            this.writable = new WritableStream({ write(frame) {
              if (frame[2] !== 25 || frame[4] !== 22) return;
              const ids = [...frame.slice(7, -1)]; state.rounds.push(ids);
              const missing = state.first || !state.recoverMissing ? state.pendingMissing : [];
              for (const id of ids.toReversed()) if (!missing.includes(id)) incoming.enqueue(response(id));
              state.first = false;
            } });
          }, async close() { state.closed++; } };
        }, addEventListener() {}, removeEventListener() {},
      } });
    });
    await page.goto(site + '/index.html');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready');
    await page.selectOption('#leaderType', '102LD');
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    assert.equal(await page.locator('#logs').textContent().then(text => text.includes('首次回读')), true);
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectLeader').disabled);

    await page.evaluate(() => { Object.assign(window.__consoleSerial, { pendingMissing: [0, 3], recoverMissing: true, rounds: [] }); document.querySelector('#responseTimeout').value = '100'; });
    await page.selectOption('#leaderType', '102HD');
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    const rounds = await page.evaluate(() => window.__consoleSerial.rounds.slice(0, 2));
    assert.deepEqual(rounds, [[0, 1, 2, 3, 4, 5, 6], [0, 3]]);
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectLeader').disabled);

    // Missing feedback after reconnect must not reuse previous joint readings as success.
    await page.evaluate(() => { Object.assign(window.__consoleSerial, { pendingMissing: [0, 2, 4], recoverMissing: false, rounds: [] }); });
    const started = Date.now();
    await page.click('#connectLeader');
    await page.waitForFunction(() => !document.querySelector('#connectLeader').disabled && document.querySelector('#interaction-status')?.textContent.includes('未返回有效角度'));
    assert(Date.now() - started < 1800, 'Three missing IDs must share the 100 ms deadline instead of multiplying it');
    assert(await page.locator('#interaction-status').textContent().then(text => text.includes('0, 2, 4')));
    assert.equal(await page.locator('#startTeleop').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__consoleSerial.closed), 3);

    await page.evaluate(() => { Object.assign(window.__consoleSerial, { pendingMissing: [], rounds: [] }); });
    await page.click('#connectFollower');
    await page.waitForFunction(() => document.querySelector('#followerStatus').textContent.includes('已连接'));
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectFollower').disabled);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ consoleSerial: true, ldAndHdAndFl: true, immediateAndOutOfOrderReplies: true, retryOnlyMissingIds: true,
      failedFirstFeedbackCannotReuseOldAngles: true, missingFeedbackSharedDeadline: true, disconnectAndReconnect: true, hardwareTested: false }));
  } finally { if (browser) await browser.close(); service.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
