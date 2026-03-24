from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _flag_from_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _path_from_env(name: str, default: Path) -> Path:
    raw = os.environ.get(name)
    if not raw:
        return default
    return Path(raw).expanduser()


DATA_ROOT = _path_from_env("PLAYABETS_DATA_ROOT", PROJECT_ROOT / "data")
RAW_ROOT = _path_from_env("PLAYABETS_RAW_ROOT", DATA_ROOT / "raw")
SERVING_ROOT = _path_from_env("PLAYABETS_SERVING_ROOT", DATA_ROOT / "serving")
WATERMARK_DB_PATH = _path_from_env("PLAYABETS_WATERMARK_DB", DATA_ROOT / "watermarks.db")
TX_WATERMARK_DB_PATH = _path_from_env(
    "PLAYABETS_TX_WATERMARK_DB",
    DATA_ROOT / "watermarks_transactions.db",
)
ENABLE_TRANSACTIONS = _flag_from_env("PLAYABETS_ENABLE_TRANSACTIONS", default=False)


def raw_dir(name: str) -> Path:
    return RAW_ROOT / name
