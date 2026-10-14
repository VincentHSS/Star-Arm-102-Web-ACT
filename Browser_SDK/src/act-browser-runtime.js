import { SerialServoBus } from './serial_servo_bus.js';
import { parseMonitorPacket } from './fashionstar_serial.js';
import { BrowserCameraController } from './act-cameras.js';
import { BrowserActionSchedule,ServoProtocol,validateWebManifest,validateWebCalibration,observationCoordinates,actionCoordinates,safeBrowserAction,packBrowserActCommand } from './act-browser-core.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function cameraWait(promise,ms,message){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}
  finally{clearTimeout(timer);}
}
export class BrowserActRunner {
  constructor({videos,onChange=()=>{},onSample=()=>{},workerFactory=()=>new Worker(new URL('./act-browser-worker.js',import.meta.url),{type:'module'}),serial}={}){
    this.videos=videos;this.onChange=onChange;this.onSample=onSample;this.worker=workerFactory();this.nextId=0;this.pending=new Map();
    this.camera=new BrowserCameraController(navigator.mediaDevices);this.cameraInfo=[null,null];this.callbacks=[null,null];
    this.frameReaders=[null,null];this.latestFrames=[null,null];
    this.model=null;this.calibration=null;this.validated=false;this.running=false;this.generation=0;this.busy=false;
    this.observation=null;this.raw=null;this.safe=null;this.metrics={executed:0,missed:0,policy:0,control:0,remaining:0};
    this.bus=new SerialServoBus('ACT 从臂',{serial,onLost:e=>void this.stop(`从臂断开：${e.message}`,{error:true}),onStateChange:()=>this.onChange()});
    this.bus.pushRaw=()=>{}; // This channel only consumes decoded monitor packets.
    this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data.result);};
    this.worker.onerror=e=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(e.message||'网页推理线程异常'));}this.pending.clear();this.model=null;void this.stop('网页推理线程异常，请重新打开页面',{error:true});};
  }
  request(operation,data={},transfer=[],timeout=120000){
    const id=++this.nextId;return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('模型操作超时，请检查显卡和浏览器硬件加速'));},timeout);
      this.pending.set(id,{resolve,reject,timer});
      try{this.worker.postMessage({id,operation,...data},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
    });
  }
  async importModel(file){
    if(this.running)throw Error('请先停止执行再导入模型');if(file.size>400_000_000)throw Error('网页模型包上限为 400 MB');
    this.validated=false;this.model=null;this.calibration=null;this.onChange();
    const buffer=await file.arrayBuffer(),result=await this.request('zip',{buffer},[buffer]);this.model=validateWebManifest(result.manifest);
    return {manifest:this.model,weights:new Blob([result.weights])};
  }
  async restoreModel(saved){
    this.model=null;const buffer=await saved.weights.arrayBuffer();await this.request('load',{buffer,manifest:saved.manifest},[buffer]);this.model=validateWebManifest(saved.manifest);
    if(saved.calibration)this.calibration=validateWebCalibration(saved.calibration);this.validated=false;
  }
  setCalibration(data){if(this.running)throw Error('请先停止执行');this.calibration=validateWebCalibration(data);this.validated=false;}
  async listCameras(){if(this.running)throw Error('请先停止执行');return this.camera.requestPermissionAndList();}
  async connectCameras(first,second){
    if(!this.model)throw Error('请先导入网页执行模型');if(this.running)throw Error('请先停止执行');this.closeCameras();
    const shape=this.model.inputs.cameras[0].shape,height=shape[2],width=shape[3];
    let phase='双相机';
    const progress=text=>{this.cameraConnection={state:'connecting',message:text};this.onChange();};
    progress('正在请求双相机，请留意浏览器的相机权限提示…');
    try{
      const labels=this.model.inputs.cameras.map((c,i)=>`第 ${i+1} 路相机 ${c.feature.toUpperCase()}`);
      const streams=await this.camera.openPair(first,second,{width,height,frameRate:30,strict:true,timeoutMs:12000,labels,onProgress:label=>{phase=label;progress(`正在打开${label}（${width}×${height} / 30 FPS）…`);}});
      for(const [i,role] of ['wrist','world'].entries()){
        phase=labels[i];progress(`正在启动${phase}的画面…`);
        const video=this.videos[i];video.srcObject=streams[role];video.closest?.('article')?.classList.add('streaming');
        await cameraWait(video.play(),5000,`${phase}播放启动超过 5 秒，请关闭其他相机软件后重试`);
        const deadline=performance.now()+5000;while(!video.videoWidth&&performance.now()<deadline)await sleep(25);
        if(video.videoWidth!==width||video.videoHeight!==height)throw Error(`第 ${i+1} 路相机实际 ${video.videoWidth}×${video.videoHeight}，模型要求 ${width}×${height}`);
        if(typeof video.requestVideoFrameCallback!=='function')throw Error('请使用支持真实视频帧回调的新版 Chrome / Edge');
        const frames=[];this.cameraInfo[i]={lastFrame:0,fps:null,previewFps:null,width,height,source:'preview',received:0};
        if(typeof MediaStreamTrackProcessor==='function'){
          try{
            const processor=new MediaStreamTrackProcessor({track:streams[role].getVideoTracks()[0],maxBufferSize:1});
            const reader=processor.readable.getReader();this.frameReaders[i]=reader;this.cameraInfo[i].source='track';
            void this.consumeCamera(i,video,streams[role],reader);
          }catch(e){this.cameraInfo[i].captureWarning=e.message;}
        }
        const onFrame=(now,metadata)=>{
          if(video.srcObject!==streams[role])return;
          frames.push({now,count:metadata.presentedFrames});while(frames.length>1&&now-frames[0].now>2000)frames.shift();
          const firstFrame=frames[0],fps=now>firstFrame.now?(metadata.presentedFrames-firstFrame.count)*1000/(now-firstFrame.now):null;
          this.cameraInfo[i].previewFps=fps;this.cameraInfo[i].lastPreview=now;
          if(this.cameraInfo[i].source==='preview')Object.assign(this.cameraInfo[i],{lastFrame:now,fps,received:metadata.presentedFrames});
          this.callbacks[i]=video.requestVideoFrameCallback(onFrame);
        };this.callbacks[i]=video.requestVideoFrameCallback(onFrame);
      }
      this.validated=false;
      this.cameraConnection={state:'connected',message:'双相机已连接；请查看两路采集 FPS，等待首帧后再校验。'};this.onChange();
    }catch(e){
      const hints={NotAllowedError:'相机权限被拒绝，请在浏览器地址栏的网站权限中允许相机',NotReadableError:'相机无法读取，可能被其他程序占用或 USB 连接异常',NotFoundError:'所选相机不存在，请重新检测设备',OverconstrainedError:'相机不支持请求的分辨率或帧率',AbortError:'相机启动已中断，请重新连接'};
      const detail=`${phase}连接失败：${hints[e.name]||e.message}${hints[e.name]?`；${e.name}: ${e.message}`:''}`;
      this.closeCameras();this.cameraConnection={state:'error',message:detail};this.onChange();throw Error(detail);
    }
  }
  async consumeCamera(i,video,stream,reader){
    const samples=[];let timestamp=null;
    try{
      while(video.srcObject===stream){
        const {value,done}=await reader.read();
        if(video.srcObject!==stream){value?.close();break;}
        if(done){this.cameraInfo[i].error='相机采集数据流已结束';break;}
        if(value.timestamp===timestamp){value.close();continue;}timestamp=value.timestamp;
        this.latestFrames[i]?.close();this.latestFrames[i]=value;
        const now=performance.now(),info=this.cameraInfo[i];info.received++;
        samples.push({now,count:info.received});while(samples.length>1&&now-samples[0].now>2000)samples.shift();
        const first=samples[0];Object.assign(info,{lastFrame:now,fps:now>first.now?(info.received-first.count)*1000/(now-first.now):null});
      }
    }catch(e){if(video.srcObject===stream)this.cameraInfo[i].error=e.message;}
    finally{try{reader.releaseLock();}catch{}}
  }
  closeCameras(){
    if(this.running)throw Error('请先停止执行');
    this.cameraConnection=null;
    this.videos.forEach((v,i)=>{if(this.callbacks[i]!=null)v.cancelVideoFrameCallback?.(this.callbacks[i]);v.pause();v.srcObject=null;v.closest?.('article')?.classList.remove('streaming');});
    this.frameReaders.forEach(reader=>{if(reader)void reader.cancel().catch(()=>{});});
    this.latestFrames.forEach(frame=>frame?.close());this.frameReaders=[null,null];this.latestFrames=[null,null];
    this.camera.close();this.cameraInfo=[null,null];this.callbacks=[null,null];this.validated=false;
  }
  cameraIssue(){
    for(let i=0;i<2;i++){
      const c=this.cameraInfo[i],role=this.model?.inputs?.cameras?.[i]?.feature??String(i+1),prefix=`第 ${i+1} 路相机 ${role.toUpperCase()}`;
      if(!c)return `${prefix} 尚未收到新图像`;
      if(c.error)return `${prefix} 采集失败：${c.error}`;
      if(!c.lastFrame)return `${prefix} 尚未收到新图像`;
      if(!this.videos[i].srcObject?.getVideoTracks().some(t=>t.readyState==='live'))return `${prefix} 已断开`;
      const age=performance.now()-c.lastFrame;
      if(age>=500)return `${prefix} 超过 500 ms 未收到新图像（已 ${age.toFixed(0)} ms），执行已停止`;
    }
    return null;
  }
  camerasReady(){return this.cameraIssue()===null;}
  readState(){
    if(this.readPending)return this.readPending;
    this.readPending=this._readState().catch(e=>{this.feedbackError=e.message;throw e;}).finally(()=>this.readPending=null);return this.readPending;
  }
  feedbackFresh(){return this.bus.connected&&!this.feedbackError&&this.observation&&performance.now()-this.observationTime<500;}
  async _readState(){
    if(!this.bus.connected)throw Error('请先在浏览器中连接从臂串口');
    this.bus.clearPackets();const requests=Array.from({length:7},(_,id)=>this.bus.waitForPacket(p=>parseMonitorPacket(p)?.id===id,150).catch(e=>{throw Error(`从臂 J${id+1} / ID ${id} 反馈失败：${e.message}`);}));
    // Register all waits before writing. Missing ID never falls back to cached angles.
    const replies=Promise.all(requests);
    replies.catch(()=>{});
    try{await this.bus.write(ServoProtocol.syncServoMonitor([0,1,2,3,4,5,6]));}
    catch(e){this.bus.rejectPending(e);await replies.catch(()=>{});throw e;}
    const result=(await replies).map(p=>parseMonitorPacket(p)?.angle);
    if(result.length!==7||!result.every(v=>Number.isFinite(v)&&Math.abs(v)<=3600))throw Error('从臂反馈不包含七个有效角度');
    this.observation=result;this.observationTime=performance.now();this.feedbackError=null;return result;
  }
  predict(observation){
    if(this.inferencePending)return Promise.reject(Error('上一轮模型预测尚未完成，请稍候重新校验'));
    this.inferencePending=this._predict(observation).finally(()=>this.inferencePending=null);
    return this.inferencePending;
  }
  async _predict(observation){
    if(!this.camerasReady())throw Error(this.cameraIssue());
    const frames=[];
    try{
      const timestamp=Math.round(performance.now()*1000);
      for(let i=0;i<this.videos.length;i++){
        if(this.cameraInfo[i]?.source==='track')frames.push(this.latestFrames[i].clone());
        else if(typeof VideoFrame==='function')frames.push(new VideoFrame(this.videos[i],{timestamp}));
        else frames.push(await createImageBitmap(this.videos[i]));
      }
      const state=observationCoordinates(observation,this.model.coordinate_contract==='degrees'?null:this.calibration);
      const result=await this.request('infer',{state,frames},frames,30000);
      const actions=Array.from({length:this.model.chunk_size},(_,i)=>actionCoordinates(Array.from(result.actions.slice(i*7,i*7+7)),this.model.coordinate_contract==='degrees'?null:this.calibration));
      this.metrics.policy=result.totalLatency??result.latency;this.metrics.gpu=result.latency;return actions;
    }catch(e){frames.forEach(f=>f.close());throw e;}
  }
  async validate(){
    this.validated=false;if(!this.model)throw Error('请导入网页执行模型');if(this.model.coordinate_contract!=='degrees'&&!this.calibration)throw Error('请导入同一台从臂的 LeRobot 校准 JSON');
    if(!this.camerasReady())throw Error('请连接双相机并等待实时画面');
    if(this.inferencePending)await this.inferencePending.catch(()=>{});
    const generation=this.generation,state=await this.readState();
    // Warm-up and validate actual model input/output without actuator commands.
    await this.predict(state);const actions=await this.predict(await this.readState());
    await this.readState();
    if(generation!==this.generation||!this.camerasReady())throw Error('设备状态已改变，请重新校验');
    if(this.metrics.policy>1500)throw Error(`浏览器预测耗时 ${this.metrics.policy.toFixed(0)} ms，无法可靠维持动作缓冲；请检查显卡硬件加速`);
    safeBrowserAction(actions[0],this.observation,null,this.model.joint_limits);this.validated=true;return this.metrics.policy;
  }
  async start(confirmed){
    if(this.running)return;if(!this.validated||!confirmed)throw Error('请先校验，并确认同一台从臂、相机视角及运动区域');
    if(document.hidden)throw Error('请保持执行页面可见');
    if(!this.camerasReady()||!this.bus.connected)throw Error('从臂或双相机连接已失效');
    const generation=++this.generation;this.running=true;this.validated=false;this.safe=null;this.raw=null;this.metrics={executed:0,missed:0,policy:0,control:0,remaining:0};this.onChange();
    try{
      // Same preparation as StaraiMotorsBus.connect(), after operator confirmation.
      for(let id=0;id<7;id++){if(generation!==this.generation)return;await this.bus.write(ServoProtocol.stopOnControlMode(id,0x10,900));}
      if(generation!==this.generation)return;
      await this.bus.write(ServoProtocol.resetMultiTurnAngle(0xFF));
      if(generation!==this.generation)return;
      const observation=await this.readState(),initial=await this.predict(observation);
      if(generation!==this.generation)return;
      const period=1000/30,epoch=performance.now(),schedule=new BrowserActionSchedule(this.model.temporal_ensemble_coeff??.01);
      schedule.add(0,initial,0);let firstWrite=null;let tick=0,lastPrediction=performance.now(),predictionError=null,previous=null,lastWrite=null;
      for(let id=0;id<7;id++){if(generation!==this.generation)return;await this.bus.write(ServoProtocol.lockTorque(id));}
      if(generation!==this.generation)return;
      const predictor=async()=>{
        while(this.running&&generation===this.generation){
          const predictionStarted=performance.now();
          const start=Math.max(tick,Math.floor((performance.now()-epoch)/period)),obs=this.observation.slice();
          try{const actions=await this.predict(obs);if(generation!==this.generation)return;schedule.add(start,actions,tick);lastPrediction=performance.now();}
          catch(e){predictionError=e;return;}await sleep(Math.max(0,period-(performance.now()-predictionStarted)));
        }
      };void predictor();
      const control=async()=>{
        while(this.running&&generation===this.generation){
          await sleep(Math.max(0,epoch+tick*period-performance.now()));
          if(generation!==this.generation)break;
          const readStart=performance.now(),observation=await this.readState();
          if(generation!==this.generation)break;
          const current=Math.max(tick,Math.floor((performance.now()-epoch)/period));this.metrics.missed+=current-tick;tick=current;
          if(document.hidden)throw Error('页面已进入后台，已停止执行');
          if(!this.camerasReady())throw Error(this.cameraIssue());
          if(predictionError)throw predictionError;
          if(performance.now()-lastPrediction>2500)throw Error('网页预测超过 2.5 秒未更新');
          const raw=schedule.action(tick);if(!raw)throw Error('动作缓冲耗尽，预测速度不足');
          const now=performance.now(),safe=safeBrowserAction(raw,observation,previous,this.model.joint_limits,lastWrite==null?1/30:Math.max(.001,(now-lastWrite)/1000));
          if(generation!==this.generation)break;
          await this.bus.write(packBrowserActCommand(safe));lastWrite=performance.now();previous=safe;
          this.raw=raw;this.safe=safe;this.metrics.executed++;firstWrite??=lastWrite;this.metrics.frequency=this.metrics.executed>1?(this.metrics.executed-1)*1000/(lastWrite-firstWrite):null;this.metrics.remaining=schedule.remaining(tick+1);this.metrics.control=performance.now()-readStart;
          this.onSample({timestamp_ms:this.observationTime,state_offset_ms:0,action_offset_ms:lastWrite-this.observationTime,observation_state:observation,action:safe});tick++;
        }
      };
      this.control=control();await this.control;
    }catch(e){await this.stop(e.message,{error:true});}
    finally{if(generation===this.generation)await this.stop();}
  }
  async stop(reason='已停止执行并请求卸力',{error=false}={}){
    if(this.running||error){
      this.lastStop={reason,error,time:new Date().toISOString(),metrics:{...this.metrics},cameras:this.cameraInfo.map(c=>c?{...c,ageMs:performance.now()-c.lastFrame}:null)};
    }
    this.running=false;this.validated=false;++this.generation;
    this.message=reason;this.onChange();
    let releaseError=null;
    if(this.bus.connected){
      const frames=Array.from({length:7},(_,id)=>ServoProtocol.releaseTorque(id));
      const batch=new Uint8Array(frames.reduce((n,f)=>n+f.length,0));let offset=0;for(const frame of frames){batch.set(frame,offset);offset+=frame.length;}
      try{await this.bus.write(batch);}catch(e){releaseError=e;}
    }
    if(this.control){const control=this.control;this.control=null;await control.catch(()=>{});}
    this.message=releaseError?`${reason}；卸力发送失败：${releaseError.message}，请检查设备供电和急停`:reason;this.onChange();return !releaseError;
  }
  diagnostics(){
    return {time:new Date().toISOString(),browser:navigator.userAgent,model:this.model?.name??null,running:this.running,serialConnected:this.bus.connected,cameraConnection:this.cameraConnection??null,
      metrics:{...this.metrics},cameras:this.cameraInfo.map((c,i)=>c?{...c,ageMs:performance.now()-c.lastFrame,settings:this.videos[i].srcObject?.getVideoTracks()[0]?.getSettings?.()}:null),lastStop:this.lastStop??null};
  }
  async release(){await this.stop();await this.bus.disconnect();this.closeCameras();}
}

export async function modelStore(operation,value){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('star-arm-browser-models',1);r.onupgradeneeded=()=>r.result.createObjectStore('models');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models',operation==='get'?'readonly':'readwrite'),store=tx.objectStore('models'),r=operation==='get'?store.get('current'):store.put(value,'current');let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('浏览器存储失败'));});}
  finally{db.close();}
}
