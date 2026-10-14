// Isolated browser-only flow. UART/cameras are simulated; optional REAL_MODEL uses genuine WebGPU weights.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),net=require('node:net'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const localLauncher=process.env.BROWSER_ACT_STATIC_SERVER==='powershell';
 const service=localLauncher
  ?spawn('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'tools/start_browser_local.ps1'),'-NoBrowser','-Port',String(port),'-WebRoot',path.join(ROOT,'Browser_SDK')],{windowsHide:true,stdio:'ignore'})
  :spawn(process.env.PYTHON||'python',['-X','utf8','-m','http.server',String(port),'--bind','127.0.0.1','--directory',path.join(ROOT,'Browser_SDK')],{windowsHide:true,stdio:'ignore'});
 let browser;
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/act-browser.html`)).ok){ready=true;break;}}catch{}await pause(200);}
  assert(ready,'Static webpage server did not start');
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu'],...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
  const page=await browser.newPage({viewport:{width:1876,height:843}}),errors=[];let backendCalls=0;
  page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1:18765/**',r=>{backendCalls++;return r.abort();});
  if(!process.env.BROWSER_ACT_REAL_MODEL)await page.route('**/src/act-browser-worker.js',r=>r.fulfill({contentType:'text/javascript',body:`
   const manifest={schema:'star-arm-browser-act-v1',name:'Software test fixture',model_file:'model.onnx',model_sha256:'a'.repeat(64),chunk_size:100,coordinate_contract:'degrees',joint_limits:Array.from({length:7},()=>[-180,180]),tasks:['Test'],inputs:{cameras:[0,1].map(i=>({input:'image_'+i,feature:i?'front':'up',shape:[1,3,480,640]}))}};
   onmessage=({data})=>{let result;if(data.operation==='zip')result={manifest,weights:new Uint8Array(128)};else if(data.operation==='load')result={manifest};else{data.frames.forEach(f=>f.close());result={actions:new Float32Array(700).fill(10),latency:8};}postMessage({id:data.id,result});};` }));
  await page.addInitScript(()=>{
   const state={frames:[],positions:[0,0,0,0,0,0,45],cameraOpens:0,portCloses:0};window.__browserActTest=state;
   const frameCallback=HTMLVideoElement.prototype.requestVideoFrameCallback;
   HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return frameCallback.call(this,(now,metadata)=>{if(!state.freezePreview)callback(now,metadata);});};
   let incoming;
   const response=id=>{const p=new Uint8Array(21);p.set([5,28,22,16]);p[4]=id;new DataView(p.buffer).setInt32(14,Math.round(state.positions[id]*10),true);p[20]=p.slice(0,20).reduce((a,b)=>a+b,0)&255;return p;};
   const port={async open(){this.readable=new ReadableStream({start(c){incoming=c;}});this.writable=new WritableStream({write(frame){
     state.frames.push(Array.from(frame));
     if(frame[2]===25&&frame[4]===22)for(let i=0;i<7;i++)incoming.enqueue(response(i));
     if(frame[2]===25&&frame[4]===14){const view=new DataView(frame.buffer,frame.byteOffset,frame.byteLength);for(let i=0;i<7;i++)state.positions[i]=view.getInt32(8+i*15,true)/10;}
   }});},async close(){state.portCloses++;}};
   Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>port,addEventListener(){},removeEventListener(){}}});
   Object.defineProperty(navigator,'mediaDevices',{value:{
    enumerateDevices:async()=>['a','b'].map(id=>({kind:'videoinput',deviceId:id,label:'Software camera '+id})),
    getUserMedia:async request=>{state.cameraOpens++;const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle=request.video?.deviceId?.exact==='b'?'rgb(96,128,192)':'rgb(32,64,96)';ctx.fillRect(0,0,640,480);const stream=canvas.captureStream(30);const timer=setInterval(()=>{if(stream.getVideoTracks()[0].readyState==='ended')clearInterval(timer);else if(!state.freezeCameras&&!(state.freezeFront&&request.video?.deviceId?.exact==='b'))ctx.fillRect(0,0,640,480);},33);return stream;}
   }});
  });
  await page.goto(`http://127.0.0.1:${port}/act-browser.html`);await page.waitForFunction(()=>!document.getElementById('web-model-import').disabled);
  if(process.env.BROWSER_ACT_SCREENSHOT){await pause(1000);await page.screenshot({path:process.env.BROWSER_ACT_SCREENSHOT,fullPage:true});}
  await page.setInputFiles('#web-model-file',process.env.BROWSER_ACT_REAL_MODEL||{name:'software-model.zip',mimeType:'application/zip',buffer:Buffer.from('TEST ONLY')});
  await page.waitForFunction(()=>document.getElementById('web-state').textContent==='模型已加载',null,{timeout:120000});
  if(process.env.BROWSER_ACT_REAL_MODEL){
   const calibration=Object.fromEntries(Array.from({length:7},(_,i)=>[i===6?'gripper':'Motor_'+i,{id:i,drive_mode:0,range_min:0,range_max:4096,homing_offset:0}]));
   await page.setInputFiles('#web-calibration-file',{name:'synthetic-test-calibration.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(calibration))});
   await page.waitForFunction(()=>document.getElementById('web-calibration-status').textContent.includes('已载入'));
  }
  await page.click('#web-detect-cameras');await page.waitForFunction(()=>!document.getElementById('web-connect-cameras').disabled);
  await page.click('#web-connect-cameras');await page.waitForFunction(()=>document.querySelectorAll('.browser-act-cameras article.streaming').length===2);
  const geometry=await page.evaluate(()=>{const panel=document.querySelector('.browser-act-vision').getBoundingClientRect();return [...document.querySelectorAll('.browser-act-cameras article')].map(el=>{const rect=el.getBoundingClientRect();return {width:rect.width,height:rect.height,contained:rect.bottom<=panel.bottom};});});
  assert(geometry.every(r=>r.height>=220&&Math.abs(r.width/r.height-4/3)<.05&&r.contained),JSON.stringify(geometry));
  if(process.env.BROWSER_ACT_SCREENSHOT)await page.screenshot({path:process.env.BROWSER_ACT_SCREENSHOT,fullPage:true});
  await page.click('#web-connect-arm');await page.waitForFunction(()=>!document.getElementById('web-validate').disabled);
  assert.equal(await page.locator('#web-start').isDisabled(),true);
  await page.click('#web-validate');await page.waitForFunction(()=>!document.getElementById('web-confirm').disabled,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>__browserActTest.frames.some(f=>f[2]===25&&f[4]===14)),false,'Read-only validation must never send a Goal_Position');
  await page.check('#web-confirm');await page.click('#web-start');
  await page.waitForFunction(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length>=5,null,{timeout:30000});
  if(await page.evaluate(()=>typeof MediaStreamTrackProcessor==='function')){
    await page.evaluate(()=>{__browserActTest.freezePreview=true;const stage=document.querySelector('.browser-act-stage');stage.scrollTop=stage.scrollHeight;});
    await pause(1200);assert.equal(await page.locator('#web-stop').isDisabled(),false,'Fresh capture must continue when preview callbacks stop');
  }
  const beforeRun=await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length);
  await pause(Number(process.env.BROWSER_ACT_RUN_MS||20000));
  assert.equal(await page.locator('#web-stop').isDisabled(),false,'Execution must remain active during a sustained run');
  assert(await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length)>beforeRun+20);
  await page.click('#web-stop');await page.waitForFunction(()=>document.getElementById('web-stop').disabled&&!document.getElementById('web-close-arm').disabled);
  const stopped=await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length);await pause(800);
  assert.equal(await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length),stopped,'Stopped predictions must not resume motor writes');
  assert((await page.locator('#web-execution-notice').textContent()).includes('用户停止'));
  await page.click('#web-validate');await page.waitForFunction(()=>!document.getElementById('web-confirm').disabled,null,{timeout:120000});
  await page.check('#web-confirm');await page.click('#web-start');
  await page.waitForFunction(()=>!document.getElementById('web-stop').disabled);
  await page.evaluate(()=>__browserActTest.freezeFront=true);
  await page.waitForFunction(()=>document.getElementById('web-stop').disabled&&!document.getElementById('web-close-arm').disabled);
  assert((await page.locator('#web-execution-notice').textContent()).includes('FRONT'));
  const halted=await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length);await pause(700);
  assert.equal(await page.evaluate(()=>__browserActTest.frames.filter(f=>f[2]===25&&f[4]===14).length),halted);
  const download=page.waitForEvent('download');await page.click('#web-download-diagnostics');const file=await download;assert.equal(file.suggestedFilename(),'star-arm-browser-diagnostics.json');const diagnostic=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert(diagnostic.cameras[0].ageMs<500);assert(diagnostic.cameras[1].ageMs>=500);assert(diagnostic.lastStop.reason.includes('FRONT'));
  await page.click('#web-close-arm');await page.waitForFunction(()=>!document.getElementById('web-connect-arm').disabled);
  assert.equal(await page.evaluate(()=>__browserActTest.portCloses),1);
  await page.click('#web-close-cameras');
  await page.evaluate(()=>{const original=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async request=>{if(request.video?.deviceId?.exact==='b')throw new DOMException('TEST camera occupied','NotReadableError');return original(request);};});
  await page.click('#web-connect-cameras');
  await page.waitForFunction(()=>document.getElementById('web-camera-connection').textContent.includes('FRONT')&&document.getElementById('web-camera-connection').classList.contains('error')&&!document.getElementById('web-connect-cameras').disabled);
  assert((await page.locator('#web-camera-connection').textContent()).includes('NotReadableError'));
  assert((await page.locator('#web-execution-notice').textContent()).includes('FRONT'));
  assert(await page.evaluate(()=>[...document.querySelectorAll('.browser-act-cameras video')].every(v=>!v.srcObject)));
  assert.equal(backendCalls,0,'Browser execution must not need the local Python/LeRobot service');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({browserOnly:true,windowsStaticLauncher:localLauncher,localServiceRequests:backendCalls,readOnlyValidation:true,sustainedRun:true,cameraStallStopped:true,singleCameraIdentified:true,previewIndependent:true,largeUncroppedPreview:true,cameraOpenFailureVisible:true,diagnosticsDownload:true,executedCommands:stopped,realModel:Boolean(process.env.BROWSER_ACT_REAL_MODEL),physicalHardware:false}));
 }finally{if(browser)await browser.close();service.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
