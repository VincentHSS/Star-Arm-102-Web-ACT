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
      const state = { requested: 0, opened: 0, closed: 0, nonReadWrites: 0, rounds: [], pendingMissing: [], recoverMissing: false, first: true, manualPause: false,
        angles: [10, 11, 12, 13, 14, 15, 16] };
      window.__consoleSerial = state;
      const response = id => {
        const bytes = new Uint8Array(21); bytes.set([5, 28, 22, 16]); bytes[4] = id;
        new DataView(bytes.buffer).setInt32(14, Math.round(state.angles[id] * 10), true);
        bytes[20] = bytes.slice(0, 20).reduce((a, b) => a + b, 0) & 255;
        return bytes;
      };
      Object.defineProperty(navigator, 'serial', { value: {
        requestPort: async () => {
          state.requested++;
          let incoming;
          return { async open() {
            state.opened++; state.first = true;
            this.readable = new ReadableStream({ start(c) { incoming = c; } });
            this.writable = new WritableStream({ write(frame) {
              if (frame[2] !== 25 || frame[4] !== 22) { state.nonReadWrites++; return; }
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

    // Both supplied URDFs belong to the original virtual Follower picker and use real console rendering.
    await page.selectOption('#leaderType', '102LD');
    await page.click('#followerTypeVirtual');
    const virtualResults = [];
    for (const [key, name] of [['fl-v3', 'FL'], ['ld-touch', 'LD']]) {
      await page.evaluate(() => { window.__consoleSerial.angles = [0, 0, 0, 0, 0, 0, 0]; });
      await page.selectOption('#virtualFollowerModel', key);
      await page.waitForFunction(model => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
        && document.querySelector('#displayedModelStatus')?.textContent.includes(model), name);
      assert.equal(await page.locator('#poseSourceFollower').isChecked(), true);
      assert.equal(await page.locator('[data-target-mode="tcp"]').isDisabled(), true);
      assert.equal(await page.locator('#confirmTarget').isDisabled(), true);
      assert.equal(await page.locator('#jointSlider1').isDisabled(), true);
      await page.click('#connectLeader');
      await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
      const before = await page.evaluate(() => ({ requested: window.__consoleSerial.requested, opened: window.__consoleSerial.opened }));
      await page.click('#connectFollower');
      await page.waitForFunction(() => document.querySelector('#connectFollower').disabled && !document.querySelector('#startTeleop').disabled);
      assert.deepEqual(await page.evaluate(() => ({ requested: window.__consoleSerial.requested, opened: window.__consoleSerial.opened })), before,
        `${key}: virtual connection must not request or open a Follower serial port`);
      assert.equal(await page.locator('#virtualFollowerModel').isDisabled(), true);
      await page.click('#startTeleop');
      await page.waitForFunction(() => !document.querySelector('#stopTeleop').disabled
        && document.querySelector('#jointActualValue1').textContent === '0.0°');
      const baseline = await page.locator('#robotCanvas').screenshot();
      const nonReadWrites = await page.evaluate(() => window.__consoleSerial.nonReadWrites);
      await page.evaluate(() => { window.__consoleSerial.angles = [25, 35, -45, 20, -15, 40, 45]; });
      // The existing Leader protocol scales the physical J7 angle by 1.5 before virtual mapping.
      const expected = ['25.0°', '35.0°', '-45.0°', '20.0°', '-15.0°', '40.0°', key === 'fl-v3' ? '67.5°' : '0.0°'];
      await page.waitForFunction(values => values.every((value, index) =>
        document.querySelector(`#jointActualValue${index + 1}`).textContent === value), expected).catch(async error => {
        const diagnostic = await page.evaluate(() => ({
          joints: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointActualValue${index + 1}`).textContent),
          status: document.querySelector('#runStatus')?.textContent,
          logs: document.querySelector('#logs').textContent.slice(-1500),
        }));
        throw new Error(`${key}: feedback did not reach the virtual model: ${JSON.stringify({ ...diagnostic, pageErrors: errors })}`, { cause: error });
      });
      const rendered = await page.locator('#robotCanvas').screenshot();
      assert.notDeepEqual(rendered, baseline, `${key}: the 3D canvas must change with Leader feedback`);
      assert.deepEqual(await page.evaluate(() => ({ requested: window.__consoleSerial.requested, opened: window.__consoleSerial.opened })), before);
      assert.equal(await page.evaluate(() => window.__consoleSerial.nonReadWrites), nonReadWrites,
        `${key}: virtual following must produce only Leader feedback queries`);
      await page.click('#stopTeleop');
      await page.waitForFunction(() => document.querySelector('#stopTeleop').disabled);
      await page.click('#disconnectAll');
      await page.waitForFunction(() => !document.querySelector('#virtualFollowerModel').disabled);
      virtualResults.push(key);
    }
    await page.selectOption('#virtualFollowerModel', 'star-arm-102-fl');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#modelLoadStatus').textContent.includes('Star Arm 102-FL'));
    // Switching from the LD joint_1 tree back to physical joint1 must rebuild the renderer immediately.
    await page.selectOption('#virtualFollowerModel', 'ld-touch');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#displayedModelStatus')?.textContent.includes('LD'));
    await page.click('#followerTypePhysical');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#modelLoadStatus').textContent.includes('Star Arm 102-FL'));
    await page.click('#connectFollower');
    await page.waitForFunction(() => document.querySelector('#followerStatus').textContent.includes('已连接')
      && document.querySelector('#jointActualValue1').textContent === '25.0°');
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectFollower').disabled);
    // The trajectory page also changes the Follower type internally when its physical connect button is used.
    await page.click('#followerTypeVirtual');
    await page.selectOption('#virtualFollowerModel', 'ld-touch');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#displayedModelStatus')?.textContent.includes('LD'));
    await page.click('[data-tab="trajectory"]');
    await page.click('#flTrajectoryConnect');
    await page.waitForFunction(() => document.querySelector('#flTrajectoryConnect').disabled
      && document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#modelLoadStatus').textContent.includes('Star Arm 102-FL'));
    await page.click('[data-tab="teleop"]');
    await page.waitForFunction(() => document.querySelector('#teleopView').classList.contains('active'), null, { timeout: 5000 }).catch(async error => {
      const diagnostic = await page.evaluate(() => ({
        status: document.querySelector('#interaction-status').textContent,
        logs: document.querySelector('#logs').textContent.slice(-1200),
      }));
      throw new Error(`trajectory return: ${JSON.stringify(diagnostic)}`, { cause: error });
    });
    assert.equal(await page.locator('#followerType').inputValue(), 'physical');
    assert.equal(await page.locator('#connectFollower').isDisabled(), false);
    assert.equal(await page.locator('#disconnectAll').isDisabled(), true, 'Changing console tabs releases the physical connection');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ consoleSerial: true, ldAndHdAndFl: true, immediateAndOutOfOrderReplies: true, retryOnlyMissingIds: true,
      failedFirstFeedbackCannotReuseOldAngles: true, missingFeedbackSharedDeadline: true, disconnectAndReconnect: true,
      suppliedVirtualModels: virtualResults, virtualFollowerHasNoSerial: true, virtualLeaderFeedbackRendered: true,
      physicalModelRestored: true, trajectoryRestoresPhysicalModel: true, hardwareTested: false }));
  } finally { if (browser) await browser.close(); service.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
