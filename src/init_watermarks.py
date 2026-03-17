"""
init_watermarks.py
------------------
Backward-compatible wrapper for seeding missing watermark rows.

Prefer:
    python -m src.seed_watermarks

Use reset_watermarks.py for explicit backfill resets.
"""
from __future__ import annotations

from src.seed_watermarks import main


if __name__ == "__main__":
    main()
