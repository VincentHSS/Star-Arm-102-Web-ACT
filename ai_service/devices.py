import secrets
import time
from copy import deepcopy

from .domain import DomainError


ROLES = ("leader", "follower", "wrist_camera", "world_camera")


class DeviceRegistry:
    def __init__(self, store):
        self.store = store
        self.config = store.load().get("device_binding")

    def _save(self):
        self.store.save({"device_binding": self.config})

    def snapshot(self):
        return deepcopy(self.config)

    def bind(self, request, capabilities):
        leader_type = request.get("leader_type")
        if leader_type not in ("LD", "HD"):
            raise DomainError("Leader 类型必须是 LD 或 HD", "invalid_leader_type")
        leader_port = request.get("leader_port")
        follower_port = request.get("follower_port")
        serial_ports = set(capabilities.get("serial_ports", []))
        if leader_port == follower_port:
            raise DomainError("Leader 和真实 FL 不能使用同一个串口", "duplicate_serial_role")
        if leader_port not in serial_ports or follower_port not in serial_ports:
            raise DomainError("所选串口不在本机候选列表", "unknown_serial_candidate")
        wrist_id = request.get("wrist_camera_id")
        world_id = request.get("world_camera_id")
        if not wrist_id or not world_id:
            raise DomainError("请选择两台摄像头", "missing_camera_role")
        if wrist_id == world_id:
            raise DomainError("末端视角与世界视角不能绑定同一相机", "duplicate_camera_role")
        self.config = {
            "binding_id": secrets.token_urlsafe(18),
            "leader_type": leader_type,
            "leader_port": leader_port,
            "follower_port": follower_port,
            "wrist_camera_id": wrist_id,
            "world_camera_id": world_id,
            "baudrate": 1_000_000,
            "status": "bound_unverified",
            "capture_ready": False,
            "verified_roles": [],
            "bound_at_ms": int(time.time() * 1000),
        }
        self._save()
        return self.snapshot()

    def mark_verified(self, binding_id, role):
        if not self.config or not secrets.compare_digest(self.config["binding_id"], str(binding_id)):
            raise DomainError("设备绑定身份已失效", "stale_device_binding")
        if role not in ROLES:
            raise DomainError("未知设备角色", "invalid_device_role")
        verified = set(self.config["verified_roles"])
        verified.add(role)
        self.config["verified_roles"] = [name for name in ROLES if name in verified]
        self.config["capture_ready"] = len(verified) == len(ROLES)
        self.config["status"] = "verified" if self.config["capture_ready"] else "verifying"
        self._save()
        return self.snapshot()
