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
      const state = { requested: 0, opened: 0, closed: 0, nonReadWrites: 0, rounds: [], motionWrites: [], pendingMissing: [], recoverMissing: false, first: true, manualPause: false,
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
          if (state.holdPicker) await new Promise(resolve => { state.finishPicker = resolve; });
          let incoming;
          return { async open() {
            state.opened++; state.first = true;
            this.readable = new ReadableStream({ start(c) { incoming = c; } });
            this.writable = new WritableStream({ write(frame) {
              if (frame[2] !== 25 || frame[4] !== 22) {
                state.nonReadWrites++;
                if (frame[2] === 25 && frame[4] === 14) {
                  state.motionWrites.push(Array.from({ length: frame[6] }, (_, index) => frame[7 + index * frame[5]]));
                }
                return;
              }
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
    const originalButton = await page.locator('#connectLeader').evaluate(button => ({ html: button.innerHTML, width: button.getBoundingClientRect().width }));
    await page.evaluate(() => { window.__consoleSerial.holdPicker = true; });
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#connectLeader').getAttribute('aria-busy') === 'true');
    const pendingButton = await page.locator('#connectLeader').evaluate(button => ({ html: button.innerHTML, width: button.getBoundingClientRect().width,
      effect: getComputedStyle(button, '::after').animationName, decorationPointerEvents: getComputedStyle(button, '::after').pointerEvents }));
    assert.equal(pendingButton.html, originalButton.html, 'waiting for a picker must preserve the label and any icon nodes');
    assert(Math.abs(pendingButton.width - originalButton.width) < 1, 'feedback must not resize the button');
    assert.equal(pendingButton.effect, 'interaction-flow');
    assert.equal(pendingButton.decorationPointerEvents, 'none');
    await page.locator('#connectLeader').evaluate(button => button.getAnimations({ subtree: true }).forEach(animation => { animation.currentTime = 650; animation.pause(); }));
    await page.screenshot({ path: path.join(ROOT, 'dist', 'button-flow-pending.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('#connectLeader').evaluate(button => getComputedStyle(button, '::after').animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { window.__consoleSerial.holdPicker = false; window.__consoleSerial.finishPicker(); });
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    await page.waitForFunction(() => document.querySelector('#connectLeader').dataset.feedback === 'success');
    await page.screenshot({ path: path.join(ROOT, 'dist', 'button-flow-success.png') });
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
    assert.equal(await page.locator('#connectLeader').getAttribute('data-feedback'), 'error', 'missing feedback must not flash as a successful connection');
    assert(Date.now() - started < 1800, 'Three missing IDs must share the 100 ms deadline instead of multiplying it');
    assert(await page.locator('#interaction-status').textContent().then(text => text.includes('0, 2, 4')));
    assert.equal(await page.locator('#startTeleop').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__consoleSerial.closed), 3);

    await page.evaluate(() => { Object.assign(window.__consoleSerial, { pendingMissing: [], rounds: [] }); });
    await page.click('#connectFollower');
    await page.waitForFunction(() => document.querySelector('#followerStatus').textContent.includes('已连接'));
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectFollower').disabled);

    const waitModel = name => page.waitForFunction(model => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready'
      && document.querySelector('#modelLoadStatus').textContent.includes(model)
      && document.querySelector('#displayedModelStatus')?.textContent.includes(model), name);
    const waitJoints = async (expected, description) => {
      await page.waitForFunction(values => values.every((value, index) =>
        document.querySelector(`#jointActualValue${index + 1}`).textContent === value), expected).catch(async error => {
        const diagnostic = await page.evaluate(() => ({
          joints: Array.from({ length: 7 }, (_, index) => document.querySelector(`#jointActualValue${index + 1}`).textContent),
          status: document.querySelector('#runStatus')?.textContent,
          logs: document.querySelector('#logs').textContent.slice(-1500),
        }));
        throw new Error(`${description}: feedback did not reach the model: ${JSON.stringify({ ...diagnostic, pageErrors: errors })}`, { cause: error });
      });
    };
    assert.equal(await page.locator('#leaderType option[value="102TOUCH"]').textContent(), 'Touch R1');
    assert.equal(await page.locator('#virtualFollowerModel option[value="fl-v3"]').textContent(), 'LumosTouch V3');
    assert.equal(await page.locator('#virtualFollowerModel option[value="ld-touch"]').count(), 0);

    // Touch R1 reads all six axes and its raw gripper channel without writing controls.
    await page.check('#poseSourceLeader');
    await page.selectOption('#leaderType', '102TOUCH');
    await waitModel('Touch R1');
    assert.equal(await page.locator('#displayedModelStatus').textContent(), 'Leader · Touch R1');
    assert.equal(await page.locator('[data-target-mode="tcp"]').isDisabled(), true);
    assert.equal(await page.locator('#jointSlider1').isDisabled(), true);
    await page.evaluate(() => { Object.assign(window.__consoleSerial, { angles: [0, 0, 0, 0, 0, 0, 90], pendingMissing: [], recoverMissing: false, rounds: [] }); });
    const touchNonReadWrites = await page.evaluate(() => window.__consoleSerial.nonReadWrites);
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    await waitJoints(['0.0°', '0.0°', '0.0°', '0.0°', '0.0°', '0.0°', '90.0°'], 'Touch R1 initial readback');
    const touchBaseline = await page.locator('#robotCanvas').screenshot();
    await page.evaluate(() => { window.__consoleSerial.angles = [25, 35, -45, 20, -15, 40, 90]; });
    await waitJoints(['25.0°', '35.0°', '-45.0°', '20.0°', '-15.0°', '40.0°', '90.0°'], 'Touch R1 six-axis and raw gripper readback');
    assert.notDeepEqual(await page.locator('#robotCanvas').screenshot(), touchBaseline, 'Touch R1 canvas must follow its six hardware axes');
    assert.equal(await page.evaluate(() => window.__consoleSerial.nonReadWrites), touchNonReadWrites, 'Touch R1 must stay read-only');
    assert.equal(await page.locator('#leaderType').isDisabled(), true);
    assert(await page.evaluate(() => window.__consoleSerial.rounds.length > 0 && window.__consoleSerial.rounds.every(ids =>
      JSON.stringify(ids) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]))), 'Every Touch query must include ID6 gripper');
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectLeader').disabled);

    // The virtual LumosTouch model accepts both Touch and the original Leader.
    await page.click('#followerTypeVirtual');
    const virtualResults = [];
    for (const [leaderType, gripperValue] of [['102TOUCH', '45.0°'], ['102LD', '67.5°']]) {
      await page.selectOption('#leaderType', leaderType);
      await page.evaluate(touch => {
        Object.assign(window.__consoleSerial, { angles: [0, 0, 0, 0, 0, 0, 0], pendingMissing: [], rounds: [] });
      }, leaderType === '102TOUCH');
      await page.selectOption('#virtualFollowerModel', 'fl-v3');
      await waitModel('LumosTouch V3');
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
        `${leaderType}: virtual connection must not request or open a Follower serial port`);
      assert.equal(await page.locator('#virtualFollowerModel').isDisabled(), true);
      await page.click('#startTeleop');
      await page.waitForFunction(() => !document.querySelector('#stopTeleop').disabled
        && document.querySelector('#jointActualValue1').textContent === '0.0°');
      const baseline = await page.locator('#robotCanvas').screenshot();
      const nonReadWrites = await page.evaluate(() => window.__consoleSerial.nonReadWrites);
      await page.evaluate(() => { window.__consoleSerial.angles = [25, 35, -45, 20, -15, 40, 45]; });
      // The existing Leader protocol scales the physical J7 angle by 1.5 before virtual mapping.
      await waitJoints(['25.0°', '35.0°', '-45.0°', '20.0°', '-15.0°', '40.0°', gripperValue], `${leaderType} to virtual LumosTouch`);
      const rendered = await page.locator('#robotCanvas').screenshot();
      assert.notDeepEqual(rendered, baseline, `${leaderType}: the 3D canvas must change with Leader feedback`);
      assert.deepEqual(await page.evaluate(() => ({ requested: window.__consoleSerial.requested, opened: window.__consoleSerial.opened })), before);
      assert.equal(await page.evaluate(() => window.__consoleSerial.nonReadWrites), nonReadWrites,
        `${leaderType}: virtual following must produce only Leader feedback queries`);
      const expectedIds = [0, 1, 2, 3, 4, 5, 6];
      assert(await page.evaluate(ids => window.__consoleSerial.rounds.every(round =>
        JSON.stringify(round) === JSON.stringify(ids)), expectedIds), `${leaderType}: preserve the Leader's actual channel count`);
      await page.click('#stopTeleop');
      await page.waitForFunction(() => document.querySelector('#stopTeleop').disabled);
      await page.click('#disconnectAll');
      await page.waitForFunction(() => !document.querySelector('#virtualFollowerModel').disabled);
      virtualResults.push(`${leaderType}->fl-v3`);
    }
    await page.selectOption('#virtualFollowerModel', 'star-arm-102-fl');
    await waitModel('Star Arm 102-FL');
    await page.selectOption('#virtualFollowerModel', 'fl-v3');
    await waitModel('LumosTouch V3');
    await page.click('#followerTypePhysical');
    await waitModel('Star Arm 102-FL');

    // Touch must never command the original serial FL; only its matching Lumos target is allowed.
    await page.selectOption('#leaderType', '102TOUCH');
    await page.check('#poseSourceLeader');
    await waitModel('Touch R1');
    await page.evaluate(() => { Object.assign(window.__consoleSerial, { pendingMissing: [], motionWrites: [] }); });
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    await page.evaluate(() => { window.__consoleSerial.pendingMissing = []; });
    await page.click('#connectFollower');
    await page.waitForFunction(() => document.querySelector('#followerStatus').textContent.includes('已连接'));
    assert.deepEqual(await page.evaluate(() => window.__consoleSerial.motionWrites), [], 'Connecting alone must not issue an angle command');
    assert.equal(await page.locator('#startTeleop').isDisabled(), true);
    await page.evaluate(() => document.querySelector('#startTeleop').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#interaction-status')?.textContent.includes('仅允许'));
    assert.deepEqual(await page.evaluate(() => window.__consoleSerial.motionWrites), [], 'DOM-event bypass must still fail closed for Touch to serial FL');
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectFollower').disabled);
    await page.selectOption('#leaderType', '102LD');
    await page.check('#poseSourceLeader');
    await waitModel('Star Arm 102-LD');
    await page.check('#poseSourceFollower');
    await waitModel('Star Arm 102-FL');
    // The trajectory page owns an independent physical FL selection, including
    // before connection, and restores the teleop selection without reconnecting.
    await page.selectOption('#physicalFollowerModel', 'LUMOS');
    await waitModel('LumosTouch V3');
    const beforeTrajectorySerial = await page.evaluate(() => window.__consoleSerial.requested);
    const beforeTrajectoryMotion = await page.evaluate(() => window.__consoleSerial.motionWrites.length);
    await page.click('[data-tab="trajectory"]');
    await waitModel('Star Arm 102-FL');
    assert.equal(await page.locator('#physicalFollowerModel').inputValue(), 'FL');
    assert.equal(await page.locator('#followerType').inputValue(), 'physical');
    assert.equal(await page.evaluate(() => window.__consoleSerial.requested), beforeTrajectorySerial, 'Opening trajectory never connects a device');
    await page.click('#flTrajectoryConnect');
    await page.waitForFunction(() => document.querySelector('#flTrajectoryConnect').disabled
      && !document.querySelector('#flTrajectoryDisconnect').disabled);
    assert.equal(await page.evaluate(() => window.__consoleSerial.requested), beforeTrajectorySerial + 1, 'Trajectory connects only a new FL serial port');
    assert.equal(await page.evaluate(() => window.__consoleSerial.motionWrites.length), beforeTrajectoryMotion, 'Trajectory connection never sends motion');
    await page.click('[data-tab="teleop"]');
    await waitModel('LumosTouch V3');
    assert.equal(await page.locator('#physicalFollowerModel').inputValue(), 'LUMOS');
    assert.equal(await page.locator('#followerType').inputValue(), 'physical');
    assert.equal(await page.locator('#poseSourceFollower').isChecked(), true);
    assert.equal(await page.locator('#disconnectAll').isDisabled(), true, 'Returning restores the choice, not a connection');
    await page.selectOption('#physicalFollowerModel', 'FL');
    await waitModel('Star Arm 102-FL');
    await page.click('#followerTypeVirtual');
    await page.selectOption('#virtualFollowerModel', 'fl-v3');
    await waitModel('LumosTouch V3');
    await page.click('[data-tab="trajectory"]');
    await waitModel('Star Arm 102-FL');
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
    await waitModel('LumosTouch V3');
    assert.equal(await page.locator('#followerType').inputValue(), 'virtual');
    assert.equal(await page.locator('#virtualFollowerModel').inputValue(), 'fl-v3');
    assert.equal(await page.locator('#connectFollower').isDisabled(), false);
    assert.equal(await page.locator('#disconnectAll').isDisabled(), true, 'Changing console tabs releases the physical connection');
    await page.check('#poseSourceLeader');
    await waitModel('Star Arm 102-LD');
    await page.click('[data-tab="trajectory"]');
    await waitModel('Star Arm 102-FL');
    await page.click('[data-tab="teleop"]');
    await waitModel('Star Arm 102-LD');
    assert.equal(await page.locator('#poseSourceLeader').isChecked(), true);
    assert.equal(await page.locator('#followerType').inputValue(), 'virtual');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ consoleSerial: true, ldAndHdAndFl: true, immediateAndOutOfOrderReplies: true, retryOnlyMissingIds: true,
      failedFirstFeedbackCannotReuseOldAngles: true, missingFeedbackSharedDeadline: true, disconnectAndReconnect: true,
      suppliedVirtualModels: virtualResults, virtualFollowerHasNoSerial: true, virtualLeaderFeedbackRendered: true,
      touchLeaderReadsSixAxesAndGripper: true, touchLeaderReadOnly: true, touchCannotCommandOriginalFl: true,
      physicalModelRestored: true, trajectoryUsesOnlyPhysicalFl: true, trajectoryRestoresTeleopSelection: true, wholeButtonFeedback: true, feedbackPreservesLabelAndSize: true, reducedMotionSupported: true, hardwareTested: false }));
  } finally { if (browser) await browser.close(); service.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
