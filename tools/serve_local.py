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
    parser.add_argument('--require-local-version',action='store_true',help='本地测试时拒绝旧版本或仅提供 API 的后台')
    parser.add_argument('--act-workbench',action='store_true',help='直接打开本地 ACT 工作台')
    args=parser.parse_args()
    from runtime.ubuntu_runtime import serve,state_directory,PORT,runtime_health_info,state_directory_id,VERSION
    directory=(args.state_dir or state_directory()).resolve()
    url=f'http://127.0.0.1:{PORT}/' + ('act-workbench.html' if args.act_workbench else '')
    existing=runtime_health_info()
    if existing:
        if args.require_local_version and (existing.get('version') != VERSION or existing.get('static_workbench') is not True):
            print(f'本地测试需要 {VERSION} 的完整本地后台；当前 18765 端口运行的是 {existing.get("version")}。',flush=True)
            print('没有启动第二个后台，也没有结束旧服务。先确认原网页没有采集、转换、训练或执行任务。',flush=True)
            print('若旧服务有启动终端，请正常退出该终端中的服务；安装组件后台可在 Ubuntu 系统监视器中查找 ubuntu_runtime.py --serve，确认空闲后正常结束，再运行本启动器。',flush=True)
            return 1
        existing_id=existing.get('state_directory_id')
        if (args.state_dir or args.require_local_version) and existing_id != state_directory_id(directory):
            print('已有 ACT 服务正在运行，不能同时改用另一个数据目录。请先正常关闭旧服务，再重新启动。',flush=True)
            return 1
        print(f'ACT 服务已经运行（版本 {existing.get("version")}），复用现有连接。',flush=True)
        if existing.get('version') != VERSION:
            print('运行中的是旧版本。请先结束当前采集、训练或执行，再正常关闭旧服务并重启。',flush=True)
        if existing.get('static_workbench') is False:
            print('已有安装组件在后台运行，请回到原服务器网站操作。',flush=True)
        elif not args.no_browser:
            webbrowser.open(url)
        return 0
    print(f'打开网页：{url}',flush=True)
    print(f'本机状态与数据目录：{directory}',flush=True)
    if os.name=='nt':
        print('Windows：可进入网页执行导入已转换的模型，无需安装 ACT 环境；采集和原生 LeRobot 执行使用本机工作台。训练使用 Ubuntu。',flush=True)
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
