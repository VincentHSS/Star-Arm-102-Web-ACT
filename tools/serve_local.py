"""Serve the repository's website and local API with one startup command."""
import argparse
import os
from pathlib import Path
import sys
import threading
import webbrowser

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))


def main():
    if not (3,10)<=sys.version_info[:2]<(3,13):
        print('请使用 Python 3.10～3.12。',flush=True)
        return 1
    parser=argparse.ArgumentParser(description='启动 Star Arm 控制台与 ACT 本地工作台')
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--state-dir',type=Path)
    args=parser.parse_args()
    from runtime.ubuntu_runtime import serve,state_directory,PORT
    directory=(args.state_dir or state_directory()).resolve()
    url=f'http://127.0.0.1:{PORT}/'
    print(f'打开网页：{url}',flush=True)
    print(f'本机状态与数据目录：{directory}',flush=True)
    if os.name=='nt':
        print('Windows：控制台、网页预览、数据集与模型管理可用；完整 ACT 训练和实机执行请使用 Ubuntu。',flush=True)
    else:
        print('Ubuntu：进入第 2 步自动准备隔离 ACT 环境；设备、模型和校准在网页中设置。',flush=True)
    if not args.no_browser:
        timer=threading.Timer(1,lambda:webbrowser.open(url));timer.daemon=True;timer.start()
    try:
        serve(directory,PORT,ROOT/'Browser_SDK')
        return 0
    except OSError as error:
        print(f'启动失败：{error}。若 18765 已由 ACT 组件占用，请使用已启动的服务，或结束旧服务后再启动。',flush=True)
        return 1


if __name__=='__main__':raise SystemExit(main())
