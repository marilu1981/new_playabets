"""
admin_db.py — JSON file persistence for dashboard user-permission management.

Switched from SQLite (unusable on Azure File Share due to SMB locking) to a
JSON file. Reads/writes are atomic via write-then-rename on Linux.

Schema: list of {user_email, role, allowed_pages, created_at, updated_at}
  role          : 'admin' | 'viewer'
  allowed_pages : list of route paths, or ['*'] for all pages.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, UTC
from pathlib import Path

from src.app_config import ADMIN_DB_PATH

DASHBOARD_PATHS: list[str] = [
    "/",
    "/users",
    "/betting",
    "/transactions",
    "/casino",
    "/crm",
    "/vip",
    "/product",
    "/acquisition",
]

_BOOTSTRAP_ADMINS: set[str] = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}

import logging as _logging
_log = _logging.getLogger("playabets.admin_db")

# Use a JSON file alongside the old db path
_JSON_PATH = Path(str(ADMIN_DB_PATH).replace(".db", "_users.json"))


def _load() -> dict[str, dict]:
    """Return {email: user_dict} from the JSON file."""
    try:
        if _JSON_PATH.exists():
            data = json.loads(_JSON_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return {u["user_email"].lower(): u for u in data if "user_email" in u}
    except Exception as exc:
        _log.warning("admin_db load failed (%s)", exc)
    return {}


def _save(users: dict[str, dict]) -> None:
    """Atomic write: write to temp file then rename."""
    try:
        _JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = list(users.values())
        tmp = _JSON_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(_JSON_PATH)
    except Exception as exc:
        _log.warning("admin_db save failed (%s)", exc)


def get_all_users() -> list[dict]:
    users = _load()
    result = []
    for u in sorted(users.values(), key=lambda x: x.get("user_email", "")):
        d = dict(u)
        if isinstance(d.get("allowed_pages"), str):
            d["allowed_pages"] = [p.strip() for p in d["allowed_pages"].split(",") if p.strip()]
        result.append(d)
    return result


def get_user(email: str) -> dict | None:
    users = _load()
    u = users.get(email.lower())
    if not u:
        return None
    d = dict(u)
    if isinstance(d.get("allowed_pages"), str):
        d["allowed_pages"] = [p.strip() for p in d["allowed_pages"].split(",") if p.strip()]
    return d


def upsert_user(email: str, role: str, allowed_pages: list[str]) -> dict:
    now = datetime.now(UTC).isoformat(timespec="seconds")
    users = _load()
    key = email.lower()
    existing = users.get(key, {})
    users[key] = {
        "user_email":    key,
        "role":          role,
        "allowed_pages": allowed_pages,
        "created_at":    existing.get("created_at", now),
        "updated_at":    now,
    }
    _save(users)
    return get_user(email)


def delete_user(email: str) -> bool:
    users = _load()
    key = email.lower()
    if key not in users:
        return False
    del users[key]
    _save(users)
    return True


def is_admin(email: str) -> bool:
    if email.lower() in _BOOTSTRAP_ADMINS:
        return True
    user = get_user(email)
    return user is not None and user.get("role") == "admin"


def get_effective_permissions(email: str) -> dict:
    if email.lower() in _BOOTSTRAP_ADMINS:
        return {"user_email": email, "role": "admin", "allowed_pages": ["*"]}
    user = get_user(email)
    if not user:
        return {"user_email": email, "role": "viewer", "allowed_pages": ["*"]}
    return user
