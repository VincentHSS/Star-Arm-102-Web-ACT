"""Produce the one static website ZIP used for server deployment."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).resolve().parent.parent
WEB=ROOT/'Browser_SDK'


def main():
    dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    output=dist/'Star-Arm-102-SERVER-UPLOAD-ONLY.zip'
    files={}
    for path in sorted(WEB.rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts:continue
        if path.suffix in ('.py','.pyc','.bat','.sh','.whl'):raise ValueError(f'网站目录包含非静态文件：{path.name}')
        files['服务器网页/'+path.relative_to(WEB).as_posix()]=path.read_bytes()
    files['部署说明.md']=(ROOT/'docs/DEPLOYMENT.md').read_bytes()
    files['文件校验.sha256']=(''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in files.items())).encode('utf-8')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
        for name,data in files.items():archive.writestr('Star-Arm-102-SERVER-UPLOAD-ONLY/'+name,data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        for name,data in files.items():assert archive.read('Star-Arm-102-SERVER-UPLOAD-ONLY/'+name)==data
    print(json.dumps({'file':str(output),'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
