"""
routers/admin.py - User permission management endpoints.

All write endpoints require the caller to be an admin (role = 'admin' in admin.db,
or listed in the ADMIN_EMAILS env var).  The caller's identity is read from the
X-User-Email request header, which the frontend populates from the Supabase
session after authentication.

The overall request is still protected by the APIKeyMiddleware in app.py, so
the only additional trust surface is the X-User-Email header - acceptable for
an invite-only internal dashboard behind an API key.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

import backend.admin_db as adb

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(x_user_email: str | None) -> str:
    if not x_user_email:
        raise HTTPException(status_code=403, detail="X-User-Email header required")
    if not adb.is_admin(x_user_email):
        raise HTTPException(status_code=403, detail="Admin access required")
    return x_user_email.lower()


class UserPermissionPayload(BaseModel):
    user_email: str
    role: str = "viewer"
    allowed_pages: list[str] = ["*"]


@router.get("/me")
def get_my_permissions(x_user_email: Optional[str] = Header(None)):
    """Return the calling user's effective permissions.  Called by AuthGuard on login."""
    if not x_user_email:
        raise HTTPException(status_code=400, detail="X-User-Email header required")
    return adb.get_effective_permissions(x_user_email)


@router.get("/users")
def list_users(x_user_email: Optional[str] = Header(None)):
    """List all users in the permissions table (admin only)."""
    _require_admin(x_user_email)
    return {
        "users": adb.get_all_users(),
        "dashboard_paths": adb.DASHBOARD_PATHS,
    }


@router.put("/users")
def upsert_user(
    payload: UserPermissionPayload,
    x_user_email: Optional[str] = Header(None),
):
    """Create or update a user's permissions (admin only)."""
    _require_admin(x_user_email)
    if payload.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'viewer'")
    result = adb.upsert_user(payload.user_email, payload.role, payload.allowed_pages)
    return result


@router.delete("/users/{email:path}")
def delete_user(email: str, x_user_email: Optional[str] = Header(None)):
    """Remove a user from the permissions table (admin only)."""
    _require_admin(x_user_email)
    if not adb.delete_user(email):
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
