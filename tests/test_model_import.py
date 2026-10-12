import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from ai_service.domain import DomainError
from ai_service.training_jobs import TrainingJobManager, STAR_ARM_102_FL_JOINT_LIMITS


class ModelImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.manager = TrainingJobManager(self.tmp.name)
        self.model = {"id": "existing-act", "dataset_id": "remote-data", "tasks": ["抓取积木"],
                      "camera_contract": {"width": 640, "height": 480, "fps": 30},
                      "joint_limits": STAR_ARM_102_FL_JOINT_LIMITS,
                      "observation_features": ["observation.state", "observation.images.wrist", "observation.images.world"]}

    def tearDown(self):
        self.manager.close()
        self.tmp.cleanup()

    def archive(self, prefix="", missing=None, extra=None, config=None):
        files = {"model.json": json.dumps(self.model, ensure_ascii=False).encode(),
                 "pretrained_model/config.json": json.dumps(config or {"type": "act"}).encode(),
                 "pretrained_model/model.safetensors": b"mock weights",
                 "pretrained_model/policy_preprocessor.json": b"{}",
                 "pretrained_model/policy_postprocessor.json": b"{}"}
        files.pop(missing, None)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in files.items():
                z.writestr(prefix + name, data)
            for name, data in (extra or {}).items():
                z.writestr(name, data)
        return buffer.getvalue()

    def test_import_without_local_dataset_is_ready_and_paths_are_local(self):
        self.model["checkpoint_path"] = "/other-machine/model"
        self.model["blockers"] = ["stale diagnostic"]
        imported = self.manager.import_model(self.archive())
        self.assertTrue(imported["execution_ready"])
        self.assertEqual(imported["tasks"], ["抓取积木"])
        self.assertTrue(Path(imported["checkpoint_path"]).is_dir())
        self.assertEqual(len(self.manager.list_models()), 1)
        self.assertFalse((Path(self.tmp.name) / "datasets").exists())

    def test_archive_with_outer_folder_is_normalized(self):
        imported = self.manager.import_model(self.archive(prefix="exported-model/"))
        self.assertTrue(imported["execution_ready"])
        self.assertTrue((Path(imported["path"]) / "pretrained_model" / "config.json").is_file())
        self.assertFalse((Path(imported["path"]) / "exported-model").exists())

    def test_duplicate_id_does_not_overwrite_existing_model(self):
        one = self.manager.import_model(self.archive())
        two = self.manager.import_model(self.archive())
        self.assertEqual(two["id"], one["id"] + "-1")
        self.assertEqual(len(self.manager.list_models()), 2)

    def test_exported_imported_model_can_be_imported_on_another_machine(self):
        model = self.manager.import_model(self.archive())
        archive, _ = self.manager.export_model(model["id"])
        with tempfile.TemporaryDirectory() as other:
            manager = TrainingJobManager(other)
            imported = manager.import_model(archive)
            self.assertTrue(imported["execution_ready"])
            self.assertTrue(imported["checkpoint_path"].startswith(str(Path(other).resolve())))

    def test_missing_processors_rejected_and_no_partial_model_remains(self):
        with self.assertRaisesRegex(DomainError, "缺少实机推理文件"):
            self.manager.import_model(self.archive(missing="pretrained_model/policy_postprocessor.json"))
        self.assertFalse(list(self.manager.models_root.iterdir()))

    def test_missing_execution_metadata_is_rejected(self):
        for key in ("tasks", "camera_contract", "joint_limits", "observation_features"):
            original = self.model.pop(key)
            with self.assertRaises(DomainError):
                self.manager.import_model(self.archive())
            self.model[key] = original
        self.assertFalse(list(self.manager.models_root.iterdir()))

    def test_wrong_policy_and_invalid_fps_are_rejected(self):
        with self.assertRaisesRegex(DomainError, "只支持 ACT"):
            self.manager.import_model(self.archive(config={"type": "diffusion"}))
        self.model["camera_contract"]["fps"] = 0
        with self.assertRaisesRegex(DomainError, "采样频率"):
            self.manager.import_model(self.archive())

    def test_unsafe_paths_and_ids_cannot_escape_model_storage(self):
        for name in ("../escaped.txt", "/escaped.txt", "C:/escaped.txt"):
            with self.assertRaisesRegex(DomainError, "不安全"):
                self.manager.import_model(self.archive(extra={name: b"bad"}))
        backslash_archive = self.archive(extra={"folder/escaped.txt": b"bad"}).replace(b"folder/escaped.txt", b"folder\\escaped.txt")
        with self.assertRaisesRegex(DomainError, "不安全"):
            self.manager.import_model(backslash_archive)
        self.model["id"] = "../escaped"
        with self.assertRaisesRegex(DomainError, "标识"):
            self.manager.import_model(self.archive())
        self.assertFalse(list(self.manager.models_root.iterdir()))

    def test_limits_outside_robot_range_are_rejected(self):
        self.model["joint_limits"] = [[-999, 999]] * 7
        with self.assertRaisesRegex(DomainError, "支持范围"):
            self.manager.import_model(self.archive())

    def test_missing_processor_tensor_is_rejected(self):
        buffer = io.BytesIO(self.archive())
        with zipfile.ZipFile(buffer, "a") as z:
            # Rebuild instead of duplicating the processor member.
            files = {info.filename: z.read(info) for info in z.infolist()}
        files["pretrained_model/policy_preprocessor.json"] = json.dumps({"steps": [{"state_file": "normalizer.safetensors"}]}).encode()
        rebuilt = io.BytesIO()
        with zipfile.ZipFile(rebuilt, "w") as z:
            for name, data in files.items():
                z.writestr(name, data)
        with self.assertRaisesRegex(DomainError, "处理器参数"):
            self.manager.import_model(rebuilt.getvalue())

    def test_invalid_zip_is_a_clear_user_error(self):
        with self.assertRaises(DomainError):
            self.manager.import_model(b"not a zip")

    def test_checkpoint_dimension_mismatch_is_rejected(self):
        with self.assertRaisesRegex(DomainError, "七个关节"):
            self.manager.import_model(self.archive(config={"type": "act", "output_features": {"action": {"shape": [6]}}}))
        with self.assertRaisesRegex(DomainError, "双相机尺寸"):
            self.manager.import_model(self.archive(config={"type": "act", "input_features": {"observation.state": {"shape": [7]}}}))
