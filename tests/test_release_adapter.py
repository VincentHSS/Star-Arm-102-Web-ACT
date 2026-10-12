import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_service.domain import DomainError
from ai_service.release_adapter import ReleaseCoordinates, validate_calibration, install_calibration, COORDINATES
from ai_service.training_jobs import TrainingJobManager


def calibration():
    return {name: {"id": i, "drive_mode": i % 2, "homing_offset": 0,
                   "range_min": 1024, "range_max": 3072}
            for i, name in enumerate([f"Motor_{i}" for i in range(6)] + ["gripper"])}


class ReleaseAdapterTests(unittest.TestCase):
    def test_normalization_matches_legacy_starai_integer_counts(self):
        adapter = ReleaseCoordinates(calibration())
        self.assertEqual(adapter.observation([0] * 7), [0] * 6 + [50])
        self.assertEqual(adapter.action([100] * 7), [90, -90, 90, -90, 90, -90, 90])
        self.assertEqual(adapter.action([-100] * 7), [-90, 90, -90, 90, -90, 90, -90])
        raw = int(int(12.9 + 180) / 360 * 4096)
        self.assertAlmostEqual(adapter.observation([12.9] * 7)[0], (raw - 1024) / 2048 * 200 - 100)

    def test_rejects_wrong_ids_ranges_offsets_and_missing_motors(self):
        for field, value in (("id", 7), ("range_max", 1024), ("range_min", -1),
                             ("drive_mode", 2), ("homing_offset", 1)):
            data = calibration()
            data["Motor_0"][field] = value
            with self.assertRaises(DomainError):
                validate_calibration(data)
        data = calibration()
        del data["gripper"]
        with self.assertRaises(DomainError):
            validate_calibration(data)

    def archive(self, extra=None):
        files = {"pretrained_model/config.json": json.dumps({"type": "act", "input_features": {
            "observation.state": {"shape": [7]}, "observation.images.up": {"shape": [3, 480, 640]},
            "observation.images.front": {"shape": [3, 480, 640]}}, "output_features": {"action": {"shape": [7]}}}).encode(),
            "pretrained_model/model.safetensors": b"mock release weights",
            "pretrained_model/policy_preprocessor.json": b"{}", "pretrained_model/policy_postprocessor.json": b"{}"}
        files.update(extra or {})
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            for name, content in files.items():
                info = tarfile.TarInfo(name)
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
        return buffer.getvalue()

    def test_raw_targz_import_then_calibration_and_export_round_trip(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            manager = TrainingJobManager(d)
            with patch("ai_service.release_adapter.RELEASE_WEIGHT_SHA256", hashlib.sha256(b"mock release weights").hexdigest()):
                imported = manager.import_model(self.archive())
            self.assertFalse(imported["execution_ready"])
            self.assertEqual(imported["camera_feature_map"], {"wrist": "up", "world": "front"})
            self.assertEqual(imported["tasks"], ["将方块放入中心"])
            self.assertEqual(imported["coordinate_contract"], COORDINATES)
            ready = install_calibration(manager, imported["id"], calibration())
            self.assertTrue(ready["execution_ready"])
            archive, _ = manager.export_model(ready["id"])
            with tempfile.TemporaryDirectory() as other:
                self.assertTrue(TrainingJobManager(other).import_model(archive)["execution_ready"])

    def test_unknown_raw_model_and_tar_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            manager = TrainingJobManager(d)
            for archive in (self.archive(), self.archive({"../outside": b"bad"})):
                with self.assertRaises(DomainError):
                    manager.import_model(archive)
            self.assertFalse(list(manager.models_root.iterdir()))

    def test_tar_links_rejected(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            info = tarfile.TarInfo("calibration.json")
            info.type = tarfile.SYMTYPE
            info.linkname = "../outside"
            tar.addfile(info)
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(DomainError):
                TrainingJobManager(d).import_model(buffer.getvalue())

    def test_worker_maps_cameras_and_converts_after_saved_postprocessor(self):
        from ai_service.act_policy_worker import LocalActPolicy
        from tests.test_act_policy_worker import Policy, Chunk, BatchTensor
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            checkpoint = root / "pretrained_model"
            checkpoint.mkdir()
            for name in ("config.json", "model.safetensors", "policy_preprocessor.json", "policy_postprocessor.json"):
                (checkpoint / name).write_text("{}")
            (root / "model.json").write_text(json.dumps({"camera_feature_map": {"wrist": "up", "world": "front"}, "coordinate_contract": COORDINATES}))
            (root / "calibration.json").write_text(json.dumps(calibration()))
            policy = Policy()
            observed = []
            policy.predict_action_chunk = lambda batch: observed.append(batch) or Chunk([[0] * 7, [1] * 7])
            # Saved postprocessor produces normalized motor coordinates; physical
            # coordinate conversion must happen afterwards, not on network output.
            adapter = LocalActPolicy(checkpoint, policy=policy, preprocessor=lambda x: x,
                postprocessor=lambda x: BatchTensor([[100 * v for v in row] for row in x.values]),
                observation_preparer=lambda obs, *args: obs, image_loader=lambda path: path,
                state_factory=lambda values: values)
            actions = adapter.predict_chunk([0] * 7, "overhead.jpg", "frontal.jpg", "task")
            self.assertEqual(observed[0]["observation.state"], [0] * 6 + [50])
            self.assertEqual(observed[0]["observation.images.up"], "overhead.jpg")
            self.assertEqual(observed[0]["observation.images.front"], "frontal.jpg")
            self.assertEqual(actions[1], [90, -90, 90, -90, 90, -90, 90])


if __name__ == "__main__":
    unittest.main()
