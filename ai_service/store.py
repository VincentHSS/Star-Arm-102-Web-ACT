import json
import os
import tempfile
from pathlib import Path
from threading import RLock


class JsonStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "workspace.json"
        self._lock = RLock()

    def load(self) -> dict:
        with self._lock:
            if not self.path.exists():
                return {}
            return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)
        with self._lock:
            fd, name = tempfile.mkstemp(prefix="workspace-", suffix=".tmp", dir=self.root)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(name, self.path)
            finally:
                if os.path.exists(name):
                    os.unlink(name)
