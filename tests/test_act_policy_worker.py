import tempfile
import unittest
from pathlib import Path

from ai_service.act_policy_worker import LocalActPolicy


class Array:
    def __init__(self, values, shape=None, dtype="float32"):
        self.values = values
        self.shape = shape or (len(values),)
        self.dtype = dtype


class Tensor:
    def __init__(self, values):
        self.values = values

    def squeeze(self, _axis=0):
        return self

    def detach(self):
        return self

    def cpu(self):
        return self

    def numpy(self):
        return Array(self.values[0], shape=(7,))


class Chunk:
    def __init__(self, actions):
        self.actions = actions
        self.shape = (1, len(actions), len(actions[0]))

    def squeeze(self, axis):
        assert axis == 0
        return BatchTensor(self.actions)


class BatchTensor(Tensor):
    def numpy(self):
        return Array(self.values, shape=(len(self.values), 7))


class Policy:
    def __init__(self):
        self.config = type("Config", (), {"device": "cuda", "use_amp": False})()
        self.batches = []
        self.reset_calls = 0

    def reset(self):
        self.reset_calls += 1

    def select_action(self, batch):
        self.batches.append(batch)
        return Tensor([[1, 2, 3, 4, 5, 6, 7]])


class LocalActPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        for name in ("config.json", "model.safetensors", "policy_preprocessor.json", "policy_postprocessor.json"):
            (self.root / name).write_text("{}", encoding="utf-8")
        self.policy = Policy()
        self.pre_calls = []
        self.post_calls = []
        self.images = []

        def image_loader(path):
            self.images.append(Path(path).name)
            return Array([], shape=(480, 640, 3), dtype="uint8")

        self.adapter = LocalActPolicy(
            self.root,
            policy=self.policy,
            preprocessor=lambda batch: self.pre_calls.append(batch) or batch,
            postprocessor=lambda action: self.post_calls.append(action) or action,
            observation_preparer=lambda observation, device, task, robot_type: {
                **observation, "device": device, "task": task, "robot_type": robot_type,
            },
            image_loader=image_loader,
            state_factory=lambda values: Array(values),
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_select_action_uses_real_act_feature_keys_and_processors(self):
        action = self.adapter.select_action(
            [10, 20, 30, 40, 50, 60, 70], "wrist.jpg", "world.jpg", "抓取积木"
        )

        batch = self.policy.batches[0]
        self.assertEqual(set(batch) - {"device", "task", "robot_type"}, {
            "observation.state", "observation.images.wrist", "observation.images.world",
        })
        self.assertEqual(batch["observation.state"].dtype, "float32")
        self.assertEqual(batch["observation.images.wrist"].shape, (480, 640, 3))
        self.assertEqual(batch["task"], "抓取积木")
        self.assertEqual(batch["robot_type"], "star_arm_102")
        self.assertEqual(self.images, ["wrist.jpg", "world.jpg"])
        self.assertEqual(action, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
        self.assertEqual(len(self.pre_calls), 1)
        self.assertEqual(len(self.post_calls), 1)

    def test_reset_clears_act_action_chunk_queue(self):
        self.adapter.reset()
        self.assertEqual(self.policy.reset_calls, 1)

    def test_rejects_non_finite_or_wrong_dimension_action(self):
        self.policy.select_action = lambda _batch: Tensor([[1, 2, 3]])
        with self.assertRaisesRegex(ValueError, "J1-J7"):
            self.adapter.select_action([0] * 7, "wrist.jpg", "world.jpg", "task")

        self.policy.select_action = lambda _batch: Tensor([[1, 2, 3, 4, 5, 6, float("nan")]])
        with self.assertRaisesRegex(ValueError, "有限"):
            self.adapter.select_action([0] * 7, "wrist.jpg", "world.jpg", "task")

    def test_requires_complete_local_checkpoint_without_hub_fallback(self):
        (self.root / "policy_postprocessor.json").unlink()
        with self.assertRaisesRegex(ValueError, "policy_postprocessor.json"):
            LocalActPolicy(self.root, policy=self.policy, preprocessor=lambda value: value,
                           postprocessor=lambda value: value, observation_preparer=lambda *args: args,
                           image_loader=lambda _path: Array([], shape=(1, 1, 3)),
                           state_factory=lambda values: Array(values))

    def test_predict_chunk_denormalizes_every_timestep_with_batch_dimension(self):
        actions = [[float(i + joint) for joint in range(7)] for i in range(3)]
        self.policy.predict_action_chunk = lambda batch: self.policy.batches.append(batch) or Chunk(actions)
        shapes = []
        def postprocessor(tensor):
            shapes.append((len(tensor.values), len(tensor.values[0])))
            return BatchTensor([[v * 10 + 5 for v in row] for row in tensor.values])
        self.adapter.postprocessor = postprocessor
        result = self.adapter.predict_chunk([0] * 7, "wrist.jpg", "world.jpg", "task")
        self.assertEqual(result, [[v * 10 + 5 for v in action] for action in actions])
        self.assertEqual(shapes, [(3, 7)])
        self.assertEqual(len(self.pre_calls), 1)
        self.assertEqual(self.images, ["wrist.jpg", "world.jpg"])

    def test_predict_chunk_rejects_bad_shape_and_nan_in_future_step(self):
        self.policy.predict_action_chunk = lambda _batch: Chunk([[1] * 6])
        with self.assertRaisesRegex(ValueError, "chunk_size"):
            self.adapter.predict_chunk([0] * 7, "wrist.jpg", "world.jpg", "task")
        self.policy.predict_action_chunk = lambda _batch: Chunk([[1] * 7, [float("nan")] * 7])
        self.adapter.postprocessor = lambda value: value
        with self.assertRaisesRegex(ValueError, "有限"):
            self.adapter.predict_chunk([0] * 7, "wrist.jpg", "world.jpg", "task")


if __name__ == "__main__":
    unittest.main()
