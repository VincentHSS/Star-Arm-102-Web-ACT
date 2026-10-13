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
