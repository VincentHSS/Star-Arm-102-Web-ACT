import unittest
from unittest.mock import patch

from ai_service.capabilities import detect_capabilities


class CapabilityTests(unittest.TestCase):
    def test_gpu_without_pytorch_reports_the_missing_runtime_layer(self):
        gpu = {"available": True, "name": "NVIDIA GeForce RTX 4060 Laptop GPU",
               "memory_mb": 8192, "reason": None}
        with patch("ai_service.capabilities._nvidia_gpu", return_value=gpu), \
                patch("ai_service.capabilities.importlib.util.find_spec", return_value=None):
            caps = detect_capabilities()

        self.assertFalse(caps["training_ready"])
        self.assertEqual(caps["training_blockers"], [
            "当前 Python 环境未安装 PyTorch",
            "ACT 训练执行链尚未接入",
        ])
        self.assertEqual(caps["training_blocker"], "当前 Python 环境未安装 PyTorch")

    def test_cuda_unavailable_is_distinct_from_gpu_detection(self):
        gpu = {"available": True, "name": "NVIDIA GeForce RTX 4060 Laptop GPU",
               "memory_mb": 8192, "reason": None}
        fake_torch = type("Torch", (), {
            "cuda": type("Cuda", (), {"is_available": staticmethod(lambda: False)})
        })
        with patch("ai_service.capabilities._nvidia_gpu", return_value=gpu), \
                patch("ai_service.capabilities.importlib.util.find_spec", return_value=object()), \
                patch.dict("sys.modules", {"torch": fake_torch}):
            caps = detect_capabilities()

        self.assertTrue(caps["gpu"]["available"])
        self.assertFalse(caps["torch"]["cuda_ready"])
        self.assertEqual(caps["training_blockers"], [
            "PyTorch 已安装，但无法使用本机 CUDA",
            "ACT 训练执行链尚未接入",
        ])

    def test_cuda_ready_environment_stays_blocked_without_training_execution(self):
        gpu = {"available": True, "name": "NVIDIA GeForce RTX 4060 Laptop GPU",
               "memory_mb": 8192, "reason": None}
        fake_torch = type("Torch", (), {
            "cuda": type("Cuda", (), {"is_available": staticmethod(lambda: True)})
        })
        with patch("ai_service.capabilities._nvidia_gpu", return_value=gpu), \
                patch("ai_service.capabilities.importlib.util.find_spec", return_value=object()), \
                patch.dict("sys.modules", {"torch": fake_torch}):
            caps = detect_capabilities()

        self.assertTrue(caps["torch"]["cuda_ready"])
        self.assertFalse(caps["act_runtime"]["execution_available"])
        self.assertFalse(caps["training_ready"])
        self.assertEqual(caps["training_blockers"], ["ACT 训练执行链尚未接入"])


if __name__ == "__main__":
    unittest.main()