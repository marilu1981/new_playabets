import type { CSSProperties } from "react";

interface MockOverlayProps {
  active?: boolean;
  label?: string;
  description?: string;
  style?: CSSProperties;
  /** When true, renders a small corner badge instead of a full blocking overlay. */
  badge?: boolean;
}

export default function MockOverlay({
  active = false,
  label = "Mock Data",
  description,
  style,
  badge = false,
}: MockOverlayProps) {
  if (!active) {
    return null;
  }

  if (badge) {
    return (
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ background: "oklch(0.72 0.14 85 / 18%)", color: "oklch(0.72 0.14 85)", border: "1px solid oklch(0.72 0.14 85 / 30%)", ...style }}
      >
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-black/60 text-[11px] uppercase tracking-[0.25em] text-white/70"
      style={{
        ...style,
      }}
    >
      <span>{label}</span>
      {description && (
        <span className="text-[9px] tracking-[0.1em] text-white/50">
          {description}
        </span>
      )}
    </div>
  );
}
