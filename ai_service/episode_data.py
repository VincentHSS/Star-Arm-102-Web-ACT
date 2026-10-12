import io
import json
import os
import shutil
import stat
import tempfile
import threading
import time
import uuid
import zipfile
from copy import deepcopy
from hashlib import sha256
from pathlib import Path, PurePosixPath

from .domain import DomainError


FORMAT_VERSION = 1
ARCHIVE_FORMAT = "star-arm-102-act-dataset"
CAMERA_ROLES = ("wrist", "world")
MAX_FRAME_BYTES = 5_000_000
MAX_BATCH_FRAMES = 30
MAX_ARCHIVE_FILES = 100_000
MAX_ARCHIVE_BYTES = 20_000_000_000


class EpisodeDataStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.datasets_root = self.root / "datasets"
        self.datasets_root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._active = {}

    def _dataset_dir(self, dataset_id):
        return self.datasets_root / str(dataset_id)

    def _episodes_dir(self, dataset_id):
        return self._dataset_dir(dataset_id) / "episodes"

    def _locate_episode(self, episode_id, include_temp=False):
        for dataset_dir in self.datasets_root.iterdir():
            if not dataset_dir.is_dir():
                continue
            episodes = dataset_dir / "episodes"
            final = episodes / str(episode_id)
            if final.is_dir():
                return final
            temporary = episodes / f".{episode_id}.tmp"
            if include_temp and temporary.is_dir():
                return temporary
        return None

    @staticmethod
    def _write_json(path, payload):
        temporary = path.with_name(f".{path.name}.tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)

    @staticmethod
    def _read_json(path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DomainError(f"数据文件无效：{path.name}", "invalid_dataset_file") from error

    @staticmethod
    def _jsonl(path):
        if not path.exists():
            return []
        try:
            return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except (OSError, json.JSONDecodeError) as error:
            raise DomainError(f"索引文件无效：{path.name}", "invalid_dataset_file") from error

    def create_dataset(self, dataset):
        dataset_dir = self._dataset_dir(dataset["id"])
        (dataset_dir / "episodes").mkdir(parents=True, exist_ok=True)
        payload = deepcopy(dataset)
        payload["format_version"] = FORMAT_VERSION
        self._write_json(dataset_dir / "dataset.json", payload)
        return payload

    def start_episode(self, dataset, episode):
        with self._lock:
            if episode["id"] in self._active:
                raise DomainError("Episode 数据写入已在运行", "episode_data_active")
            self.create_dataset(dataset)
            episodes_dir = self._episodes_dir(dataset["id"])
            temporary = episodes_dir / f".{episode['id']}.tmp"
            final = episodes_dir / episode["id"]
            if temporary.exists() or final.exists():
                raise DomainError("Episode 数据目录已存在", "episode_data_exists")
            temporary.mkdir(parents=True)
            index_handles = {}
            for role in CAMERA_ROLES:
                camera_dir = temporary / "cameras" / role
                (camera_dir / "frames").mkdir(parents=True)
                index_handles[role] = (camera_dir / "index.jsonl").open("a", encoding="utf-8")
            sample_handle = (temporary / "samples.jsonl").open("a", encoding="utf-8")
            self._active[episode["id"]] = {
                "dataset_id": dataset["id"], "temporary": temporary, "final": final,
                "sample_handle": sample_handle, "index_handles": index_handles,
                "samples": 0, "camera_counts": {role: 0 for role in CAMERA_ROLES},
                "camera_files": [],
                "started_at_ms": int(time.time() * 1000),
            }
            return {"episode_id": episode["id"], "status": "recording"}

    def append_sample(self, sample):
        episode_id = str(sample.get("episode_id", ""))
        with self._lock:
            active = self._active.get(episode_id)
            if not active:
                raise DomainError("Episode 样本写入器未运行", "episode_data_inactive")
            action, state_values = sample.get("action"), sample.get("observation_state")
            if not isinstance(action, list) or not isinstance(state_values, list) or len(action) != 7 or len(state_values) != 7:
                raise DomainError("Episode 样本必须包含 J1-J7", "invalid_joint_sample")
            active["sample_handle"].write(json.dumps(sample, ensure_ascii=False, separators=(",", ":")) + "\n")
            active["samples"] += 1
            return active["samples"]

    def append_camera_frames(self, episode_id, role, frames):
        with self._lock:
            active = self._active.get(str(episode_id))
            if not active:
                raise DomainError("相机帧只允许写入正在录制的 Episode", "episode_data_inactive")
            if role not in CAMERA_ROLES:
                raise DomainError("相机角色必须是 wrist 或 world", "invalid_camera_role")
            if not isinstance(frames, list) or not 1 <= len(frames) <= MAX_BATCH_FRAMES:
                raise DomainError("相机帧批次大小无效", "invalid_camera_batch")
            expected = active["camera_counts"][role] + 1
            validated = []
            for offset, frame in enumerate(frames):
                sequence = int(frame.get("sequence", 0))
                jpeg = frame.get("jpeg")
                if sequence != expected + offset:
                    raise DomainError(f"{role} 相机帧序号必须连续", "camera_sequence_gap")
                if not isinstance(jpeg, (bytes, bytearray)) or not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
                    raise DomainError(f"{role} 相机帧不是有效 JPEG", "invalid_jpeg")
                if len(jpeg) > MAX_FRAME_BYTES:
                    raise DomainError(f"{role} 相机单帧过大", "camera_frame_too_large")
                width, height = int(frame.get("width", 0)), int(frame.get("height", 0))
                if width <= 0 or height <= 0:
                    raise DomainError(f"{role} 相机帧尺寸无效", "invalid_camera_frame")
                validated.append((sequence, bytes(jpeg), width, height, frame))
            camera_dir = active["temporary"] / "cameras" / role
            handle = active["index_handles"][role]
            for sequence, jpeg, width, height, frame in validated:
                filename = f"{sequence:08d}.jpg"
                target = camera_dir / "frames" / filename
                with target.open("xb") as output:
                    output.write(jpeg)
                active["camera_files"].append(target)
                record = {
                    "sequence": sequence, "captured_at_ms": float(frame["captured_at_ms"]),
                    "monotonic_ms": float(frame["monotonic_ms"]), "media_time": float(frame["media_time"]),
                    "presented_frames": int(frame["presented_frames"]), "width": width, "height": height,
                    "file": filename, "bytes": len(jpeg),
                }
                handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                active["camera_counts"][role] += 1
            handle.flush()
            return {"stored": len(validated), "total": active["camera_counts"][role], "role": role}

    def _close_active(self, episode_id):
        active = self._active.pop(episode_id, None)
        if not active:
            return None
        for target in active["camera_files"]:
            with target.open("r+b") as image:
                os.fsync(image.fileno())
        handles = [active["sample_handle"], *active["index_handles"].values()]
        for handle in handles:
            handle.flush()
            os.fsync(handle.fileno())
            handle.close()
        return active

    def _integrity_for_dir(self, episode_dir, active_counts=None):
        errors = []
        samples = self._jsonl(episode_dir / "samples.jsonl")
        for index, sample in enumerate(samples, 1):
            if len(sample.get("action", [])) != 7 or len(sample.get("observation_state", [])) != 7:
                errors.append(f"样本 {index} 缺少 J1-J7")
        camera_counts = {}
        for role in CAMERA_ROLES:
            records = self._jsonl(episode_dir / "cameras" / role / "index.jsonl")
            files = sorted((episode_dir / "cameras" / role / "frames").glob("*.jpg"))
            camera_counts[role] = len(records)
            if not records:
                errors.append(f"{role} 相机没有真实图像")
            if len(records) != len(files):
                errors.append(f"{role} 相机索引与 JPEG 数量不一致")
            for expected, record in enumerate(records, 1):
                target = episode_dir / "cameras" / role / "frames" / str(record.get("file", ""))
                if record.get("sequence") != expected or not target.is_file() or target.stat().st_size != record.get("bytes"):
                    errors.append(f"{role} 相机第 {expected} 帧索引无效")
                    break
        if active_counts:
            if len(samples) != active_counts["samples"]:
                errors.append("关节样本写入计数不一致")
            for role in CAMERA_ROLES:
                if camera_counts[role] != active_counts["camera_counts"][role]:
                    errors.append(f"{role} 相机写入计数不一致")
        return {"ok": not errors and bool(samples), "errors": errors, "samples": len(samples), "camera_frames": camera_counts}

    def integrity(self, episode_id):
        with self._lock:
            active = self._active.get(str(episode_id))
            if active:
                for handle in [active["sample_handle"], *active["index_handles"].values()]:
                    handle.flush()
                return self._integrity_for_dir(active["temporary"], active)
            target = self._locate_episode(episode_id)
            if not target:
                raise DomainError("Episode 数据目录不存在", "episode_data_not_found")
            return self._integrity_for_dir(target)

    def finalize_episode(self, episode_id, status, mismatch_rate=0, runtime_error=None, persistence_error=None):
        with self._lock:
            active = self._close_active(episode_id)
            if not active:
                raise DomainError("Episode 数据写入器未运行", "episode_data_inactive")
            integrity = self._integrity_for_dir(active["temporary"], active)
            metadata = {
                "id": episode_id, "dataset_id": active["dataset_id"], "format_version": FORMAT_VERSION,
                "status": status, "valid_frames": integrity["samples"], "mismatch_rate": float(mismatch_rate),
                "camera_frames": integrity["camera_frames"], "integrity": integrity,
                "started_at_ms": active["started_at_ms"], "stopped_at_ms": int(time.time() * 1000),
                "runtime_error": runtime_error, "persistence_error": persistence_error,
            }
            self._write_json(active["temporary"] / "episode.json", metadata)
            os.replace(active["temporary"], active["final"])
            return {"samples": integrity["samples"], "camera_frames": integrity["camera_frames"], "integrity": integrity, "metadata": metadata}

    def update_episode_status(self, episode_id, status):
        target = self._locate_episode(episode_id)
        if not target:
            raise DomainError("Episode 数据目录不存在", "episode_data_not_found")
        metadata = self._read_json(target / "episode.json")
        metadata["status"] = status
        self._write_json(target / "episode.json", metadata)
        return metadata

    def abort_episode(self, episode_id):
        with self._lock:
            active = self._close_active(episode_id)
            if active:
                shutil.rmtree(active["temporary"], ignore_errors=True)
                return
            target = self._locate_episode(episode_id, include_temp=True)
            if target and target.name.startswith("."):
                shutil.rmtree(target, ignore_errors=True)

    def delete_episode(self, episode_id):
        with self._lock:
            self.abort_episode(episode_id)
            target = self._locate_episode(episode_id)
            if target:
                shutil.rmtree(target)

    def dataset_stats(self, dataset_id):
        dataset_dir = self._dataset_dir(dataset_id)
        if not dataset_dir.is_dir():
            raise DomainError("数据集目录不存在", "dataset_data_not_found")
        episodes = []
        totals = {"samples": 0, "wrist": 0, "world": 0, "bytes": 0}
        integrity_ok = False
        for episode_dir in sorted((dataset_dir / "episodes").iterdir()):
            if not episode_dir.is_dir() or episode_dir.name.startswith("."):
                continue
            metadata = self._read_json(episode_dir / "episode.json")
            integrity = self._integrity_for_dir(episode_dir)
            metadata["integrity"] = integrity
            episodes.append(metadata)
            totals["samples"] += integrity["samples"]
            totals["wrist"] += integrity["camera_frames"]["wrist"]
            totals["world"] += integrity["camera_frames"]["world"]
            integrity_ok = integrity["ok"] if len(episodes) == 1 else integrity_ok and integrity["ok"]
        totals["bytes"] = sum(path.stat().st_size for path in dataset_dir.rglob("*") if path.is_file())
        return {"dataset_id": dataset_id, "episodes": episodes, "totals": totals, "integrity_ok": integrity_ok}

    def export_dataset(self, dataset_id):
        with self._lock:
            if any(active["dataset_id"] == dataset_id for active in self._active.values()):
                raise DomainError("数据集正在录制，不能导出", "dataset_recording")
            dataset_dir = self._dataset_dir(dataset_id)
            if not dataset_dir.is_dir():
                raise DomainError("数据集目录不存在", "dataset_data_not_found")
            stats = self.dataset_stats(dataset_id)
            if not stats["integrity_ok"]:
                raise DomainError("数据集完整性检查失败，不能导出", "dataset_integrity_failed")
            files = [path for path in dataset_dir.rglob("*") if path.is_file()]
            records = []
            for path in files:
                relative = path.relative_to(dataset_dir).as_posix()
                records.append({"path": relative, "bytes": path.stat().st_size, "sha256": sha256(path.read_bytes()).hexdigest()})
            dataset = self._read_json(dataset_dir / "dataset.json")
            manifest = {"format": ARCHIVE_FORMAT, "version": FORMAT_VERSION, "exported_at_ms": int(time.time() * 1000),
                        "dataset": dataset, "episodes": stats["episodes"], "totals": stats["totals"], "files": records}
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as bundle:
                for path in files:
                    bundle.write(path, path.relative_to(dataset_dir).as_posix())
                bundle.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))
                bundle.writestr("checksums.sha256", "".join(f"{item['sha256']}  {item['path']}\n" for item in records))
            return output.getvalue()

    @staticmethod
    def _safe_members(bundle):
        infos = bundle.infolist()
        if len(infos) > MAX_ARCHIVE_FILES or sum(info.file_size for info in infos) > MAX_ARCHIVE_BYTES:
            raise DomainError("ZIP 文件数量或解压大小超限", "archive_too_large")
        seen = set()
        for info in infos:
            path = PurePosixPath(info.filename)
            mode = info.external_attr >> 16
            if path.is_absolute() or ".." in path.parts or not path.parts or info.filename in seen:
                raise DomainError("ZIP 包含不安全路径", "unsafe_archive_path")
            if stat.S_ISLNK(mode):
                raise DomainError("ZIP 不允许符号链接", "unsafe_archive_link")
            seen.add(info.filename)
        return infos

    @staticmethod
    def _import_slug(slug, existing_slugs):
        if slug not in existing_slugs:
            return slug
        index = 2
        while f"{slug}-import-{index}" in existing_slugs:
            index += 1
        return f"{slug}-import-{index}"

    def import_dataset(self, archive, existing_slugs):
        with self._lock:
            staging_root = Path(tempfile.mkdtemp(prefix="act-import-", dir=self.root))
            try:
                try:
                    bundle = zipfile.ZipFile(io.BytesIO(archive))
                except zipfile.BadZipFile as error:
                    raise DomainError("ZIP 归档无效", "invalid_archive") from error
                with bundle:
                    infos = self._safe_members(bundle)
                    names = {info.filename for info in infos}
                    if not {"manifest.json", "checksums.sha256", "dataset.json"}.issubset(names):
                        raise DomainError("ZIP 缺少必需清单", "invalid_archive")
                    bundle.extractall(staging_root)
                manifest = self._read_json(staging_root / "manifest.json")
                if manifest.get("format") != ARCHIVE_FORMAT or manifest.get("version") != FORMAT_VERSION:
                    raise DomainError("ZIP 格式版本不支持", "unsupported_archive")
                for record in manifest.get("files", []):
                    relative = PurePosixPath(str(record.get("path", "")))
                    if relative.is_absolute() or ".." in relative.parts:
                        raise DomainError("ZIP 清单包含不安全路径", "unsafe_archive_path")
                    target = staging_root.joinpath(*relative.parts)
                    if not target.is_file() or target.stat().st_size != record.get("bytes") or sha256(target.read_bytes()).hexdigest() != record.get("sha256"):
                        raise DomainError(f"ZIP 文件校验失败：{relative}", "archive_checksum_failed")
                source_dataset = self._read_json(staging_root / "dataset.json")
                old_dataset_id = source_dataset["id"]
                new_dataset_id = str(uuid.uuid4())
                source_dataset["id"] = new_dataset_id
                source_dataset["slug"] = self._import_slug(source_dataset["slug"], set(existing_slugs))
                episode_id_map = {}
                episodes_root = staging_root / "episodes"
                imported_episodes = []
                if episodes_root.exists():
                    for old_dir in sorted(path for path in episodes_root.iterdir() if path.is_dir()):
                        metadata = self._read_json(old_dir / "episode.json")
                        new_episode_id = str(uuid.uuid4())
                        episode_id_map[metadata["id"]] = new_episode_id
                        metadata["id"] = new_episode_id
                        metadata["dataset_id"] = new_dataset_id
                        self._write_json(old_dir / "episode.json", metadata)
                        sample_path = old_dir / "samples.jsonl"
                        samples = self._jsonl(sample_path)
                        with sample_path.open("w", encoding="utf-8") as handle:
                            for sample in samples:
                                sample["episode_id"] = new_episode_id
                                handle.write(json.dumps(sample, ensure_ascii=False, separators=(",", ":")) + "\n")
                        new_dir = old_dir.with_name(new_episode_id)
                        old_dir.rename(new_dir)
                        imported_episodes.append(metadata)
                self._write_json(staging_root / "dataset.json", source_dataset)
                target = self._dataset_dir(new_dataset_id)
                if target.exists():
                    raise DomainError("导入数据集 ID 冲突", "dataset_exists")
                for extra in (staging_root / "manifest.json", staging_root / "checksums.sha256"):
                    extra.unlink(missing_ok=True)
                os.replace(staging_root, target)
                staging_root = None
                stats = self.dataset_stats(new_dataset_id)
                return {"dataset": source_dataset, "episodes": imported_episodes, "stats": stats,
                        "source_dataset_id": old_dataset_id, "episode_id_map": episode_id_map}
            finally:
                if staging_root:
                    shutil.rmtree(staging_root, ignore_errors=True)

    def close(self):
        with self._lock:
            for episode_id in list(self._active):
                self.abort_episode(episode_id)
