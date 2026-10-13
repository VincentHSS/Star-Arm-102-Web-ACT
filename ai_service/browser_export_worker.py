"""Provider-side conversion. Customers only receive the resulting ZIP and website."""
from pathlib import Path
import argparse
import hashlib
import json
import tempfile
import zipfile


def export_model(root, output):
    import torch
    import numpy as np
    import onnxruntime as ort
    from safetensors.torch import load_file
    from lerobot.configs.policies import PreTrainedConfig
    from lerobot.policies.act.modeling_act import ACTPolicy
    from lerobot.processor import PolicyProcessorPipeline
    from lerobot.processor.converters import batch_to_transition,transition_to_batch,policy_action_to_transition,transition_to_policy_action

    root = Path(root).resolve()
    checkpoint = root / 'pretrained_model'
    metadata = json.loads((root / 'model.json').read_text(encoding='utf-8'))
    config = PreTrainedConfig.from_pretrained(checkpoint, local_files_only=True)
    if config.type != 'act' or not config.robot_state_feature or config.robot_state_feature.shape != (7,) and list(config.robot_state_feature.shape) != [7] or config.env_state_feature:
        raise ValueError('网页执行仅支持七关节、双相机 ACT 模型')
    features = list(config.image_features)
    if len(features) != 2:
        raise ValueError('网页执行模型需要两路相机')
    shapes = [list(config.image_features[key].shape) for key in features]
    if shapes[0] != shapes[1] or shapes[0][0] != 3:
        raise ValueError('双相机必须具有相同 RGB 图像规格')
    if metadata.get('coordinate_contract') not in ('degrees', 'starai_0_0_4_calibrated'):
        raise ValueError('不支持模型的坐标合同')
    if metadata.get('camera_contract',{}).get('fps') != 30:
        raise ValueError('当前网页控制器要求训练采样频率为 30 Hz')
    pipelines = []
    for filename, normalizer in [('policy_preprocessor.json','normalizer_processor'), ('policy_postprocessor.json','unnormalizer_processor')]:
        data = json.loads((checkpoint / filename).read_text(encoding='utf-8'))
        allowed = {'rename_observations_processor','to_batch_processor','device_processor',normalizer}
        if any(step['registry_name'] not in allowed or step.get('config',{}).get('rename_map') for step in data['steps']):
            raise ValueError('处理器包含当前网页转换器不支持的步骤，不能省略后直接执行')
        steps = [s for s in data['steps'] if s['registry_name'] == normalizer]
        if len(steps) != 1 or any(v != 'MEAN_STD' for v in steps[0]['config']['norm_map'].values()):
            raise ValueError('当前网页转换器要求 MEAN_STD 处理器')
        state_file = steps[0]['state_file']
        path = (checkpoint / state_file).resolve()
        if path.parent != checkpoint.resolve():
            raise ValueError('处理器状态文件路径无效')
        pipelines.append(load_file(str(path)))
    pre, post = pipelines
    config.device = 'cpu'
    config.pretrained_backbone_weights = None
    policy = ACTPolicy.from_pretrained(checkpoint, config=config, local_files_only=True).eval()
    preprocessor=PolicyProcessorPipeline.from_pretrained(checkpoint,config_filename='policy_preprocessor.json',local_files_only=True,
        overrides={'device_processor':{'device':'cpu'}},to_transition=batch_to_transition,to_output=transition_to_batch)
    postprocessor=PolicyProcessorPipeline.from_pretrained(checkpoint,config_filename='policy_postprocessor.json',local_files_only=True,
        to_transition=policy_action_to_transition,to_output=transition_to_policy_action)
    torch.set_num_threads(4)
    torch.backends.mha.set_fastpath_enabled(False)

    class BrowserExport(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.net = policy.model
            for i,key in enumerate(['observation.state',*features]):
                for stat in ('mean','std'):
                    self.register_buffer(f'p{i}_{stat}',pre[key+'.'+stat])
            self.register_buffer('action_mean',post['action.mean'])
            self.register_buffer('action_std',post['action.std'])

        def forward(self,state,image_0,image_1):
            state=(state-self.p0_mean)/(self.p0_std+1e-8)
            images=[(image_0-self.p1_mean)/(self.p1_std+1e-8),(image_1-self.p2_mean)/(self.p2_std+1e-8)]
            latent=torch.zeros((1,config.latent_dim),dtype=state.dtype,device=state.device)
            tokens=[self.net.encoder_latent_input_proj(latent).unsqueeze(0),self.net.encoder_robot_state_input_proj(state).unsqueeze(0)]
            positions=[self.net.encoder_1d_feature_pos_embed.weight.unsqueeze(1)]
            for image in images:
                feature=self.net.backbone(image)['feature_map']
                position=self.net.encoder_cam_feat_pos_embed(feature).to(dtype=feature.dtype)
                tokens.append(self.net.encoder_img_feat_input_proj(feature).flatten(2).permute(2,0,1))
                positions.append(position.flatten(2).permute(2,0,1))
            tokens=torch.cat(tokens,dim=0)
            positions=torch.cat(positions,dim=0)
            encoded=self.net.encoder(tokens,pos_embed=positions)
            decoded=self.net.decoder(torch.zeros((config.chunk_size,1,config.dim_model),dtype=positions.dtype,device=state.device),encoded,
                encoder_pos_embed=positions,decoder_pos_embed=self.net.decoder_pos_embed.weight.unsqueeze(1))
            return self.net.action_head(decoded.transpose(0,1))*self.action_std+self.action_mean

    wrapper = BrowserExport().eval()
    inputs = tuple(torch.zeros([1,*shape]) for shape in [[7],*shapes])
    output = Path(output).resolve()
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='star-arm-web-export-',dir=output.parent) as temporary:
        graph = Path(temporary)/'model.onnx'
        with torch.inference_mode():
            torch.onnx.export(wrapper,inputs,str(graph),input_names=['state','image_0','image_1'],output_names=['actions'],
                opset_version=17,dynamo=False,external_data=False)
        options=ort.SessionOptions();options.intra_op_num_threads=4
        session=ort.InferenceSession(str(graph),sess_options=options,providers=['CPUExecutionProvider'])
        errors=[]
        generator=torch.Generator().manual_seed(102)
        with torch.inference_mode():
            for _ in range(3):
                values=(torch.rand(1,7,generator=generator)*200-100,*(torch.rand([1,*shape],generator=generator) for shape in shapes))
                processed=preprocessor({'observation.state':values[0],**{key:values[i+1] for i,key in enumerate(features)}})
                original=postprocessor(policy.predict_action_chunk(processed).squeeze(0)).unsqueeze(0).numpy()
                actual=session.run(None,dict(zip(['state','image_0','image_1'],[v.numpy() for v in values])))[0]
                error=float(np.max(np.abs(actual-original)))
                if actual.shape!=(1,config.chunk_size,7) or not np.isfinite(actual).all() or error>=.01:
                    raise ValueError(f'转换后的动作未通过原模型一致性检查，误差 {error}')
                errors.append(error)
        manifest={'schema':'star-arm-browser-act-v1','name':metadata.get('id',root.name),'model_file':'model.onnx',
            'model_sha256':hashlib.sha256(graph.read_bytes()).hexdigest(),'source_weight_sha256':hashlib.sha256((checkpoint/'model.safetensors').read_bytes()).hexdigest(),
            'coordinate_contract':metadata['coordinate_contract'],'joint_limits':metadata['joint_limits'],'tasks':metadata['tasks'],
            'chunk_size':config.chunk_size,'n_action_steps':config.n_action_steps,'temporal_ensemble_coeff':config.temporal_ensemble_coeff,
            'inputs':{'state':{'input':'state','shape':[1,7]},'cameras':[{'input':f'image_{i}','feature':key.removeprefix('observation.images.'),'shape':[1,*shapes[i]]} for i,key in enumerate(features)]},
            'conversion_validation':{'samples':3,'max_abs_error':max(errors),'physical_hardware_tested':False}}
        with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            archive.write(graph,'model.onnx')
            archive.writestr('web-act.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        # Calibration belongs to the physical customer's robot and is never bundled here.
    return manifest


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model-dir',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args()
    result=export_model(args.model_dir,args.output)
    print(json.dumps({'status':'completed','model':result['name'],'max_abs_error':result['conversion_validation']['max_abs_error']},ensure_ascii=False))


if __name__=="__main__":main()
