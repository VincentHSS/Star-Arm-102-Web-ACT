"""Manual range recording. Never sends a target position or writes servo zeroes."""
import json
import math
from pathlib import Path
from threading import RLock
from copy import deepcopy

from .domain import DomainError
from .release_adapter import MOTOR_NAMES, validate_calibration, legacy_position_counts


class FollowerCalibration:
    def __init__(self, data_root, serial):
        self.root = Path(data_root) / "follower-calibration"
        self.serial = serial
        self.lock = RLock()
        self.state = {"status": "idle", "samples": 0, "joints": []}
        try:
            saved = json.loads((self.root / "saved.json").read_text(encoding="utf-8"))
            validate_calibration(saved["calibration"])
            self.state.update(status="saved", port=saved["port"], calibration=saved["calibration"])
        except (OSError, ValueError, KeyError):
            pass

    def snapshot(self):
        with self.lock:
            return deepcopy(self.state)

    def active(self):
        return self.snapshot()["status"] in {"recording", "paused"}

    def _port(self):
        follower = self.serial.snapshot().get("follower") or {}
        if not follower.get("connected") or not follower.get("port"):
            raise DomainError("请先连接本台真实从臂", "follower_not_connected")
        return follower["port"]

    def start(self, confirmed):
        with self.lock:
            if not confirmed:
                raise DomainError("请先确认已扶稳从臂，开始校准会解除锁力", "calibration_confirmation_required")
            if self.active():
                raise DomainError("校准正在记录", "calibration_active")
            port = self._port()
            self.serial.release_follower_torque()
            self.state = {"status": "recording", "port": port, "samples": 0, "joints": [], "consecutive_failures": 0}
            return self.sample()

    def sample(self):
        with self.lock:
            if self.state["status"] != "recording":
                raise DomainError("校准没有开始或已停止", "calibration_not_active")
            try:
                if self._port() != self.state["port"]:
                    raise DomainError("从臂连接已变化，请重新校准", "calibration_device_changed")
                degrees = self.serial.read_follower_angles()
                if not isinstance(degrees, (list, tuple)) or len(degrees) != 7:
                    raise DomainError("从臂角度数据无效：没有返回七个关节", "invalid_joint_sample")
                invalid = [f"J{i + 1}（舵机 ID {i}）={v}" for i, v in enumerate(degrees)
                           if not math.isfinite(float(v)) or not -214748364.8 <= float(v) <= 214748364.7]
                if invalid:
                    raise DomainError("从臂角度数据无效，需为串口支持范围内的有限值：" + "、".join(invalid), "invalid_joint_sample")
                raw = [legacy_position_counts(v) for v in degrees]
                clipped = [f"J{i + 1}={float(v):.1f}°" for i, v in enumerate(degrees) if abs(float(v)) > 180]
                if not self.state["joints"]:
                    self.state["joints"] = [{"name": name, "id": i, "min": v, "max": v} for i, (name, v) in enumerate(zip(MOTOR_NAMES, raw))]
                for joint, value, degree in zip(self.state["joints"], raw, degrees):
                    joint.update(min=min(joint["min"], value), max=max(joint["max"], value), angle=float(degree))
                    joint.update(raw_min=min(joint.get("raw_min", float(degree)), float(degree)),
                                 raw_max=max(joint.get("raw_max", float(degree)), float(degree)))
                    joint["raw_span_deg"] = round(joint["raw_max"] - joint["raw_min"], 1)
                    joint["span_deg"] = round((joint["max"] - joint["min"]) / 4096 * 360, 1)
                self.state["samples"] += 1
                self.state.update(consecutive_failures=0, error=None,
                                  warning=("正在记录原始角度；发布驱动的坐标换算在 ±180° 截断，超出部分不能分辨：" + "、".join(clipped)) if clipped else None)
                return self.snapshot()
            except Exception as error:
                failures = self.state.get("consecutive_failures", 0) + 1
                self.state.update(consecutive_failures=failures, error=None)
                if isinstance(error, DomainError) and error.code == "calibration_device_changed":
                    self.state.update(status="paused", warning=f"连接的设备已改变，已有范围保留。确认同一台从臂并重新连接，或取消后重新开始：{error}")
                else:
                    self.state.update(status="recording", warning=f"等待有效角度，正在持续重试（连续 {failures} 次失败），已有范围保留：{error}")
                return self.snapshot()

    def pause(self):
        with self.lock:
            if self.active():
                self.state.update(status="paused", warning="记录已暂停，已有范围已保留。确认连接后可以继续记录。")
            return self.snapshot()

    def resume(self, confirmed, same_arm_confirmed):
        with self.lock:
            if self.state["status"] not in {"paused", "recording"}:
                raise DomainError("没有可继续的校准记录，请重新开始", "calibration_not_paused")
            if not confirmed or not same_arm_confirmed:
                raise DomainError("请确认已扶稳，并且连接的是刚才校准的同一台从臂", "calibration_confirmation_required")
            if self._port() != self.state["port"]:
                raise DomainError("从臂串口已改变，不能合并不同设备的范围，请取消后重新开始", "calibration_device_changed")
            self.serial.release_follower_torque()
            self.state.update(status="recording", consecutive_failures=0, warning=None, error=None)
            return self.sample()

    def finish(self, confirmed):
        with self.lock:
            if not confirmed:
                raise DomainError("请确认七个关节都已覆盖可用活动范围", "calibration_range_confirmation_required")
            self.sample()
            if self.state.get("consecutive_failures", 0):
                raise DomainError("当前角度读取尚未恢复，已有范围已保留；请恢复记录后再保存", "calibration_read_retry")
            missing = [f"J{j['id'] + 1}" + (f"（原始跨度 {j['raw_span_deg']}°，发布驱动可分辨跨度 {j['span_deg']}°；需核对关节零位，不能仅继续转动）"
                       if j.get("raw_span_deg", 0) >= 5 else "") for j in self.state["joints"] if j["span_deg"] < 5]
            if missing:
                raise DomainError("以下关节尚未充分记录（至少 5°，需实际覆盖可用范围）：" + "、".join(missing), "calibration_incomplete")
            calibration = {j["name"]: {"id": j["id"], "drive_mode": 0, "homing_offset": 0,
                                       "range_min": j["min"], "range_max": j["max"]} for j in self.state["joints"]}
            validate_calibration(calibration)
            saved = {"port": self.state["port"], "calibration": calibration}
            try:
                self.root.mkdir(parents=True, exist_ok=True)
                temp = self.root / "saved.json.tmp"
                temp.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
                temp.replace(self.root / "saved.json")
            except OSError as error:
                raise DomainError(f"校准保存失败，请检查数据目录空间或权限：{error}", "calibration_save_failed") from error
            self.state.update(status="saved", calibration=calibration)
            return self.snapshot()

    def cancel(self):
        with self.lock:
            if self.active():
                self.state.update(status="cancelled")
            return self.snapshot()

    def saved_calibration(self):
        with self.lock:
            try:
                saved = json.loads((self.root / "saved.json").read_text(encoding="utf-8"))
                return validate_calibration(saved["calibration"]), saved["port"]
            except (OSError, ValueError, KeyError) as error:
                raise DomainError("尚无有效的已保存校准，请先完成校准", "calibration_missing") from error
