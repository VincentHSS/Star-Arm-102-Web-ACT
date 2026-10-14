import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserActRunner} from '../Browser_SDK/src/act-browser-runtime.js';
import {Packet} from '../Browser_SDK/src/fashionstar_serial.js';
const fixture=()=>new BrowserActRunner({videos:[],workerFactory:()=>({postMessage(){}})});
function monitor(id,angle=12){const bytes=new Uint8Array(16);const v=new DataView(bytes.buffer);v.setUint8(0,id);v.setInt32(10,angle*10,true);return {code:22,params:bytes};}
test('feedback is single-flight so status polling cannot steal execution replies',async()=>{
  const r=fixture();let waits=0,writes=0;
  r.bus={connected:true,clearPackets(){},waitForPacket(predicate){waits++;return Promise.resolve(Array.from({length:7},(_,id)=>monitor(id)).find(predicate));},async write(){writes++;}};
  const first=r.readState(),second=r.readState();assert.equal(first,second);
  assert.deepEqual(await first,Array(7).fill(12));assert.equal(waits,7);assert.equal(writes,1);
});
test('missing servo feedback rejects instead of returning previous cached state',async()=>{
  const r=fixture();r.observation=Array(7).fill(123);
  r.bus={connected:true,clearPackets(){},waitForPacket(predicate){const packet=Array.from({length:7},(_,id)=>monitor(id)).find(predicate);return packet.params[0]===3?Promise.reject(Error('missing ID 3')):Promise.resolve(packet);},async write(){}};
  await assert.rejects(r.readState(),/missing ID 3/);
});
test('stop during first prediction never sends lock or position after the late result',async()=>{
  const oldDocument=globalThis.document;globalThis.document={hidden:false};
  try{
    const r=fixture(),writes=[];let resolvePrediction;
    r.bus={connected:true,async write(frame){writes.push(Array.from(frame));}};
    r.model={joint_limits:Array.from({length:7},()=>[-180,180]),temporal_ensemble_coeff:null};r.validated=true;
    r.camerasReady=()=>true;r.readState=async()=>Array(7).fill(0);r.predict=()=>new Promise(resolve=>resolvePrediction=resolve);
    const start=r.start(true);await new Promise(resolve=>setTimeout(resolve,0));assert(r.running);
    await r.stop();resolvePrediction(Array.from({length:100},()=>Array(7).fill(10)));await start;
    assert.equal(r.running,false);assert.equal(writes.length,9);
    // Preparation (release + turn-counter reset), then stop; no lock or position.
    assert(writes.slice(0,7).every(f=>f[2]===24&&f[5]===0x10));
    assert.deepEqual(writes[7].slice(2,5),[17,1,255]);
    assert(!writes.some(f=>f[2]===25&&f[4]===14));
    const batch=Uint8Array.from(writes.at(-1));assert.equal(batch.length,63);
    for(let i=0;i<7;i++){const packet=batch.slice(i*9,i*9+9);assert.equal(packet[2],24);assert.equal(packet[4],i);assert.equal(packet[5],0x10);assert.equal(packet.at(-1),packet.slice(0,-1).reduce((a,b)=>a+b,0)&255);}
  }finally{globalThis.document=oldDocument;}
});

test('stop publishes its cause before waiting for an outstanding control read',async()=>{
  const r=fixture();let finish,notice;
  r.running=true;r.control=new Promise(resolve=>finish=resolve);r.onChange=()=>notice=r.lastStop?.reason;
  r.bus={connected:false};
  const stopping=r.stop('相机超过 500 ms 未更新',{error:true});
  assert.equal(notice,'相机超过 500 ms 未更新');assert.equal(r.running,false);assert.equal(r.lastStop.error,true);
  finish();await stopping;
});

test('camera snapshots transfer VideoFrames and overlapping predictions are rejected',async()=>{
  const original=globalThis.VideoFrame;let captures=0,closed=0,resolve;
  globalThis.VideoFrame=class{constructor(){captures++;}close(){closed++;}};
  try{
    const r=fixture();r.videos=[{},{}];r.model={coordinate_contract:'degrees',chunk_size:2};r.camerasReady=()=>true;
    r.request=async(operation,data,transfer)=>{assert.equal(transfer.length,2);assert.equal(data.frames,transfer);await new Promise(r=>resolve=r);data.frames.forEach(f=>f.close());return {actions:new Float32Array(14),latency:5,totalLatency:9};};
    const pending=r.predict(Array(7).fill(0));
    await assert.rejects(r.predict(Array(7).fill(0)),/尚未完成/);
    assert.equal(captures,2);resolve();await pending;assert.equal(closed,2);assert.equal(r.metrics.policy,9);assert.equal(r.inferencePending,null);
  }finally{globalThis.VideoFrame=original;}
});

test('worker reuses image buffers and releases captured frames before GPU work',async()=>{
  const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
  const source=(await readFile(new URL('../Browser_SDK/src/act-browser-worker.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'https://example.test/src/act-browser-worker.js'");
  let canvases=0,disposed=0,closed=0,runs=0,firstFeeds;
  class Tensor{constructor(type,data,dims){this.data=data;this.dims=dims;}dispose(){disposed++;}}
  const session={inputNames:['state','image_0','image_1'],outputNames:['actions'],async release(){},async run(feeds){
    assert.equal(closed,(runs+1)*2,'Camera buffers must be released before inference');
    if(firstFeeds){assert.equal(feeds.image_0,firstFeeds.image_0);assert.equal(feeds.image_1,firstFeeds.image_1);}else firstFeeds=feeds;
    assert.deepEqual(Array.from(feeds.image_0.data),[1,1,0,0,0,0]);
    runs++;return {actions:new Tensor('float32',new Float32Array(14),[1,2,7])};
  }};
  const ort={env:{wasm:{}},Tensor,InferenceSession:{create:async()=>session}};
  class Canvas{constructor(){canvases++;}getContext(){return {drawImage(){},getImageData(){return {data:Uint8Array.from([255,0,0,255,255,0,0,255])};}};}}
  const messages=[],self={postMessage:message=>messages.push(message)},manifest={model_sha256:'a'.repeat(64),chunk_size:2,inputs:{cameras:[0,1].map(()=>({shape:[1,3,1,2]}))}};
  runInNewContext(source,{ort,unzipSync(){},validateWebManifest(){},OffscreenCanvas:Canvas,self,navigator:{gpu:{requestAdapter:async()=>({})}},crypto:{subtle:{digest:async()=>new Uint8Array(32).fill(170)}},URL,performance,Uint8Array,Float32Array});
  await self.onmessage({data:{id:1,operation:'load',buffer:new ArrayBuffer(1),manifest}});
  assert(!messages.at(-1).error);
  for(let i=0;i<200;i++){
    await self.onmessage({data:{id:i+2,operation:'infer',state:Array(7).fill(0),frames:[0,1].map(()=>({displayWidth:2,displayHeight:1,close(){closed++;}}))}});
    assert(!messages.at(-1).error,messages.at(-1).error);
  }
  assert.equal(canvases,2);assert.equal(runs,200);assert.equal(disposed,400);
  await self.onmessage({data:{id:999,operation:'load',buffer:new ArrayBuffer(1),manifest}});
  assert.equal(disposed,402,'Reload must release the retained image tensors');
});

test('fresh capture remains usable even when preview callbacks stop',async()=>{
  const r=fixture();r.videos=[0,1].map(()=>({srcObject:{getVideoTracks:()=>[{readyState:'live'}]}}));
  r.model={coordinate_contract:'degrees',chunk_size:2,inputs:{cameras:[{feature:'up'},{feature:'front'}]}};
  r.cameraInfo=[0,1].map(()=>({source:'track',lastFrame:performance.now(),lastPreview:performance.now()-1000}));
  let clones=0;r.latestFrames=[0,1].map(()=>({clone(){clones++;return {close(){}};}}));
  r.request=async(operation,data)=>({actions:new Float32Array(14),latency:1});
  assert(r.camerasReady());await r.predict(Array(7).fill(0));assert.equal(clones,2);
  r.cameraInfo[1].lastFrame=performance.now()-600;
  assert(!r.camerasReady());assert.match(r.cameraIssue(),/第 2 路相机 FRONT.*500 ms/);
  await assert.rejects(r.predict(Array(7).fill(0)),/FRONT/);
});

test('camera pump retains only the newest frame and closes all frames on release',async()=>{
  const r=fixture(),stream={};let reads=0,closed=0,finish;
  const video={srcObject:stream,pause(){}};r.videos=[video];
  r.cameraInfo[0]={received:0,source:'track',lastFrame:0};
  const reader={read(){reads++;return reads<=2?Promise.resolve({done:false,value:{timestamp:reads*33333,close(){closed++;}}}):new Promise(resolve=>finish=resolve);},async cancel(){finish({done:true});},releaseLock(){}};
  r.frameReaders[0]=reader;const pumping=r.consumeCamera(0,video,stream,reader);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(closed,1);assert.equal(r.cameraInfo[0].received,2);assert(r.cameraInfo[0].lastFrame>0);
  r.closeCameras();await pumping;assert.equal(closed,2);assert.equal(r.latestFrames[0],null);
});
