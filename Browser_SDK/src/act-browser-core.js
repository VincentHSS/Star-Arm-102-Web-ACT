// Pure browser execution contracts; matching the existing LeRobot release adapter.
import { Packet, ServoProtocol } from './fashionstar_serial.js';

export const MOTOR_NAMES = [...Array.from({length:6},(_,i)=>`Motor_${i}`),'gripper'];
const finiteSeven = values => {
  if (!Array.isArray(values) || values.length!==7 || !values.every(Number.isFinite)) throw Error('需要 J1–J7 七个有限数值');
  return values;
};
export function validateWebManifest(model) {
  if (model?.schema!=='star-arm-browser-act-v1' || model.model_file!=='model.onnx' || !/^[a-f0-9]{64}$/.test(model.model_sha256)) throw Error('请选择完整网页执行模型包；普通 PyTorch checkpoint 需要由提供方转换');
  if (!Number.isInteger(model.chunk_size) || model.chunk_size<2 || model.chunk_size>1000) throw Error('模型动作块长度无效');
  if (!['degrees','starai_0_0_4_calibrated'].includes(model.coordinate_contract)) throw Error('不支持模型的关节坐标格式');
  if (!Array.isArray(model.joint_limits) || model.joint_limits.length!==7 || !model.joint_limits.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&v[0]<v[1]&&v[0]>=-3600&&v[1]<=3600)) throw Error('模型缺少有效的七关节机械限位');
  const cameras=model.inputs?.cameras;
  if (!Array.isArray(cameras)||cameras.length!==2||!cameras.every((c,i)=>c.input===`image_${i}`&&/^[a-z][a-z0-9_]*$/i.test(c.feature)&&Array.isArray(c.shape)&&c.shape.length===4&&c.shape[0]===1&&c.shape[1]===3&&c.shape.slice(2).every(v=>Number.isInteger(v)&&v>=360&&v<=1920))) throw Error('模型必须定义两路 RGB 相机输入');
  if(cameras[0].shape.slice(2).join()!==cameras[1].shape.slice(2).join())throw Error('当前执行器要求双相机使用相同分辨率');
  if(!Array.isArray(model.tasks)||!model.tasks.length||!model.tasks.every(t=>typeof t==='string'&&t.length>0&&t.length<200))throw Error('模型任务信息无效');
  if(model.temporal_ensemble_coeff!=null&&(!Number.isFinite(model.temporal_ensemble_coeff)||model.temporal_ensemble_coeff<0||model.temporal_ensemble_coeff>1))throw Error('动作融合参数无效');
  return model;
}
export function validateWebCalibration(data) {
  for(let i=0;i<7;i++){
    const c=data?.[MOTOR_NAMES[i]];
    if(!c||c.id!==i||![0,1].includes(c.drive_mode)||!Number.isFinite(c.range_min)||!Number.isFinite(c.range_max)||c.range_min<0||c.range_min>=c.range_max||c.range_max>4096||(c.homing_offset??0)!==0)throw Error(`校准文件 ${MOTOR_NAMES[i]} / ID ${i} 不符合此模型的坐标格式`);
  }
  return data;
}
export function observationCoordinates(degrees,calibration) {
  finiteSeven(degrees);if(!calibration)return degrees.slice();validateWebCalibration(calibration);
  return degrees.map((degree,i)=>{
    const c=calibration[MOTOR_NAMES[i]];
    const raw=Math.trunc(Math.trunc(Math.min(180,Math.max(-180,degree))+180)/360*4096);
    const ratio=(Math.min(c.range_max,Math.max(c.range_min,raw))-c.range_min)/(c.range_max-c.range_min);
    let value=ratio*(i===6?100:200)-(i===6?0:100);
    if(c.drive_mode)value=i===6?100-value:-value;return value;
  });
}
export function actionCoordinates(values,calibration) {
  finiteSeven(values);if(!calibration)return values.slice();validateWebCalibration(calibration);
  return values.map((value,i)=>{
    const c=calibration[MOTOR_NAMES[i]];
    if(c.drive_mode)value=i===6?100-value:-value;
    const ratio=i===6?Math.min(100,Math.max(0,value))/100:(Math.min(100,Math.max(-100,value))+100)/200;
    const raw=Math.trunc(ratio*(c.range_max-c.range_min)+c.range_min);
    return Math.trunc((raw/4096*360-180)*10)/10;
  });
}
export function safeBrowserAction(raw,observation,previous,limits,elapsed=1/30) {
  finiteSeven(raw);finiteSeven(observation);if(previous)finiteSeven(previous);
  if(!Number.isFinite(elapsed)||elapsed<=0||!Array.isArray(limits)||limits.length!==7)throw Error('动作限制参数无效');
  return raw.map((value,i)=>{
    const [min,max]=limits[i],step=120*Math.min(1/30,elapsed),reference=previous?.[i]??observation[i];
    const low=Math.max(min,observation[i]-15,reference-step),high=Math.min(max,observation[i]+15,reference+step);
    if(low>high)throw Error(`J${i+1} 的实际位置与限位或跟随范围冲突，请检查原点、校准和物理位置`);
    return Math.max(low,Math.min(high,value));
  });
}
export function packBrowserActCommand(angles) {
  finiteSeven(angles);
  // Same FashionStar 1.3.6 multi-turn interval frame as native LeRobot: gripper differs.
  const params=[14,15,7];
  angles.forEach((angle,i)=>{
    const bytes=new Uint8Array(15),view=new DataView(bytes.buffer);
    const scaled=angle*10,lower=Math.floor(scaled),rounded=scaled-lower===.5?(lower%2===0?lower:lower+1):Math.round(scaled);
    view.setUint8(0,i);view.setInt32(1,rounded,true);
    view.setUint32(5,i===6?100:350,true);view.setUint16(9,50,true);view.setUint16(11,50,true);view.setUint16(13,i===6?1000:0,true);params.push(...bytes);
  });
  return Packet.pack(25,params);
}
export class BrowserActionSchedule {
  constructor(coefficient=.01){this.chunks=[];this.coefficient=coefficient;}
  add(start,actions,tick){if(!Number.isInteger(start)||!Array.isArray(actions)||!actions.length)throw Error('动作块无效');actions.forEach(finiteSeven);this.chunks=this.chunks.filter(c=>c.start+c.actions.length>tick);if(start+actions.length<=tick)return false;this.chunks.push({start,actions});return true;}
  action(tick){this.chunks=this.chunks.filter(c=>c.start+c.actions.length>tick);const candidates=this.chunks.filter(c=>c.start<=tick).map(c=>c.actions[tick-c.start]);if(!candidates.length)return null;const weights=candidates.map((_,i)=>Math.exp(-this.coefficient*i)),sum=weights.reduce((a,b)=>a+b,0);return Array.from({length:7},(_,j)=>candidates.reduce((s,a,i)=>s+a[j]*weights[i],0)/sum);}
  remaining(tick){return Math.max(0,...this.chunks.map(c=>c.start+c.actions.length-tick));}
}
export { ServoProtocol };
