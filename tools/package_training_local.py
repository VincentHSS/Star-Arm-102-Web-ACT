"""Package tracked source for a complete Ubuntu training test."""
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent

def main():
    version = json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    name = f'Star-Arm-102-UBUNTU-LOCAL-TEST-v{version}'
    output = ROOT/'dist'/f'{name}.zip'
    output.parent.mkdir(exist_ok=True)
    tracked = subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode('utf-8').split('\0')
    files = {path:(ROOT/path).read_bytes() for path in tracked if path and (ROOT/path).is_file()}
    assert 'start_ubuntu_training_test.sh' in files
    assert b'\r' not in files['start_ubuntu_training_test.sh']
    files['本地训练测试说明.txt'] = (
        f'Star Arm 102 · Ubuntu 本地训练测试 v{version}\n\n'
        '1. 完整解压 ZIP，在解压后的文件夹内打开终端。\n'
        '2. 运行：sh start_ubuntu_training_test.sh\n'
        '3. 浏览器打开本机 ACT 工作台，进入第 2 步。确认右上角服务版本为 '+version+'。\n'
        '4. 选择原数据集，检查参数并点击开始训练。先显示“正在准备数据”，完成后自动启动训练器。\n'
        '5. 测试结束先在网页停止任务，再在启动终端按 Ctrl+C 正常退出。\n\n'
        '不需要上传服务器，也不需要先安装 .deb。适用 Ubuntu 22.04/24.04，使用 /usr/bin/python3，终端的 Conda (base) 不影响此启动器。\n'
        '启动脚本只补齐缺失系统依赖，首次缺少依赖时可能需要系统授权。训练环境仍由网页准备，不使用 Docker。\n'
        '默认复用当前用户原 ACT 状态目录 ~/.local/share/star-arm-act；若此前设置 XDG_DATA_HOME，则沿用该设置。已配置的数据目录与独立训练环境按原设置读取。\n'
        '不会自动开始训练、选择设备、复制客户数据或删除模型。使用同一 Ubuntu 账号运行，不要 sudo 运行启动器。\n\n'
        '如提示 18765 上有旧版本或已安装组件，启动器会停止，不会把测试悄悄交给旧后台。\n'
        '先确认旧网页没有采集、转换、训练或执行任务；只有结束现有任务后，才正常关闭旧服务，再重试。\n'
        '源码服务可在原启动终端 Ctrl+C。安装组件可在 Ubuntu 系统监视器查找命令含 ubuntu_runtime.py --serve 的进程，确认空闲后正常结束。不要结束其他 Python 进程。\n'
        '若本地列表没有原数据，请先检查网页的数据存储目录设置，不要重新采集或删除原数据。\n'
        '这是本地测试源码包；服务器交付仍使用 SERVER-UPLOAD-ONLY.zip。\n'
    ).encode('utf-8-sig')
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=7) as archive:
        for relative,data in files.items():
            item=zipfile.ZipInfo(f'{name}/{relative}')
            item.create_system=3
            item.external_attr=(0o100755 if relative.endswith('.sh') else 0o100644)<<16
            item.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(item,data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert archive.read(f'{name}/ai_service/training_jobs.py') == (ROOT/'ai_service/training_jobs.py').read_bytes()
    print(output)

if __name__ == '__main__': main()
