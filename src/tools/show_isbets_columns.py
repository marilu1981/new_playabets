"""
show_isbets_columns.py
----------------------
Print table/view metadata and column names using the existing DWH connection.

Run from project root:
    python -m src.tools.show_isbets_columns

Optional:
    python -m src.tools.show_isbets_columns --sample-rows 2
    python -m src.tools.show_isbets_columns --only Dwh.Utenti Stats.Transazioni_DepositiUtente

Requires env vars:
    DWH_USER
    DWH_PASS
"""
from __future__ import annotations

import argparse
from typing import Iterable

from sqlalchemy import text

from src.extract.db_utils import build_engine


DEFAULT_OBJECTS = [
    "Dwh.Utenti",
    "Stats.Transazioni_DepositiUtente",
    "Dwh.StrutturaUtentiAttuale",
    "Dwh.UtentiGruppi",
    "Dwh.UtentiSessioni",
    "Dwh.UtentiAutoesclusioni",
    "Dwh.UtentiAutoesclusioniStorico",
    "Dwh_en.view_users",
    "Dwh_en.view_usersselfexclusions",
    "Dwh_en.view_usersselfexclusionshistorical",
]


def _parse_object_name(name: str) -> tuple[str | None, str]:
    parts = name.split(".", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return None, name


def _load_matching_objects(conn, schema: str | None, table: str) -> list[tuple[str, str, str]]:
    if schema:
        rows = conn.execute(
            text(
                """
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE LOWER(TABLE_SCHEMA) = LOWER(:schema)
                  AND LOWER(TABLE_NAME) = LOWER(:table)
                ORDER BY TABLE_SCHEMA, TABLE_NAME
                """
            ),
            {"schema": schema, "table": table},
        ).fetchall()
    else:
        rows = conn.execute(
            text(
                """
                SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE LOWER(TABLE_NAME) = LOWER(:table)
                ORDER BY TABLE_SCHEMA, TABLE_NAME
                """
            ),
            {"table": table},
        ).fetchall()
    return [(str(r[0]), str(r[1]), str(r[2])) for r in rows]


def _load_columns(conn, schema: str, table: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        text(
            """
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = :schema
              AND TABLE_NAME = :table
            ORDER BY ORDINAL_POSITION
            """
        ),
        {"schema": schema, "table": table},
    ).fetchall()
    return [(str(r[0]), str(r[1])) for r in rows]


def _sample_rows(conn, schema: str, table: str, n: int) -> list[dict]:
    safe_schema = schema.replace("]", "]]")
    safe_table = table.replace("]", "]]")
    rows = conn.execute(text(f"SELECT TOP ({n}) * FROM [{safe_schema}].[{safe_table}]")).mappings().all()
    out: list[dict] = []
    for row in rows:
        rec = {}
        for k, v in row.items():
            txt = str(v)
            rec[str(k)] = txt if len(txt) <= 80 else f"{txt[:77]}..."
        out.append(rec)
    return out


def run(objects: Iterable[str], sample_rows: int) -> None:
    engine = build_engine()
    with engine.connect() as conn:
        for obj in objects:
            schema_filter, table = _parse_object_name(obj)
            matches = _load_matching_objects(conn, schema_filter, table)
            print("\n" + "=" * 90)
            print(f"Requested: {obj}")
            if not matches:
                print("  not found in INFORMATION_SCHEMA.TABLES")
                continue

            for schema, name, table_type in matches:
                print(f"\n  Found: {schema}.{name} ({table_type})")
                cols = _load_columns(conn, schema, name)
                print(f"  Columns ({len(cols)}):")
                for c_name, c_type in cols:
                    print(f"    - {c_name} [{c_type}]")

                if sample_rows > 0:
                    try:
                        samples = _sample_rows(conn, schema, name, sample_rows)
                        print(f"  Sample rows fetched: {len(samples)}")
                        for i, row in enumerate(samples, start=1):
                            print(f"    row{i}: {row}")
                    except Exception as exc:  # noqa: BLE001
                        print(f"  sample read failed: {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Show columns and sample rows for key isbets_bi objects.")
    parser.add_argument("--sample-rows", type=int, default=1, help="Number of sample rows to print per object (default 1; 0 disables)")
    parser.add_argument("--only", nargs="*", default=None, help="Optional explicit object list, e.g. Dwh.Utenti")
    args = parser.parse_args()

    if args.sample_rows < 0 or args.sample_rows > 10:
        raise SystemExit("--sample-rows must be between 0 and 10")

    targets = args.only if args.only else DEFAULT_OBJECTS
    run(targets, sample_rows=args.sample_rows)


if __name__ == "__main__":
    main()
