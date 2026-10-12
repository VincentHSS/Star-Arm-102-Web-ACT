import tempfile
import unittest
from pathlib import Path

from ai_service.domain import ActWorkspace, DomainError
from ai_service.store import JsonStore


class ActWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.workspace = ActWorkspace(JsonStore(Path(self.tmp.name)))

    def tearDown(self):
        self.tmp.cleanup()

    def test_dataset_locks_supported_capture_profile(self):
        dataset = self.workspace.create_dataset(
            task_name="抓取积木",
            slug="block-pick-v1",
            width=640,
            height=360,
            fps=30,
        )
        self.assertEqual(dataset["capture"], {"width": 640, "height": 360, "fps": 30})
        with self.assertRaisesRegex(DomainError, "不支持的双相机保存规格"):
            self.workspace.create_dataset("另一个任务", "bad-size", 800, 600, 30)

    def test_dataset_accepts_640_by_480_at_30_fps(self):
        dataset = self.workspace.create_dataset(
            task_name="双相机采集",
            slug="capture-640x480",
            width=640,
            height=480,
            fps=30,
        )
        self.assertEqual(dataset["capture"], {"width": 640, "height": 480, "fps": 30})

    def test_device_lease_has_one_owner_and_requires_matching_token(self):
        lease = self.workspace.acquire_devices("collect-session")
        with self.assertRaisesRegex(DomainError, "已被其他 AI 会话占用"):
            self.workspace.acquire_devices("other-session")
        with self.assertRaisesRegex(DomainError, "设备租约无效"):
            self.workspace.release_devices("wrong-token")
        self.workspace.release_devices(lease["lease_id"])
        self.assertIsNone(self.workspace.snapshot()["device_lease"])

    def test_episode_requires_review_before_success_acceptance(self):
        dataset = self.workspace.create_dataset("抓取积木", "episodes", 640, 360, 30)
        episode = self.workspace.start_episode(dataset["id"])
        with self.assertRaisesRegex(DomainError, "尚未停止"):
            self.workspace.review_episode(episode["id"], "success")
        stopped = self.workspace.stop_episode(episode["id"], valid_frames=90, mismatch_rate=0.01)
        self.assertEqual(stopped["status"], "review")
        accepted = self.workspace.review_episode(episode["id"], "success")
        self.assertEqual(accepted["status"], "accepted_success")

    def test_zero_sample_episode_cannot_be_accepted_as_success(self):
        dataset = self.workspace.create_dataset("空采集", "empty-episode", 640, 360, 30)
        episode = self.workspace.start_episode(dataset["id"])
        self.workspace.stop_episode(episode["id"], valid_frames=0, mismatch_rate=0)
        with self.assertRaisesRegex(DomainError, "没有真实样本"):
            self.workspace.review_episode(episode["id"], "success")
        failed = self.workspace.review_episode(episode["id"], "failure")
        self.assertEqual(failed["status"], "accepted_failure")

    def test_success_review_requires_persisted_episode_integrity(self):
        dataset = self.workspace.create_dataset("视觉采集", "vision-gate", 640, 360, 30)
        episode = self.workspace.start_episode(dataset["id"])
        self.workspace.stop_episode(episode["id"], valid_frames=10, mismatch_rate=0)
        with self.assertRaisesRegex(DomainError, "完整性"):
            self.workspace.review_episode(episode["id"], "success", integrity_ok=False)
        accepted = self.workspace.review_episode(episode["id"], "success", integrity_ok=True)
        self.assertEqual(accepted["status"], "accepted_success")

    def test_imported_dataset_and_episodes_are_registered_atomically(self):
        dataset = {"id": "imported-dataset", "task_name": "导入任务", "slug": "import-copy",
                   "capture": {"width": 640, "height": 360, "fps": 30}, "created_at_ms": 123}
        episodes = [{"id": "imported-episode", "dataset_id": "imported-dataset",
                     "status": "accepted_success", "valid_frames": 4, "mismatch_rate": 0}]
        result = self.workspace.register_import(dataset, episodes)
        self.assertEqual(result["dataset"]["id"], "imported-dataset")
        self.assertEqual(self.workspace.snapshot()["episodes"][0]["id"], "imported-episode")
        with self.assertRaisesRegex(DomainError, "已存在"):
            self.workspace.register_import(dataset, episodes)

    def test_training_gate_reports_gpu_and_dataset_reasons(self):
        dataset = self.workspace.create_dataset("抓取积木", "train-gate", 640, 360, 30)
        reasons = self.workspace.training_blockers(dataset["id"], gpu_ready=False)
        self.assertIn("本机 NVIDIA GPU 或 ACT 运行依赖不可用", reasons)
        self.assertIn("数据集没有已审核的成功示教", reasons)

    def test_inference_authorization_requires_all_gates_and_expires(self):
        model = self.workspace.register_model("block-act-v1", "dataset-1")
        with self.assertRaisesRegex(DomainError, "离线验证"):
            self.workspace.authorize_inference(model["id"], now_ms=1000)
        self.workspace.mark_offline_validation(model["id"], passed=True)
        self.workspace.confirm_virtual_preview(model["id"])
        token = self.workspace.authorize_inference(model["id"], now_ms=1000)
        self.assertTrue(self.workspace.is_inference_authorized(token["token"], now_ms=1200))
        self.assertFalse(self.workspace.is_inference_authorized(token["token"], now_ms=3000))


if __name__ == "__main__":
    unittest.main()
