"""Coordinates used by the published Star Arm LeRobot ACT checkpoint."""
import json
import math

from .domain import DomainError

MOTOR_NAMES = [f"Motor_{i}" for i in range(6)] + ["gripper"]
RELEASE_WEIGHT_SHA256 = "fca7d7f499dfbe9d7194a8a84835408f41f6f4cc0a8016ae117b1fe8e44ae993"
COORDINATES = "starai_0_0_4_calibrated"


def legacy_position_counts(degree):
    """Exactly match the release driver's clamp and two integer truncations."""
    degree = float(degree)
    if not math.isfinite(degree):
        raise ValueError("关节角度必须是有限值")
    return int(int(min(180, max(-180, degree)) + 180) / 360 * 4096)


def validate_calibration(data):
    if not isinstance(data, dict):
        raise DomainError("请选择 LeRobot 为本台从臂生成的校准 JSON", "invalid_calibration")
    result = {}
    for index, name in enumerate(MOTOR_NAMES):
        item = data.get(name)
        if not isinstance(item, dict) or item.get("id") != index:
            raise DomainError(f"校准文件缺少舵机 {name} / ID {index}", "invalid_calibration")
        low, high = item.get("range_min"), item.get("range_max")
        if (not isinstance(low, (int, float)) or not isinstance(high, (int, float))
                or not math.isfinite(low) or not math.isfinite(high)
                or not 0 <= low < high <= 4096 or item.get("drive_mode") not in (0, 1)
                or item.get("homing_offset", 0) != 0):
            raise DomainError(f"{name} 校准范围不符合此发布模型的 StarAI 坐标格式", "invalid_calibration")
        result[name] = dict(item)
    return result


class ReleaseCoordinates:
    def __init__(self, calibration):
        self.calibration = validate_calibration(calibration)

    def observation(self, degrees):
        # Match StarAI 0.0.4: first truncate degree+180, then truncate counts.
        result = []
        for i, (name, degree) in enumerate(zip(MOTOR_NAMES, degrees, strict=True)):
            c = self.calibration[name]
            raw = legacy_position_counts(degree)
            ratio = (min(c["range_max"], max(c["range_min"], raw)) - c["range_min"]) / (c["range_max"] - c["range_min"])
            value = ratio * (100 if i == 6 else 200) - (0 if i == 6 else 100)
            if c["drive_mode"]:
                value = 100 - value if i == 6 else -value
            result.append(value)
        return result

    def action(self, values):
        result = []
        for i, (name, value) in enumerate(zip(MOTOR_NAMES, values, strict=True)):
            c = self.calibration[name]
            if c["drive_mode"]:
                value = 100 - value if i == 6 else -value
            ratio = min(100, max(0, value)) / 100 if i == 6 else (min(100, max(-100, value)) + 100) / 200
            raw = int(ratio * (c["range_max"] - c["range_min"]) + c["range_min"])
            result.append(int((raw / 4096 * 360 - 180) * 10) / 10)
        return result


def install_calibration(manager, model_id, data):
    calibration = validate_calibration(data)
    with manager._lock:
        models = {m["id"]: m for m in manager.list_models()}
        model = models.get(model_id)
        if not model or model.get("coordinate_contract") != COORDINATES:
            raise DomainError("所选模型不需要此格式的校准文件", "invalid_calibration")
        root = manager.models_root / model_id
        temporary = root / "calibration.json.tmp"
        temporary.write_text(json.dumps(calibration, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(root / "calibration.json")
        return manager._execution_metadata(json.loads((root / "model.json").read_text(encoding="utf-8")), root)
