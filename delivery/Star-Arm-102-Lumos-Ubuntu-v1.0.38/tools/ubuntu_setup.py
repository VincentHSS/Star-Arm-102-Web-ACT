import os
import shutil
import subprocess
import sys


def installed(package, runner=subprocess.run):
    architecture = runner(['/usr/bin/dpkg', '--print-architecture'],
                          capture_output=True, text=True, check=False)
    if architecture.returncode or not architecture.stdout.strip():
        raise RuntimeError('无法确定系统软件包架构，请检查 dpkg 是否正常。')
    native = architecture.stdout.strip()
    result = runner(['/usr/bin/dpkg-query', '-W', '-f=${Status}\t${Architecture}\n', package],
                    capture_output=True, text=True, check=False)
    # Multiarch packages produce one record per architecture. A foreign-only
    # installation cannot satisfy the native runtime's dependencies.
    return result.returncode == 0 and any(
        line.split('\t') in (['install ok installed', native],
                             ['install ok installed', 'all'])
        for line in result.stdout.splitlines())


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
