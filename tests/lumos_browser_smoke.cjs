// No hardware or customer API: this test owns its loopback HTTP server and uses
// synthetic Web Serial. Refuse an occupied port instead of reusing a live service.
const { chromium } = require('playwright');
const path = require('node:path'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs/promises');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const origin = 'http://127.0.0.1:18766';
  let browser, page;
  const errors = [], calls = [];
  let state = { phase: 'idle', connected: false, session_id: null }, sequence = 0, stopDelay = 0, connectDelay = 0, sdkEpoch = 0;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin);
      if (!url.pathname.startsWith('/api/')) {
        const file = path.resolve(ROOT, 'Browser_SDK', '.' + decodeURIComponent(url.pathname));
        assert(file.startsWith(path.join(ROOT, 'Browser_SDK') + path.sep));
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
          '.json': 'application/json', '.urdf': 'application/xml', '.svg': 'image/svg+xml',
          '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
        const content = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        return response.end(content);
      }
      let input = '';
      for await (const chunk of request) input += chunk;
      const body = input ? JSON.parse(input) : {};
      const action = url.pathname.split('/').at(-1);
      const reply = (result, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ gripper_type: 'TypeLJ', gripper_config_error: null, ...result }));
      };
      calls.push({ action, body });
      if (action === 'emergency-stop') { sdkEpoch++; state = { phase: 'stopped', connected: false, session_id: null }; return reply({ stopped: true }); }
      if (action === 'status') return reply(state);
      if (action === 'connect') {
        assert.equal(body.leader_type, 'TOUCH'); assert.equal(body.follower_type, 'LUMOS');
        assert.equal(body.enable_confirmed, true);
        const epoch = sdkEpoch;
        await pause(connectDelay);
        if (epoch !== sdkEpoch) return reply({ error: { code: 'cancelled', message: '连接已被急停取消' } }, 400);
        state = { phase: 'connected', connected: true, session_id: `session-${++sequence}`, connection_id: `can-${sequence}`,
          positions_rad: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], preview_rad: null, calibration: { reference_set: false, range_ready: false },
          gripper: { control: true, position_ratio: 0.5, preview_ratio: null, target_ratio: null, leader_deg: 0,
            closed_deg: null, open_deg: null, calibrated: false, feedback_valid: true, feedback_age_ms: 0 } };
        return reply(state);
      }
      if (!state.session_id || body.session_id !== state.session_id) return reply({ error: { code: 'stale_session', message: '会话已过期' } }, 400);
      if (action === 'sample') {
        assert.equal(body.leader_deg.length, 6);
        assert(body.leader_deg.every(Number.isFinite));
        assert(Number.isFinite(body.leader_gripper_deg));
        state.gripper.leader_deg = body.leader_gripper_deg;
        if (state.phase === 'calibrating') state.calibration.range_max_deg = body.leader_deg.map(value => Math.abs(value));
        if (['preview', 'running'].includes(state.phase)) {
          state.preview_rad = body.leader_deg.map(value => value / 180 * Math.PI);
          state.gripper.preview_ratio = Math.max(0, Math.min(1, (body.leader_gripper_deg - state.gripper.closed_deg) / (state.gripper.open_deg - state.gripper.closed_deg)));
        }
      } else if (action === 'capture-reference') {
        assert.deepEqual(body.joint_map, [0, 1, 2, 3, 4, 5]);
        state.phase = 'calibrating'; state.calibration = { reference_set: true, range_ready: false,
          range_min_deg: [0, 0, 0, 0, 0, 0], range_max_deg: [0, 0, 0, 0, 0, 0] };
      } else if (action === 'finish-calibration') {
        assert(state.gripper.calibrated);
        state.phase = 'preview'; state.calibration.range_ready = true; state.preview_rad = [0, 0, 0, 0, 0, 0];
      } else if (action === 'capture-gripper') {
        assert.equal(state.phase, 'calibrating');
        state.gripper[body.position === 'closed' ? 'closed_deg' : 'open_deg'] = body.leader_gripper_deg;
        state.gripper.calibrated = Number.isFinite(state.gripper.closed_deg) && Number.isFinite(state.gripper.open_deg);
      } else if (action === 'start') {
        assert.equal(state.phase, 'preview'); assert.equal(body.confirmed, true); state.phase = 'running';
      } else if (action === 'stop' || action === 'disconnect') {
        await pause(stopDelay); state = { phase: 'stopped', connected: false, session_id: null, cleanup_pending: false, cleanup_failed: false };
      } else return reply({ error: { message: `Unexpected API ${action}` } }, 400);
      return reply(state);
    } catch (error) {
      if (error.code !== 'ENOENT') errors.push(error.message);
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.message);
    }
  });
  try {
    // Exercise actual HTTP response delivery during the 50 Hz sample loop;
    // production deadlines remain unchanged.
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(18766, '127.0.0.1', resolve);
    });
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}),
      ...(process.env.LUMOS_BROWSER_SOFTWARE_RENDERER === '1' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (Number(process.env.LUMOS_BROWSER_CPU_THROTTLE) > 1) {
      await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.LUMOS_BROWSER_CPU_THROTTLE) });
    }
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1:18765/**', route => route.abort());
    await page.addInitScript(() => {
      window.__lumosTiming = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__lumosTiming.push({ type: 'longtask', start: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'longtask', buffered: true });
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        if (!String(args[0]).includes('/api/v1/lumos/')) return originalFetch(...args);
        const timing = { type: String(args[0]).split('/').at(-1), start: performance.now() };
        window.__lumosTiming.push(timing);
        try {
          const response = await originalFetch(...args);
          timing.headers = performance.now();
          const json = response.json.bind(response);
          response.json = async () => {
            try { return await json(); }
            catch (error) { timing.error = error.name; throw error; }
            finally { timing.end = performance.now(); }
          };
          return response;
        } catch (error) { timing.error = error.name; timing.end = performance.now(); throw error; }
      };
      const state = { requested: 0, opened: 0, closed: 0, nonReadWrites: 0, rounds: [], missing: [], angles: [0, 0, 0, 0, 0, 0, 0] };
      window.__lumosSerial = state;
      Object.defineProperty(navigator, 'serial', { value: {
        requestPort: async () => {
          state.requested++; let incoming;
          return { async open() {
            state.opened++;
            this.readable = new ReadableStream({ start(controller) { incoming = controller; } });
            this.writable = new WritableStream({ write(frame) {
              if (frame[2] !== 25 || frame[4] !== 22) { state.nonReadWrites++; return; }
              const ids = [...frame.slice(7, -1)]; state.rounds.push(ids);
              for (const id of ids) {
                if (state.missing.includes(id)) continue;
                const response = new Uint8Array(21); response.set([5, 28, 22, 16]); response[4] = id;
                new DataView(response.buffer).setInt32(14, Math.round(state.angles[id] * 10), true);
                response[20] = response.slice(0, 20).reduce((a, b) => a + b, 0) & 255;
                incoming.enqueue(response);
              }
            } });
          }, async close() { state.closed++; } };
        }, addEventListener() {}, removeEventListener() {},
      } });
    });
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus').dataset.state === 'ready');
    await page.evaluate(async () => {
      const THREE = await import('./assets/vendor/three.module.js');
      window.__lumosSceneDraws = 0;
      THREE.Object3D.prototype.onBeforeRender = function () { window.__lumosSceneDraws++; };
    });
    await page.selectOption('#physicalFollowerModel', 'LUMOS');
    await page.waitForFunction(() => {
      const status = document.querySelector('#modelLoadStatus');
      return status.dataset.state === 'ready' && status.textContent.includes('LumosTouch');
    });
    await page.click('#lumosCheckService');
    await page.waitForFunction(() => document.querySelector('#lumosSdkGripper').textContent.includes('TypeLJ'));
    assert.equal(await page.locator('#connectFollower').isDisabled(), true);
    assert.equal(await page.locator('#targetModeTcp').isDisabled(), true);
    assert.equal(await page.locator('#enterSliderControl').isDisabled(), true);
    assert.equal(calls.some(call => call.action === 'connect'), false);
    // Original Leader cannot open CAN, including a direct event bypass of disabled UI.
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    await page.check('#lumosEnableConfirmed');
    await page.evaluate(() => document.querySelector('#connectFollower').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#interaction-status')?.textContent.includes('仅允许'));
    assert.equal(calls.some(call => call.action === 'connect'), false);
    await page.click('#disconnectAll');
    await page.waitForFunction(() => !document.querySelector('#connectLeader').disabled);
    await page.selectOption('#leaderType', '102TOUCH');
    await page.click('#connectLeader');
    await page.waitForFunction(() => document.querySelector('#leaderStatus').textContent.includes('已连接'));
    await page.check('#lumosEnableConfirmed');
    const serialRequests = await page.evaluate(() => window.__lumosSerial.requested);
    const connect = async () => {
      await page.check('#lumosEnableConfirmed');
      await page.click('#connectFollower');
      await page.waitForFunction(() => !document.querySelector('#lumosCaptureReference').disabled, null, { timeout: 6000 }).catch(async error => {
        throw new Error(`Lumos connect: ${JSON.stringify({ ui: await page.evaluate(() => ({
          lumos: document.querySelector('#lumosStatus').textContent,
          logs: document.querySelector('#logs').textContent.slice(-1500),
          interaction: document.querySelector('#interaction-status')?.textContent,
        })), calls: calls.slice(-10), errors })}`, { cause: error });
      });
      await page.waitForFunction(() => {
        const status = document.querySelector('#modelLoadStatus');
        return status.dataset.state === 'ready' && status.textContent.includes('LumosTouch');
      });
    };
    const calibrate = async () => {
      await page.click('#lumosCaptureReference');
      await page.waitForFunction(() => !document.querySelector('#lumosFinishCalibration').disabled, null, { timeout: 5000 }).catch(async error => {
        throw new Error(`Capture reference: ${JSON.stringify({ state, calls: calls.slice(-5), errors,
          ui: await page.evaluate(() => ({ status: document.querySelector('#lumosStatus').textContent,
            interaction: document.querySelector('#interaction-status')?.textContent, logs: document.querySelector('#logs').textContent.slice(-1000) })) })}`, { cause: error });
      });
      await page.evaluate(() => { window.__lumosSerial.angles = [10, 20, 30, 40, 50, 60, 90]; });
      await page.waitForFunction(() => document.querySelector('#lumosRange').textContent.includes('10.0'));
      await page.evaluate(() => { window.__lumosSerial.angles[6] = -40; });
      await page.click('#lumosGripperClosed');
      await page.waitForFunction(() => document.querySelector('#lumosGripper').textContent.includes('闭合端点 -40.0°'));
      await page.evaluate(() => { window.__lumosSerial.angles[6] = 60; });
      await page.click('#lumosGripperOpen');
      await page.waitForFunction(() => document.querySelector('#lumosGripper').textContent.includes('张开端点 60.0°'));
      await page.evaluate(() => { window.__lumosSerial.angles[6] = 10; });
      await page.click('#lumosFinishCalibration');
      await page.waitForFunction(() => !document.querySelector('#lumosMappingConfirmed').disabled);
      assert.equal(await page.locator('#startTeleop').isDisabled(), true);
      await page.check('#lumosMappingConfirmed');
      await page.click('#startTeleop');
      await page.waitForFunction(() => document.querySelector('#runStatus').textContent.includes('Touch R1 → LumosTouch'), null, { timeout: 6000 }).catch(async error => {
        throw new Error(`Start Lumos: ${JSON.stringify({ state, calls: calls.slice(-8), errors,
          ui: await page.evaluate(() => ({ status: document.querySelector('#lumosStatus').textContent,
            run: document.querySelector('#runStatus').textContent, interaction: document.querySelector('#interaction-status')?.textContent,
            logs: document.querySelector('#logs').textContent.slice(-1500) })) })}`, { cause: error });
      });
    };
    await connect();
    assert.equal(await page.evaluate(() => window.__lumosSerial.requested), serialRequests, 'Lumos must not request a serial Follower');
    assert.equal(calls.some(call => call.action === 'start'), false);
    await calibrate();
    await page.waitForFunction(() => document.querySelector('#jointActualValue7').textContent === '50%'
      && document.querySelector('#jointSliderValue7').textContent === '50%'
      && document.querySelector('#teleopFrequency').textContent !== '未运行');
    await pause(1600); // Let the model's camera damping finish before counting unchanged poses.
    const samplesBeforeIdle = calls.filter(call => call.action === 'sample').length;
    await page.evaluate(() => { window.__lumosSceneDraws = 0; });
    await pause(350);
    assert.equal(await page.evaluate(() => window.__lumosSceneDraws), 0, 'fresh but unchanged feedback must not redraw the STL scene');
    assert(calls.filter(call => call.action === 'sample').length > samplesBeforeIdle, 'render deduplication must not pause fresh control samples');
    state.positions_rad[0] += 0.01;
    await page.waitForFunction(() => window.__lumosSceneDraws > 0);
    await page.locator('#lumosPanel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(ROOT, 'dist', 'lumos-console.png') });
    assert.equal(await page.evaluate(() => window.__lumosSerial.nonReadWrites), 0, 'Touch is strictly read-only');
    assert(await page.evaluate(() => window.__lumosSerial.rounds.slice(-10).every(ids => JSON.stringify(ids) === '[0,1,2,3,4,5,6]')));
    assert.equal(calls.find(call => call.action === 'capture-gripper' && call.body.position === 'closed').body.leader_gripper_deg, -40);
    stopDelay = 300;
    await page.click('#stopTeleop');
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('正在停止'));
    assert.equal(await page.locator('#physicalFollowerModel').isDisabled(), true, 'model stays locked while CAN cleanup is pending');
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('重新连接') && !document.querySelector('#physicalFollowerModel').disabled);
    stopDelay = 0;
    assert.equal(calls.filter(call => call.action === 'disconnect').length, 0);
    assert.equal(await page.locator('#lumosMappingConfirmed').isChecked(), false);
    assert.equal(await page.locator('#startTeleop').isDisabled(), true);
    // One missing axis stops all future samples; cached angles may not drive the arm.
    await connect(); await calibrate();
    const stoppedBefore = calls.filter(call => call.action === 'stop').length;
    await page.evaluate(() => { window.__lumosSerial.missing = [2]; });
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('本次六轴或夹爪回读缺失'));
    assert.equal(calls.filter(call => call.action === 'stop').length, stoppedBefore + 1);
    assert.equal(await page.locator('#startTeleop').isDisabled(), true);
    await page.evaluate(() => { window.__lumosSerial.missing = []; });
    await connect(); await calibrate();
    const beforeMissingGripper = calls.filter(call => call.action === 'stop').length;
    await page.evaluate(() => { window.__lumosSerial.missing = [6]; });
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('（ID 6）'));
    assert.equal(calls.filter(call => call.action === 'stop').length, beforeMissingGripper + 1);
    await page.evaluate(() => { window.__lumosSerial.missing = []; });
    // CAN connect completion after an emergency cannot publish a live session.
    connectDelay = 400;
    await page.check('#lumosEnableConfirmed'); await page.click('#connectFollower');
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('正在连接'));
    await page.click('#emergencyStop');
    await page.waitForFunction(() => document.querySelector('#lumosStatus').textContent.includes('取消'));
    assert(calls.some(call => call.action === 'emergency-stop'));
    assert.equal(state.connected, false);
    connectDelay = 0;
    // Switching console tabs waits for CAN cleanup and closes the Leader serial port.
    await connect();
    const beforeNavigationStops = calls.filter(call => call.action === 'stop').length;
    await page.click('[data-tab="trajectory"]');
    await page.waitForFunction(() => document.querySelector('#trajectoryView').classList.contains('active'));
    assert.equal(calls.filter(call => call.action === 'stop').length, beforeNavigationStops + 1);
    await page.click('#flTrajectoryConnect');
    await page.waitForFunction(() => document.querySelector('#flTrajectoryStatus')?.textContent.includes('仅支持 Star Arm 102-FL'));
    assert.equal(await page.evaluate(() => window.__lumosSerial.requested), serialRequests);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ lumosBrowser: true, matchingLeaderRequired: true, noFollowerSerial: true,
      freshSixAxesAndGripper: true, explicitCalibrationAndStart: true, gripperEndpointsRaw: true, stopLocksModel: true, missingAxisOrGripperStops: true,
      emergencyCancelsPendingConnect: true, navigationClosesCan: true, oldTrajectoryBlocked: true,
      stationaryPoseSkipsRedrawWithoutPausingSampling: true, realHttpTransport: true, hardwareTested: false }));
  } catch (error) {
    if (page && !page.isClosed()) {
      console.error(JSON.stringify({ state, calls: calls.slice(-8), errors, browser: await page.evaluate(() => ({
        status: document.querySelector('#lumosStatus')?.textContent,
        logs: document.querySelector('#logs')?.textContent.slice(-1500),
        timing: window.__lumosTiming?.slice(-50),
      })).catch(() => null) }));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
