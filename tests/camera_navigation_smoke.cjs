// Synthetic camera regression: no physical camera, UART or Policy is opened.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const net = require('node:net');
const ROOT = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const site='http://127.0.0.1:'+port;
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'star-arm-camera-test-'));
  const service=spawn(process.env.PYTHON||'python',['-X','utf8','-c',
    `from pathlib import Path;from runtime.ubuntu_runtime import serve;serve(Path(${JSON.stringify(state)}),port=${port},static_root=Path(${JSON.stringify(path.join(ROOT,'Browser_SDK'))}))`],
    {cwd:ROOT,env:{...process.env,NO_PROXY:'localhost,127.0.0.1,::1'},windowsHide:true,stdio:'ignore'});
  let browser;
  try {
    let ready=false;
    for(let i=0;i<80;i++){try{const r=await fetch(site+'/api/v1/health');ready=r.ok;await r.arrayBuffer();if(ready)break;}catch{}await pause(100);}
    assert(ready,'Temporary service failed to start');
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
    for(const backend of ['browser','native']) {
      const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
      await page.route('**/src/local-service.js*',r=>r.fulfill({contentType:'text/javascript',
        body:fs.readFileSync(path.join(ROOT,'Browser_SDK/src/local-service.js'),'utf8').replace('http://127.0.0.1:18765',site)}));
      // Never send a test's control/device requests to the customer runtime.
      await page.route('http://127.0.0.1:18765/**',r=>r.abort());
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        const cameras={calls:0,streams:[]};window.__testCameras=cameras;
        Object.defineProperty(navigator,'mediaDevices',{value:{
          enumerateDevices:async()=>['a','b'].map(id=>({kind:'videoinput',deviceId:id,groupId:id,label:'Test camera '+id})),
          getUserMedia:async constraints=>{
            cameras.calls++;
            const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
            const ctx=canvas.getContext('2d');let frame=0;
            const paint=()=>{ctx.fillStyle=constraints.video?.deviceId?.exact==='b'?'#216ba1':'#b74242';ctx.fillRect(0,0,640,480);ctx.fillStyle='white';ctx.fillText(String(frame++),20,20);};paint();
            const stream=canvas.captureStream(30);cameras.streams.push(stream);
            const timer=setInterval(()=>{if(stream.getVideoTracks()[0].readyState==='ended')clearInterval(timer);else paint();},33);
            return stream;
          }
        }});
      });
      const devices=['a','b'].map(id=>({stable_id:id,name:'Test camera '+id,path:id}));
      let native={backend:'native',status:'idle',roles:{}}, connects=0, closes=0, releaseHeld;
      let hold=false, heldStarted=false;
      await page.route('**/api/v1/training/environment',r=>r.fulfill({json:{status:'ready',backend:'cpu',training_supported:false,training_profile:{}}}));
      await page.route('**/api/v1/cameras/native',r=>r.fulfill({json:{available:backend==='native',devices:backend==='native'?devices:[]}}));
      await page.route('**/api/v1/cameras/native/connect',async r=>{
        connects++;await pause(150);native={backend:'native',status:'streaming',roles:Object.fromEntries(devices.map((d,i)=>[i?'world':'wrist',
          {device_id:d.stable_id,device_name:d.name,mode:{width:640,height:480,fps:30,pixel_format:'MJPG'},actual_fps:30}]))};return r.fulfill({json:native});
      });
      await page.route('**/api/v1/cameras/native/disconnect',r=>{closes++;native={status:'idle',roles:{}};return r.fulfill({json:native});});
      await page.route('**/api/v1/inference',async r=>{
        const snapshot={status:'idle',cameras:structuredClone(native),serial_connections:{},metrics:{},logs:[]};
        if(hold){hold=false;heldStarted=true;await new Promise(resolve=>releaseHeld=resolve);}
        return r.fulfill({json:snapshot});
      });
      await page.goto(site+'/act-workbench.html');
      await page.waitForFunction(()=>document.querySelector('#service-state').textContent.includes('已连接'));
      const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.toDataURL('image/jpeg').split(',')[1];});
      await page.route('**/api/v1/cameras/native/*/frame?*',async r=>{await pause(60);return r.fulfill({contentType:'image/jpeg',body:Buffer.from(jpeg,'base64')});});
      await page.click('#detect-cameras');
      await page.waitForFunction(()=>!document.querySelector('#connect-cameras').disabled);
      if(backend==='native'){
        hold=true;await page.click('#refresh');
        for(let i=0;!heldStarted&&i<40;i++)await pause(50);
        assert(heldStarted,'A pre-connect snapshot must be held for the stale-response regression');
      }
      await page.click('#connect-cameras');
      await page.waitForFunction(()=>!document.querySelector('#disconnect-cameras').disabled);
      if(releaseHeld){releaseHeld();await pause(250);}
      await page.waitForFunction(()=>document.querySelector('#camera-badge').classList.contains('on'));
      for(const target of ['infer','collect','models','infer','collect','infer']) {
        await page.click(`.workflow [data-view="${target}"]`);
        await page.waitForFunction(id=>document.querySelector('#'+id).classList.contains('active')&&!document.querySelector(`.workflow [data-view="${id}"]`).disabled,target);
        if(target==='models')continue;
        if(backend==='browser') {
          await page.waitForFunction(target=>['wrist','world'].every(role=>{
            const id=target==='infer'?`inference-${role}-browser-preview`:`${role}-preview`,v=document.getElementById(id);
            return v.srcObject&&v.videoWidth===640&&v.readyState>=2&&!v.paused;
          }),target);
          assert.equal(await page.evaluate(()=>window.__testCameras.calls),3,'Navigation must reuse the two streams without reopening camera devices');
          assert.equal(await page.evaluate(()=>window.__testCameras.streams.slice(1).every(s=>s.getVideoTracks()[0].readyState==='live')),true);
          if(target==='infer')assert.equal(await page.locator('#inference-start').isDisabled(),true,'A browser preview alone must not authorize a real Policy');
        } else {
          await page.waitForFunction(target=>['wrist','world'].every(role=>{
            const selector=target==='infer'?`#inference-${role}-frame.active,#inference-${role}-frame-buffer.active`:`#${role}-native-preview.active,#${role}-native-preview-buffer.active`;
            const img=document.querySelector(selector);return img?.naturalWidth===640&&img.classList.contains('frame-ready');
          }),target);
          assert.equal(closes,0,'Step navigation and late idle snapshots must never close connected native cameras');
          assert.equal(connects,1,'Native cameras must be connected only once');
        }
      }
      assert.deepEqual(errors,[]);console.log(JSON.stringify({backend,stepOneToFourPreserved:true,roundTrips:true,staleIdleIgnored:backend==='native',hardwareTested:false}));
      await page.close();
    }
  } finally {
    if(browser)await browser.close();
    if(service.exitCode===null){const exited=new Promise(resolve=>service.once('exit',resolve));service.kill();await exited;}
    assert.equal(path.dirname(path.resolve(state)),path.resolve(os.tmpdir()));assert(path.basename(state).startsWith('star-arm-camera-test-'));
    fs.rmSync(state,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
