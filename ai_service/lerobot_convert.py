import argparse
import bisect
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile
from lerobot.datasets.lerobot_dataset import LeRobotDataset


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def nearest_frame(records, timestamp_ms):
    timestamps = [float(record["captured_at_ms"]) for record in records]
    index = bisect.bisect_left(timestamps, float(timestamp_ms))
    candidates = [value for value in (index - 1, index) if 0 <= value < len(records)]
    return records[min(candidates, key=lambda value: abs(timestamps[value] - float(timestamp_ms)))]


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
        samples = read_jsonl(root / "samples.jsonl")
        indices = {role: read_jsonl(root / "cameras" / role / "index.jsonl") for role in ("wrist", "world")}
        for sample in samples:
            timestamp = sample["timestamp_ms"]
            frames = {role: nearest_frame(indices[role], timestamp) for role in indices}
            episode_id = episode.get("id", root.name)
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
