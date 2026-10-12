import secrets
import time
import uuid
from copy import deepcopy


CAPTURE_PROFILES = {(640, 360, 30), (640, 480, 30), (1280, 720, 30), (1920, 1080, 30)}


class DomainError(ValueError):
    def __init__(self, message: str, code: str = "domain_error"):
        super().__init__(message)
        self.code = code


class ActWorkspace:
    def __init__(self, store):
        self.store = store
        loaded = store.load()
        self.state = {
            "datasets": loaded.get("datasets", []),
            "episodes": loaded.get("episodes", []),
            "models": loaded.get("models", []),
            "device_lease": None,
            "inference": None,
            "generation": int(loaded.get("generation", 0)),
        }

    def _save(self):
        persistent = deepcopy(self.state)
        persistent["device_lease"] = None
        persistent["inference"] = None
        self.store.save(persistent)

    def snapshot(self):
        return deepcopy(self.state)

    def create_dataset(self, task_name, slug, width, height, fps):
        if (width, height, fps) not in CAPTURE_PROFILES:
            raise DomainError("不支持的双相机保存规格", "invalid_capture_profile")
        if not str(task_name).strip() or not str(slug).strip():
            raise DomainError("任务名称和数据集标识不能为空", "invalid_dataset")
        if any(item["slug"] == slug for item in self.state["datasets"]):
            raise DomainError("数据集标识已存在", "dataset_exists")
        item = {
            "id": str(uuid.uuid4()),
            "task_name": str(task_name).strip(),
            "slug": str(slug).strip(),
            "capture": {"width": width, "height": height, "fps": fps},
            "created_at_ms": int(time.time() * 1000),
        }
        self.state["datasets"].append(item)
        self._save()
        return deepcopy(item)

    def acquire_devices(self, owner):
        lease = self.state["device_lease"]
        if lease and lease["owner"] != owner:
            raise DomainError("设备已被其他 AI 会话占用", "devices_busy")
        if lease:
            return deepcopy(lease)
        lease = {"owner": owner, "lease_id": secrets.token_urlsafe(24)}
        self.state["device_lease"] = lease
        return deepcopy(lease)

    def release_devices(self, lease_id):
        lease = self.state["device_lease"]
        if not lease or not secrets.compare_digest(lease["lease_id"], str(lease_id)):
            raise DomainError("设备租约无效", "invalid_lease")
        self.state["device_lease"] = None

    def _dataset(self, dataset_id):
        return next((x for x in self.state["datasets"] if x["id"] == dataset_id), None)

    def _episode(self, episode_id):
        return next((x for x in self.state["episodes"] if x["id"] == episode_id), None)

    def _model(self, model_id):
        return next((x for x in self.state["models"] if x["id"] == model_id), None)

    def start_episode(self, dataset_id):
        if not self._dataset(dataset_id):
            raise DomainError("数据集不存在", "dataset_not_found")
        if any(x["status"] == "recording" for x in self.state["episodes"]):
            raise DomainError("已有 Episode 正在录制", "episode_active")
        item = {"id": str(uuid.uuid4()), "dataset_id": dataset_id, "status": "recording"}
        self.state["episodes"].append(item)
        self._save()
        return deepcopy(item)

    def stop_episode(self, episode_id, valid_frames, mismatch_rate):
        item = self._episode(episode_id)
        if not item:
            raise DomainError("Episode 不存在", "episode_not_found")
        if item["status"] != "recording":
            raise DomainError("Episode 不在录制状态", "invalid_episode_state")
        item.update(status="review", valid_frames=max(0, int(valid_frames)), mismatch_rate=float(mismatch_rate))
        self._save()
        return deepcopy(item)

    def abort_episode_start(self, episode_id):
        item = self._episode(episode_id)
        if item and item["status"] == "recording":
            self.state["episodes"].remove(item)
            self._save()

    def review_episode(self, episode_id, decision, integrity_ok=None):
        item = self._episode(episode_id)
        if not item:
            raise DomainError("Episode 不存在", "episode_not_found")
        if item["status"] == "recording":
            raise DomainError("Episode 尚未停止，不能审核", "episode_recording")
        if item["status"] != "review":
            raise DomainError("Episode 已完成审核", "episode_already_reviewed")
        states = {"success": "accepted_success", "failure": "accepted_failure", "discard": "discarded"}
        if decision not in states:
            raise DomainError("不支持的审核决定", "invalid_review")
        if decision == "success" and int(item.get("valid_frames", 0)) <= 0:
            raise DomainError("Episode 没有真实样本，不能保存为成功示教", "episode_has_no_samples")
        if decision == "success" and integrity_ok is False:
            raise DomainError("Episode 数据完整性检查未通过，不能保存为成功示教", "episode_integrity_failed")
        item["status"] = states[decision]
        self._save()
        return deepcopy(item)

    def register_import(self, dataset, episodes):
        if any(item["id"] == dataset["id"] or item["slug"] == dataset["slug"] for item in self.state["datasets"]):
            raise DomainError("导入数据集已存在", "dataset_exists")
        episode_ids = {item["id"] for item in self.state["episodes"]}
        if any(item["id"] in episode_ids or item.get("dataset_id") != dataset["id"] for item in episodes):
            raise DomainError("导入 Episode 身份无效或已存在", "episode_exists")
        self.state["datasets"].append(deepcopy(dataset))
        self.state["episodes"].extend(deepcopy(episodes))
        self._save()
        return {"dataset": deepcopy(dataset), "episodes": deepcopy(episodes)}

    def training_blockers(self, dataset_id, gpu_ready, runtime_blockers=None):
        episodes = [x for x in self.state["episodes"] if x["dataset_id"] == dataset_id]
        reasons = []
        if not gpu_ready:
            reasons.extend(runtime_blockers or ["本机 NVIDIA GPU 或 ACT 运行依赖不可用"])
        if not any(x["status"] == "accepted_success" for x in episodes):
            reasons.append("数据集没有已审核的成功示教")
        if any(x["status"] == "review" for x in episodes):
            reasons.append("数据集仍有待审核 Episode")
        return reasons

    def register_model(self, name, dataset_id):
        item = {"id": str(uuid.uuid4()), "name": name, "dataset_id": dataset_id,
                "offline_validated": False, "virtual_preview_confirmed": False}
        self.state["models"].append(item)
        self._save()
        return deepcopy(item)

    def mark_offline_validation(self, model_id, passed):
        model = self._model(model_id)
        if not model:
            raise DomainError("模型不存在", "model_not_found")
        model["offline_validated"] = bool(passed)
        if not passed:
            model["virtual_preview_confirmed"] = False
        self._save()

    def confirm_virtual_preview(self, model_id):
        model = self._model(model_id)
        if not model or not model["offline_validated"]:
            raise DomainError("模型尚未通过离线验证", "offline_validation_required")
        model["virtual_preview_confirmed"] = True
        self._save()

    def authorize_inference(self, model_id, now_ms=None):
        model = self._model(model_id)
        if not model or not model["offline_validated"]:
            raise DomainError("模型尚未通过离线验证", "offline_validation_required")
        if not model["virtual_preview_confirmed"]:
            raise DomainError("虚拟 FL 预演尚未确认", "preview_required")
        now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
        self.state["generation"] += 1
        token = secrets.token_urlsafe(32)
        self.state["inference"] = {"token": token, "model_id": model_id,
                                   "generation": self.state["generation"], "expires_at_ms": now_ms + 1000}
        return deepcopy(self.state["inference"])

    def is_inference_authorized(self, token, now_ms=None):
        active = self.state["inference"]
        now_ms = int(time.time() * 1000) if now_ms is None else int(now_ms)
        if not active or now_ms > active["expires_at_ms"]:
            self.state["inference"] = None
            return False
        return secrets.compare_digest(active["token"], str(token))

    def revoke_inference(self, reason="manual"):
        self.state["generation"] += 1
        self.state["inference"] = None
        return {"stopped": True, "reason": reason, "generation": self.state["generation"]}
