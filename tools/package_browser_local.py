"""Build a standalone Windows static-page test kit, without the ACT backend."""
from pathlib import Path
import zipfile
import json

ROOT = Path(__file__).resolve().parent.parent

def main():
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    output = ROOT / f'dist/Star-Arm-102-WINDOWS-LOCAL-TEST-v{version}.zip'
    output.parent.mkdir(exist_ok=True)
    prefix = f'Star-Arm-102-WINDOWS-LOCAL-TEST-v{version}/'
    files = {p.relative_to(ROOT).as_posix(): p.read_bytes()
             for p in (ROOT / 'Browser_SDK').rglob('*') if p.is_file() and 'downloads' not in p.relative_to(ROOT / 'Browser_SDK').parts}
    for name in ('start_windows_browser.bat', 'tools/start_browser_local.ps1'):
        files[name] = (ROOT / name).read_bytes()
    files['先看这里.txt'] = (
        'Star Arm 102 · Windows 本地网页测试\n\n'
        '更新包时，先在旧网页停止执行并关闭旧启动窗口，再解压到新文件夹启动。\n'
        '1. 将整个 ZIP 解压到普通文件夹，不要在压缩包预览中启动。\n'
        '2. 双击 start_windows_browser.bat，保持启动窗口打开；网页会在 Edge 或 Chrome 中打开。\n'
        '3. 导入原来的网页执行模型 ZIP、同一台从臂的校准 JSON，再连接双相机和从臂。\n'
        '4. 先查看两路实际 FPS，再校验并按原流程执行。停止原因显示在顶部；异常时点击“下载运行诊断”。\n'
        '5. 先在网页停止执行，再关闭启动窗口。\n\n'
        '本包不需要安装 Python、PyTorch、LeRobot、Node.js 或 Ubuntu 组件。\n'
        '使用 Windows 自带的 PowerShell/.NET，只在 127.0.0.1 提供静态网页；不提供训练或设备控制后台。\n'
        '浏览器负责相机、Web Serial 和 WebGPU。需要支持 WebGPU 的 Chrome/Edge 及可用的显卡硬件加速。\n'
        '本地地址与服务器网站的模型存储及设备权限独立，首次需要重新导入并授权。\n'
        '优先使用端口 18766，被占用时尝试其他端口；不结束原 ACT 服务。无需管理员启动。\n'
        '模型、校准、相机和设备不会自动连接或执行。此包用于本地测试；服务器上传包仍为 SERVER-UPLOAD-ONLY.zip。\n'
    ).encode('utf-8-sig')
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for name, data in files.items(): archive.writestr(prefix + name, data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert not any('ai_service/' in name or name.endswith('.deb') for name in archive.namelist())
    print(output)

if __name__ == '__main__': main()
