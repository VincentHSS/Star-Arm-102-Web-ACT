"""Import self-contained ACT packages without requiring a local training dataset."""
import io
import hashlib
import tarfile
from types import SimpleNamespace
import json
import math
import os
import re
import shutil
import stat
import time
import uuid
import zipfile
from pathlib import PurePosixPath

from .domain import DomainError


class ModelArchive:
    def __init__(self, data):
        self.zip = zipfile.is_zipfile(io.BytesIO(data))
        self.archive = zipfile.ZipFile(io.BytesIO(data)) if self.zip else tarfile.open(fileobj=io.BytesIO(data), mode="r:*")
    def __enter__(self):
        return self
    def __exit__(self, *args):
        self.archive.close()
    def infolist(self):
        if self.zip:
            return self.archive.infolist()
        result = []
        total = 0
        for item in self.archive:
            if not (item.isfile() or item.isdir()):
                raise DomainError("模型包包含链接或特殊文件", "invalid_model_archive")
            total += item.size
            if total > 4_000_000_000 or len(result) >= 10000:
                raise DomainError("模型包解压后内容过大", "payload_too_large")
            result.append(SimpleNamespace(orig_filename=item.name, file_size=item.size, external_attr=0,
                                          is_dir=lambda member=item: member.isdir(), member=item))
        return result
    def open(self, info):
        return self.archive.open(info) if self.zip else self.archive.extractfile(info.member)
    def read(self, info):
        with self.open(info) as f:
            return f.read()


def release_metadata(z, files):
    from .release_adapter import RELEASE_WEIGHT_SHA256, COORDINATES
    candidates = [n for n in files if n.endswith("pretrained_model/model.safetensors")]
    if len(candidates) != 1:
        raise DomainError("请选择完整 ACT checkpoint，需包含配置、权重和处理器", "invalid_model_archive")
    prefix = candidates[0][:-len("pretrained_model/model.safetensors")]
    digest = hashlib.sha256()
    with z.open(files[candidates[0]]) as f:
        while block := f.read(1024 * 1024):
            digest.update(block)
    if digest.hexdigest() != RELEASE_WEIGHT_SHA256:
        raise DomainError("此原始 checkpoint 不是已适配的 act-pick-v1.0.0 发布模型；请提供训练相机、采样频率和关节坐标配置", "invalid_model_archive")
    from .training_jobs import STAR_ARM_102_FL_JOINT_LIMITS
    return prefix, {
        "id": "stararm102-pick-act-v1.0.0", "dataset_id": "stararm102_pick_20260930_run",
        "tasks": ["将方块放入中心"], "step": 100000,
        "camera_contract": {"width": 640, "height": 480, "fps": 30},
        "camera_feature_map": {"wrist": "up", "world": "front"},
        "camera_instructions": "此模型需固定俯视 up 和固定正面 front。连接页第一路 UP 选择俯视相机，第二路 FRONT 选择正面相机；不要使用随臂运动的腕部相机。",
        "observation_features": ["observation.state", "observation.images.up", "observation.images.front"],
        "coordinate_contract": COORDINATES, "joint_limits": STAR_ARM_102_FL_JOINT_LIMITS,
        "release_url": "https://github.com/servodevelop/Star-Arm-102/releases/tag/act-pick-v1.0.0",
        "weight_sha256": RELEASE_WEIGHT_SHA256,
    }


def import_model_package(manager, archive):
    if not archive:
        raise DomainError("模型包为空", "invalid_model_archive")
    temporary = None
    try:
        with ModelArchive(archive) as z:
            files = {}
            total = 0
            for info in z.infolist():
                name = info.orig_filename
                parts = PurePosixPath(name).parts
                if ("\\" in name or ":" in name or "\x00" in name or name.startswith("/") or ".." in parts
                        or stat.S_ISLNK(info.external_attr >> 16)):
                    raise DomainError("模型包包含不安全的文件路径", "invalid_model_archive")
                if info.is_dir():
                    continue
                normalized = PurePosixPath(name).as_posix()
                if normalized in files:
                    raise DomainError("模型包包含重复文件", "invalid_model_archive")
                files[normalized] = info
                total += info.file_size
            if total > 4_000_000_000 or len(files) > 10000:
                raise DomainError("模型包解压后内容过大", "payload_too_large")
            metadata_entries = [n for n in files if PurePosixPath(n).name == "model.json"]
            if not metadata_entries:
                prefix, source = release_metadata(z, files)
            elif len(metadata_entries) == 1:
                entry = metadata_entries[0]
                prefix = entry[:-len("model.json")]
                if files[entry].file_size > 1_000_000:
                    raise DomainError("模型元数据过大", "invalid_model_archive")
                source = json.loads(z.read(files[entry]).decode("utf-8-sig"))
                if not isinstance(source, dict):
                    raise DomainError("模型元数据无效", "invalid_model_archive")
            else:
                raise DomainError("模型包包含多个 model.json，无法确定要导入的模型", "invalid_model_archive")
            required = ("config.json", "model.safetensors", "policy_preprocessor.json", "policy_postprocessor.json")
            policy_config = {}
            missing = [n for n in required if prefix + "pretrained_model/" + n not in files]
            if missing:
                raise DomainError("模型包缺少实机推理文件：" + "、".join(missing), "training_checkpoint_incomplete")
            for name in required:
                info = files[prefix + "pretrained_model/" + name]
                if not info.file_size:
                    raise DomainError("模型文件为空：" + name, "training_checkpoint_incomplete")
                if name.endswith(".json"):
                    if info.file_size > 1_000_000:
                        raise DomainError("模型配置文件过大", "invalid_model_archive")
                    config = json.loads(z.read(info).decode("utf-8-sig"))
                    if not isinstance(config, dict):
                        raise DomainError("模型配置格式无效：" + name, "invalid_model_archive")
                    if name == "config.json" and config.get("type", "act") != "act":
                        raise DomainError("当前机械臂执行接口只支持 ACT 模型", "invalid_model_archive")
                    if name == "config.json":
                        policy_config = config
                    # Saved processors may refer to additional normalization tensors.
                    for step in config.get("steps", []):
                        state_file = step.get("state_file") if isinstance(step, dict) else None
                        if state_file and prefix + "pretrained_model/" + state_file not in files:
                            raise DomainError("模型包缺少处理器参数文件：" + state_file, "training_checkpoint_incomplete")
            tasks = source.get("tasks")
            if not isinstance(tasks, list) or not tasks or not all(isinstance(t, str) and t.strip() for t in tasks):
                raise DomainError("模型包缺少有效的支持任务列表", "invalid_model_archive")
            contract = source.get("camera_contract")
            if not isinstance(contract, dict):
                raise DomainError("模型包缺少双相机训练配置", "invalid_model_archive")
            fps = float(contract.get("fps", 0))
            if not math.isfinite(fps) or not 1 <= fps <= 100 or int(contract.get("width", 0)) <= 0 or int(contract.get("height", 0)) <= 0:
                raise DomainError("模型相机尺寸或采样频率无效", "invalid_model_archive")
            outputs = policy_config.get("output_features", {})
            if outputs and outputs.get("action", {}).get("shape") != [7]:
                raise DomainError("ACT 模型必须输出七个关节角度", "invalid_model_archive")
            inputs = policy_config.get("input_features", {})
            camera_map = source.get("camera_feature_map") or {"wrist": "wrist", "world": "world"}
            if camera_map not in ({"wrist": "wrist", "world": "world"}, {"wrist": "up", "world": "front"}):
                raise DomainError("不支持此模型的相机映射", "invalid_model_archive")
            expected = {"observation.state": [7],
                        "observation.images." + camera_map["wrist"]: [3, int(contract["height"]), int(contract["width"])],
                        "observation.images." + camera_map["world"]: [3, int(contract["height"]), int(contract["width"])]}
            if inputs and any(inputs.get(key, {}).get("shape") != shape for key, shape in expected.items()):
                raise DomainError("ACT 权重配置与七关节、双相机尺寸不一致", "invalid_model_archive")
            limits = source.get("joint_limits")
            if not isinstance(limits, list) or len(limits) != 7:
                raise DomainError("模型包缺少 J1-J7 七关节安全限位", "invalid_model_archive")
            from .training_jobs import STAR_ARM_102_FL_JOINT_LIMITS
            for index, limit in enumerate(limits):
                if not isinstance(limit, list) or len(limit) != 2:
                    raise DomainError("模型关节限位格式无效", "invalid_model_archive")
                low, high = map(float, limit)
                if not math.isfinite(low) or not math.isfinite(high) or low >= high:
                    raise DomainError("模型关节限位无效", "invalid_model_archive")
                arm_low, arm_high = STAR_ARM_102_FL_JOINT_LIMITS[index]
                if low < arm_low or high > arm_high:
                    raise DomainError(f"模型 J{index + 1} 限位超出 Star Arm 102 支持范围", "invalid_model_archive")
            if source.get("observation_features") != list(expected):
                raise DomainError("模型不符合本机七关节、wrist/world 双相机执行格式", "invalid_model_archive")
            base_id = str(source.get("id") or "imported-model")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", base_id) or base_id in {".", ".."}:
                raise DomainError("模型标识包含无效字符", "invalid_model_archive")
            with manager._lock:
                model_id = base_id
                counter = 0
                while (manager.models_root / model_id).exists():
                    counter += 1
                    model_id = f"{base_id}-{counter}"
                target = manager.models_root / model_id
                temporary = manager.models_root / f".{model_id}-{uuid.uuid4().hex}.tmp"
                temporary.mkdir()
                for name, info in files.items():
                    if not name.startswith(prefix):
                        continue
                    relative = name[len(prefix):]
                    destination = temporary / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(info) as src, destination.open("wb") as dst:
                        shutil.copyfileobj(src, dst, 256 * 1024)
                imported = dict(source)
                for key in ("blockers", "execution_ready", "checkpoint_path"):
                    imported.pop(key, None)
                imported.update(id=model_id, path=str(target), imported=True,
                                registered_at_ms=int(time.time() * 1000))
                (temporary / "model.json").write_text(json.dumps(imported, ensure_ascii=False, indent=2), encoding="utf-8")
                checked = manager._execution_metadata(imported, temporary)
                if not checked["execution_ready"] and source.get("coordinate_contract") != "starai_0_0_4_calibrated":
                    raise DomainError("；".join(checked["blockers"]), "invalid_model_archive")
                # Do not create target first: this must be an atomic directory rename.
                os.replace(temporary, target)
                temporary = None
                return manager._execution_metadata(imported, target)
    except DomainError:
        raise
    except (zipfile.BadZipFile, tarfile.TarError, EOFError, OverflowError, UnicodeDecodeError, ValueError, TypeError, KeyError, AttributeError) as error:
        raise DomainError("模型包损坏或配置格式无效", "invalid_model_archive") from error
    except OSError as error:
        raise DomainError(f"模型导入失败：{error}", "model_import_failed") from error
    finally:
        if temporary is not None:
            shutil.rmtree(temporary, ignore_errors=True)
