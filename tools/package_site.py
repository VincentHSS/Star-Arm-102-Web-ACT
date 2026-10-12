"""Produce the one static website ZIP used for server deployment."""
from pathlib import Path
import hashlib
import json
import re
from urllib.parse import quote
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
    for path in sorted((ROOT/'docs').rglob('*')):
        if path.is_file() and path.suffix in ('.md', '.png'):
            data = path.read_bytes()
            if path.name == 'FILE_MAP.md':
                # Source links remain useful without shipping backend code.
                data = re.sub(r'\]\(\.\./([^\)]+)\)', lambda match:
                    '](' + (match[1][5:] if match[1].startswith('docs/') else
                        'https://github.com/VincentHSS/Star-Arm-102-Web-ACT/blob/main/' + quote(match[1], safe='/')) + ')',
                    data.decode('utf-8')).encode('utf-8')
            files['使用教程/'+path.relative_to(ROOT/'docs').as_posix()]=data
    files['部署说明.md']=(
        '# Star Arm 102 数字孪生平台 · 交付包说明\n\n'
        '只将 `服务器网页` 文件夹里面的全部内容上传到网站目录，并启用 HTTPS。\n\n'
        '- [服务器上传与验收教程](使用教程/DEPLOYMENT.md)\n'
        '- [客户图文快速上手](使用教程/GETTING_STARTED.md)\n'
        '- [控制台图文教程](使用教程/CONSOLE_GUIDE.md)\n'
        '- [ACT 四步骤图文教程](使用教程/ACT_GUIDE.md)\n'
        '- [Ubuntu 首次使用与源码启动](使用教程/UBUNTU.md)\n'
        '- [Windows 源码启动](使用教程/WINDOWS.md)\n\n'
        '教程与截图可直接阅读，不必上传到网站。此交付包是静态服务器包，'
        '本地启动脚本在 GitHub 的 Code → Download ZIP 源码内。\n'
    ).encode('utf-8')
    files['文件校验.sha256']=(''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in files.items())).encode('utf-8')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
        for name,data in files.items():archive.writestr('Star-Arm-102-SERVER-UPLOAD-ONLY/'+name,data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        for name,data in files.items():assert archive.read('Star-Arm-102-SERVER-UPLOAD-ONLY/'+name)==data
    print(json.dumps({'file':str(output),'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
