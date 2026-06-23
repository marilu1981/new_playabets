"""
raventrack_affiliates.py
------------------------
Pulls affiliate-level and player-level data from the RavenTrack API
at https://affiliates.playabets.co.za and saves daily aggregate Parquet
files for use by build_domain_kpis.py.

Required env vars:
    RAVENTRACK_AFFILIATE_TOKEN  — Bearer token with affiliate-list ability
    RAVENTRACK_PLAYER_TOKEN     — Bearer token with player-reporting ability
    RAVENTRACK_VENDOR_ID        — Playabets vendor/operator ID in RavenTrack
                                  (ask Max — needed for player reporting endpoint)

Optional env vars:
    RT_BACKFILL_START   — Start date, e.g. "2026-05-01" (default: 90 days ago)
    RT_BACKFILL_END     — End date, e.g. "2026-05-31" (default: yesterday)
    RT_PAGE_SIZE        — Results per page: 50,100,150,200,250 (default: 100)
    RT_CURRENCY         — ISO 4217 currency code (default: ZAR)

Confirmed endpoints (from Postman collection dce86e95):
    GET /network/api/affiliate/search
        params: created_at_from, created_at_to, paginate, per_page, page, detailed
        token:  RAVENTRACK_AFFILIATE_TOKEN  (needs 'Affiliate List' ability)
        status: 403 — token scope not yet granted in RavenTrack admin

    GET /network/api/reporting/player
        params: date_range=custom, start_date, end_date, currency, grouping,
                vendor, paginate, per_page, page, new_players_only
        token:  RAVENTRACK_PLAYER_TOKEN  (token authenticates, needs vendor ID)
        grouping options: player | player_by_day | player_by_month
        status: 500/timeout — vendor ID required, ask Max for Playabets vendor ID

Token abilities to request from Max in RavenTrack admin:
    Affiliate token → 'Affiliate List' ability
    Player token    → 'Player Activity By Date Range' ability

Run:
    RAVENTRACK_AFFILIATE_TOKEN=... RAVENTRACK_PLAYER_TOKEN=... RAVENTRACK_VENDOR_ID=... \\
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

BASE_URL        = os.environ.get("RAVENTRACK_BASE_URL", "https://affiliates.playabets.co.za")
AFFILIATE_TOKEN = os.environ.get("RAVENTRACK_AFFILIATE_TOKEN", "")
PLAYER_TOKEN    = os.environ.get("RAVENTRACK_PLAYER_TOKEN", "")
VENDOR_ID       = os.environ.get("RAVENTRACK_VENDOR_ID", "")   # Playabets operator ID — ask Max
CURRENCY        = os.environ.get("RT_CURRENCY", "ZAR")
PAGE_SIZE       = int(os.environ.get("RT_PAGE_SIZE", "100"))   # valid: 50,100,150,200,250

_yesterday   = date.today() - timedelta(days=1)
_90_days_ago = date.today() - timedelta(days=90)
BACKFILL_START = date.fromisoformat(os.environ.get("RT_BACKFILL_START", str(_90_days_ago)))
BACKFILL_END   = date.fromisoformat(os.environ.get("RT_BACKFILL_END",   str(_yesterday)))

OUT_DIR = RAW_ROOT / "affiliates"

# Confirmed working paths (tested 2026-06-23)
AFFILIATE_REPORTING_PATH = "/network/api/reporting/affiliate"
PLAYER_REPORTING_PATH    = "/network/api/reporting/player"


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

        # Handle RavenTrack reporting envelope: {params:{}, results:{data:[...], last_page:N}, totals:{}}
        # Also handle plain list or simpler {data:[...]} shapes.
        if isinstance(data, list):
            records = data
            has_more = False
        elif isinstance(data, dict):
            results = data.get("results", data)
            records = results.get("data", data.get("data", data.get("records", data.get("affiliates", data.get("players", [])))))
            last_page = results.get("last_page", data.get("last_page", 1))
            has_more = page < int(last_page or 1)
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
    """Pull affiliate activity from /network/api/reporting/affiliate."""
    if not AFFILIATE_TOKEN:
        _log("RAVENTRACK_AFFILIATE_TOKEN not set — skipping affiliate fetch")
        return pd.DataFrame()

    _log(f"Fetching affiliates {date_from} → {date_to}")
    params = {
        "start_date":    str(date_from),
        "end_date":      str(date_to),
        "currency":      CURRENCY,
        "grouping":      "affiliate",
        "show_by_site":  "0",
        "per_page":      str(PAGE_SIZE),
    }
    records = _fetch_paginated(AFFILIATE_TOKEN, AFFILIATE_REPORTING_PATH, params)
    if not records:
        return pd.DataFrame()

    df = pd.json_normalize(records)

    # Normalise field names from /reporting/affiliate response
    rename = {
        "affiliate_profile_id":       "affiliate_id",
        "affiliate_profile_username": "affiliate_name",
        "clicks":                     "clicks",
        "registrations":              "registrations",
        "ftd_count":                  "ftds",
        "new_account_deposits":       "ftd_amount",
        "gross_revenue":              "revenue",
        "net_revenue":                "net_revenue",
        "deposits":                   "total_deposits",
        "total_commission":           "commission",
        "revshare_commission":        "revshare_commission",
        "cpa_commission":             "cpa_commission",
        "active_accounts":            "active_players",
        "vendor_id":                  "vendor_id",
        "vendor_name":                "vendor_name",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    # Ensure numeric columns
    for col in ["clicks", "registrations", "ftds", "ftd_amount", "revenue", "net_revenue",
                "total_deposits", "commission", "revshare_commission", "cpa_commission", "active_players"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

    df["date_from"] = str(date_from)
    df["date_to"]   = str(date_to)
    df["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")

    return df


def fetch_players(date_from: date, date_to: date) -> pd.DataFrame:
    """Pull player-level activity data for the given date range."""
    if not PLAYER_TOKEN:
        _log("RAVENTRACK_PLAYER_TOKEN not set — skipping player fetch")
        return pd.DataFrame()

    if not VENDOR_ID:
        _log("RAVENTRACK_VENDOR_ID not set — skipping player fetch")
        _log("  Ask Max (RavenTrack) for the Playabets operator/vendor ID")
        return pd.DataFrame()

    _log(f"Fetching players {date_from} → {date_to} (vendor={VENDOR_ID}, currency={CURRENCY})")
    params = {
        "date_range": "custom",
        "start_date": str(date_from),
        "end_date":   str(date_to),
        "currency":   CURRENCY,
        "grouping":   "player",
        "vendor":     VENDOR_ID,
    }
    records = _fetch_paginated(PLAYER_TOKEN, PLAYER_REPORTING_PATH, params)
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
