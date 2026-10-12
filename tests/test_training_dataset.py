import json
import os
import tempfile
import unittest
from pathlib import Path

from ai_service.domain import DomainError
from ai_service.episode_data import EpisodeDataStore
from ai_service.training_dataset import TrainingDatasetAdapter


JPEG = b"\xff\xd8real-jpeg\xff\xd9"


class Result:
    returncode = 0
    stdout = ""
    stderr = ""


class TrainingDatasetAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd())
        self.root = Path(self.tmp.name)
        self.store = EpisodeDataStore(self.root)
        self.dataset = {"id": "dataset-1", "task_name": "抓取积木", "slug": "block-pick",
                        "capture": {"width": 640, "height": 480, "fps": 30}}
        self.store.create_dataset(self.dataset)
        self.environment = {"status": "ready", "python": "/managed/bin/python",
                            "fingerprint": "env-1"}

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def episode(self, episode_id, status):
        episode = {"id": episode_id, "dataset_id": "dataset-1", "status": "recording"}
        self.store.start_episode(self.dataset, episode)
        self.store.append_sample({"episode_id": episode_id, "timestamp_ms": 1300,
                                  "action": [0, 1, 2, 3, 4, 5, 6],
                                  "observation_state": [0.1, 1.1, 2.1, 3.1, 4.1, 5.1, 6.1]})
        for role in ("wrist", "world"):
            self.store.append_camera_frames(episode_id, role, [{
                "sequence": 1, "captured_at_ms": 1300, "monotonic_ms": 20,
                "media_time": 0.03, "presented_frames": 1, "width": 640, "height": 480,
                "jpeg": JPEG,
            }])
        self.store.finalize_episode(episode_id, status=status)

    def test_rejects_dataset_without_accepted_success_episode(self):
        self.episode("episode-review", "review")
        adapter = TrainingDatasetAdapter(self.root, self.store, runner=lambda *_a, **_k: Result())
        with self.assertRaisesRegex(DomainError, "没有审核通过"):
            adapter.prepare("dataset-1", self.environment)

    def test_converts_only_success_episodes_and_preserves_source(self):
        self.episode("episode-success", "accepted_success")
        self.episode("episode-failure", "accepted_failure")
        source = self.root / "datasets" / "dataset-1" / "episodes" / "episode-success" / "samples.jsonl"
        before = source.read_bytes()
        commands = []

        def runner(command, **_kwargs):
            commands.append(command)
            output = Path(command[command.index("--output") + 1])
            (output / "meta").mkdir(parents=True)
            (output / "meta" / "info.json").write_text("{}")
            return Result()

        adapter = TrainingDatasetAdapter(self.root, self.store, runner=runner)
        prepared = adapter.prepare("dataset-1", self.environment)
        self.assertEqual(prepared["episodes"], 1)
        self.assertEqual(prepared["samples"], 1)
        self.assertTrue((Path(prepared["path"]) / "meta" / "info.json").is_file())
        self.assertEqual(source.read_bytes(), before)
        self.assertEqual(commands[0][0], self.environment["python"])
        self.assertNotIsInstance(commands[0], str)
        self.assertEqual(prepared["tasks"], ["抓取积木"])
        self.assertEqual(prepared["camera_contract"], {
            "width": 640, "height": 480, "fps": 30,
            "features": ["observation.images.wrist", "observation.images.world"],
        })
        self.assertEqual(prepared["observation_features"], [
            "observation.state", "observation.images.wrist", "observation.images.world",
        ])

    def test_prepare_returns_absolute_path_when_data_root_is_relative(self):
        self.episode("episode-success", "accepted_success")
        previous = Path.cwd()
        os.chdir(self.root.parent)
        try:
            relative_root = Path(self.root.name)

            def runner(command, **_kwargs):
                output = Path(command[command.index("--output") + 1])
                (output / "meta").mkdir(parents=True)
                (output / "meta" / "info.json").write_text("{}")
                return Result()

            adapter = TrainingDatasetAdapter(relative_root, self.store, runner=runner)
            prepared = adapter.prepare("dataset-1", self.environment)
        finally:
            os.chdir(previous)

        self.assertTrue(Path(prepared["path"]).is_absolute())
        self.assertTrue((Path(prepared["path"]) / "meta" / "info.json").is_file())

    def test_cached_legacy_relative_path_is_migrated_to_canonical_dataset_path(self):
        self.episode("episode-success", "accepted_success")

        def runner(command, **_kwargs):
            output = Path(command[command.index("--output") + 1])
            (output / "meta").mkdir(parents=True)
            (output / "meta" / "info.json").write_text("{}")
            return Result()

        adapter = TrainingDatasetAdapter(self.root, self.store, runner=runner)
        prepared = adapter.prepare("dataset-1", self.environment)
        marker = Path(prepared["path"]).parent / "training-dataset.json"
        legacy = json.loads(marker.read_text())
        legacy["path"] = os.path.relpath(legacy["path"], Path.cwd())
        marker.write_text(json.dumps(legacy), encoding="utf-8")

        migrated = adapter.prepare("dataset-1", self.environment)

        self.assertEqual(Path(migrated["path"]), Path(prepared["path"]).resolve())
        self.assertEqual(json.loads(marker.read_text())["path"], migrated["path"])

    def test_environment_must_be_ready(self):
        adapter = TrainingDatasetAdapter(self.root, self.store)
        with self.assertRaisesRegex(DomainError, "尚未就绪"):
            adapter.prepare("dataset-1", {"status": "failed"})


if __name__ == "__main__":
    unittest.main()
