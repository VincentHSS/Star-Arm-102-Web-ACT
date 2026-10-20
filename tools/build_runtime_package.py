from pathlib import Path
import gzip
import hashlib
import io
import json
import re
import shutil
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'Browser_SDK'
RUNTIME = ROOT / 'runtime'
PACKAGE_NAME = 'act-runtime-template.deb'


def tar_bytes(files):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.GNU_FORMAT) as archive:
        # dpkg needs explicit parent entries, even though tar extraction tools
        # often create missing directories implicitly.
        directories = set()
        for name, _, _ in files:
            parent = Path(name).parent
            while parent != Path('.'):
                directories.add(parent.as_posix())
                parent = parent.parent
        for name in sorted(directories):
            item = tarfile.TarInfo('./' + name + '/')
            item.type = tarfile.DIRTYPE
            item.mode = 0o755
            item.uid = item.gid = 0
            item.uname = item.gname = 'root'
            item.mtime = 1791753600
            archive.addfile(item)
        for name, content, mode in sorted(files):
            item = tarfile.TarInfo('./' + name)
            item.size = len(content)
            item.mode = mode
            item.uid = item.gid = 0
            item.uname = item.gname = 'root'
            item.mtime = 1791753600
            archive.addfile(item, io.BytesIO(content))
    return gzip.compress(buffer.getvalue(), mtime=0)


def ar_bytes(files):
    content = bytearray(b'!<arch>\n')
    for name, data in files:
        header = f'{name + "/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(data):<10}`\n'
        assert len(header) == 60
        content.extend(header.encode('ascii'))
        content.extend(data)
        if len(data) % 2:
            content.extend(b'\n')
    return bytes(content)


def build_deb(origin=None):
    from urllib.parse import urlsplit
    import importlib.util
    spec = importlib.util.spec_from_file_location('publisher_runtime', RUNTIME / 'ubuntu_runtime.py')
    runtime = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime)
    if origin:
        parsed = urlsplit(origin.strip())
        if parsed.username or parsed.password:
            raise ValueError('网站地址不能包含账号密码')
        origin = runtime.normalize_origin(f'{parsed.scheme}://{parsed.netloc}')
    else:
        origin = ''
    files = []
    for path in sorted((ROOT / 'ai_service').rglob('*')):
        if not path.is_file() or '__pycache__' in path.parts or path.suffix == '.pyc':
            continue
        relative = path.relative_to(ROOT).as_posix()
        content = path.read_bytes()
        if path.name == 'training_environment.py':
            text = content.decode('utf-8')
            text = text.replace('（缺少 venv/ensurepip：请先执行 sudo apt install -y ', '（运行组件安装不完整：请从网页重新下载安装 Ubuntu 运行组件，')
            text = text.replace('python3.10-venv python3.10-dev 再重试）', '然后在训练页面点击重试）')
            content = text.encode('utf-8')
        files.append((f'opt/star-arm-act/{relative}', content, 0o644))
    files.append(('opt/star-arm-act/ubuntu_runtime.py', (RUNTIME / 'ubuntu_runtime.py').read_bytes(), 0o644))
    files.append(('opt/star-arm-act/website.json', json.dumps({'origin': origin}, ensure_ascii=False).encode('utf-8'), 0o644))
    files.append(('opt/star-arm-act/start_desktop_sessions.py', (RUNTIME / 'start_desktop_sessions.py').read_bytes(), 0o644))
    files.append(('opt/star-arm-act/Browser_SDK/index.html', '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>ACT 已连接</title><body><h1>ACT 正在运行</h1><p>请回到你的网页继续操作，环境配置和模型运行都在网页里完成。</p></body></html>'.encode('utf-8'), 0o644))
    files.append(('usr/bin/star-arm-act-launch', b'#!/bin/sh\nexec /usr/bin/python3 /opt/star-arm-act/ubuntu_runtime.py "$@"\n', 0o755))
    desktop = '[Desktop Entry]\nType=Application\nName=Star Arm ACT\nName[zh_CN]=Star Arm ACT 运行组件\nComment=Connect the browser workbench to local ACT\nExec=/usr/bin/star-arm-act-launch %u\nIcon=star-arm-act\nTerminal=false\nCategories=Science;Robotics;\nStartupNotify=false\n'
    files.append(('usr/share/applications/star-arm-act.desktop', desktop.encode('utf-8'), 0o644))
    autostart = '[Desktop Entry]\nType=Application\nName=Star Arm ACT\nExec=/usr/bin/star-arm-act-launch --background\nIcon=star-arm-act\nTerminal=false\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n'
    files.append(('etc/xdg/autostart/star-arm-act.desktop', autostart.encode('utf-8'), 0o644))
    files.append(('usr/share/icons/hicolor/256x256/apps/star-arm-act.png', (WEB / 'assets/logo-icon.png').read_bytes(), 0o644))
    rules = '# Local active desktop user can open supported USB UART adapters.\nSUBSYSTEM=="tty", KERNEL=="ttyUSB[0-9]*", TAG+="uaccess"\nSUBSYSTEM=="tty", KERNEL=="ttyACM[0-9]*", TAG+="uaccess"\n'
    files.append(('lib/udev/rules.d/70-star-arm-act.rules', rules.encode('ascii'), 0o644))
    copyright_text = 'Star Arm ACT browser runtime.\nApplication source: https://github.com/servodevelop/Star-Arm-102\nBundled FashionStar SDK and pyserial retain their original licenses in /opt/star-arm-act/ai_service/vendor/.\nLeRobot and PyTorch are installed from their upstream packages; their upstream licenses apply.\n'
    files.append(('usr/share/doc/star-arm-act/copyright', copyright_text.encode('utf-8'), 0o644))
    md5sums = '\n'.join(f'{hashlib.md5(content).hexdigest()}  {name}' for name, content, _ in sorted(files)) + '\n'
    installed_size = (sum(len(content) for _, content, _ in files) + 1023) // 1024
    control = f'Package: star-arm-act\nVersion: 1.0.16\nArchitecture: all\nMaintainer: Star Arm Delivery <noreply@localhost>\nSection: science\nPriority: optional\nInstalled-Size: {installed_size}\nDepends: python3 (>= 3.10), python3 (<< 3.13), python3-venv, python3-dev, python3-tk, build-essential, v4l-utils, ffmpeg, libgl1, libglib2.0-0 | libglib2.0-0t64, desktop-file-utils, xdg-utils, udev, util-linux, systemd\nDescription: Local ACT execution for the Star Arm browser workbench\n Installs the Ubuntu user-session runtime, publisher website binding and automatic desktop startup.\n The browser configures the isolated LeRobot and PyTorch environment.\n'
    postinst = '#!/bin/sh\nset -e\nif [ "$1" = configure ]; then\n update-desktop-database -q /usr/share/applications || true\n udevadm control --reload-rules || true\n udevadm trigger --subsystem-match=tty --action=change || true\n /usr/bin/python3 /opt/star-arm-act/start_desktop_sessions.py || true\nfi\nexit 0\n'
    postrm = '#!/bin/sh\nset -e\nif [ "$1" = remove ] || [ "$1" = purge ]; then\n update-desktop-database -q /usr/share/applications || true\n udevadm control --reload-rules || true\nfi\nexit 0\n'
    control_tar = tar_bytes([('control', control.encode('utf-8'), 0o644), ('md5sums', md5sums.encode('ascii'), 0o644), ('postinst', postinst.encode('ascii'), 0o755), ('postrm', postrm.encode('ascii'), 0o755)])
    package = ar_bytes([('debian-binary', b'2.0\n'), ('control.tar.gz', control_tar), ('data.tar.gz', tar_bytes(files))])
    downloads = WEB / 'downloads'
    downloads.mkdir(exist_ok=True)
    (downloads / PACKAGE_NAME).write_bytes(package)
    installer_module = WEB / 'src/act-installer.js'
    text = installer_module.read_text(encoding='utf-8')
    text = re.sub(r"const TEMPLATE_SHA256 = '[^']*';", "const TEMPLATE_SHA256 = '" + hashlib.sha256(package).hexdigest() + "';", text)
    installer_module.write_text(text, encoding='utf-8', newline='\n')
    return {'publisher_origin': origin, 'installer_bytes': len(package), 'installer_sha256': hashlib.sha256(package).hexdigest(), 'runtime_files': len(files)}


if __name__ == '__main__':
    metadata = build_deb()
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
