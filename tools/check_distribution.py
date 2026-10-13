"""Check the static website and Debian template before publication."""
import hashlib
import argparse
import io
import json
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'Browser_SDK'


def read_ar(data):
    assert data.startswith(b'!<arch>\n')
    result = {}; offset = 8
    while offset < len(data):
        header = data[offset:offset + 60]; assert header[-2:] == b'`\n'
        size = int(header[48:58]); name = header[:16].decode().strip().rstrip('/')
        result[name] = data[offset + 60:offset + 60 + size]
        offset += 60 + size + size % 2
    assert offset == len(data)
    return result


def unpack(data):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        return {item.name.removeprefix('./'): (archive.extractfile(item).read(), item.mode)
                for item in archive if item.isfile()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--generated', type=Path)
    args = parser.parse_args()
    template = (WEB / 'downloads/act-runtime-template.deb').read_bytes()
    installer = (WEB / 'src/act-installer.js').read_text(encoding='utf-8')
    expected = re.search(r"const TEMPLATE_SHA256 = '([a-f0-9]{64})';", installer)[1]
    assert hashlib.sha256(template).hexdigest() == expected, '模板与前端校验值不一致'
    ar = read_ar(template); assert ar['debian-binary'] == b'2.0\n'
    control = unpack(ar['control.tar.gz']); payload = unpack(ar['data.tar.gz'])
    assert b'Version: 1.0.8\n' in control['control'][0]
    assert control['postinst'][1] == 0o755 and control['postrm'][1] == 0o755
    assert payload['usr/bin/star-arm-act-launch'][1] == 0o755
    assert json.loads(payload['opt/star-arm-act/website.json'][0]) == {'origin': ''}
    assert payload['opt/star-arm-act/ubuntu_runtime.py'][0] == (ROOT / 'runtime/ubuntu_runtime.py').read_bytes()
    assert payload['opt/star-arm-act/start_desktop_sessions.py'][0] == (ROOT / 'runtime/start_desktop_sessions.py').read_bytes()
    for path in (ROOT / 'ai_service').rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
            assert payload['opt/star-arm-act/' + path.relative_to(ROOT).as_posix()][0] == path.read_bytes(), path
    assert b'MimeType=x-scheme-handler' not in payload['usr/share/applications/star-arm-act.desktop'][0]
    assert b'--background' in payload['etc/xdg/autostart/star-arm-act.desktop'][0]
    shell = (ROOT / 'start_ubuntu.sh').read_bytes()
    assert shell.startswith(b'#!/bin/sh\n') and b'\r' not in shell
    batch = (ROOT / 'start_windows.bat').read_bytes()
    assert b'\r\n' in batch and b'\n' not in batch.replace(b'\r\n', b'')
    for path in WEB.rglob('*'):
        if not path.is_file(): continue
        assert path.suffix.lower() not in {'.py', '.pyc', '.sh', '.bat', '.whl', '.log'}
        assert path.stat().st_size < 95_000_000
        if path.suffix == '.js':
            text = path.read_text(encoding='utf-8')
            for relative in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+)['\"]", text):
                assert (path.parent / relative.split('?')[0]).resolve().is_file(), (path.name, relative)
    for name in ('index.html', 'act-workbench.html'):
        text = (WEB / name).read_text(encoding='utf-8')
        for value in re.findall(r'(?:src|href)=["\"]([^"\"]+)["\"]', text):
            if value.startswith(('http:', 'https:', '#', 'data:')): continue
            assert (WEB / value.split('?')[0]).is_file(), value
    if args.generated:
        generated = read_ar(args.generated.read_bytes())
        generated_payload = unpack(generated['data.tar.gz'])
        assert set(generated_payload) == set(payload)
        for name, (content, mode) in payload.items():
            actual_content, actual_mode = generated_payload[name]
            assert mode == actual_mode, name
            if name == 'opt/star-arm-act/website.json':
                assert json.loads(actual_content) == {'origin': 'https://control.example.com'}
            else:
                assert content == actual_content, name
        generated_control = unpack(generated['control.tar.gz'])
        assert b'Version: 1.0.8+site.' in generated_control['control'][0]
        assert 'md5sums' not in generated_control
        print('浏览器生成包的网站绑定、文件内容与权限校验通过')
    print(f'网站与 Ubuntu 模板校验通过：{len(payload)} 个安装文件')


if __name__ == '__main__': main()
