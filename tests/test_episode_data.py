import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from ai_service.domain import DomainError
from ai_service.episode_data import EpisodeDataStore


class EpisodeDataStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.store = EpisodeDataStore(self.root)
        self.dataset = {
            "id": "dataset-1",
            "task_name": "抓取积木",
            "slug": "block-pick",
            "capture": {"width": 640, "height": 360, "fps": 30},
            "created_at_ms": 1000,
        }
        self.episode = {"id": "episode-1", "dataset_id": "dataset-1", "status": "recording"}

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_episode_persists_real_samples_and_final_metadata(self):
        self.store.create_dataset(self.dataset)
        self.store.start_episode(self.dataset, self.episode)
        sample = {
            "episode_id": "episode-1",
            "timestamp_ms": 1200.5,
            "interval_ms": None,
            "action": [0, 1, 2, 3, 4, 5, 6],
            "observation_state": [0.1, 1.1, 2.1, 3.1, 4.1, 5.1, 6.1],
            "action_offset_ms": -2.0,
            "state_offset_ms": -1.0,
        }
        self.store.append_sample(sample)
        result = self.store.finalize_episode("episode-1", status="review", mismatch_rate=0.25)

        episode_dir = self.root / "datasets" / "dataset-1" / "episodes" / "episode-1"
        saved_sample = json.loads((episode_dir / "samples.jsonl").read_text().strip())
        metadata = json.loads((episode_dir / "episode.json").read_text())
        self.assertEqual(saved_sample, sample)
        self.assertEqual(result["samples"], 1)
        self.assertEqual(metadata["status"], "review")
        self.assertEqual(metadata["valid_frames"], 1)
        self.assertEqual(metadata["mismatch_rate"], 0.25)
        self.assertFalse((episode_dir.parent / ".episode-1.tmp").exists())

    def test_camera_frames_are_indexed_and_integrity_requires_both_real_streams(self):
        self.store.create_dataset(self.dataset)
        self.store.start_episode(self.dataset, self.episode)
        jpeg = b"\xff\xd8real-jpeg\xff\xd9"
        wrist = self.store.append_camera_frames("episode-1", "wrist", [{
            "sequence": 1, "captured_at_ms": 1300, "monotonic_ms": 20,
            "media_time": 0.03, "presented_frames": 1, "width": 640, "height": 360,
            "jpeg": jpeg,
        }])
        self.assertEqual(wrist["stored"], 1)
        with self.assertRaisesRegex(DomainError, "连续"):
            self.store.append_camera_frames("episode-1", "wrist", [{
                "sequence": 3, "captured_at_ms": 1333, "monotonic_ms": 53,
                "media_time": 0.06, "presented_frames": 2, "width": 640, "height": 360,
                "jpeg": jpeg,
            }])
        self.store.append_sample({
            "episode_id": "episode-1", "timestamp_ms": 1300, "interval_ms": None,
            "action": [0] * 7, "observation_state": [0] * 7,
            "action_offset_ms": 0, "state_offset_ms": 0,
        })
        incomplete = self.store.integrity("episode-1")
        self.assertFalse(incomplete["ok"])
        self.assertIn("world", " ".join(incomplete["errors"]))
        self.store.append_camera_frames("episode-1", "world", [{
            "sequence": 1, "captured_at_ms": 1300, "monotonic_ms": 20,
            "media_time": 0.03, "presented_frames": 1, "width": 640, "height": 360,
            "jpeg": jpeg,
        }])
        self.assertTrue(self.store.integrity("episode-1")["ok"])

    def test_camera_upload_defers_jpeg_fsync_until_episode_finalize(self):
        self.store.create_dataset(self.dataset)
        self.store.start_episode(self.dataset, self.episode)
        self.store.append_sample({
            "episode_id": "episode-1", "timestamp_ms": 1300, "interval_ms": None,
            "action": [0] * 7, "observation_state": [0] * 7,
            "action_offset_ms": 0, "state_offset_ms": 0,
        })
        jpeg = b"\xff\xd8real-jpeg\xff\xd9"
        frames = [{
            "sequence": sequence, "captured_at_ms": 1300 + sequence * 33,
            "monotonic_ms": sequence * 33, "media_time": sequence / 30,
            "presented_frames": sequence, "width": 640, "height": 360, "jpeg": jpeg,
        } for sequence in (1, 2)]

        with patch("ai_service.episode_data.os.fsync") as fsync:
            self.store.append_camera_frames("episode-1", "wrist", frames)
            self.assertEqual(fsync.call_count, 0)
            self.store.finalize_episode("episode-1", status="review", mismatch_rate=0)
            self.assertGreaterEqual(fsync.call_count, 4)

    def test_export_and_import_round_trip_rebuilds_ids_and_slug(self):
        self.store.create_dataset(self.dataset)
        self.store.start_episode(self.dataset, self.episode)
        self.store.append_sample({
            "episode_id": "episode-1", "timestamp_ms": 1300, "interval_ms": None,
            "action": [0] * 7, "observation_state": [0] * 7,
            "action_offset_ms": 0, "state_offset_ms": 0,
        })
        jpeg = b"\xff\xd8real-jpeg\xff\xd9"
        for role in ("wrist", "world"):
            self.store.append_camera_frames("episode-1", role, [{
                "sequence": 1, "captured_at_ms": 1300, "monotonic_ms": 20,
                "media_time": 0.03, "presented_frames": 1, "width": 640, "height": 360,
                "jpeg": jpeg,
            }])
        self.store.finalize_episode("episode-1", status="accepted_success", mismatch_rate=0)
        archive = self.store.export_dataset("dataset-1")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            self.assertIn("manifest.json", bundle.namelist())
            self.assertIn("checksums.sha256", bundle.namelist())
            manifest = json.loads(bundle.read("manifest.json"))
            self.assertEqual(manifest["dataset"]["slug"], "block-pick")

        imported = self.store.import_dataset(archive, existing_slugs={"block-pick"})
        self.assertNotEqual(imported["dataset"]["id"], "dataset-1")
        self.assertEqual(imported["dataset"]["slug"], "block-pick-import-2")
        self.assertNotEqual(imported["episodes"][0]["id"], "episode-1")
        self.assertTrue(imported["stats"]["integrity_ok"])

    def test_import_rejects_path_traversal_without_changing_datasets(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("../escape", "bad")
        before = sorted(path.name for path in self.store.datasets_root.iterdir())
        with self.assertRaisesRegex(DomainError, "路径"):
            self.store.import_dataset(archive.getvalue(), existing_slugs=set())
        after = sorted(path.name for path in self.store.datasets_root.iterdir())
        self.assertEqual(after, before)

    def test_abort_and_delete_remove_all_episode_files(self):
        self.store.create_dataset(self.dataset)
        self.store.start_episode(self.dataset, self.episode)
        self.store.abort_episode("episode-1")
        episodes = self.root / "datasets" / "dataset-1" / "episodes"
        self.assertFalse(any(episodes.iterdir()))

        self.store.start_episode(self.dataset, self.episode)
        self.store.finalize_episode("episode-1", status="review", mismatch_rate=0)
        self.store.delete_episode("episode-1")
        self.assertFalse((episodes / "episode-1").exists())

    def test_empty_dataset_is_not_exportable_as_a_complete_act_archive(self):
        self.store.create_dataset(self.dataset)
        stats = self.store.dataset_stats(self.dataset["id"])
        self.assertFalse(stats["integrity_ok"])
        with self.assertRaisesRegex(DomainError, "完整性检查失败"):
            self.store.export_dataset(self.dataset["id"])


if __name__ == "__main__":
    unittest.main()
