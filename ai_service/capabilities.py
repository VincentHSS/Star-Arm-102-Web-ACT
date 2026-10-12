import glob
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path


def _nvidia_gpu():
    command = shutil.which("nvidia-smi")
    if not command:
        return {"available": False, "name": None, "memory_mb": None, "reason": "未检测到 nvidia-smi"}
    try:
        result = subprocess.run(
            [command, "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3, check=True,
        )
        first = result.stdout.strip().splitlines()[0]
        name, memory = [part.strip() for part in first.split(",", 1)]
        return {"available": True, "name": name, "memory_mb": int(float(memory)), "reason": None}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError) as error:
        return {"available": False, "name": None, "memory_mb": None,
                "reason": f"NVIDIA 驱动不可用：{type(error).__name__}"}


def detect_capabilities(training_environment=None):
    gpu = _nvidia_gpu()
    if training_environment is not None:
        environment = training_environment.snapshot()
        training_ready = environment.get("status") == "ready"
        blockers = [] if training_ready else [environment.get("error") or "训练环境尚未准备"]
        camera_paths = sorted(glob.glob("/dev/video*"))
        camera_devices = []
        for path in camera_paths:
            node = Path(path).name
            name_path = Path("/sys/class/video4linux") / node / "name"
            name = name_path.read_text(encoding="utf-8").strip() if name_path.exists() else node
            camera_devices.append({"path": path, "stable_id": str(Path(path).resolve()), "name": name})
        backend = environment.get("backend")
        return {
            "python": {"version": sys.version.split()[0], "training_path": environment.get("python")},
            "gpu": gpu,
            "torch": {"installed": training_ready, "cuda_ready": training_ready and backend in {"cuda", "rocm"},
                      "backend": backend},
            "act_runtime": {"compute_ready": training_ready, "execution_available": training_ready,
                            "lerobot_version": environment.get("lerobot_version")},
            "training_environment": environment,
            "training_profile": environment.get("training_profile", {}),
            "training_ready": training_ready,
            "training_blocker": blockers[0] if blockers else None,
            "training_blockers": blockers,
            "cameras": camera_paths,
            "camera_devices": camera_devices,
            "serial_ports": sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")),
        }
    torch_installed = importlib.util.find_spec("torch") is not None
    cuda_ready = False
    if torch_installed:
        try:
            import torch
            cuda_ready = bool(torch.cuda.is_available())
        except Exception:
            cuda_ready = False
    blockers = []
    if not gpu["available"]:
        blockers.append(gpu["reason"] or "未检测到 NVIDIA GPU")
    elif not torch_installed:
        blockers.append("当前 Python 环境未安装 PyTorch")
    elif not cuda_ready:
        blockers.append("PyTorch 已安装，但无法使用本机 CUDA")
    compute_ready = not blockers
    act_execution_available = False
    if not act_execution_available:
        blockers.append("ACT 训练执行链尚未接入")
    training_ready = not blockers
    camera_paths = sorted(glob.glob("/dev/video*"))
    camera_devices = []
    for path in camera_paths:
        node = Path(path).name
        name_path = Path("/sys/class/video4linux") / node / "name"
        name = name_path.read_text(encoding="utf-8").strip() if name_path.exists() else node
        camera_devices.append({"path": path, "stable_id": str(Path(path).resolve()), "name": name})
    return {
        "python": {"version": sys.version.split()[0]},
        "gpu": gpu,
        "torch": {"installed": torch_installed, "cuda_ready": cuda_ready},
        "act_runtime": {"compute_ready": compute_ready,
                        "execution_available": act_execution_available},
        "training_ready": training_ready,
        "training_blocker": blockers[0] if blockers else None,
        "training_blockers": blockers,
        "cameras": camera_paths,
        "camera_devices": camera_devices,
        "serial_ports": sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")),
    }
