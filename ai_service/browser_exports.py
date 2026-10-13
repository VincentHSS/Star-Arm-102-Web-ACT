"""Async provider-side export; no robot or camera I/O."""
import json
import os
import re
import subprocess
import threading
import uuid
from pathlib import Path
from copy import deepcopy
from .domain import DomainError


class BrowserExportManager:
    def __init__(self, data_root, models, environment, runner=None):
        self.root=Path(data_root).resolve()/'training'/'browser-exports'
        self.root.mkdir(parents=True,exist_ok=True)
        self.models=models;self.environment=environment;self.runner=runner or subprocess.run
        self.lock=threading.RLock();self.jobs={}

    def _update(self,job_id,**values):
        with self.lock:
            self.jobs[job_id].update(values)

    def active(self):
        with self.lock:return any(j['status']=='running' for j in self.jobs.values())

    def start(self,model_id):
        with self.lock:
            if self.active():raise DomainError('已有网页模型正在导出，请等待完成','browser_export_busy')
            model=next((m for m in self.models.list_models() if m['id']==model_id),None)
            if not model:raise DomainError('模型不存在','model_not_found')
            source=(self.models.models_root/model_id).resolve()
            if source.parent!=self.models.models_root.resolve():raise DomainError('模型路径无效','invalid_model_path')
            environment=self.environment.snapshot()
            if environment.get('status')!='ready' or not Path(environment.get('python') or '').is_file():
                raise DomainError('提供方需先在第 2 步准备训练环境，再导出网页模型；Windows 客户无需安装此环境','browser_export_environment')
            job_id=str(uuid.uuid4());directory=self.root/job_id;directory.mkdir()
            self.jobs[job_id]={'id':job_id,'model_id':model_id,'status':'running','stage':'准备转换依赖','error':None}
            thread=threading.Thread(target=self._export,args=(job_id,source,environment['python']),daemon=True)
            thread.start();return deepcopy(self.jobs[job_id])

    def _run(self,command,timeout):
        result=self.runner(command,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout,
            **({'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}))
        if result.returncode:raise RuntimeError((result.stderr or result.stdout or '转换进程失败')[-1500:])

    def _export(self,job_id,source,python):
        try:
            self._run([python,'-m','pip','install','onnx>=1.17,<2','onnxruntime>=1.20,<2'],1200)
            self._update(job_id,stage='转换并比对原 ACT 动作输出')
            output=self.root/job_id/'browser-model.zip'
            self._run([python,'-X','utf8',str(Path(__file__).with_name('browser_export_worker.py')),
                '--model-dir',str(source),'--output',str(output)],600)
            if not output.is_file():raise RuntimeError('导出未生成模型包')
            self._update(job_id,status='completed',stage='模型转换和一致性检查完成')
        except Exception as error:self._update(job_id,status='failed',stage='导出失败',error=str(error))

    def snapshot(self,job_id):
        if not re.fullmatch(r'[a-f0-9-]{36}',job_id):raise DomainError('导出任务不存在','browser_export_not_found')
        with self.lock:
            if job_id not in self.jobs:raise DomainError('导出任务不存在；服务重启后请重新导出','browser_export_not_found')
            return deepcopy(self.jobs[job_id])

    def download(self,job_id):
        if self.snapshot(job_id)['status']!='completed':raise DomainError('网页模型尚未导出完成','browser_export_not_ready')
        return (self.root/job_id/'browser-model.zip').read_bytes()
