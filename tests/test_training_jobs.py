import json
import tempfile
import time
import unittest
from pathlib import Path

from ai_service.domain import DomainError
from ai_service.training_jobs import TrainingJobManager


class FakeProcess:
    def __init__(self, returncode=None, pid=4321):
        self.returncode = returncode
        self.pid = pid
        self.signals = []

    def poll(self):
        return self.returncode

    def send_signal(self, signal):
        self.signals.append(signal)
        self.returncode = 130

    def terminate(self):
        self.signals.append("terminate")
        self.returncode = -15

    def wait(self, timeout=None):
        if self.returncode is None:
            raise TimeoutError()
        return self.returncode


class TrainingJobManagerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.process = FakeProcess()
        self.commands = []

        def launch(command, **kwargs):
            self.commands.append((command, kwargs))
            return self.process

        self.manager = TrainingJobManager(self.root, launcher=launch)
        self.environment = {
            "status": "ready",
            "fingerprint": "env-abc",
            "executable": str((self.root / "runtime" / "bin" / "lerobot-train").resolve()),
            "backend": "cuda",
            "training_profile": {"batch_size": 8, "mixed_precision": "bf16", "num_workers": 4},
        }
        self.dataset = {
            "dataset_id": "dataset-1", "path": "/data/training/dataset-1", "fingerprint": "data-abc",
            "tasks": ["抓取积木"],
            "camera_contract": {"width": 640, "height": 480, "fps": 30,
                                "features": ["observation.images.wrist", "observation.images.world"]},
            "observation_features": ["observation.state", "observation.images.wrist", "observation.images.world"],
        }

    def tearDown(self):
        self.manager.close()
        self.tmp.cleanup()

    def test_create_persists_job_and_uses_argv_without_shell(self):
        job = self.manager.create(self.environment, self.dataset, {"steps": 1000, "save_freq": 100})

        self.assertEqual(job["status"], "running")
        self.assertEqual(job["environment_fingerprint"], "env-abc")
        command, kwargs = self.commands[0]
        self.assertEqual(command[0], self.environment["executable"])
        self.assertIn("--policy.type=act", command)
        self.assertFalse(kwargs.get("shell", False))
        saved = json.loads((self.root / "training" / "jobs" / job["id"] / "job.json").read_text())
        self.assertEqual(saved["pid"], 4321)

    def test_create_configures_local_policy_without_hub_upload_and_binds_backend_device(self):
        job = self.manager.create(self.environment, self.dataset, {})

        command = self.commands[0][0]
        self.assertIn("--policy.push_to_hub=false", command)
        self.assertNotIn("--policy.repo_id", " ".join(command))
        self.assertIn("--policy.device=cuda", command)
        self.assertEqual(job["backend"], "cuda")

    def test_create_canonicalizes_relative_dataset_path_before_changing_child_cwd(self):
        relative = Path("data/training/datasets/dataset-1/fingerprint/lerobot")
        job = self.manager.create(self.environment, {**self.dataset, "path": str(relative)}, {})

        expected = str(relative.resolve())
        self.assertEqual(job["dataset_path"], expected)
        self.assertIn(f"--dataset.root={expected}", self.commands[0][0])
        self.assertNotEqual(self.commands[0][1]["cwd"], Path(expected).parent)

    def test_create_leaves_new_output_directory_for_lerobot_to_create(self):
        output_exists_at_launch = []

        def launch(command, **_kwargs):
            output_arg = next(item for item in command if item.startswith("--output_dir="))
            output_exists_at_launch.append(Path(output_arg.split("=", 1)[1]).exists())
            return self.process

        manager = TrainingJobManager(self.root, launcher=launch)
        try:
            job = manager.create(self.environment, self.dataset, {})

            self.assertEqual(job["status"], "running")
            self.assertEqual(output_exists_at_launch, [False])
        finally:
            manager.close()

    def test_rejects_unready_environment_and_parallel_job(self):
        with self.assertRaisesRegex(DomainError, "训练环境尚未就绪"):
            self.manager.create({**self.environment, "status": "failed"}, self.dataset, {})
        self.manager.create(self.environment, self.dataset, {})
        with self.assertRaisesRegex(DomainError, "已有训练任务"):
            self.manager.create(self.environment, self.dataset, {})

    def test_create_normalizes_legacy_relative_entrypoint_before_launch(self):
        environment = {**self.environment, "executable": "data/training/environment/runtime/bin/lerobot-train"}

        self.manager.create(environment, self.dataset, {})

        expected = self.root / "training" / "environment" / "runtime" / "bin" / "lerobot-train"
        self.assertEqual(self.commands[0][0][0], str(expected))

    def test_create_runs_console_script_through_environment_python_when_script_is_not_executable(self):
        runtime_bin = self.root / "training" / "environment" / "runtime" / "bin"
        runtime_bin.mkdir(parents=True)
        python = runtime_bin / "python"
        python.write_text("python")
        executable = runtime_bin / "lerobot-train"
        executable.write_text(f"#!{python}\nprint('train')\n")
        executable.chmod(0o644)
        environment = {**self.environment, "executable": str(executable), "python": str(python)}

        self.manager.create(environment, self.dataset, {})

        command = self.commands[0][0]
        self.assertEqual(command[:2], [str(python), str(executable)])

    def test_start_failure_reports_missing_entrypoint_path(self):
        missing = "/missing/runtime/bin/lerobot-train"

        def launch(_command, **_kwargs):
            raise FileNotFoundError(2, "No such file or directory", missing)

        manager = TrainingJobManager(self.root, launcher=launch)
        environment = {**self.environment, "executable": missing}

        with self.assertRaisesRegex(DomainError, missing):
            manager.create(environment, self.dataset, {})

        failed = manager.list()[0]
        self.assertEqual(failed["status"], "failed")
        self.assertIn(missing, failed["error"])

    def test_refresh_requires_checkpoint_before_success(self):
        job = self.manager.create(self.environment, self.dataset, {})
        self.process.returncode = 0
        refreshed = self.manager.get(job["id"])
        self.assertEqual(refreshed["status"], "failed")
        self.assertIn("checkpoint", refreshed["error"])

    def test_refresh_marks_success_when_checkpoint_exists(self):
        job = self.manager.create(self.environment, self.dataset, {})
        checkpoint = Path(job["output_dir"]) / "checkpoints" / "000100" / "pretrained_model"
        checkpoint.mkdir(parents=True)
        self.process.returncode = 0
        refreshed = self.manager.get(job["id"])
        self.assertEqual(refreshed["status"], "completed")
        self.assertEqual(refreshed["checkpoint"], str(checkpoint.parent))

    def test_stop_and_resume_bind_environment_and_dataset_fingerprints(self):
        job = self.manager.create(self.environment, self.dataset, {})
        stopped = self.manager.stop(job["id"])
        self.assertEqual(stopped["status"], "stopped")
        checkpoint = Path(job["output_dir"]) / "checkpoints" / "000100"
        checkpoint.mkdir(parents=True)
        (checkpoint / "pretrained_model").mkdir()
        stopped["checkpoint"] = str(checkpoint)
        self.manager._save(stopped)

        with self.assertRaisesRegex(DomainError, "训练环境已变化"):
            self.manager.resume(job["id"], {**self.environment, "fingerprint": "new"}, self.dataset)
        resumed = self.manager.resume(job["id"], self.environment, self.dataset)
        self.assertEqual(resumed["status"], "running")
        self.assertIn(f"--config_path={checkpoint / 'pretrained_model' / 'train_config.json'}", self.commands[-1][0])
        self.assertIn("--resume=true", self.commands[-1][0])

    def test_new_manager_can_query_persisted_stopped_job(self):
        job = self.manager.create(self.environment, self.dataset, {})
        self.manager.stop(job["id"])
        restored = TrainingJobManager(self.root, launcher=lambda *_args, **_kwargs: None)
        self.assertEqual(restored.get(job["id"])["status"], "stopped")

    def test_new_manager_marks_orphaned_running_job_interrupted(self):
        job = self.manager.create(self.environment, self.dataset, {})
        restored = TrainingJobManager(self.root, launcher=lambda *_args, **_kwargs: None)
        snapshot = restored.get(job["id"])
        self.assertEqual(snapshot["status"], "interrupted")
        self.assertIn("服务重启", snapshot["error"])

    def test_close_requests_safe_stop_for_owned_running_jobs(self):
        job = self.manager.create(self.environment, self.dataset, {})
        self.manager.close()
        saved = json.loads((self.root / "training" / "jobs" / job["id"] / "job.json").read_text())
        self.assertEqual(saved["status"], "stopped")
        self.assertTrue(self.process.signals)

    def test_get_parses_latest_lerobot_step_and_loss_from_log(self):
        job = self.manager.create(self.environment, self.dataset, {})
        log = self.root / "training" / "jobs" / job["id"] / "train.log"
        log.write_text("INFO 2026-08-10 steps:100 smpl:800 loss:1.250 grdn:0.1\n"
                       "INFO 2026-08-10 steps:200 smpl:1600 loss:0.875 grdn:0.1\n", encoding="utf-8")

        refreshed = self.manager.get(job["id"])

        self.assertEqual(refreshed["step"], 200)
        self.assertEqual(refreshed["loss"], 0.875)

    def test_get_exposes_real_progress_metrics_log_tail_elapsed_time_and_checkpoints(self):
        job = self.manager.create(self.environment, self.dataset, {"steps": 1000, "save_freq": 100})
        log = self.root / "training" / "jobs" / job["id"] / "train.log"
        log.write_text(
            "loading dataset\n"
            "INFO steps:100 smpl:800 loss:1.250 grdn:0.1\n"
            "INFO steps:250 smpl:2000 loss:0.875 grdn:0.1\n",
            encoding="utf-8",
        )
        first = Path(job["output_dir"]) / "checkpoints" / "000100" / "pretrained_model"
        second = Path(job["output_dir"]) / "checkpoints" / "000250" / "pretrained_model"
        first.mkdir(parents=True)
        second.mkdir(parents=True)
        job["started_at_ms"] = int(time.time() * 1000) - 5000
        self.manager._save(job)

        refreshed = self.manager.get(job["id"])

        self.assertEqual(refreshed["progress_percent"], 25.0)
        self.assertGreaterEqual(refreshed["elapsed_ms"], 5000)
        self.assertEqual(refreshed["metrics"], [{"step": 100, "loss": 1.25}, {"step": 250, "loss": 0.875}])
        self.assertIn("loading dataset", refreshed["log_tail"])
        self.assertEqual([item["step"] for item in refreshed["checkpoints"]], [100, 250])

    def test_progress_step_uses_real_lerobot_training_counter_between_loss_summaries(self):
        job = self.manager.create(self.environment, self.dataset, {"steps": 1000, "save_freq": 100})
        log = self.root / "training" / "jobs" / job["id"] / "train.log"
        log.write_text(
            "steps:100 smpl:2000 loss:0.125 grad_norm:1.0 lr:1e-5\n"
            "Training: 14%|#3        | 137/1000 [02:17<14:23, 1.29it/s]\r",
            encoding="utf-8",
        )

        snapshot = self.manager.get(job["id"])

        self.assertEqual(snapshot["step"], 137)
        self.assertEqual(snapshot["loss"], 0.125)
        self.assertEqual(snapshot["progress_percent"], 13.7)
        self.assertEqual(snapshot["step_rate"], 1.29)
        self.assertEqual(snapshot["metrics"], [{"step": 100, "loss": 0.125}])

    def test_progress_converts_real_seconds_per_iteration_to_steps_per_second(self):
        job = self.manager.create(self.environment, self.dataset, {"steps": 1000, "save_freq": 100})
        log = self.root / "training" / "jobs" / job["id"] / "train.log"
        log.write_text("Training: 2%| | 20/1000 [00:40<32:40, 2.00s/it]\r", encoding="utf-8")

        snapshot = self.manager.get(job["id"])

        self.assertEqual(snapshot["step"], 20)
        self.assertEqual(snapshot["step_rate"], 0.5)

    def test_progress_uses_latest_speed_from_carriage_return_tqdm_updates(self):
        job = self.manager.create(self.environment, self.dataset, {"steps": 1000, "save_freq": 100})
        log = self.root / "training" / "jobs" / job["id"] / "train.log"
        log.write_text(
            "Training: 10%| | 101/1000 [01:20<10:00, 1.21it/s]\r"
            "Training: 10%| | 102/1000 [01:21<09:59, 1.28it/s]\r",
            encoding="utf-8",
        )

        snapshot = self.manager.get(job["id"])

        self.assertEqual(snapshot["step"], 102)
        self.assertEqual(snapshot["step_rate"], 1.28)

    def test_completed_job_registers_checkpoint_as_dataset_model(self):
        job = self.manager.create(self.environment, self.dataset, {})
        checkpoint = Path(job["output_dir"]) / "checkpoints" / "000100" / "pretrained_model"
        checkpoint.mkdir(parents=True)
        (checkpoint / "model.safetensors").write_bytes(b"weights")
        for name in ("config.json", "policy_preprocessor.json", "policy_postprocessor.json"):
            (checkpoint / name).write_text("{}", encoding="utf-8")
        self.process.returncode = 0
        completed = self.manager.get(job["id"])

        self.assertEqual(completed["status"], "completed")
        self.assertIsNotNone(completed["model_id"])
        models = self.manager.list_models("dataset-1")
        self.assertEqual(len(models), 1)
        model = models[0]
        self.assertEqual(model["id"], completed["model_id"])
        self.assertEqual(self.manager.get(job["id"])["model_id"], completed["model_id"])
        self.assertEqual(len(self.manager.list_models("dataset-1")), 1)

        self.assertEqual(model["dataset_id"], "dataset-1")
        self.assertEqual(model["job_id"], job["id"])
        self.assertTrue(model["execution_ready"])
        self.assertEqual(model["tasks"], ["抓取积木"])
        self.assertEqual(len(model["joint_limits"]), 7)
        self.assertEqual(model["joint_limits"][6], [0.0, 90.0])
        self.assertEqual(model["checkpoint_path"], str(Path(model["path"]) / "pretrained_model"))
        self.assertTrue((Path(model["path"]) / "pretrained_model" / "model.safetensors").is_file())
        self.assertEqual(self.manager.list_models("dataset-1")[0]["id"], model["id"])

    def test_export_and_import_model_carries_execution_metadata_across_machines(self):
        job = self.manager.create(self.environment, self.dataset, {})
        checkpoint = Path(job["output_dir"]) / "checkpoints" / "000100" / "pretrained_model"
        checkpoint.mkdir(parents=True)
        (checkpoint / "model.safetensors").write_bytes(b"weights")
        for name in ("config.json", "policy_preprocessor.json", "policy_postprocessor.json"):
            (checkpoint / name).write_text("{}", encoding="utf-8")
        self.process.returncode = 0
        completed = self.manager.get(job["id"])
        model_id = completed["model_id"]

        archive, name = self.manager.export_model(model_id)
        self.assertTrue(archive)
        self.assertEqual(name, model_id)

        # Simulate a different machine: a fresh data root with no source dataset.
        with tempfile.TemporaryDirectory() as other:
            other_manager = TrainingJobManager(
                Path(other), launcher=lambda *args, **kwargs: self.process)
            try:
                imported = other_manager.import_model(archive)
                self.assertTrue(imported["execution_ready"])
                self.assertEqual(imported["id"], model_id)
                self.assertEqual(imported["dataset_id"], "dataset-1")
                self.assertEqual(imported["tasks"], ["抓取积木"])
                self.assertEqual(len(imported["joint_limits"]), 7)
                self.assertEqual(imported["checkpoint_path"],
                                 str(Path(imported["path"]) / "pretrained_model"))
                self.assertTrue(
                    (Path(imported["path"]) / "pretrained_model" / "model.safetensors").is_file())
                self.assertEqual(len(other_manager.list_models()), 1)
                self.assertEqual(other_manager.list_models()[0]["execution_ready"], True)
            finally:
                other_manager.close()

    def test_restart_backfills_registration_for_historical_completed_job(self):
        job = self.manager.create(self.environment, self.dataset, {})
        checkpoint = Path(job["output_dir"]) / "checkpoints" / "000100" / "pretrained_model"
        checkpoint.mkdir(parents=True)
        (checkpoint / "model.safetensors").write_bytes(b"weights")
        for name in ("config.json", "policy_preprocessor.json", "policy_postprocessor.json"):
            (checkpoint / name).write_text("{}", encoding="utf-8")
        self.process.returncode = 0
        completed = self.manager.get(job["id"])
        model_root = self.root / "training" / "models" / completed["model_id"]
        import shutil
        shutil.rmtree(model_root)
        state_path = self.root / "training" / "jobs" / job["id"] / "job.json"
        saved = json.loads(state_path.read_text(encoding="utf-8"))
        saved.pop("model_id", None)
        saved.pop("registration_error", None)
        state_path.write_text(json.dumps(saved), encoding="utf-8")

        restarted = TrainingJobManager(self.root)
        try:
            recovered = restarted.get(job["id"])
            self.assertIsNotNone(recovered["model_id"])
            self.assertEqual(len(restarted.list_models("dataset-1")), 1)
        finally:
            restarted.close()


if __name__ == "__main__":
    unittest.main()
