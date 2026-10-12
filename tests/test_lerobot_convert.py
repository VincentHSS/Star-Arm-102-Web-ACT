import importlib
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

class FakeLeRobotDataset:
    created = None

    def __init__(self):
        self.frames = []
        self.saved = 0
        self.finalized = False

    @classmethod
    def create(cls, **_kwargs):
        cls.created = cls()
        return cls.created

    def add_frame(self, frame):
        declared = {
            "observation.state",
            "action",
            "observation.images.wrist",
            "observation.images.world",
            "task",
        }
        extra = set(frame) - declared
        if extra:
            raise ValueError(f"Extra features: {extra}")
        self.frames.append(frame)

    def save_episode(self, parallel_encoding=False):
        self.saved += 1

    def finalize(self):
        self.finalized = True


class LeRobotConvertTests(unittest.TestCase):
    def _load_converter(self, image_factory):
        dataset_module = types.ModuleType("lerobot.datasets.lerobot_dataset")
        dataset_module.LeRobotDataset = FakeLeRobotDataset
        image_file = types.SimpleNamespace(LOAD_TRUNCATED_IMAGES=False)
        modules = {
            "lerobot": types.ModuleType("lerobot"),
            "lerobot.datasets": types.ModuleType("lerobot.datasets"),
            "lerobot.datasets.lerobot_dataset": dataset_module,
            "numpy": types.ModuleType("numpy"),
            "PIL": types.ModuleType("PIL"),
        }
        modules["numpy"].asarray = lambda value, dtype=None: value
        modules["numpy"].float32 = "float32"

        modules["PIL"].Image = types.SimpleNamespace(open=image_factory)
        modules["PIL"].ImageFile = image_file
        previous = {name: sys.modules.get(name) for name in modules}
        sys.modules.update(modules)
        try:
            sys.modules.pop("ai_service.lerobot_convert", None)
            return importlib.import_module("ai_service.lerobot_convert"), modules, previous
        except Exception:
            for name, value in previous.items():
                if value is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = value
            raise

    @staticmethod
    def _restore_modules(previous):
        sys.modules.pop("ai_service.lerobot_convert", None)
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value

    def test_conversion_lets_lerobot_generate_timestamp(self):
        class FakeImage:
            size = (2, 2)
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def load(self): return None
            def convert(self, _mode): return self
            def __array__(self): return [[[0, 0, 0]]]

        converter, _modules, previous = self._load_converter(lambda _path: FakeImage())
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                episode = root / "episode"
                for role in ("wrist", "world"):
                    frames = episode / "cameras" / role / "frames"
                    frames.mkdir(parents=True)
                    (frames / "000.jpg").write_bytes(b"fake-image")
                    (frames.parent / "index.jsonl").write_text(
                        json.dumps({"captured_at_ms": 1000, "file": "000.jpg"}) + "\n",
                        encoding="utf-8",
                    )
                (episode / "samples.jsonl").write_text(
                    json.dumps({
                        "timestamp_ms": 1000,
                        "observation_state": [0] * 7,
                        "action": [1] * 7,
                    }) + "\n",
                    encoding="utf-8",
                )
                manifest = root / "manifest.json"
                manifest.write_text(json.dumps({
                    "repo_id": "local/test",
                    "task_name": "test task",
                    "width": 2,
                    "height": 2,
                    "fps": 30,
                    "episodes": [{"path": str(episode)}],
                }), encoding="utf-8")

                converter.convert(manifest, root / "output")

            self.assertEqual(len(FakeLeRobotDataset.created.frames), 1)
            self.assertNotIn("timestamp", FakeLeRobotDataset.created.frames[0])
            self.assertEqual(FakeLeRobotDataset.created.saved, 1)
            self.assertTrue(FakeLeRobotDataset.created.finalized)
        finally:
            self._restore_modules(previous)

    def test_image_retries_only_broken_data_stream_with_truncated_mode(self):
        attempts = []

        class FakeImage:
            size = (640, 480)
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def load(self):
                attempts.append(image_file.LOAD_TRUNCATED_IMAGES)
                if not image_file.LOAD_TRUNCATED_IMAGES:
                    raise OSError("broken data stream when reading image file")
            def convert(self, _mode): return self

        converter, modules, previous = self._load_converter(lambda _path: FakeImage())
        image_file = modules["PIL"].ImageFile
        try:
            result = converter.image("frame.jpg", 640, 480, "Episode ep-1 / wrist")
            self.assertIsNotNone(result)
            self.assertEqual(attempts, [False, True])
            self.assertFalse(image_file.LOAD_TRUNCATED_IMAGES)
        finally:
            self._restore_modules(previous)

    def test_image_rejects_other_corruption_with_path_context(self):
        class BadImage:
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def load(self): raise OSError("cannot identify image file")

        converter, _modules, previous = self._load_converter(lambda _path: BadImage())
        try:
            with self.assertRaisesRegex(RuntimeError, "Episode ep-2 / world.*broken.jpg"):
                converter.image("broken.jpg", 640, 480, "Episode ep-2 / world")
        finally:
            self._restore_modules(previous)


if __name__ == "__main__":
    unittest.main()
