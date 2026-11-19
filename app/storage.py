from __future__ import annotations

import copy
import fcntl
import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, TypeVar

T = TypeVar("T")
_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "leaderboard.json"


class JsonStore:
    """Small single-host JSON store with thread/process locking and atomic replacement."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path or os.environ.get("LEADERBOARD_PATH", _DEFAULT_PATH)).resolve()
        self.lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        self._thread_lock = threading.RLock()

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"schema_version": 1, "students": {}}
        try:
            with self.path.open("r", encoding="utf-8") as stream:
                data = json.load(stream)
        except (json.JSONDecodeError, OSError) as exc:
            raise RuntimeError(f"Could not read leaderboard data at {self.path}") from exc
        if not isinstance(data, dict) or not isinstance(data.get("students", {}), dict):
            raise RuntimeError("Leaderboard data has an invalid structure")
        data.setdefault("schema_version", 1)
        data.setdefault("students", {})
        return data

    def read(self) -> dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self._thread_lock, self.lock_path.open("a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_SH)
            try:
                return copy.deepcopy(self._read_unlocked())
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def update(self, operation: Callable[[dict[str, Any]], T]) -> T:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self._thread_lock, self.lock_path.open("a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                data = self._read_unlocked()
                result = operation(data)
                self._write_unlocked(data)
                return copy.deepcopy(result)
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _write_unlocked(self, data: dict[str, Any]) -> None:
        fd, temp_name = tempfile.mkstemp(
            prefix=f".{self.path.name}.", suffix=".tmp", dir=self.path.parent
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2, sort_keys=True)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_name, self.path)
            directory_fd = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except Exception:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass
            raise
