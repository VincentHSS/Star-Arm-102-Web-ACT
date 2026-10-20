// Actual workbench, isolated backend and synthetic cameras. No physical hardware.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..'), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const site = `http://127.0.0.1:${port}`, stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'star-arm-workflow-'));
  const service = spawn(process.env.PYTHON || 'python', ['-X', 'utf8', '-c',
    `from pathlib import Path;from runtime.ubuntu_runtime import serve;serve(Path(${JSON.stringify(stateDir)}),port=${port},static_root=Path(${JSON.stringify(path.join(ROOT,'Browser_SDK'))}))`],
    { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: { ...process.env, NO_PROXY: '127.0.0.1,localhost,::1' } });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) { try { const r = await fetch(site + '/api/v1/health'); await r.arrayBuffer(); if (r.ok) { ready = true; break; } } catch {} await pause(100); }
    assert(ready);
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let online = false, prepares = 0, binding = null, episodes = [], cameraUploads = 0;
    const serial = { leader: null, follower: null };
    await page.route('**/src/local-service.js*', r => r.fulfill({ contentType: 'text/javascript',
      body: fs.readFileSync(path.join(ROOT, 'Browser_SDK/src/local-service.js'), 'utf8').replace('http://127.0.0.1:18765', site) }));
    await page.route('http://127.0.0.1:18765/**', r => r.abort());
    await page.route(site + '/api/v1/**', async r => {
      const url = new URL(r.request().url()), api = url.pathname, method = r.request().method();
      if (!online) return r.fulfill({ status: 503, json: { error: { message: 'Test service offline' } } });
      if (api === '/api/v1/training/environment') return r.fulfill({ json: { status: 'not_prepared', training_supported: true, training_profile: {} } });
      if (api.includes('/training/environment/prepare') || api.includes('/training/environment/retry')) { prepares++;return r.fulfill({ status: 409, json: { error: { message: 'Training must not start during capture' } } }); }
      if (api === '/api/v1/capabilities') return r.fulfill({ json: { serial_ports: ['/dev/test-leader', '/dev/test-follower'], torch: { installed: false }, gpu: { available: false }, act_runtime: { execution_available: false }, training_ready: false } });
      if (api === '/api/v1/cameras/native') return r.fulfill({ json: { available: false, devices: [] } });
      if (api === '/api/v1/devices' && method === 'GET') return r.fulfill({ json: { binding, serial_connections: serial } });
      if (api === '/api/v1/devices/serial/connect') { const body = r.request().postDataJSON();serial[body.role] = { ...body, connected: true, baudrate: 1000000 };return r.fulfill({ json: serial[body.role] }); }
      if (api === '/api/v1/devices/serial/disconnect') { serial[r.request().postDataJSON().role] = null;return r.fulfill({ json: { connected: false } }); }
      if (api === '/api/v1/devices/bind') { binding = { ...r.request().postDataJSON(), capture_ready: true };return r.fulfill({ json: binding }); }
      if (api === '/api/v1/episodes' && method === 'POST') { const body = r.request().postDataJSON();const episode = { id: 'workflow-test', dataset_id: body.dataset_id, status: 'recording', runtime: { status: 'running' } };episodes = [episode];return r.fulfill({ status: 201, json: episode }); }
      if (api.endsWith('/camera-frames')) { cameraUploads++;return r.fulfill({ json: { accepted: r.request().postDataJSON().frames.length } }); }
      if (api.endsWith('/workflow-test/stop')) { episodes[0].status = 'review';return r.fulfill({ json: { ...episodes[0], valid_frames: 0, mismatch_rate: 0 } }); }
      if (api === '/api/v1/state') { const result = await r.fetch();const value = await result.json();value.episodes = episodes;return r.fulfill({ json: value }); }
      return r.continue();
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'mediaDevices', { value: {
        enumerateDevices: async () => ['one', 'two'].map(id => ({ kind: 'videoinput', deviceId: id, label: 'Layout test ' + id })),
        getUserMedia: async constraints => {
          const c = document.createElement('canvas'); c.width = 640; c.height = 480;
          const ctx = c.getContext('2d');let frame = 0;
          const draw = () => { ctx.fillStyle = constraints.video?.deviceId?.exact === 'two' ? '#254354' : '#30443f';ctx.fillRect(0,0,640,480);ctx.strokeStyle='#789aa0';ctx.lineWidth=2;for(let x=0;x<640;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,480);ctx.stroke();}ctx.fillStyle='#d9e8eb';ctx.font='22px sans-serif';ctx.fillText('LAYOUT PREVIEW / SIMULATED CAMERA',45,210);ctx.fillText(String(frame++),45,250); };draw();
          const stream = c.captureStream(30);const timer=setInterval(()=>{if(stream.getVideoTracks()[0].readyState==='ended')clearInterval(timer);else draw();},33);return stream;
        }
      } });
    });
    await page.goto(site + '/index.html');
    await page.waitForFunction(() => document.querySelector('#modelLoadStatus')?.dataset.state === 'ready');
    await page.locator('.workspace-nav summary').click();
    const actLink = page.locator('.workspace-nav [href="act-workbench.html"][data-workspace-target="act"]');
    assert((await actLink.getAttribute('href')).endsWith('act-workbench.html'), 'Windows ACT entry must preserve the workbench URL');
    await actLink.click(); await page.waitForURL('**/act-workbench.html');
    assert.equal(await page.locator('.workflow [data-view]').count(), 4);
    assert.equal(await page.locator('#collect').isVisible(), true);
    assert.equal(await page.locator('.workspace-nav').count(), 1);
    assert.equal(await page.locator('.workspace-nav [aria-current="page"]').textContent().then(text => text.includes('ACT 工作台')), true);
    assert.equal(await page.locator('.workspace-nav [href="act-browser.html"][data-workspace-target="act"]').count(), 1);
    assert.equal(await page.locator('.product-tabs,.workspace-launch,.browser-execute-link').count(), 0, 'Workspace links should be consolidated into one picker');
    await page.click('#capture-service-setup');
    await page.waitForFunction(() => document.querySelector('#capture-service-dialog').open);
    assert.equal(await page.locator('#capture-runtime-host #runtime-onboarding').count(), 1);
    assert.equal(await page.locator('#capture-runtime-host [data-runtime-environment]').isVisible(), false);
    online = true;
    await page.click('#capture-service-recheck');
    await page.waitForFunction(() => document.querySelector('#capture-service-status').textContent === '已连接');
    await page.click('#capture-service-close');
    await page.waitForFunction(() => document.querySelector('#service-state').textContent.includes('已连接'));
    assert.equal(await page.locator('#collect').isVisible(), true);
    assert.equal(prepares, 0);
    if (process.env.ACT_WORKFLOW_SCREENSHOT) {
      await page.waitForFunction(() => document.querySelector('#waveform-status').textContent.includes('等待采集'));
      await pause(2800);
      await page.screenshot({ path: process.env.ACT_WORKFLOW_SCREENSHOT.replace('.png', '-entry.png') });
      await page.click('.workflow [data-view="infer"]');await page.waitForFunction(() => document.querySelector('#infer').classList.contains('active'));await pause(300);
      await page.screenshot({ path: process.env.ACT_WORKFLOW_SCREENSHOT.replace('.png', '-infer-empty.png') });
      await page.click('.workflow [data-view="collect"]');await page.waitForFunction(() => document.querySelector('#collect').classList.contains('active'));
    }
    await page.fill('#dataset-form [name=task_name]', 'Layout capture test');
    await page.fill('#dataset-form [name=slug]', 'workflow-capture');
    await page.click('#dataset-form [type=submit]');
    await page.waitForFunction(() => document.querySelector('#active-dataset').value !== '');
    await page.selectOption('#leader-port', '/dev/test-leader');await page.click('#connect-leader');
    await page.selectOption('#follower-port', '/dev/test-follower');await page.click('#connect-follower');
    await page.click('#detect-cameras');await page.waitForFunction(() => !document.querySelector('#connect-cameras').disabled);
    await page.click('#connect-cameras');await page.waitForFunction(() => !document.querySelector('#bind-devices').disabled);
    await page.click('#bind-devices');await page.waitForFunction(() => !document.querySelector('#episode-button').disabled);
    await page.click('#episode-button');await page.waitForFunction(() => !document.querySelector('#stop-episode').disabled);
    await pause(400);assert(cameraUploads > 0, 'Browser camera recording must upload frames without a prepared ACT environment');
    assert.equal(prepares, 0);
    await page.click('#stop-episode');
    await page.waitForFunction(() => document.querySelector('#stop-episode').disabled && !document.querySelector('#episode-review').classList.contains('hidden'));
    const layouts = [];
    for (const viewport of [{width:1600,height:900},{width:1366,height:768},{width:1920,height:1080}]) {
      await page.setViewportSize(viewport);
      for (const view of ['collect','infer']) {
        await page.click(`.workflow [data-view="${view}"]`);
        await page.waitForFunction(id => document.querySelector('#'+id).classList.contains('active'), view);await pause(250);
        const geometry=await page.evaluate(view => {
          const stage=document.querySelector(view==='collect'?'.capture-stage':'.inference-stage'), cameras=stage.querySelector(view==='collect'?'.camera-grid':'.inference-cameras'), wave=stage.querySelector(view==='collect'?'.waveform-panel':'.inference-wave');
          const image=cameras.querySelector('video'), imageBox=image.getBoundingClientRect(), b=cameras.getBoundingClientRect(),w=wave.getBoundingClientRect();
          const scale=Math.min(imageBox.width/640,imageBox.height/480);
          return {cameraHeight:b.height,imageWidth:640*scale,imageHeight:480*scale,waveHeight:w.height,bottom:w.bottom,viewport:innerHeight,documentOverflow:document.documentElement.scrollHeight>innerHeight+2};
        },view);
        assert(geometry.cameraHeight >= 230, JSON.stringify({view,viewport,geometry}));
        assert(geometry.imageWidth >= 300, JSON.stringify({view,viewport,geometry}));
        assert(geometry.waveHeight >= 190 && geometry.bottom <= viewport.height+2, JSON.stringify({view,viewport,geometry}));
        assert.equal(geometry.documentOverflow,false);
        layouts.push({view,viewport,...geometry});
        if(process.env.ACT_WORKFLOW_SCREENSHOT && viewport.width===1600)await page.screenshot({path:process.env.ACT_WORKFLOW_SCREENSHOT.replace('.png','-'+view+'.png')});
      }
    }
    assert.equal(prepares,0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({windowsEntersFourStepWorkbench:true,captureSetupInStepOne:true,captureWithoutTrainingEnvironment:true,browserFramesUploaded:true,trainingInstalls:prepares,layouts,hardwareTested:false}));
  } finally {
    if(browser)await browser.close();
    if(service.exitCode===null){const exited=new Promise(resolve=>service.once('exit',resolve));service.kill();await exited;}
    assert(path.resolve(stateDir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(stateDir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
