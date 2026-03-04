import type { CSSProperties } from "react";

interface MockOverlayProps {
  active?: boolean;
  label?: string;
  description?: string;
  style?: CSSProperties;
}

export default function MockOverlay({
  active = false,
  label = "Mock Data",
  description,
  style,
}: MockOverlayProps) {
  if (!active) {
    return null;
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
