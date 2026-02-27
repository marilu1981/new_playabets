"""
check_isbets_bi_access.py
-------------------------
Quick access checker for isbets_bi objects referenced in discovery docs.

This script can do two things:
1) Targeted access checks for Betting Events + User Data objects
2) Full metadata inventory with column-level discovery hints

Run from project root:
    python -m src.tools.check_isbets_bi_access

Optional:
    python -m src.tools.check_isbets_bi_access --sample-rows 3 --json-out data/serving/isbets_access_report.json
    python -m src.tools.check_isbets_bi_access --inventory --inventory-limit 5000 --json-out data/serving/isbets_inventory.json

Requires env vars:
    DWH_USER
    DWH_PASS
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy import text

from src.extract.db_utils import build_engine


# Built from Discovery workbook ontology + data dictionary mappings.
BETTING_EVENTS_OBJECTS = [
    "Eventi",
    "SottoEventi",
    "Quote",
    "CouponPrenotati",
    "CouponPrenotatiDettaglio",
    "Scommesse",
    "EsitiDettaglioScommessa",
    "DatiAggiuntiviEvento",
    "TipiQuota",
    "StatiQuota",
    # Current extraction view used in this repo:
    "view_betslips",
]

USER_DATA_OBJECTS = [
    "Utenti",
    "UtentiDettaglio",
    "UtentiSessioni",
    "StrutturaUtentiAttuale",
    "UtentiAutoesclusioniStorico",
    "Saldi",
    "SaldiBonus",
    "SaldiBonusAttuale",
    # Current extraction views already known in this repo:
    "view_users",
    "view_balances",
]

# Common schemas seen across docs + current extracts.
SCHEMAS_TO_TRY = ["dbo", "Dwh_en"]


@dataclass
class ObjectCheckResult:
    domain: str
    object_name: str
    schema_tried: str | None
    metadata_visible: bool
    metadata_schema: str | None
    metadata_type: str | None
    select_ok: bool
    sample_rows: int
    error: str | None


@dataclass
class InventoryObject:
    schema: str
    object_name: str
    object_type: str
    column_count: int
    registration_signal: bool
    first_deposit_signal: bool
    matched_registration_columns: list[str]
    matched_first_deposit_columns: list[str]
    preview_columns: list[str]


def _unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _metadata_map(conn, object_names: list[str]) -> dict[str, tuple[str, str]]:
    """
    Returns:
      lower_table_name -> (schema, table_type)
    """
    if not object_names:
        return {}

    placeholders = ", ".join([f":n{i}" for i in range(len(object_names))])
    params = {f"n{i}": n for i, n in enumerate(object_names)}
    q = text(
        f"""
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE LOWER(TABLE_NAME) IN ({placeholders})
        """
    )

    rows = conn.execute(q, params).fetchall()
    out: dict[str, tuple[str, str]] = {}
    for row in rows:
        schema, name, table_type = row[0], row[1], row[2]
        out[str(name).lower()] = (str(schema), str(table_type))
    return out


def _try_select(conn, schema: str, obj_name: str, sample_rows: int) -> tuple[bool, int, str | None]:
    # Object names are from internal docs, but still quote defensively.
    safe_schema = schema.replace("]", "]]")
    safe_obj = obj_name.replace("]", "]]")
    sql = text(f"SELECT TOP ({int(sample_rows)}) * FROM [{safe_schema}].[{safe_obj}]")
    try:
        rows = conn.execute(sql).fetchall()
        return True, len(rows), None
    except Exception as exc:  # noqa: BLE001
        return False, 0, str(exc)


def _load_inventory_tables(conn, limit: int | None = None) -> list[tuple[str, str, str]]:
    sql = """
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    """
    if limit:
        sql = f"""
            SELECT TOP ({int(limit)}) TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        """
    rows = conn.execute(text(sql)).fetchall()
    return [(str(r[0]), str(r[1]), str(r[2])) for r in rows]


def _load_inventory_columns(conn) -> dict[tuple[str, str], list[str]]:
    rows = conn.execute(
        text(
            """
            SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
            """
        )
    ).fetchall()

    out: dict[tuple[str, str], list[str]] = {}
    for row in rows:
        key = (str(row[0]), str(row[1]))
        out.setdefault(key, []).append(str(row[2]))
    return out


def run_inventory(inventory_limit: int = 5000, preview_cols: int = 12) -> dict:
    """
    Full catalog scan from INFORMATION_SCHEMA with lightweight heuristics
    to surface likely objects for:
      - true registration baselines
      - first-deposit signals via BonusType/campaigns
    """
    engine = build_engine()
    with engine.connect() as conn:
        tables = _load_inventory_tables(conn, limit=inventory_limit)
        cols_map = _load_inventory_columns(conn)

    reg_name_signals = ("user", "utent", "registr", "account", "profil")
    reg_col_signals = {
        "userid",
        "idutente",
        "creationdate",
        "insertdate",
        "datainserimento",
        "dataregistrazione",
        "registrationdate",
        "testuser",
        "uid",
        "userstatus",
    }

    fd_name_signals = ("bonus", "campaign", "deposit", "freebet")
    fd_col_signals = {
        "bonustype",
        "bonustypeid",
        "campaignid",
        "bonusid",
        "userid",
        "idutente",
        "insertdate",
        "dateversion",
        "amount",
        "freebetstatusid",
    }

    objects: list[InventoryObject] = []
    for schema, name, obj_type in tables:
        cols = cols_map.get((schema, name), [])
        cols_lower = [c.lower() for c in cols]
        name_lower = name.lower()

        reg_hits = [c for c in cols if c.lower() in reg_col_signals]
        fd_hits = [c for c in cols if c.lower() in fd_col_signals]

        registration_signal = bool(reg_hits) and any(sig in name_lower for sig in reg_name_signals)
        first_deposit_signal = bool(fd_hits) and any(sig in name_lower for sig in fd_name_signals)

        objects.append(
            InventoryObject(
                schema=schema,
                object_name=name,
                object_type=obj_type,
                column_count=len(cols),
                registration_signal=registration_signal,
                first_deposit_signal=first_deposit_signal,
                matched_registration_columns=reg_hits,
                matched_first_deposit_columns=fd_hits,
                preview_columns=cols[:preview_cols],
            )
        )

    ts = datetime.now(UTC).isoformat(timespec="seconds")
    reg_candidates = [asdict(o) for o in objects if o.registration_signal]
    fd_candidates = [asdict(o) for o in objects if o.first_deposit_signal]

    return {
        "summary": {
            "checked_at_utc": ts,
            "database": "isbets_bi",
            "inventory_limit": inventory_limit,
            "total_objects": len(objects),
            "registration_candidates": len(reg_candidates),
            "first_deposit_candidates": len(fd_candidates),
        },
        "registration_candidates": reg_candidates,
        "first_deposit_candidates": fd_candidates,
        "objects": [asdict(o) for o in objects],
    }


def run_check(sample_rows: int = 1) -> dict:
    objects_by_domain = {
        "betting_events": _unique(BETTING_EVENTS_OBJECTS),
        "user_data": _unique(USER_DATA_OBJECTS),
    }
    all_objects = _unique(BETTING_EVENTS_OBJECTS + USER_DATA_OBJECTS)

    engine = build_engine()
    results: list[ObjectCheckResult] = []

    with engine.connect() as conn:
        meta = _metadata_map(conn, [n.lower() for n in all_objects])

        for domain, names in objects_by_domain.items():
            for name in names:
                key = name.lower()
                metadata = meta.get(key)
                metadata_visible = metadata is not None
                metadata_schema = metadata[0] if metadata else None
                metadata_type = metadata[1] if metadata else None

                schema_candidates = []
                if metadata_schema:
                    schema_candidates.append(metadata_schema)
                schema_candidates.extend(SCHEMAS_TO_TRY)
                schema_candidates = _unique(schema_candidates)

                select_ok = False
                sample_count = 0
                last_error: str | None = None
                chosen_schema: str | None = None

                for schema in schema_candidates:
                    ok, cnt, err = _try_select(conn, schema, name, sample_rows)
                    if ok:
                        select_ok = True
                        sample_count = cnt
                        chosen_schema = schema
                        last_error = None
                        break
                    chosen_schema = schema
                    last_error = err

                results.append(
                    ObjectCheckResult(
                        domain=domain,
                        object_name=name,
                        schema_tried=chosen_schema,
                        metadata_visible=metadata_visible,
                        metadata_schema=metadata_schema,
                        metadata_type=metadata_type,
                        select_ok=select_ok,
                        sample_rows=sample_count,
                        error=last_error if not select_ok else None,
                    )
                )

    ts = datetime.now(UTC).isoformat(timespec="seconds")
    summary = {
        "checked_at_utc": ts,
        "database": "isbets_bi",
        "schemas_tried": SCHEMAS_TO_TRY,
        "total_objects": len(results),
        "accessible_objects": sum(1 for r in results if r.select_ok),
        "metadata_visible_objects": sum(1 for r in results if r.metadata_visible),
    }
    return {
        "summary": summary,
        "results": [asdict(r) for r in results],
    }


def print_report(report: dict) -> None:
    summary = report["summary"]
    print("\nisbets_bi Access Check")
    print("=" * 72)
    print(
        f"Checked at (UTC): {summary['checked_at_utc']} | "
        f"Accessible: {summary['accessible_objects']}/{summary['total_objects']} | "
        f"Metadata visible: {summary['metadata_visible_objects']}/{summary['total_objects']}"
    )

    for domain in ("betting_events", "user_data"):
        rows = [r for r in report["results"] if r["domain"] == domain]
        print(f"\n[{domain}]")
        for r in rows:
            status = "OK" if r["select_ok"] else "FAIL"
            meta = f"{r['metadata_schema']}.{r['object_name']}" if r["metadata_visible"] else "not_visible_in_metadata"
            line = (
                f" - {status:<4} {r['object_name']:<30} "
                f"schema={str(r['schema_tried']):<8} metadata={meta:<45} sample_rows={r['sample_rows']}"
            )
            print(line)
            if r["error"]:
                print(f"      error: {r['error'][:220]}")


def print_inventory_report(report: dict) -> None:
    summary = report["summary"]
    print("\nisbets_bi Inventory")
    print("=" * 72)
    print(
        f"Checked at (UTC): {summary['checked_at_utc']} | "
        f"Objects: {summary['total_objects']} | "
        f"Registration candidates: {summary['registration_candidates']} | "
        f"First-deposit candidates: {summary['first_deposit_candidates']}"
    )

    print("\n[registration_candidates]")
    for row in report["registration_candidates"][:40]:
        print(
            f" - {row['schema']}.{row['object_name']} ({row['object_type']}) "
            f"cols={row['column_count']} reg_cols={row['matched_registration_columns']}"
        )

    print("\n[first_deposit_candidates]")
    for row in report["first_deposit_candidates"][:40]:
        print(
            f" - {row['schema']}.{row['object_name']} ({row['object_type']}) "
            f"cols={row['column_count']} fd_cols={row['matched_first_deposit_columns']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Check isbets_bi access for Betting Events and User Data objects.")
    parser.add_argument("--sample-rows", type=int, default=1, help="Rows to fetch when testing SELECT TOP(N). Default: 1")
    parser.add_argument("--inventory", action="store_true", help="Run full INFORMATION_SCHEMA inventory instead of targeted checks")
    parser.add_argument("--inventory-limit", type=int, default=5000, help="Max objects to scan in inventory mode. Default: 5000")
    parser.add_argument("--json-out", type=Path, default=None, help="Optional path to save JSON report")
    args = parser.parse_args()

    if args.sample_rows < 1 or args.sample_rows > 20:
        raise SystemExit("--sample-rows must be between 1 and 20")
    if args.inventory_limit < 1 or args.inventory_limit > 20000:
        raise SystemExit("--inventory-limit must be between 1 and 20000")

    if args.inventory:
        report = run_inventory(inventory_limit=args.inventory_limit)
        print_inventory_report(report)
    else:
        report = run_check(sample_rows=args.sample_rows)
        print_report(report)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nSaved JSON report: {args.json_out}")


if __name__ == "__main__":
    main()
