"""Build the Ubuntu LumosTouch kit from tracked source, without customer data."""
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    name = "Star-Arm-102-LUMOS-UBUNTU-TEST"
    output = ROOT / "dist" / f"{name}.zip"
    output.parent.mkdir(exist_ok=True)
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode("utf-8").split("\0")
    files = {path: (ROOT / path).read_bytes() for path in tracked if path and (ROOT / path).is_file()}
    for required in ("start_ubuntu_lumos.sh", "tools/start_lumos_local.py",
                     "ai_service/lumos_runtime.py", "docs/LUMOS_TELEOP.md"):
        assert required in files, f"Missing tracked source: {required}"
    assert b"\r" not in files["start_ubuntu_lumos.sh"]
    files["本地遥操作说明.txt"] = (
        f"Star Arm 102 · Touch R1 → LumosTouch Ubuntu 测试包（源码 {version}）\n\n"
        "1. 完整解压到 Ubuntu 文件夹，在此文件夹打开终端，运行 sh start_ubuntu_lumos.sh。\n"
        "2. 首次启动准备独立 Python 环境与固定版本 Lumos SDK；缺少系统依赖时会请求 sudo 授权。无需 Conda 或 Docker。\n"
        "3. 使用 Chrome/Edge 打开启动器给出的本机网址。Leader 选 Touch R1，实体从臂选 LumosTouch V3。\n"
        "4. 先连接 Touch R1 串口，再查看 CAN 接口并连接 LumosTouch。连接 CAN 会使能电机；不会自动开始跟随。\n"
        "5. 按页面记录两臂参考姿态、采集主臂六轴范围，并分别记录夹爪闭合与张开位置；核对关节及夹爪目标预览后开始遥操作。\n"
        "6. 停止、断开或输入超时会关闭 CAN 控制连接。再次运行需要重连并校准。\n\n"
        "此实体 LumosTouch 路径仅用于 Ubuntu + 1 Mbps SocketCAN；Windows 包仍用于模型预览和原串口/WebGPU执行。\n"
        "必须使用与这台 LumosTouch 及其夹爪配套且已核对的 SDK/CAN 配置。Touch R1 的 ID 6 为夹爪输入，缺失时不能执行。\n"
        "启动器不修改 CAN 配置、不重启已有 ACT 后台、不自动连接设备，不包含或删除客户模型/数据。\n"
        "只完成软件、模拟串口和模拟 CAN 测试，未进行实机验证。详细步骤见 docs/LUMOS_TELEOP.md。\n"
    ).encode("utf-8-sig")
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for relative, data in files.items():
            item = zipfile.ZipInfo(f"{name}/{relative}")
            item.create_system = 3
            item.external_attr = (0o100755 if relative.endswith(".sh") else 0o100644) << 16
            item.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(item, data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert archive.read(f"{name}/ai_service/lumos_runtime.py") == (ROOT / "ai_service/lumos_runtime.py").read_bytes()
    print(output)


if __name__ == "__main__":
    main()
