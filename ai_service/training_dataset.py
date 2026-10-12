import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .domain import DomainError


class TrainingDatasetAdapter:
    def __init__(self, data_root, episode_store, runner=None, converter_path=None):
        self.data_root = Path(data_root).resolve()
        self.episode_store = episode_store
        self.root = self.data_root / "training" / "datasets"
        self.root.mkdir(parents=True, exist_ok=True)
        self._runner = runner or subprocess.run
        self.converter_path = Path(converter_path or Path(__file__).with_name("lerobot_convert.py"))

    @staticmethod
    def _hash_file(digest, path):
        digest.update(path.name.encode())
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)

    def _source(self, dataset_id):
        dataset_dir = self.episode_store._dataset_dir(dataset_id)
        if not dataset_dir.is_dir():
            raise DomainError("训练数据集不存在", "dataset_data_not_found")
        dataset = self.episode_store._read_json(dataset_dir / "dataset.json")
        episodes = []
        digest = hashlib.sha256()
        for episode_dir in sorted((dataset_dir / "episodes").iterdir()):
            if not episode_dir.is_dir() or episode_dir.name.startswith("."):
                continue
            metadata = self.episode_store._read_json(episode_dir / "episode.json")
            if metadata.get("status") != "accepted_success":
                continue
            integrity = self.episode_store._integrity_for_dir(episode_dir)
            if not integrity["ok"]:
                details = "；".join(integrity["errors"])
                raise DomainError(f"Episode {metadata.get('id', episode_dir.name)} 完整性失败：{details}",
                                  "training_episode_invalid")
            for path in sorted(value for value in episode_dir.rglob("*") if value.is_file()):
                self._hash_file(digest, path)
            episodes.append({"id": metadata["id"], "path": str(episode_dir),
                             "samples": integrity["samples"]})
        if not episodes:
            raise DomainError("数据集没有审核通过的成功 Episode", "training_dataset_empty")
        capture = dataset["capture"]
        return dataset, episodes, digest.hexdigest(), capture

    def prepare(self, dataset_id, environment):
        if environment.get("status") != "ready" or not environment.get("python"):
            raise DomainError("训练环境尚未就绪", "training_environment_not_ready")
        dataset, episodes, fingerprint, capture = self._source(dataset_id)
        target = self.root / str(dataset_id) / fingerprint
        marker = target / "training-dataset.json"
        if marker.is_file():
            snapshot = json.loads(marker.read_text(encoding="utf-8"))
            canonical_path = (target / "lerobot").resolve()
            if not (canonical_path / "meta" / "info.json").is_file():
                raise DomainError("已转换训练数据缺少 LeRobot 元数据，请重新准备数据集",
                                  "training_dataset_conversion_failed")
            if snapshot.get("path") != str(canonical_path):
                snapshot["path"] = str(canonical_path)
                temporary = marker.with_suffix(".tmp")
                temporary.write_text(
                    json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"
                )
                os.replace(temporary, marker)
            return snapshot
        parent = target.parent
        parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=f".{fingerprint}-", dir=parent))
        manifest = {
            "dataset_id": dataset_id,
            "repo_id": f"star-arm-102/{dataset['slug']}",
            "task_name": dataset["task_name"],
            "fps": int(capture["fps"]), "width": int(capture["width"]), "height": int(capture["height"]),
            "fingerprint": fingerprint, "episodes": episodes,
        }
        manifest_path = staging.parent / f".{fingerprint}-manifest.json"
        try:
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            command = [environment["python"], str(self.converter_path), "--manifest", str(manifest_path),
                       "--output", str(staging / "lerobot")]
            result = self._runner(command, capture_output=True, text=True, timeout=7200, check=False)
            if result.returncode != 0:
                lines = (result.stderr or result.stdout or "转换进程失败").strip().splitlines()
                raise DomainError(f"训练数据转换失败：{lines[-1][:300]}", "training_dataset_conversion_failed")
            if not (staging / "lerobot" / "meta" / "info.json").is_file():
                raise DomainError("训练数据转换未生成 LeRobot 元数据", "training_dataset_conversion_failed")
            snapshot = {
                "dataset_id": dataset_id, "path": str((target / "lerobot").resolve()),
                "fingerprint": fingerprint, "episodes": len(episodes),
                "samples": sum(item["samples"] for item in episodes),
                "environment_fingerprint": environment.get("fingerprint"),
                "tasks": [dataset["task_name"]],
                "camera_contract": {
                    "width": int(capture["width"]), "height": int(capture["height"]),
                    "fps": int(capture["fps"]),
                    "features": ["observation.images.wrist", "observation.images.world"],
                },
                "observation_features": [
                    "observation.state", "observation.images.wrist", "observation.images.world",
                ],
                "action_feature": "action",
            }
            (staging / "training-dataset.json").write_text(
                json.dumps(snapshot, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
            os.replace(staging, target)
            return snapshot
        finally:
            manifest_path.unlink(missing_ok=True)
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
