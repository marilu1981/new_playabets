from __future__ import annotations

from pathlib import Path
import pandas as pd


def read_all_parquets(folder: Path, pattern: str) -> pd.DataFrame:
    files = sorted(folder.glob(pattern))
    if not files:
        return pd.DataFrame()
    return pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)


def normalize_cols(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    """Strip whitespace and return (df, lowercase->actual mapping)."""
    df = df.copy()
    df.columns = [c.strip() for c in df.columns]
    mapping = {c.lower(): c for c in df.columns}
    return df, mapping


def ensure_cols(mapping: dict[str, str], required_lower: list[str], context: str) -> dict[str, str]:
    missing = [c for c in required_lower if c not in mapping]
    if missing:
        raise RuntimeError(f"{context}: missing required columns: {missing}. Found: {list(mapping.values())}")
    return {k: mapping[k] for k in required_lower}


def to_date(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce").dt.date


def to_dt(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def to_num(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(default)
