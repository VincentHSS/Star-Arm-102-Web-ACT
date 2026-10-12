import argparse
import json
import math
import sys
from pathlib import Path


REQUIRED_CHECKPOINT_FILES = (
    "config.json",
    "model.safetensors",
    "policy_preprocessor.json",
    "policy_postprocessor.json",
)


class LocalActPolicy:
    def __init__(self, checkpoint_path, *, policy=None, preprocessor=None, postprocessor=None,
                 observation_preparer=None, image_loader=None, state_factory=None):
        self.checkpoint_path = Path(checkpoint_path).resolve()
        missing = [name for name in REQUIRED_CHECKPOINT_FILES if not (self.checkpoint_path / name).is_file()]
        if missing:
            raise ValueError(f"本地 ACT checkpoint 缺少 {missing[0]}")

        metadata_path = self.checkpoint_path.parent / "model.json"
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.is_file() else {}
        self.camera_map = self.metadata.get("camera_feature_map") or {"wrist": "wrist", "world": "world"}
        self.coordinates = None
        contract = self.metadata.get("coordinate_contract")
        if contract == "starai_0_0_4_calibrated":
            sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
            from ai_service.release_adapter import ReleaseCoordinates
            self.coordinates = ReleaseCoordinates(json.loads((self.checkpoint_path.parent / "calibration.json").read_text(encoding="utf-8")))
        elif contract not in (None, "degrees"):
            raise ValueError("不支持此模型的关节坐标格式")

        if policy is None:
            import numpy as np
            from PIL import Image
            from lerobot.configs.policies import PreTrainedConfig
            from lerobot.policies.act.modeling_act import ACTPolicy
            from lerobot.policies.utils import prepare_observation_for_inference
            from lerobot.processor import PolicyProcessorPipeline
            from lerobot.processor.converters import (
                batch_to_transition,
                policy_action_to_transition,
                transition_to_batch,
                transition_to_policy_action,
            )

            config = PreTrainedConfig.from_pretrained(self.checkpoint_path, local_files_only=True)
            import torch
            if str(config.device).startswith("cuda") and not torch.cuda.is_available():
                config.device = "cpu"
            # Full saved ACT weights already contain the image backbone.
            config.pretrained_backbone_weights = None
            policy = ACTPolicy.from_pretrained(
                self.checkpoint_path, config=config, local_files_only=True
            )
            preprocessor = PolicyProcessorPipeline.from_pretrained(
                self.checkpoint_path,
                config_filename="policy_preprocessor.json",
                local_files_only=True,
                overrides={"device_processor": {"device": config.device}},
                to_transition=batch_to_transition,
                to_output=transition_to_batch,
            )
            postprocessor = PolicyProcessorPipeline.from_pretrained(
                self.checkpoint_path,
                config_filename="policy_postprocessor.json",
                local_files_only=True,
                to_transition=policy_action_to_transition,
                to_output=transition_to_policy_action,
            )
            observation_preparer = prepare_observation_for_inference
            state_factory = lambda values: np.asarray(values, dtype=np.float32)

            def image_loader(path):
                with Image.open(path) as source:
                    return np.array(source.convert("RGB"), dtype=np.uint8, copy=True)

        self.policy = policy
        self.preprocessor = preprocessor
        self.postprocessor = postprocessor
        self.observation_preparer = observation_preparer
        self.image_loader = image_loader
        self.state_factory = state_factory

    def reset(self):
        self.policy.reset()

    def _prepare(self, observation_state, wrist_path, world_path, task):
        values = [float(value) for value in observation_state]
        if len(values) != 7 or not all(math.isfinite(value) for value in values):
            raise ValueError("Observation 必须包含 J1-J7 七个有限值")
        if self.coordinates:
            values = self.coordinates.observation(values)
        observation = {
            "observation.state": self.state_factory(values),
            "observation.images." + self.camera_map["wrist"]: self.image_loader(wrist_path),
            "observation.images." + self.camera_map["world"]: self.image_loader(world_path),
        }
        batch = self.observation_preparer(
            observation, self.policy.config.device, str(task), "star_arm_102"
        )
        return self.preprocessor(batch)

    @staticmethod
    def _values(action):
        array = action.squeeze(0).detach().cpu().numpy()
        result = [float(value) for value in array.values] if hasattr(array, "values") else [float(value) for value in array.tolist()]
        if len(result) != 7:
            raise ValueError("ACT Action 必须包含 J1-J7 七个值")
        if not all(math.isfinite(value) for value in result):
            raise ValueError("ACT Action 必须全部为有限值")
        return result

    def select_action(self, observation_state, wrist_path, world_path, task):
        processed = self._prepare(observation_state, wrist_path, world_path, task)
        values = self._values(self.postprocessor(self.policy.select_action(processed)))
        return self.coordinates.action(values) if self.coordinates else values

    def predict_chunk(self, observation_state, wrist_path, world_path, task):
        processed = self._prepare(observation_state, wrist_path, world_path, task)
        chunk = self.policy.predict_action_chunk(processed)
        if len(chunk.shape) != 3 or chunk.shape[0] != 1 or chunk.shape[2] != 7:
            raise ValueError("ACT 动作块必须为 [1, chunk_size, 7]")
        # Treat time steps as the batch dimension: saved ACT processors accept
        # [batch, 7]. Unnormalize and copy the entire chunk to CPU only once.
        array = self.postprocessor(chunk.squeeze(0)).detach().cpu().numpy()
        rows = array.values if hasattr(array, "values") else array.tolist()
        result = []
        for row in rows:
            values = [float(v) for v in row]
            if len(values) != 7 or not all(math.isfinite(v) for v in values):
                raise ValueError("ACT Action 必须包含 J1-J7 七个有限值")
            result.append(self.coordinates.action(values) if self.coordinates else values)
        if len(result) != chunk.shape[1] or not result:
            raise ValueError("ACT 后处理返回的动作块长度无效")
        return result


def serve(checkpoint_path):
    adapter = LocalActPolicy(checkpoint_path)
    adapter.reset()
    print(json.dumps({"status": "ready", "protocol": "act-chunk-v1",
                      "chunk_size": adapter.policy.config.chunk_size}, ensure_ascii=False), flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request.get("command") == "reset":
                adapter.reset()
                response = {"status": "reset"}
            elif request.get("command") == "predict_chunk":
                response = {"actions": adapter.predict_chunk(
                    request.get("observation_state") or [], request.get("wrist_path"),
                    request.get("world_path"), request.get("task", ""),
                )}
            elif request.get("command") == "infer":
                response = {"action": adapter.select_action(
                    request.get("observation_state") or [], request.get("wrist_path"),
                    request.get("world_path"), request.get("task", ""),
                )}
            else:
                raise ValueError("worker 命令无效")
        except Exception as error:
            response = {"error": f"{type(error).__name__}: {error}"}
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()
    serve(args.checkpoint)


if __name__ == "__main__":
    main()
