import { BrowserActRunner,modelStore } from './act-browser-runtime.js';
import { WaveformBuffer,WaveformChart } from './act-waveform.js';
const $=id=>document.getElementById(id),videos=[$('web-video-0'),$('web-video-1')];
let busy=false,saved=null,feedbackBusy=false;
const waveform=new WaveformBuffer({limit:600}),chart=new WaveformChart($('web-waveform'),waveform);
const runner=new BrowserActRunner({videos,onChange:()=>draw(),onSample:sample=>{waveform.append(sample);chart.setCursor(sample.timestamp_ms);}});
const label=feature=>({up:'固定俯视 / UP',front:'固定正面 / FRONT',wrist:'末端视角 / WRIST',world:'世界视角 / WORLD'}[feature]||feature);
function message(text,error=false){$('web-message').textContent=text;$('web-message').classList.toggle('error',error);}
function option(select,values){select.replaceChildren(...values.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));}
function draw(){
  const model=runner.model,connected=runner.bus.connected,cameras=runner.camerasReady(),running=runner.running;
  const locked=busy||running;
  if(runner.validated&&!locked&&(!connected||!cameras||!runner.feedbackFresh())){runner.validated=false;$('web-confirm').checked=false;}
  $('web-state').textContent=running?'正在执行':busy?'正在处理':runner.validated?'校验通过':model?'模型已加载':'等待模型';
  $('web-model-name').textContent=model?.name||'尚未选择模型';
  $('web-model-detail').textContent=model?`${model.chunk_size} 步动作块 · WebGPU · ${model.inputs.cameras[0].shape[3]}×${model.inputs.cameras[0].shape[2]}`:'网页执行模型包含 web-act.json 和 model.onnx';
  $('web-calibration-status').textContent=!model?'导入模型后检查关节坐标与校准要求':model.coordinate_contract==='degrees'?'此模型使用角度坐标，不需要 LeRobot 归一化校准':runner.calibration?'校准已载入；仍需确认属于当前物理从臂':'此模型需要同一台从臂的 LeRobot 校准 JSON';
  const rows=[['网页模型',model?'已加载':'等待导入'],['浏览器双相机',cameras?'已接入':'等待画面'],['真实从臂反馈',runner.feedbackFresh()?'已读取':connected?'等待有效反馈':'等待连接'],['坐标校准',model&&(model.coordinate_contract==='degrees'||runner.calibration)?'已就绪':'等待校准']];
  $('web-gates').replaceChildren(...rows.map(([name,value])=>{const row=document.createElement('div'),s=document.createElement('span'),b=document.createElement('b');s.textContent=name;b.textContent=value;if(value.startsWith('已'))b.className='ok';row.append(s,b);return row;}));
  $('web-model-import').disabled=locked;
  $('web-calibration-import').disabled=locked||!model||model.coordinate_contract==='degrees';
  $('web-detect-cameras').disabled=locked||videos.some(v=>v.srcObject);
  $('web-connect-cameras').disabled=locked||!model||!$('web-camera-0').value||!$('web-camera-1').value||$('web-camera-0').value===$('web-camera-1').value||videos.some(v=>v.srcObject);
  $('web-close-cameras').disabled=locked||!videos.some(v=>v.srcObject);
  $('web-connect-arm').disabled=locked||connected||!navigator.serial;
  $('web-close-arm').disabled=locked||!connected;
  $('web-validate').disabled=locked||!model||!cameras||!connected||(model.coordinate_contract!=='degrees'&&!runner.calibration);
  $('web-confirm').disabled=locked||!runner.validated;
  $('web-start').disabled=locked||!runner.validated||!$('web-confirm').checked;
  $('web-stop').disabled=!running;
  for(const id of ['web-camera-0','web-camera-1','web-task'])$(id).disabled=locked||videos.some(v=>v.srcObject)&&id!=='web-task';
  $('web-arm-status').textContent=connected?(runner.observation?'从臂已连接，J1–J7 实时反馈有效':'从臂已连接，等待七关节反馈'):'Chrome / Edge 会弹出串口选择窗口';
  const metrics=[['目标频率','30 Hz'],['实测循环',runner.metrics.frequency==null?'—':runner.metrics.frequency.toFixed(1)+' Hz'],['已执行动作',String(runner.metrics.executed)],['Policy 延迟',`${runner.metrics.policy.toFixed(1)} ms`],['读写耗时',`${runner.metrics.control.toFixed(1)} ms`],['动作缓冲',String(runner.metrics.remaining)],['错过节拍',String(runner.metrics.missed)]];
  $('web-performance').replaceChildren(...metrics.map(([name,value])=>{const d=document.createElement('div'),s=document.createElement('span'),b=document.createElement('b');s.textContent=name;b.textContent=value;d.append(s,b);return d;}));
  $('web-joints').replaceChildren(...Array.from({length:7},(_,i)=>{const d=document.createElement('div'),b=document.createElement('b'),s=document.createElement('span'),a=document.createElement('strong');b.textContent=`J${i+1}`;s.textContent=`OBS ${runner.observation?.[i]?.toFixed(1)??'—'}°`;a.textContent=`ACT ${runner.safe?.[i]?.toFixed(1)??'—'}°`;d.append(b,s,a);return d;}));
  for(let i=0;i<2;i++){
    videos[i].closest('article').classList.toggle('streaming',Boolean(videos[i].srcObject));
    const camera=runner.cameraInfo[i];$('web-video-status-'+i).textContent=camera?`${camera.width}×${camera.height} · ${camera.fps==null?'计算中':camera.fps.toFixed(1)+' FPS'}`:'未连接';
    if(model){const role=label(model.inputs.cameras[i].feature);$('web-camera-label-'+i).textContent=role;$('web-video-label-'+i).textContent=role;}
  }
  if(runner.message){message(runner.message);runner.message=null;}
}
async function action(fn){
  if(busy||runner.running)return;busy=true;draw();
  try{await fn();}catch(e){runner.validated=false;$('web-confirm').checked=false;message(e.message,true);}
  finally{busy=false;draw();}
}
$('web-model-import').onclick=()=>$('web-model-file').click();
$('web-model-file').onchange=()=>void action(async()=>{
  const file=$('web-model-file').files?.[0];if(!file)return;
  await runner.bus.disconnect();runner.closeCameras();$('web-confirm').checked=false;message('正在校验模型包并加载网页推理引擎，首次加载可能需要稍候…');
  saved=await runner.importModel(file);option($('web-task'),saved.manifest.tasks.map(t=>[t,t]));
  try{await modelStore('put',saved);message('网页模型已加载并保存到当前浏览器。接下来连接双相机和从臂。');}
  catch{message('网页模型已加载；浏览器存储不足，下次打开需要重新导入。');}
  $('web-model-file').value='';
});
$('web-calibration-import').onclick=()=>$('web-calibration-file').click();
$('web-calibration-file').onchange=()=>void action(async()=>{
  const file=$('web-calibration-file').files?.[0];if(!file)return;if(file.size>65536)throw Error('校准 JSON 过大');
  runner.setCalibration(JSON.parse(await file.text()));$('web-confirm').checked=false;
  if(saved){saved.calibration=runner.calibration;try{await modelStore('put',saved);}catch{}}
  message('校准已载入。请确认它属于当前连接的同一台从臂。');$('web-calibration-file').value='';
});
$('web-detect-cameras').onclick=()=>void action(async()=>{
  const devices=await runner.listCameras();if(devices.length<2)throw Error(`仅检测到 ${devices.length} 台相机，请检查 USB 和浏览器权限`);
  for(let i=0;i<2;i++){option($('web-camera-'+i),devices.map(d=>[d.deviceId,d.label]));$('web-camera-'+i).value=devices[i].deviceId;}
  message('请按模型的实际视角核对两路设备，再连接双相机。');
});
for(let i=0;i<2;i++)$('web-camera-'+i).onchange=()=>{runner.validated=false;$('web-confirm').checked=false;draw();};
$('web-task').onchange=()=>{runner.validated=false;$('web-confirm').checked=false;draw();};
$('web-connect-cameras').onclick=()=>void action(async()=>{await runner.connectCameras($('web-camera-0').value,$('web-camera-1').value);message('浏览器双相机已直接接入网页策略，无需切换到本机原生相机。');});
$('web-close-cameras').onclick=()=>void action(async()=>{runner.closeCameras();$('web-confirm').checked=false;message('双相机已关闭。');});
$('web-connect-arm').onclick=()=>void action(async()=>{
  $('web-confirm').checked=false;await runner.bus.connect();
  try{await runner.readState();}catch(e){await runner.bus.disconnect();throw e;}
  message('从臂已连接，七关节反馈已读取。校验不会带动机械臂。');
});
$('web-close-arm').onclick=()=>void action(async()=>{await runner.stop();await runner.bus.disconnect();$('web-confirm').checked=false;message('从臂串口已释放。');});
$('web-validate').onclick=()=>void action(async()=>{message('使用真实图像和反馈预热模型，正在校验；首次 WebGPU 编译可能需要数秒…');const ms=await runner.validate();message(`模型与设备校验通过，当前预测 ${ms.toFixed(1)} ms / 动作块。确认设备、视角和运动区域后可以执行。`);});
$('web-confirm').onchange=draw;
$('web-start').onclick=()=>void action(async()=>{const confirmed=$('web-confirm').checked;message('正在准备连续动作…');waveform.clear();await runner.start(confirmed);$('web-confirm').checked=false;});
$('web-stop').onclick=()=>{void runner.stop('用户停止执行并请求卸力');$('web-confirm').checked=false;draw();};
window.addEventListener('workbench:before-switch',e=>{e.detail.waits.push(runner.release());});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&runner.running)void runner.stop('页面进入后台，已停止执行并请求卸力');});
window.addEventListener('pagehide',()=>{void runner.release();});
window.addEventListener('resize',()=>chart.schedule());
setInterval(()=>{
  if(runner.running&&runner.metrics.executed)$('web-wave-state').textContent='J1–J7 真实反馈 / 已发送动作';
  draw();
  if(runner.bus.connected&&!runner.running&&!busy&&!feedbackBusy){feedbackBusy=true;runner.readState().catch(e=>{runner.validated=false;message(`从臂反馈异常：${e.message}`,true);}).finally(()=>feedbackBusy=false);}
},250);
void action(async()=>{
  if(!isSecureContext)throw Error('请通过 HTTPS 网站或 localhost 打开网页');
  if(!navigator.serial)throw Error('此浏览器不支持串口，请使用桌面 Chrome / Edge');
  const current=await modelStore('get');
  if(current){message('正在恢复当前浏览器保存的模型…');await runner.restoreModel(current);saved=current;option($('web-task'),runner.model.tasks.map(t=>[t,t]));message('已恢复网页模型。请连接本台从臂和双相机，再重新校验。');}
});
draw();chart.schedule();
