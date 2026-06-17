"""
admin_db.py — SQLite persistence for dashboard user-permission management.

Schema: user_permissions(user_email, role, allowed_pages, created_at, updated_at)
  role          : 'admin' | 'viewer'
  allowed_pages : comma-separated route paths, or '*' for all pages.

Bootstrap: set ADMIN_EMAILS env var (comma-separated) to grant admin access
to specific emails even before any rows exist in the DB.  This avoids the
chicken-and-egg problem where no one can log into the admin panel.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, UTC
from pathlib import Path

from src.app_config import ADMIN_DB_PATH

# All navigable dashboard paths (kept here as the single source of truth)
DASHBOARD_PATHS: list[str] = [
    "/",
    "/users",
    "/betting",
    "/transactions",
    "/casino",
    "/bonus",
    "/crm",
    "/vip",
    "/product",
]

_BOOTSTRAP_ADMINS: set[str] = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}


import logging as _logging
_log = _logging.getLogger("playabets.admin_db")


def _connect() -> sqlite3.Connection:
    db_path = str(Path(ADMIN_DB_PATH).resolve())
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    # timeout=30: wait up to 30s for stale SMB/NFS locks to clear between revisions.
    # journal_mode=DELETE: WAL mode is unreliable on Azure File Share (network FS).
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    try:
        with _connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_permissions (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_email    TEXT    NOT NULL UNIQUE,
                    role          TEXT    NOT NULL DEFAULT 'viewer',
                    allowed_pages TEXT    NOT NULL DEFAULT '*',
                    created_at    TEXT    NOT NULL,
                    updated_at    TEXT    NOT NULL
                )
            """)
            conn.commit()
    except sqlite3.OperationalError as exc:
        _log.warning("admin_db init failed (%s) — admin features degraded until DB is accessible", exc)


_init_db()


def _pages_from_str(pages_str: str) -> list[str]:
    return [p.strip() for p in pages_str.split(",") if p.strip()]


def get_all_users() -> list[dict]:
    try:
        with _connect() as conn:
            rows = conn.execute(
                "SELECT * FROM user_permissions ORDER BY user_email"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["allowed_pages"] = _pages_from_str(d["allowed_pages"])
            result.append(d)
        return result
    except sqlite3.OperationalError as exc:
        _log.warning("get_all_users failed (%s)", exc)
        return []


def get_user(email: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM user_permissions WHERE user_email = ?",
            (email.lower(),),
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["allowed_pages"] = _pages_from_str(d["allowed_pages"])
    return d


def upsert_user(email: str, role: str, allowed_pages: list[str]) -> dict:
    now = datetime.now(UTC).isoformat(timespec="seconds")
    pages_str = ",".join(allowed_pages) if allowed_pages else "*"
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_permissions (user_email, role, allowed_pages, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_email) DO UPDATE SET
                role          = excluded.role,
                allowed_pages = excluded.allowed_pages,
                updated_at    = excluded.updated_at
            """,
            (email.lower(), role, pages_str, now, now),
        )
        conn.commit()
    return get_user(email)


def delete_user(email: str) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM user_permissions WHERE user_email = ?", (email.lower(),)
        )
        conn.commit()
    return cur.rowcount > 0


def is_admin(email: str) -> bool:
    if email.lower() in _BOOTSTRAP_ADMINS:
        return True
    user = get_user(email)
    return user is not None and user["role"] == "admin"


def get_effective_permissions(email: str) -> dict:
    """Return the effective permissions for a user.

    Falls back to full access (*) when the user is not in the DB yet,
    so existing authenticated users aren't locked out before an admin
    configures them.
    """
    if email.lower() in _BOOTSTRAP_ADMINS:
        return {"user_email": email, "role": "admin", "allowed_pages": ["*"]}
    user = get_user(email)
    if not user:
        return {"user_email": email, "role": "viewer", "allowed_pages": ["*"]}
    return user
