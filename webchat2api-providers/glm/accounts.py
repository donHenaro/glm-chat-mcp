"""
GLM (ZhiPu AI) account adapter for webchat2api.

Handles cookie-based authentication with chat.z.ai:
- Token stored in cookie (zai_token or access_token)
- Refresh via POST /api/user/refresh
- Validation via GET /api/user/info

Place in: services/providers/glm/accounts.py
"""

from __future__ import annotations

import re
from typing import Any

from services.providers.base import GLM_PROVIDER, ModelSpec
from services.providers.registry import normalize_provider

EXPORT_FILENAME = "webchat2api-glm.txt"
UNAVAILABLE_STATUSES = {"禁用", "限流", "异常", "disabled", "limited", "abnormal"}
SECRET_EXPORT_KEYS = {"access_token", "refresh_token", "session_id"}


def clean_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def normalize_access_token(item: dict[str, Any]) -> str:
    """Extract access token from account dict."""
    return clean_string(
        item.get("access_token")
        or item.get("accessToken")
        or item.get("zai_token")
        or ""
    )


def normalize_account(account: dict[str, Any]) -> dict[str, Any]:
    """Normalize GLM account fields to standard format."""
    account["provider"] = GLM_PROVIDER
    account["access_token"] = normalize_access_token(account)
    account["status"] = clean_string(account.get("status")) or "正常"
    # GLM has no tier system like Grok — all accounts are equal
    account["tier"] = ""
    account["capabilities"] = ["chat"]
    return account


def delete_token_matches_account(token: str, account: dict[str, Any]) -> bool:
    return clean_string(token) == clean_string(account.get("access_token"))


def is_account(account: dict[str, Any]) -> bool:
    return normalize_provider(account.get("provider")) == GLM_PROVIDER


def supports_refresh(account: dict[str, Any]) -> bool:
    return is_account(account) and bool(account.get("access_token"))


def refresh_error_message(exc: Exception) -> str:
    return str(exc)


def export_filename() -> str:
    return EXPORT_FILENAME


def build_export_item(account: dict[str, Any]) -> dict[str, str] | None:
    access_token = clean_string(account.get("access_token"))
    if not access_token:
        return None
    return {
        "access_token": access_token,
        "session_id": clean_string(account.get("session_id")),
    }


def sanitize_account(item: dict[str, Any]) -> dict[str, Any]:
    """Remove secret fields for API responses."""
    account = dict(item)
    for key in SECRET_EXPORT_KEYS:
        account.pop(key, None)
    account["has_access_token"] = bool(item.get("access_token"))
    return account


def is_console_account_available(account: dict[str, Any], current_time: float) -> bool:
    if not isinstance(account, dict) or not is_account(account):
        return False
    return account.get("status") not in UNAVAILABLE_STATUSES


def is_image_account_available(account: dict[str, Any]) -> bool:
    return False  # GLM image not yet supported


def normalize_console_quota(value: Any) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    return {
        "remaining": raw.get("remaining", 0),
        "total": raw.get("total", 0),
    }


def reset_console_quota_if_ready(account: dict[str, Any], current_time: float) -> dict[str, Any]:
    return account  # GLM has no quota reset mechanism


def requested_tiers(spec: ModelSpec) -> list[str]:
    return []  # GLM has no tier system


def account_has_capability(account: dict[str, Any], spec: ModelSpec) -> bool:
    if spec.provider != GLM_PROVIDER:
        return False
    if spec.capability not in {"chat", "image", "image_edit"}:
        return False
    # All GLM accounts support chat; image not yet
    return spec.capability == "chat"


def tier_matches(account_tier: str, requested_tier: str) -> bool:
    return True  # GLM has no tier system


def normalize_tier(value: Any) -> str:
    return ""  # GLM has no tier system


def is_auth_failure_payload(payload: Any) -> bool:
    """Detect auth failures from GLM API responses."""
    if isinstance(payload, dict):
        status = payload.get("status") or payload.get("code")
        if status in {401, 403, "401", "403"}:
            return True
        msg = str(payload.get("message", "")).lower()
        if any(marker in msg for marker in ("unauthorized", "forbidden", "token expired", "invalid token")):
            return True
    return False
