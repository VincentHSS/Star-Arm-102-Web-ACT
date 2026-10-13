"""Bounded Ubuntu dependency/package installation; never remove package locks."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

DEPENDENCIES = ('python3-venv', 'python3-dev', 'python3-tk', 'build-essential',
                'v4l-utils', 'ffmpeg', 'libgl1', 'desktop-file-utils', 'xdg-utils',
                'udev', 'util-linux', 'systemd')


def installed(package, runner=subprocess.run):
    result = runner(['/usr/bin/dpkg-query', '-W', '-f=${Status}', package],
                    capture_output=True, text=True, check=False)
    return result.returncode == 0 and result.stdout.strip() == 'install ok installed'


def missing_dependencies(runner=subprocess.run):
    missing = [name for name in DEPENDENCIES if not installed(name, runner)]
    if not any(installed(name, runner) for name in ('libglib2.0-0', 'libglib2.0-0t64')):
        # Ubuntu 24.04's replacement can also satisfy the old package name.
        missing.append('libglib2.0-0')
    return missing


def install_command(packages, which=shutil.which, uid=None):
    uid = os.geteuid() if uid is None else uid
    command = ['/usr/bin/env', 'DEBIAN_FRONTEND=noninteractive', '/usr/bin/apt-get',
               '-o', 'DPkg::Lock::Timeout=300', '-o', 'Acquire::Retries=3',
               '-o', 'Acquire::http::Timeout=30', '-o', 'Acquire::https::Timeout=30',
               '--no-remove', 'install', '-y', *packages]
    if uid == 0:
        return command
    if (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY')) and which('pkexec'):
        return [which('pkexec'), *command]
    if which('sudo'):
        return [which('sudo'), *command]
    raise RuntimeError('需要系统安装授权，但未找到 Ubuntu 的 pkexec 或 sudo。请使用系统软件安装器。')


def install_hint(output, code):
    text = output.lower()
    if code in (126, 127) or 'not authorized' in text or 'authentication failure' in text:
        return '系统安装授权未完成。请重新启动，并在 Ubuntu 授权窗口中允许安装。'
    if 'lock' in text or '锁' in text:
        return '系统软件管理器仍占用安装锁。请等系统更新完成后重试；无需删除锁文件。'
    if 'dpkg was interrupted' in text:
        return '之前的系统安装被中断，请先在 Ubuntu 软件管理器完成或修复上次安装，再重试。'
    if any(value in text for value in ('failed to fetch', 'temporary failure resolving', 'unable to locate package', 'no installation candidate')):
        return '系统软件源暂时不可用。请检查网络，在 Ubuntu 软件管理器刷新软件源后重试。'
    return '系统安装未完成，具体原因已显示。处理后重新启动即可，已有数据和模型会保留。'


def install(packages, runner=None):
    print('正在准备系统依赖；Ubuntu 可能会询问安装授权。', flush=True)
    print('系统更新占用 dpkg 安装锁时，自动等待最多 5 分钟；网络下载失败自动重试。', flush=True)
    # APT owns its locks throughout the transaction. Do not fuser/kill/unlink,
    # or hold a second lock around apt-get, which could deadlock installation.
    command = install_command(packages)
    if runner:
        result = runner(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, encoding='utf-8', errors='replace', check=False)
        output, code = result.stdout or '', result.returncode
        print(output, flush=True)
    else:
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True, encoding='utf-8', errors='replace', bufsize=1) as process:
            lines = []
            for line in process.stdout:
                print(line, end='', flush=True)
                lines.append(line)
                # Keep a bounded diagnostic tail even during a long download.
                if len(lines) > 100:
                    del lines[:50]
            code = process.wait()
            output = ''.join(lines)
    if code:
        print(install_hint(output, code), file=sys.stderr, flush=True)
        return 1
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', type=Path, help='安装网页下载的 Star Arm Ubuntu 组件')
    args = parser.parse_args(argv)
    if sys.platform != 'linux' or not (3, 10) <= sys.version_info[:2] < (3, 13):
        print('需要 Ubuntu 22.04 / 24.04 与 Python 3.10～3.12。', file=sys.stderr)
        return 1
    release = dict(line.split('=', 1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    if release.get('ID', '').strip('"') != 'ubuntu' or release.get('VERSION_ID', '').strip('"') not in ('22.04', '24.04'):
        print('当前自动安装入口支持 Ubuntu 22.04 / 24.04。', file=sys.stderr)
        return 1
    try:
        if args.package:
            package = args.package.expanduser().resolve(strict=True)
            result = subprocess.run(['/usr/bin/dpkg-deb', '-f', str(package), 'Package'],
                                    capture_output=True, text=True, check=False)
            if not package.is_file() or result.returncode or result.stdout.strip() != 'star-arm-act':
                raise ValueError('请选择网页下载的完整 Star Arm Ubuntu .deb 安装文件。')
            packages = [str(package)]
        else:
            packages = missing_dependencies()
        if packages and install(packages):
            return 1
        if not args.package and missing_dependencies():
            raise RuntimeError('系统依赖仍不完整，请查看上面的安装结果，再重新启动。')
        print('Ubuntu 系统依赖检查完成。', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'系统准备失败：{error}', file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
