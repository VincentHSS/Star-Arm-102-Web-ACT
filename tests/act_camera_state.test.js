import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveCameraBackend, nativeCameraReady, cameraConnectionSignature, cameraRolePresentation, browserCameraLive } from '../Browser_SDK/src/act-camera-state.js';
const camera = () => ({status:'streaming',roles:{wrist:{device_id:'a',mode:{width:640,height:480,fps:30}},world:{device_id:'b',mode:{width:640,height:480,fps:30}}}});
test('auto prefers native pair while explicit browser choice is preserved',()=>{
 assert.equal(effectiveCameraBackend('auto',[{},{}]),'native');
 assert.equal(effectiveCameraBackend('auto',[{}]),'browser');
 assert.equal(effectiveCameraBackend('browser',[{},{}]),'browser');
});
test('shared browser preview requires a live video track',()=>{
 assert.equal(browserCameraLive(null),false);
 assert.equal(browserCameraLive({getVideoTracks:()=>[{readyState:'ended'}]}),false);
 assert.equal(browserCameraLive({getVideoTracks:()=>[{readyState:'live'}]}),true);
});
test('browser previews and incomplete or faulted native sessions cannot unlock ACT',()=>{
 assert.equal(nativeCameraReady(camera()),true);
 assert.equal(nativeCameraReady({status:'streaming',roles:{wrist:{}}}),false);
 assert.equal(nativeCameraReady({...camera(),status:'fault'}),false);
 assert.equal(nativeCameraReady(null),false);
});
test('new frames preserve authorization, actual camera or serial changes invalidate it',()=>{
 const c=camera(); const serial={follower:{connected:true,port:'/dev/ttyUSB0'}};
 const initial=cameraConnectionSignature(c,serial);
 c.roles.wrist.frames=500;c.roles.wrist.actual_fps=29.8;
 assert.equal(cameraConnectionSignature(c,serial),initial);
 c.roles.wrist.mode.width=1280;
 assert.notEqual(cameraConnectionSignature(c,serial),initial);
 assert.notEqual(cameraConnectionSignature(camera(),{follower:{connected:false}}),initial);
});

test('both camera pages derive the same role names from model features',()=>{
 const roles=cameraRolePresentation({wrist:'up',world:'front'});
 assert.equal(roles.wrist.caption,'UP / 固定俯视');
 assert.equal(roles.world.caption,'FRONT / 固定正面');
 assert.equal(cameraRolePresentation().wrist.caption,'WRIST / 末端视角');
});
