"""Prepare the isolated Ubuntu Lumos SDK, then serve the console on loopback."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
import webbrowser
import zipfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
PORT = 18766
SDK_COMMIT = "040412542c0b6b6fd2bb6dd652c0de6c666631be"
SDK_ARCHIVE_SHA256 = "c0017617cb0b02220edee4c8996bac1feb51540c596357c91dbb91000703b0a2"
SDK_URL = f"https://codeload.github.com/lumos-open/startouch_sdk/zip/{SDK_COMMIT}"
DEPENDENCIES = (
    "python3-venv", "python3-dev", "build-essential", "cmake", "pkg-config",
    "libeigen3-dev", "libyaml-cpp-dev", "liborocos-kdl-dev", "libtinyxml2-dev",
    "pybind11-dev", "libgl1", "iproute2", "ca-certificates",
)
IMPORT_CHECK = "import serial; from startouchclass import SingleArm; print('Lumos SDK 导入正常；未连接设备。')"


def environment_directory():
    base = Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache")))
    return (base / "star-arm-102" / "lumos" /
            f"python-{sys.version_info.major}.{sys.version_info.minor}-{SDK_COMMIT[:8]}").resolve()


def default_data_directory():
    base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share")))
    return (base / "star-arm-102" / "lumos" / "data").resolve()


def identity(environment_root, data_root):
    digest = hashlib.sha256()
    paths = sorted(set(
        list((ROOT / "ai_service").rglob("*.py"))
        + list((ROOT / "Browser_SDK/src").rglob("*.js"))
        + list((ROOT / "Browser_SDK").glob("*.html"))
        + [Path(__file__).resolve(), ROOT / "package.json"]
    ))
    for path in paths:
        digest.update(path.relative_to(ROOT).as_posix().encode())
        digest.update(path.read_bytes())
    return {
        "service": "star-arm-lumos-local",
        "version": json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"],
        "source_root": str(ROOT),
        "source_fingerprint": digest.hexdigest(),
        "environment_root": str(environment_root),
        "data_root": str(data_root),
        "sdk_commit": SDK_COMMIT,
        "static_workbench": True,
    }


def existing_identity():
    # Do not send loopback requests through a system HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{PORT}/api/lumos/launcher", timeout=2) as response:
            value = json.load(response)
            if not isinstance(value, dict) or value.get("service") != "star-arm-lumos-local":
                raise RuntimeError(f"{PORT} 端口已被其他服务占用。请先确认对应服务的任务状态。")
            return value
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{PORT} 端口已有服务，但不是本版本 Lumos 本地启动器。") from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            return None
        raise RuntimeError(f"无法检查 {PORT} 端口：{error.reason}。未启动第二个服务。") from error
    except (TimeoutError, socket.timeout, json.JSONDecodeError) as error:
        raise RuntimeError(f"{PORT} 端口的现有服务未返回有效身份信息。未启动第二个服务。") from error


def reuse_existing(expected, no_browser):
    current = existing_identity()
    if current is None:
        return False
    if current != expected:
        raise RuntimeError(
            f"{PORT} 已运行不同版本、源码或数据目录的 Lumos 服务 "
            f"（版本 {current.get('version', '未知')}，目录 {current.get('source_root', '未知')}）。"
            "请先在原网页停止遥操作并断开设备，再在原启动终端按 Ctrl+C 正常退出后重试。"
        )
    print(f"Lumos 本地服务已经运行，复用 http://127.0.0.1:{PORT}/index.html", flush=True)
    if not no_browser:
        webbrowser.open(f"http://127.0.0.1:{PORT}/index.html")
    return True


def clean_environment():
    env = os.environ.copy()
    for name in ("PYTHONHOME", "PYTHONPATH", "LD_LIBRARY_PATH", "LD_PRELOAD"):
        env.pop(name, None)
    env["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    env["PYTHONNOUSERSITE"] = "1"
    return env


@contextmanager
def preparation_lock(directory):
    import fcntl
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".prepare.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("另一个 Lumos 启动器正在准备环境，请等其完成后重试。") from error
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def ensure_system_dependencies():
    from tools.ubuntu_setup import installed, install
    missing = [name for name in DEPENDENCIES if not installed(name)]
    if not any(installed(name) for name in ("libglib2.0-0", "libglib2.0-0t64")):
        missing.append("libglib2.0-0")
    if missing and install(missing):
        raise RuntimeError("Lumos 系统依赖安装未完成。处理上方提示后重新运行，已有文件会保留。")
    remaining = [name for name in DEPENDENCIES if not installed(name)]
    if remaining:
        raise RuntimeError("系统依赖仍不完整：" + "、".join(remaining))


def download_sdk(directory):
    sdk = directory / "startouch_sdk"
    marker = sdk / ".star-arm-sdk-commit"
    if sdk.exists():
        if not marker.is_file() or marker.read_text().strip() != SDK_COMMIT:
            raise RuntimeError(f"SDK 目录不是预期版本，已保留原文件：{sdk}")
        if not (sdk / "src/config/robot_kinematics.yaml").is_file():
            raise RuntimeError(f"SDK 配置文件缺失，请恢复原完整 SDK 目录：{sdk}")
        return sdk
    data = None
    for attempt in range(1, 4):
        print(f"下载固定版本 Lumos SDK（第 {attempt}/3 次）：{SDK_COMMIT[:8]}", flush=True)
        try:
            with urllib.request.urlopen(SDK_URL, timeout=45) as response:
                data = response.read(32 * 1024 * 1024 + 1)
            if hashlib.sha256(data).hexdigest() != SDK_ARCHIVE_SHA256:
                raise RuntimeError("SDK 下载校验不匹配，未安装。")
            break
        except (OSError, urllib.error.URLError) as error:
            if attempt == 3:
                raise RuntimeError(f"SDK 下载失败，请检查 GitHub 网络连接：{error}") from error
    with tempfile.TemporaryDirectory(prefix=".sdk-download-", dir=directory) as temporary:
        staging = Path(temporary)
        archive_path = staging / "sdk.zip"
        archive_path.write_bytes(data)
        prefix = f"startouch_sdk-{SDK_COMMIT}/"
        with zipfile.ZipFile(archive_path) as archive:
            for entry in archive.infolist():
                if not entry.filename.startswith(prefix):
                    raise RuntimeError("SDK 压缩包目录结构无效。")
                target = (staging / entry.filename).resolve()
                if not target.is_relative_to(staging.resolve()) or stat.S_ISLNK(entry.external_attr >> 16):
                    raise RuntimeError("SDK 压缩包包含无效路径。")
            archive.extractall(staging)
        unpacked = staging / prefix.rstrip("/")
        if not (unpacked / "src/config/robot_kinematics.yaml").is_file():
            raise RuntimeError("SDK 压缩包缺少 robot_kinematics.yaml。")
        (unpacked / ".star-arm-sdk-commit").write_text(SDK_COMMIT + "\n")
        unpacked.rename(sdk)
    return sdk


def run_pip(python, args, env):
    command = [str(python), "-I", "-m", "pip", "--disable-pip-version-check",
               "install", "--retries", "3", "--timeout", "30", *args]
    for attempt in range(1, 4):
        print(f"安装 Python 依赖（第 {attempt}/3 次），请保留此窗口…", flush=True)
        result = subprocess.run(command, env=env, check=False, timeout=1800)
        if result.returncode == 0:
            return
    raise RuntimeError("Python 依赖安装连续 3 次失败。修复上方网络或构建错误后重新启动即可。")


def prepare_environment(directory):
    with preparation_lock(directory):
        ensure_system_dependencies()
        sdk = download_sdk(directory)
        venv = directory / "venv"
        python = venv / "bin/python"
        env = clean_environment()
        if not python.is_file():
            subprocess.run(["/usr/bin/python3", "-I", "-m", "venv", str(venv)],
                           env=env, check=True, timeout=120)
        ready = directory / ".ready.json"
        expected = {"sdk_commit": SDK_COMMIT, "python": platform.python_version()}
        try:
            prepared = json.loads(ready.read_text()) == expected
        except (OSError, ValueError):
            prepared = False
        if prepared:
            prepared = subprocess.run([str(python), "-I", "-c", IMPORT_CHECK],
                                      env=env, check=False, timeout=45).returncode == 0
        if not prepared:
            run_pip(python, ["--upgrade", "pip", "setuptools", "wheel"], env)
            run_pip(python, [str(ROOT / "ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl")], env)
            run_pip(python, ["-r", str(sdk / "requirements.txt")], env)
            run_pip(python, [str(sdk)], env)
            subprocess.run([str(python), "-I", "-c", IMPORT_CHECK], env=env, check=True, timeout=45)
            ready.write_text(json.dumps(expected) + "\n")
        return python, sdk


def print_can_status(interface):
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,15}", interface):
        raise ValueError("CAN 接口名称无效。")
    executable = shutil.which("ip", path=clean_environment()["PATH"])
    if not executable:
        print("未找到 iproute2，暂时无法读取 CAN 状态。", flush=True)
        return
    result = subprocess.run([executable, "-details", "-json", "link", "show", interface],
                            capture_output=True, text=True, check=False, timeout=5)
    try:
        record = json.loads(result.stdout)[0] if result.returncode == 0 else {}
    except (ValueError, IndexError):
        record = {}
    details = record.get("linkinfo", {})
    bitrate = details.get("info_data", {}).get("bittiming", {}).get("bitrate")
    if details.get("info_kind") == "can" and "UP" in record.get("flags", []) and bitrate == 1000000:
        print(f"CAN 只读检查：{interface} 已启用，1 Mbps。连接设备由网页按钮发起。", flush=True)
    else:
        print(f"CAN 只读检查：{interface} 尚未达到已启用、1 Mbps 的条件。"
              "请由现场人员检查接口名称、驱动和 CAN 配置，再在网页连接。", flush=True)
        if record:
            print(f"当前 flags={record.get('flags', [])}，bitrate={bitrate}", flush=True)
        elif result.stderr.strip():
            print(result.stderr.strip(), flush=True)


def run_service(args, directory, data_root, *, server_factory=None):
    sdk = directory / "startouch_sdk"
    os.environ["STAR_ARM_LUMOS_SDK_ROOT"] = str(sdk)
    if server_factory is None:
        from ai_service.app import create_server
        server_factory = create_server
    server = server_factory(("127.0.0.1", PORT), data_root, ROOT / "Browser_SDK",
                            data_dir_explicit=True)
    server.lumos_launcher_identity = identity(directory, data_root)
    print(f"打开控制台：http://127.0.0.1:{PORT}/index.html", flush=True)
    print(f"Lumos 数据目录：{data_root}", flush=True)
    print("服务已启动；在网页选择对应 Leader 与 LumosTouch 后连接。按 Ctrl+C 正常退出。", flush=True)
    timer = None
    if not args.no_browser:
        timer = threading.Timer(0.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}/index.html"))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if timer:
            timer.cancel()
        server.server_close()
    return 0


def validate_platform():
    if sys.platform != "linux" or not (3, 10) <= sys.version_info[:2] < (3, 13):
        raise RuntimeError("请在 Ubuntu 22.04 / 24.04 上使用系统 Python 3.10～3.12 启动。")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    if release.get("ID", "").strip('"') != "ubuntu" or release.get("VERSION_ID", "").strip('"') not in ("22.04", "24.04"):
        raise RuntimeError("当前 Lumos 自动准备入口支持 Ubuntu 22.04 / 24.04。")
    if platform.machine().lower() not in ("x86_64", "amd64"):
        raise RuntimeError("该固定版本 Lumos SDK 提供 x86-64 本机库，请使用 x86-64 Ubuntu。")
    if os.geteuid() == 0:
        raise RuntimeError("请以普通桌面用户启动，依赖安装时会单独请求系统授权；不要 sudo 整个启动器。")


def main(argv=None):
    parser = argparse.ArgumentParser(description="准备独立 Lumos 环境并启动 Star Arm 102 控制台")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--state-dir", type=Path)
    parser.add_argument("--can-interface", default="can0", help="仅用于启动时只读检查，不修改接口")
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        validate_platform()
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,15}", args.can_interface):
            raise ValueError("CAN 接口名称无效。")
        directory = environment_directory()
        data_root = (args.state_dir or default_data_directory()).expanduser().resolve()
        if reuse_existing(identity(directory, data_root), args.no_browser):
            return 0
        if args.serve:
            if Path(sys.prefix).resolve() != (directory / "venv").resolve():
                raise RuntimeError("请通过 start_ubuntu_lumos.sh 启动，以使用已准备的独立环境。")
            print_can_status(args.can_interface)
            return run_service(args, directory, data_root)
        python, sdk = prepare_environment(directory)
        env = clean_environment()
        env["STAR_ARM_LUMOS_SDK_ROOT"] = str(sdk)
        env["VIRTUAL_ENV"] = str(directory / "venv")
        env["PATH"] = str(python.parent) + os.pathsep + env["PATH"]
        forwarded = list(sys.argv[1:] if argv is None else argv)
        os.execve(str(python), [str(python), str(Path(__file__).resolve()), "--serve", *forwarded], env)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Lumos 启动失败：{error}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
