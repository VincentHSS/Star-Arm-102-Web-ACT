import argparse
import bisect
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile
from lerobot.datasets.lerobot_dataset import LeRobotDataset


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def timestamped_records(records, field):
    records = sorted(records, key=lambda record: float(record[field]))
    timestamps = [float(record[field]) for record in records]
    if not timestamps or not all(math.isfinite(value) for value in timestamps):
        raise ValueError(f"缺少有效时间戳：{field}")
    return records, timestamps


def nearest_record(records, timestamps, timestamp_ms):
    index = bisect.bisect_left(timestamps, timestamp_ms)
    candidates = [value for value in (index - 1, index) if 0 <= value < len(records)]
    return records[min(candidates, key=lambda value: abs(timestamps[value] - timestamp_ms))]


def aligned_frames(samples, camera_indices, fps, episode_id):
    samples, joint_times = timestamped_records(samples, "timestamp_ms")
    cameras = {role: timestamped_records(records, "captured_at_ms") for role, records in camera_indices.items()}
    streams = [joint_times, *(times for _, times in cameras.values())]
    start_ms = max(times[0] for times in streams)
    end_ms = min(times[-1] for times in streams)
    if end_ms < start_ms:
        raise ValueError(f"Episode {episode_id} 的关节记录和双相机没有共同时间区间")

    # LeRobot assigns each frame an implicit index / fps timestamp. Select one
    # original joint/action pair and two images for each tick of that timeline.
    for index in range(math.floor((end_ms - start_ms) * fps / 1000) + 1):
        timestamp_ms = start_ms + index * 1000 / fps
        sample = nearest_record(samples, joint_times, timestamp_ms)
        frames = {role: nearest_record(records, times, timestamp_ms) for role, (records, times) in cameras.items()}
        yield sample, frames


def image(path, expected_width, expected_height, context):
    path = Path(path)
    def read():
        with Image.open(path) as source:
            source.load()
            converted = source.convert("RGB")
            actual_width, actual_height = converted.size
            if (actual_width, actual_height) != (expected_width, expected_height):
                raise ValueError(
                    f"图像尺寸为 {actual_width}×{actual_height}，要求 {expected_width}×{expected_height}"
                )
            return np.asarray(converted)
    try:
        return read()
    except OSError as error:
        if "broken data stream" not in str(error).lower():
            raise RuntimeError(f"图像读取失败：{context}：{path}：{error}") from error
        previous = ImageFile.LOAD_TRUNCATED_IMAGES
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try:
            return read()
        except Exception as retry_error:
            raise RuntimeError(f"图像读取失败：{context}：{path}：{retry_error}") from retry_error
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = previous
    except Exception as error:
        raise RuntimeError(f"图像读取失败：{context}：{path}：{error}") from error


def convert(manifest_path, output):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    features = {
        "observation.state": {"dtype": "float32", "shape": (7,), "names": [f"J{i}" for i in range(1, 8)]},
        "action": {"dtype": "float32", "shape": (7,), "names": [f"J{i}" for i in range(1, 8)]},
        "observation.images.wrist": {"dtype": "image", "shape": (manifest["height"], manifest["width"], 3), "names": ["height", "width", "channel"]},
        "observation.images.world": {"dtype": "image", "shape": (manifest["height"], manifest["width"], 3), "names": ["height", "width", "channel"]},
    }
    dataset = LeRobotDataset.create(repo_id=manifest["repo_id"], root=output, fps=manifest["fps"],
                                    robot_type="star_arm_102", features=features, use_videos=False)
    for episode in manifest["episodes"]:
        root = Path(episode["path"])
        episode_id = episode.get("id", root.name)
        samples = read_jsonl(root / "samples.jsonl")
        indices = {role: read_jsonl(root / "cameras" / role / "index.jsonl") for role in ("wrist", "world")}
        for sample, frames in aligned_frames(samples, indices, manifest["fps"], episode_id):
            dataset.add_frame({
                "observation.state": np.asarray(sample["observation_state"], dtype=np.float32),
                "action": np.asarray(sample["action"], dtype=np.float32),
                "observation.images.wrist": image(
                    root / "cameras" / "wrist" / "frames" / frames["wrist"]["file"],
                    manifest["width"], manifest["height"], f"Episode {episode_id} / wrist"
                ),
                "observation.images.world": image(
                    root / "cameras" / "world" / "frames" / frames["world"]["file"],
                    manifest["width"], manifest["height"], f"Episode {episode_id} / world"
                ),
                "task": manifest["task_name"],
            })
        dataset.save_episode(parallel_encoding=False)
    dataset.finalize()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    convert(args.manifest, args.output)


if __name__ == "__main__":
    main()
