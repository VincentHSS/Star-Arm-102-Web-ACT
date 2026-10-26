import * as ort from '../assets/vendor/onnxruntime-web/ort.webgpu.min.js';
import { unzipSync } from '../assets/vendor/fflate/browser.js';
import { validateWebManifest } from './act-browser-core.js?v=server-1.0.35';
let session=null,model=null,busy=false,imageInputs=[];
function releaseImages(){for(const input of imageInputs)input.tensor.dispose();imageInputs=[];}
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths={mjs:new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.js',import.meta.url).href,wasm:new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm',import.meta.url).href};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function initialize(bytes,manifest){
  validateWebManifest(manifest);
  if(await sha(bytes)!==manifest.model_sha256)throw Error('模型权重 SHA-256 校验失败');
  if(!await navigator.gpu?.requestAdapter())throw Error('浏览器 WebGPU 不可用，请启用 Chrome / Edge 硬件加速并检查显卡驱动');
  if(session)await session.release();session=null;model=null;releaseImages();
  const next=await ort.InferenceSession.create(bytes,{executionProviders:['webgpu']});
  if(next.inputNames.join()!==['state','image_0','image_1'].join()||next.outputNames.join()!=='actions'){await next.release();throw Error('模型输入输出接口不匹配');}
  session=next;model=manifest;
}
async function loadZip(buffer){
  const bytes=new Uint8Array(buffer);
  const manifests=unzipSync(bytes,{filter:f=>{
    if(/(^|\/)web-act\.json$/.test(f.name)){if(f.originalSize>65536)throw Error('模型清单过大');return true;}return false;
  }});
  const names=Object.keys(manifests);if(names.length!==1)throw Error('请选择包含一个 web-act.json 的完整网页执行模型包；普通 checkpoint 需要由提供方转换');
  const name=names[0];if(name.startsWith('/')||name.split('/').includes('..'))throw Error('模型文件路径无效');
  const manifest=validateWebManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifests[name])));
  const path=name.slice(0,-'web-act.json'.length)+manifest.model_file;
  const weights=unzipSync(bytes,{filter:f=>{if(f.name!==path)return false;if(f.originalSize>400_000_000)throw Error('模型超过网页执行大小限制');return true;}})[path];
  if(!weights?.length)throw Error('模型包缺少 model.onnx');
  await initialize(weights,manifest);return {manifest,weights};
}
async function infer(state,frames){
  const started=performance.now(),feeds={};let output;
  try{
    if(!session)throw Error('网页模型未加载');
    feeds.state=new ort.Tensor('float32',Float32Array.from(state),[1,7]);
    for(let i=0;i<2;i++){
      const bitmap=frames[i],shape=model.inputs.cameras[i].shape,[,,,width]=shape,height=shape[2];
      if((bitmap.displayWidth??bitmap.width)!==width||(bitmap.displayHeight??bitmap.height)!==height)throw Error('真实相机分辨率与模型不一致');
      if(!imageInputs[i]){
        const canvas=new OffscreenCanvas(width,height),rgb=new Float32Array(width*height*3);
        imageInputs[i]={ctx:canvas.getContext('2d',{willReadFrequently:true}),rgb,tensor:new ort.Tensor('float32',rgb,shape)};
      }
      const {ctx,rgb,tensor}=imageInputs[i];ctx.drawImage(bitmap,0,0);
      bitmap.close();frames[i]=null; // Return camera buffers before waiting for GPU inference.
      const rgba=ctx.getImageData(0,0,width,height).data,pixels=width*height;
      for(let j=0;j<pixels;j++){rgb[j]=rgba[j*4]/255;rgb[pixels+j]=rgba[j*4+1]/255;rgb[2*pixels+j]=rgba[j*4+2]/255;}
      feeds[`image_${i}`]=tensor;
    }
    const start=performance.now(),result=await session.run(feeds);output=result.actions;
    if(output.dims.join()!==[1,model.chunk_size,7].join()||!output.data.every(Number.isFinite))throw Error('模型返回了无效动作');
    return {actions:Float32Array.from(output.data),latency:performance.now()-start,totalLatency:performance.now()-started};
  }finally{frames.forEach(f=>f?.close());feeds.state?.dispose();output?.dispose();}
}
self.onmessage=async({data})=>{
  const {id,operation}=data;
  if(busy){self.postMessage({id,error:'当前模型操作尚未完成'});data.frames?.forEach(f=>f.close());return;}
  busy=true;
  try{
    let result;
    if(operation==='zip'){result=await loadZip(data.buffer);self.postMessage({id,result},[result.weights.buffer]);}
    else if(operation==='load'){await initialize(new Uint8Array(data.buffer),data.manifest);self.postMessage({id,result:{manifest:model}});}
    else if(operation==='infer'){result=await infer(data.state,data.frames);self.postMessage({id,result},[result.actions.buffer]);}
    else throw Error('未知模型操作');
  }catch(e){self.postMessage({id,error:e.message});}
  finally{busy=false;}
};
