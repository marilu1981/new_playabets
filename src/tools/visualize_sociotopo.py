"""
visualize_sociotopo.py
----------------------
Generates three publication-ready charts from sociotopo_features.parquet:

  1. sociotopo_umap.png        - UMAP manifold scatter (all players, coloured by tier)
  2. sociotopo_radar_vips.png  - Radar charts for Critical VIPs (axis scores)
  3. sociotopo_heatmap.png     - Segment x risk tier player count heatmap

Usage (from project root on VM):
    python3 -m src.tools.visualize_sociotopo

Optional:
    --segment VIP               # filter radar to one segment (default: VIP)
    --tier Critical             # tier for radar charts (default: Critical)
    --out-dir /tmp              # output directory (default: ~/new_playabets)
    --dark                      # dark background theme (default: light)
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import matplotlib
    matplotlib.use("Agg")  # non-interactive backend for VM
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.patches import FancyArrowPatch
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

try:
    import seaborn as sns
    HAS_SNS = True
except ImportError:
    HAS_SNS = False

from src.app_config import SERVING_ROOT

SOCIOTOPO_PATH = SERVING_ROOT / "sociotopo_features.parquet"

# Brand colours
TIER_COLORS = {
    "Critical": "#d94040",
    "High":     "#ff7a00",
    "Moderate": "#ffb500",
    "Low":      "#7ab800",
}
TIER_ORDER   = ["Critical", "High", "Moderate", "Low"]
SEG_ORDER    = ["VIP", "Active", "New", "Cooling", "Lapsed", "Dormant"]
BRAND_GREEN  = "#7ab800"
BRAND_DARK   = "#093508"
BRAND_GOLD   = "#ffb500"


def _load() -> pd.DataFrame:
    if not SOCIOTOPO_PATH.exists():
        raise FileNotFoundError(f"Not found: {SOCIOTOPO_PATH}. Run src.kpis.sociotopo_features first.")
    df = pd.read_parquet(SOCIOTOPO_PATH)
    # Ensure tier ordering
    df["risk_tier"] = pd.Categorical(df["risk_tier"], categories=TIER_ORDER, ordered=True)
    return df


# -----------------------------------------------------------------------------
# Chart 1: UMAP Manifold Scatter
# -----------------------------------------------------------------------------

def plot_umap(df: pd.DataFrame, out: Path, dark: bool = False) -> None:
    if "umap_x" not in df.columns or df["umap_x"].isna().all():
        print("[viz] UMAP coordinates not available - skipping manifold scatter.")
        return

    bg   = "#0e1117" if dark else "#f8faf8"
    fg   = "#ffffff" if dark else "#1a1a1a"
    grid = "#2a2a2a" if dark else "#e8ede8"

    fig, ax = plt.subplots(figsize=(14, 10), facecolor=bg)
    ax.set_facecolor(bg)

    # Plot all users by tier (low-risk first so high-risk renders on top)
    for tier in reversed(TIER_ORDER):
        sub = df[df["risk_tier"] == tier]
        if sub.empty:
            continue
        alpha = 0.12 if tier in ("Low", "Moderate") else 0.25
        size  = 1.5  if tier in ("Low", "Moderate") else 2.5
        ax.scatter(
            sub["umap_x"], sub["umap_y"],
            c=TIER_COLORS[tier], s=size, alpha=alpha, linewidths=0, rasterized=True,
        )

    # Highlight VIPs with a ring
    vips = df[df["segment"] == "VIP"]
    if not vips.empty:
        ax.scatter(
            vips["umap_x"], vips["umap_y"],
            c=[TIER_COLORS.get(str(t), "#aaa") for t in vips["risk_tier"]],
            s=30, alpha=0.9, linewidths=0.5,
            edgecolors="white" if dark else BRAND_DARK, zorder=5, label="VIP players",
        )

    # Critical VIPs - star markers
    crit_vips = df[(df["risk_tier"] == "Critical") & (df["segment"] == "VIP")]
    if not crit_vips.empty:
        ax.scatter(
            crit_vips["umap_x"], crit_vips["umap_y"],
            marker="*", s=120, c=TIER_COLORS["Critical"],
            edgecolors="white" if dark else BRAND_DARK, linewidths=0.5,
            zorder=6, label=f"Critical VIPs ({len(crit_vips)})",
        )

    # Legend
    handles = [
        mpatches.Patch(color=TIER_COLORS[t], label=f"{t}  ({(df['risk_tier']==t).sum():,})")
        for t in TIER_ORDER
    ]
    handles.append(plt.scatter([], [], marker="*", s=80, c=TIER_COLORS["Critical"],
                               label=f"Critical VIPs ({len(crit_vips)})"))
    ax.legend(handles=handles, loc="upper left", framealpha=0.85,
              facecolor=bg, edgecolor=grid, labelcolor=fg, fontsize=9)

    total = len(df)
    ax.set_title(
        f"Playabets - SocioTopography Behavioural Manifold\n"
        f"{total:,} players  |  {df['risk_tier'].nunique()} risk tiers  |  30-day window",
        color=fg, fontsize=13, pad=14,
    )
    ax.set_xlabel("UMAP Dimension 1", color=fg, fontsize=9)
    ax.set_ylabel("UMAP Dimension 2", color=fg, fontsize=9)
    ax.tick_params(colors=fg, labelsize=7)
    for spine in ax.spines.values():
        spine.set_edgecolor(grid)

    plt.tight_layout()
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=bg)
    plt.close(fig)
    print(f"[viz] Saved -> {out}")


# -----------------------------------------------------------------------------
# Chart 2: Radar Charts for Critical VIPs
# -----------------------------------------------------------------------------

def _radar_one(ax, values: list[float], labels: list[str], color: str, title: str,
               dark: bool) -> None:
    N    = len(labels)
    angles = [n / N * 2 * math.pi for n in range(N)]
    angles += angles[:1]
    vals   = values + values[:1]

    bg  = "#0e1117" if dark else "#ffffff"
    fg  = "#ffffff" if dark else "#1a1a1a"
    grid = "#333333" if dark else "#cccccc"

    ax.set_facecolor(bg)
    ax.set_theta_offset(math.pi / 2)
    ax.set_theta_direction(-1)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels(["0.25", "0.5", "0.75", "1.0"], fontsize=5, color=fg)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, fontsize=7, color=fg)
    ax.tick_params(colors=fg)
    ax.spines["polar"].set_color(grid)
    for g in ax.yaxis.get_gridlines():
        g.set_color(grid)
        g.set_alpha(0.4)

    ax.plot(angles, vals, color=color, linewidth=1.5)
    ax.fill(angles, vals, color=color, alpha=0.25)

    ax.set_title(title, color=fg, fontsize=7, pad=8)


def plot_radar(df: pd.DataFrame, out: Path, segment: str, tier: str, dark: bool = False) -> None:
    sub = df[(df["risk_tier"] == tier) & (df["segment"] == segment)].copy()
    if sub.empty:
        print(f"[viz] No {tier} {segment} players - skipping radar.")
        return

    sub = sub.sort_values("risk_score", ascending=False).head(16)

    axes_labels = ["Financial\nCapacity", "Behavioral\nIntensity", "Outcome\nInstability", "Manifold\nPressure"]
    bg  = "#0e1117" if dark else "#f8faf8"
    fg  = "#ffffff" if dark else "#1a1a1a"

    ncols = 4
    nrows = math.ceil(len(sub) / ncols)
    fig   = plt.figure(figsize=(ncols * 3.5, nrows * 3.5 + 1.2), facecolor=bg)
    fig.suptitle(
        f"Playabets - {tier} Risk {segment} Players\nAxis scores: 0 = no risk, 1 = maximum risk",
        color=fg, fontsize=12, y=0.98,
    )

    for i, (_, row) in enumerate(sub.iterrows()):
        ax = fig.add_subplot(nrows, ncols, i + 1, projection="polar")
        fc_risk = 1 - float(row.get("fc_score", 0))   # invert: low FC = high financial risk
        bil     = float(row.get("bil_score", 0))
        oi      = float(row.get("oi_score",  0))
        mp      = float(row.get("manifold_pressure", 0)) if pd.notna(row.get("manifold_pressure")) else 0.0
        vals    = [fc_risk, bil, oi, mp]

        uid  = int(row["userid"])
        rscore = float(row["risk_score"])
        title  = f"User {uid}\nRisk: {rscore:.3f}"

        color = TIER_COLORS.get(str(row.get("risk_tier", tier)), TIER_COLORS[tier])
        _radar_one(ax, vals, axes_labels, color, title, dark)

    plt.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=bg)
    plt.close(fig)
    print(f"[viz] Saved -> {out}")


# -----------------------------------------------------------------------------
# Chart 3: Segment x Tier Heatmap
# -----------------------------------------------------------------------------

def plot_heatmap(df: pd.DataFrame, out: Path, dark: bool = False) -> None:
    bg = "#0e1117" if dark else "#f8faf8"
    fg = "#ffffff" if dark else "#1a1a1a"

    pivot = (
        df.groupby(["segment", "risk_tier"], observed=True)
        .size()
        .unstack(fill_value=0)
        .reindex(index=[s for s in SEG_ORDER if s in df["segment"].unique()])
        .reindex(columns=TIER_ORDER, fill_value=0)
    )

    # Percentage version for annotation
    row_totals = pivot.sum(axis=1).replace(0, 1)
    pct = pivot.div(row_totals, axis=0) * 100

    fig, ax = plt.subplots(figsize=(9, 5), facecolor=bg)
    ax.set_facecolor(bg)

    cmap = "RdYlGn_r"
    im = ax.imshow(pct.values, cmap=cmap, aspect="auto", vmin=0, vmax=100)

    ax.set_xticks(range(len(TIER_ORDER)))
    ax.set_xticklabels(TIER_ORDER, color=fg, fontsize=10)
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index.tolist(), color=fg, fontsize=10)
    ax.tick_params(colors=fg)

    for spine in ax.spines.values():
        spine.set_visible(False)

    for r in range(pivot.shape[0]):
        for c in range(pivot.shape[1]):
            count = pivot.iloc[r, c]
            pct_v = pct.iloc[r, c]
            text_color = "white" if pct_v > 55 else fg
            ax.text(c, r, f"{count:,}\n({pct_v:.0f}%)",
                    ha="center", va="center", fontsize=8.5,
                    color=text_color, fontweight="bold")

    cbar = fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02)
    cbar.set_label("% of segment", color=fg, fontsize=9)
    cbar.ax.yaxis.set_tick_params(color=fg)
    plt.setp(cbar.ax.yaxis.get_ticklabels(), color=fg)

    ax.set_title("Playabets - Churn Risk by Player Segment\n% of each segment in each risk tier",
                 color=fg, fontsize=12, pad=12)
    ax.set_xlabel("Risk Tier", color=fg, fontsize=10)
    ax.set_ylabel("RFM Segment", color=fg, fontsize=10)

    plt.tight_layout()
    fig.savefig(out, dpi=150, bbox_inches="tight", facecolor=bg)
    plt.close(fig)
    print(f"[viz] Saved -> {out}")


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--segment",  default="VIP")
    p.add_argument("--tier",     default="Critical")
    p.add_argument("--out-dir",  default=str(Path.home() / "new_playabets"))
    p.add_argument("--dark",     action="store_true")
    args = p.parse_args()

    if not HAS_MPL:
        print("matplotlib not installed. Run: pip install matplotlib seaborn")
        return

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = _load()
    print(f"[viz] Loaded {len(df):,} users")

    plot_umap(df,
              out=out_dir / "sociotopo_umap.png",
              dark=args.dark)

    plot_radar(df,
               out=out_dir / "sociotopo_radar_vips.png",
               segment=args.segment,
               tier=args.tier,
               dark=args.dark)

    plot_heatmap(df,
                 out=out_dir / "sociotopo_heatmap.png",
                 dark=args.dark)

    print(f"\n[viz] All charts saved to {out_dir}")
    print("[viz] Copy to local machine:")
    print(f"  scp marilusmit@<vm-ip>:{out_dir}/sociotopo_*.png .")


if __name__ == "__main__":
    main()
