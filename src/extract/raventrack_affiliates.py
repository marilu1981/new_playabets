"""
raventrack_affiliates.py
------------------------
Pulls affiliate-level and player-level data from the RavenTrack API
at https://affiliates.playabets.co.za and saves daily aggregate Parquet
files for use by build_domain_kpis.py.

Required env vars:
    RAVENTRACK_AFFILIATE_TOKEN  — Bearer token for affiliate activity endpoint
    RAVENTRACK_PLAYER_TOKEN     — Bearer token for player reporting endpoint

Optional env vars:
    RT_BACKFILL_START   — Start date, e.g. "2026-05-01" (default: 90 days ago)
    RT_BACKFILL_END     — End date, e.g. "2026-05-31" (default: yesterday)
    RT_PAGE_SIZE        — Results per page (default: 500)

Endpoint status (2026-06-20):
    GET /network/api/affiliate/search  — confirmed path, pending token scope fix
    GET /network/api/player/search     — path to be confirmed by Max (RavenTrack)

Run:
    python -m src.extract.raventrack_affiliates
"""
from __future__ import annotations

import os
import time
from datetime import date, timedelta, datetime, UTC
from pathlib import Path

import requests
import pandas as pd

from src.app_config import RAW_ROOT

BASE_URL = os.environ.get("RAVENTRACK_BASE_URL", "https://affiliates.playabets.co.za")
AFFILIATE_TOKEN = os.environ.get("RAVENTRACK_AFFILIATE_TOKEN", "")
PLAYER_TOKEN    = os.environ.get("RAVENTRACK_PLAYER_TOKEN", "")
PAGE_SIZE       = int(os.environ.get("RT_PAGE_SIZE", "500"))

_yesterday   = date.today() - timedelta(days=1)
_90_days_ago = date.today() - timedelta(days=90)
BACKFILL_START = date.fromisoformat(os.environ.get("RT_BACKFILL_START", str(_90_days_ago)))
BACKFILL_END   = date.fromisoformat(os.environ.get("RT_BACKFILL_END",   str(_yesterday)))

OUT_DIR = RAW_ROOT / "affiliates"

# ---------------------------------------------------------------------------
# Endpoint config — update paths here when Max confirms player endpoint
# ---------------------------------------------------------------------------
AFFILIATE_SEARCH_PATH = "/network/api/affiliate/search"
PLAYER_SEARCH_PATH    = "/network/api/player/search"   # to be confirmed

# Expected affiliate response fields (update once schema is confirmed):
#   affiliate_id, affiliate_name, clicks, registrations, ftds,
#   ftd_amount, revenue (GGR), commission, date
#
# Expected player response fields (update once schema is confirmed):
#   player_id, affiliate_id, registration_date, first_deposit_date,
#   first_deposit_amount, total_deposits, status


def _log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[raventrack] {ts} UTC | {msg}")


def _get_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _fetch_paginated(token: str, path: str, params: dict) -> list[dict]:
    """Fetch all pages from a RavenTrack paginated endpoint."""
    url = f"{BASE_URL}{path}"
    headers = _get_headers(token)
    all_records: list[dict] = []
    page = 1

    while True:
        p = {**params, "page": page, "perPage": PAGE_SIZE}
        try:
            resp = requests.get(url, headers=headers, params=p, timeout=60)
        except requests.RequestException as exc:
            _log(f"  Network error on {path} page {page}: {exc}")
            break

        if resp.status_code == 401:
            _log(f"  ERROR 401: Token is invalid or expired for {path}")
            break
        if resp.status_code == 403:
            _log(f"  ERROR 403: Token lacks required scope for {path}.")
            _log("  → Ask Max (RavenTrack) to grant the correct API ability to this token.")
            break
        if resp.status_code == 404:
            _log(f"  ERROR 404: Endpoint {path} not found. Confirm exact URL with Max.")
            break
        if not resp.ok:
            _log(f"  ERROR {resp.status_code} on {path}: {resp.text[:200]}")
            break

        data = resp.json()

        # Handle both paginated envelope {data: [...], meta: {...}} and plain list
        if isinstance(data, list):
            records = data
            has_more = False
        elif isinstance(data, dict):
            records = data.get("data", data.get("records", data.get("affiliates", data.get("players", []))))
            meta = data.get("meta", data.get("pagination", {}))
            last_page = meta.get("last_page", meta.get("totalPages", 1))
            has_more = page < last_page
        else:
            records = []
            has_more = False

        all_records.extend(records if isinstance(records, list) else [])
        _log(f"  Page {page}: {len(records)} records (total so far: {len(all_records)})")

        if not has_more or not records:
            break
        page += 1
        time.sleep(0.3)  # be polite to the API

    return all_records


def fetch_affiliates(date_from: date, date_to: date) -> pd.DataFrame:
    """Pull affiliate-level activity summary for the given date range."""
    if not AFFILIATE_TOKEN:
        _log("RAVENTRACK_AFFILIATE_TOKEN not set — skipping affiliate fetch")
        return pd.DataFrame()

    _log(f"Fetching affiliates {date_from} → {date_to}")
    params = {
        "dateFrom": str(date_from),
        "dateTo":   str(date_to),
    }
    records = _fetch_paginated(AFFILIATE_TOKEN, AFFILIATE_SEARCH_PATH, params)
    if not records:
        return pd.DataFrame()

    df = pd.json_normalize(records)

    # Normalise field names — RavenTrack may return camelCase or snake_case
    rename = {
        # camelCase variants
        "affiliateId":      "affiliate_id",
        "affiliateName":    "affiliate_name",
        "totalClicks":      "clicks",
        "totalRegistrations": "registrations",
        "totalFtds":        "ftds",
        "ftdAmount":        "ftd_amount",
        "totalRevenue":     "revenue",
        "totalCommission":  "commission",
        "marketingSpend":   "marketing_spend",
        # snake_case variants (may already be correct)
        "affiliate_id":     "affiliate_id",
        "affiliate_name":   "affiliate_name",
        "total_clicks":     "clicks",
        "total_registrations": "registrations",
        "total_ftds":       "ftds",
        "ftd_amount":       "ftd_amount",
        "total_revenue":    "revenue",
        "total_commission": "commission",
        "marketing_spend":  "marketing_spend",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    # Ensure numeric columns
    for col in ["clicks", "registrations", "ftds", "ftd_amount", "revenue", "commission", "marketing_spend"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["date_from"] = str(date_from)
    df["date_to"]   = str(date_to)
    df["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")

    return df


def fetch_players(date_from: date, date_to: date) -> pd.DataFrame:
    """Pull player-level data for the given date range."""
    if not PLAYER_TOKEN:
        _log("RAVENTRACK_PLAYER_TOKEN not set — skipping player fetch")
        return pd.DataFrame()

    _log(f"Fetching players {date_from} → {date_to}")
    params = {
        "dateFrom": str(date_from),
        "dateTo":   str(date_to),
    }
    records = _fetch_paginated(PLAYER_TOKEN, PLAYER_SEARCH_PATH, params)
    if not records:
        return pd.DataFrame()

    df = pd.json_normalize(records)

    rename = {
        "playerId":          "player_id",
        "player_id":         "player_id",
        "affiliateId":       "affiliate_id",
        "affiliate_id":      "affiliate_id",
        "affiliateName":     "affiliate_name",
        "affiliate_name":    "affiliate_name",
        "registrationDate":  "registration_date",
        "registration_date": "registration_date",
        "firstDepositDate":  "first_deposit_date",
        "first_deposit_date": "first_deposit_date",
        "firstDepositAmount": "first_deposit_amount",
        "first_deposit_amount": "first_deposit_amount",
        "totalDeposits":     "total_deposits",
        "total_deposits":    "total_deposits",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    for col in ["first_deposit_amount", "total_deposits"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["date_from"] = str(date_from)
    df["date_to"]   = str(date_to)
    df["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")

    return df


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not AFFILIATE_TOKEN and not PLAYER_TOKEN:
        _log("ERROR: Neither RAVENTRACK_AFFILIATE_TOKEN nor RAVENTRACK_PLAYER_TOKEN is set.")
        _log("Set them as environment variables and re-run.")
        return

    _log(f"Backfill range: {BACKFILL_START} → {BACKFILL_END}")
    _log(f"Base URL: {BASE_URL}")

    # Pull affiliate data for the full range (aggregate, not per-day)
    aff_df = fetch_affiliates(BACKFILL_START, BACKFILL_END)
    if not aff_df.empty:
        ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        out = OUT_DIR / f"affiliates_{BACKFILL_START}_{BACKFILL_END}_{ts}.parquet"
        aff_df.to_parquet(out, index=False)
        _log(f"Saved {len(aff_df)} affiliate rows → {out}")
        _log(f"Columns: {list(aff_df.columns)}")
    else:
        _log("No affiliate data returned (check token scope / endpoint path).")

    # Pull player data for the full range
    player_df = fetch_players(BACKFILL_START, BACKFILL_END)
    if not player_df.empty:
        ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        out = OUT_DIR / f"players_{BACKFILL_START}_{BACKFILL_END}_{ts}.parquet"
        player_df.to_parquet(out, index=False)
        _log(f"Saved {len(player_df)} player rows → {out}")
        _log(f"Columns: {list(player_df.columns)}")
    else:
        _log("No player data returned (check token scope / endpoint path).")


if __name__ == "__main__":
    main()
