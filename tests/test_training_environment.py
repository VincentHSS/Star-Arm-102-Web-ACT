import json
import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from pathlib import Path

from ai_service.training_environment import TrainingEnvironmentManager, recommended_profile


class Result:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class TrainingEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_initial_state_and_missing_accelerator_failure(self):
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda *_a, **_k: Result(),
                                             backend_detector=lambda: [])
        self.assertEqual(manager.snapshot()["status"], "not_prepared")
        result = manager.prepare()
        self.assertEqual(result["status"], "failed")
        self.assertIn("硬件加速后端", result["error"])

    def test_prepare_is_idempotent_while_running(self):
        release = threading.Event()

        def runner(command, **_kwargs):
            if command[2:4] == ["venv", str(command[-1])]:
                release.wait(0.5)
            return Result()

        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=runner, backend_detector=lambda: ["cuda"])
        first = manager.prepare()
        second = manager.prepare()
        release.set()
        manager.wait()
        self.assertEqual(first["job_id"], second["job_id"])

    def test_successful_fake_install_publishes_atomic_runtime(self):
        commands = []

        def runner(command, **_kwargs):
            commands.append(command)
            if command[1:3] == ["-m", "venv"]:
                staging = Path(command[-1])
                (staging / "bin").mkdir(parents=True)
                (staging / "bin" / "python").write_text("python")
                (staging / "bin" / "lerobot-train").write_text(
                    f"#!{staging / 'bin' / 'python'}\nprint('train')\n"
                )
            return Result(stdout='{"backend":"cuda"}')

        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=runner, backend_detector=lambda: ["cuda"])
        started = manager.prepare()
        manager.wait()
        ready = manager.job(started["job_id"])
        self.assertEqual(ready["status"], "ready")
        self.assertTrue(Path(ready["executable"]).is_file())
        shebang = Path(ready["executable"]).read_text().splitlines()[0]
        self.assertEqual(shebang, f"#!{manager.runtime / 'bin' / 'python'}")
        self.assertTrue(Path(shebang[2:]).is_file())
        self.assertEqual(ready["backend"], "cuda")
        self.assertTrue(any("lerobot==0.4.4" in item for command in commands for item in command))
        self.assertFalse(any(isinstance(command, str) for command in commands))

    def test_prepare_self_test_validates_local_training_configuration(self):
        commands = []

        def runner(command, **_kwargs):
            commands.append(command)
            if command[1:3] == ["-m", "venv"]:
                staging = Path(command[-1])
                (staging / "bin").mkdir(parents=True)
                (staging / "bin" / "python").write_text("python")
                (staging / "bin" / "lerobot-train").write_text(
                    f"#!{staging / 'bin' / 'python'}\nprint('train')\n"
                )
            return Result(stdout='{"backend":"cuda"}')

        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=runner, backend_detector=lambda: ["cuda"])
        started = manager.prepare()
        manager.wait()

        self.assertEqual(manager.job(started["job_id"])["status"], "ready")
        probe = next(command[-1] for command in commands if len(command) >= 3 and command[-2] == "-c")
        self.assertIn("TrainPipelineConfig", probe)
        self.assertIn("push_to_hub=False", probe)
        self.assertIn("device=d", probe)
        self.assertIn("cfg.validate()", probe)

    def test_prepare_uses_supported_python_instead_of_service_interpreter(self):
        commands = []
        supported_python = "/usr/bin/python3.11"

        def runner(command, **_kwargs):
            commands.append(command)
            if command[1:3] == ["-m", "venv"]:
                staging = Path(command[-1])
                (staging / "bin").mkdir(parents=True)
                (staging / "bin" / "python").write_text("python")
                (staging / "bin" / "lerobot-train").write_text(
                    f"#!{staging / 'bin' / 'python'}\nprint('train')\n"
                )
            return Result(stdout='{"backend":"cuda"}')

        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=runner,
            backend_detector=lambda: ["cuda"],
            python_detector=lambda _constraint: supported_python,
        )
        started = manager.prepare()
        manager.wait()

        self.assertEqual(manager.job(started["job_id"])["status"], "ready")
        create_command = next(command for command in commands if command[1:3] == ["-m", "venv"])
        self.assertEqual(create_command[0], supported_python)

    def test_prepare_fails_before_install_when_supported_python_is_missing(self):
        commands = []
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda command, **_kwargs: commands.append(command) or Result(),
            backend_detector=lambda: ["cuda"],
            python_detector=lambda _constraint: None,
        )

        started = manager.prepare()
        manager.wait()
        failed = manager.job(started["job_id"])

        self.assertEqual(failed["status"], "failed")
        self.assertIn("Python 3.10–3.12", failed["error"])
        self.assertEqual(commands, [])

    def test_snapshot_repairs_relocated_training_entrypoint(self):
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda *_a, **_k: Result(),
                                             backend_detector=lambda: ["cuda"])
        (manager.runtime / "bin").mkdir(parents=True)
        python = manager.runtime / "bin" / "python"
        python.write_text("python")
        executable = manager.runtime / "bin" / "lerobot-train"
        executable.write_text(f"#!{manager.root / '.staging-old' / 'bin' / 'python'}\n")
        state = manager.snapshot()
        state.update(status="ready", executable=str(executable), python=str(python), fingerprint="old")
        manager._save(state)

        repaired = manager.snapshot()

        self.assertEqual(repaired["status"], "ready")
        self.assertEqual(executable.read_text().splitlines()[0], f"#!{python}")

    def test_snapshot_rejects_published_python_outside_manifest_range(self):
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda *_a, **_k: Result(),
                                             backend_detector=lambda: ["cuda"])
        (manager.runtime / "bin").mkdir(parents=True)
        python = manager.runtime / "bin" / "python"
        python.write_text("python")
        executable = manager.runtime / "bin" / "lerobot-train"
        executable.write_text(f"#!{python}\n")
        (manager.runtime / "pyvenv.cfg").write_text("version = 3.14.0\n")
        state = manager.snapshot()
        state.update(status="ready", executable=str(executable), python=str(python), fingerprint="python-3.14")
        manager._save(state)

        rejected = manager.snapshot()

        self.assertEqual(rejected["status"], "failed")
        self.assertIn("Python 3.10–3.12", rejected["error"])

    def test_snapshot_restores_execute_permission_lost_during_copy_or_extraction(self):
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda *_a, **_k: Result(),
                                             backend_detector=lambda: ["cuda"])
        (manager.runtime / "bin").mkdir(parents=True)
        python = manager.runtime / "bin" / "python"
        python.write_text("python")
        python.chmod(0o755)
        executable = manager.runtime / "bin" / "lerobot-train"
        executable.write_text(f"#!{python}\nprint('train')\n")
        executable.chmod(0o644)
        state = manager.snapshot()
        state.update(status="ready", executable=str(executable), python=str(python), fingerprint="copied")
        manager._save(state)

        repaired = manager.snapshot()

        self.assertEqual(repaired["status"], "ready")
        self.assertTrue(os.access(executable, os.X_OK))

    def test_relative_data_root_and_legacy_entrypoint_are_migrated_to_absolute_runtime_paths(self):
        previous = Path.cwd()
        try:
            os.chdir(self.root)
            manager = TrainingEnvironmentManager("data", platform_name="linux", runner=lambda *_a, **_k: Result(),
                                                 backend_detector=lambda: ["cuda"])
            (manager.runtime / "bin").mkdir(parents=True)
            python = manager.runtime / "bin" / "python"
            python.write_text("python")
            executable = manager.runtime / "bin" / "lerobot-train"
            executable.write_text(f"#!{python}\n")
            state = manager.snapshot()
            state.update(status="ready", executable="data/training/environment/runtime/bin/lerobot-train",
                         python="data/training/environment/runtime/bin/python", fingerprint="legacy")
            manager._save(state)

            migrated = manager.snapshot()

            self.assertTrue(manager.runtime.is_absolute())
            self.assertEqual(migrated["executable"], str(executable))
            self.assertEqual(migrated["python"], str(python))
            self.assertEqual(migrated["status"], "ready")
        finally:
            os.chdir(previous)

    def test_failed_reprepare_preserves_published_runtime(self):
        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=lambda *_a, **_k: Result(),
                                             backend_detector=lambda: ["cuda"])
        runtime = manager.runtime
        (runtime / "bin").mkdir(parents=True)
        executable = runtime / "bin" / "lerobot-train"
        executable.write_text("working")
        state = manager.snapshot()
        state.update(status="ready", executable=str(executable), fingerprint="old", backend="cuda")
        manager._save(state)

        manager._runner = lambda *_a, **_k: Result(returncode=1, stderr="network failed")
        started = manager.prepare()
        manager.wait()
        failed = manager.job(started["job_id"])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(executable.read_text(), "working")

    def test_prepare_failure_reports_stage_and_command_output(self):
        def runner(command, **_kwargs):
            if command[2:4] == ["venv", str(command[-1])]:
                return Result(returncode=1,
                              stderr="ensurepip is not available\nFailing command: /tmp/x/bin/python3.10")
            return Result()

        manager = TrainingEnvironmentManager(self.root, platform_name="linux", runner=runner, backend_detector=lambda: ["cuda"])
        started = manager.prepare()
        manager.wait()
        failed = manager.job(started["job_id"])
        self.assertEqual(failed["status"], "failed")
        self.assertIn("创建隔离训练环境", failed["error"])          # 失败阶段
        self.assertIn("ensurepip is not available", failed["error"])
        self.assertIn("Failing command", failed["error"])
        self.assertIn("Ubuntu 运行组件", failed["error"])

    def test_recommended_profile_is_capability_based_not_model_based(self):
        self.assertEqual(recommended_profile(4096, "cuda")["batch_size"], 1)
        self.assertEqual(recommended_profile(8192, "cuda")["batch_size"], 4)
        self.assertEqual(recommended_profile(24576, "cuda")["batch_size"], 16)
        self.assertNotIn("gpu_model", recommended_profile(8192, "cuda"))

    def test_interrupted_prepare_recovers_to_retryable_state_without_removing_model(self):
        manager = TrainingEnvironmentManager(self.root, platform_name='linux')
        model = self.root / 'training' / 'models' / 'customer' / 'weights.safetensors'
        model.parent.mkdir(parents=True)
        model.write_bytes(b'customer model')
        state = manager.snapshot()
        state.update(status='preparing', owner_pid=5471, backend='cuda', progress=35)
        manager._save(state)
        with patch('ai_service.training_environment._process_alive', return_value=False):
            restarted = TrainingEnvironmentManager(self.root, platform_name='linux')
        self.assertEqual(restarted.snapshot()['status'], 'failed')
        self.assertIn('重试准备', restarted.snapshot()['error'])
        self.assertEqual(model.read_bytes(), b'customer model')

    def test_live_owner_is_not_mistaken_for_interrupted_install(self):
        manager = TrainingEnvironmentManager(self.root, platform_name='linux')
        state = manager.snapshot()
        state.update(status='preparing', owner_pid=os.getpid(), backend='cuda', progress=35)
        manager._save(state)
        second = TrainingEnvironmentManager(self.root, platform_name='linux')
        self.assertEqual(second.prepare()['status'], 'preparing')
        self.assertIsNone(second._thread)

    def test_reused_pid_does_not_leave_old_job_stuck_preparing(self):
        manager = TrainingEnvironmentManager(self.root, platform_name='linux')
        state = manager.snapshot()
        state.update(status='preparing', owner_pid=os.getpid(), owner_started_at='old-process-start')
        manager._save(state)
        with patch('ai_service.training_environment._process_token', return_value='new-process-start'):
            restarted = TrainingEnvironmentManager(self.root, platform_name='linux')
        self.assertEqual(restarted.snapshot()['status'], 'failed')

    def test_transient_download_retries_and_resets_visible_retry_state(self):
        responses = [Result(1, stderr='ReadTimeoutError: download interrupted'), Result(stdout='done')]
        calls = []
        def runner(command, **kwargs):
            calls.append(command)
            return responses.pop(0)
        manager = TrainingEnvironmentManager(self.root, runner=runner)
        state = manager.snapshot()
        state.update(job_id='test', stage_label='安装 ACT')
        manager._save(state)
        with patch.object(manager._cancel, 'wait', return_value=False):
            self.assertEqual(manager._run(['python', '-m', 'pip', 'install', 'lerobot'], job_id='test'), 'done')
        self.assertEqual(len(calls), 2)
        self.assertIn('--retries', calls[0])
        self.assertEqual(manager.snapshot()['retry_attempt'], 0)
        self.assertEqual(manager.snapshot()['stage_label'], '安装 ACT')

    def test_permanent_dependency_error_is_not_retried(self):
        calls = []
        manager = TrainingEnvironmentManager(self.root, runner=lambda command, **kwargs: calls.append(command) or Result(1, stderr='ResolutionImpossible: incompatible requirements'))
        with self.assertRaisesRegex(RuntimeError, 'ResolutionImpossible'):
            manager._run(['python', '-m', 'pip', 'install', 'lerobot'])
        self.assertEqual(len(calls), 1)

    def test_download_retries_are_bounded_and_expose_next_action(self):
        calls = []
        manager = TrainingEnvironmentManager(self.root, runner=lambda command, **kwargs: calls.append(command) or Result(1, stderr='ConnectionError: connection reset'))
        with patch.object(manager._cancel, 'wait', return_value=False), self.assertRaisesRegex(RuntimeError, '重试准备'):
            manager._run(['python', '-m', 'pip', 'install', 'lerobot'])
        self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
