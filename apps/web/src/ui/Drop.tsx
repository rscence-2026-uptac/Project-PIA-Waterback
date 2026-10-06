// The drop is the status (DESIGN.md, "Drop Gauge"). Level, colour and ripple always agree
// with the words beside it, which is why the gauge itself is hidden from screen readers.
import { useId } from "react";
import type { DropLook } from "../lib/waterState";

// Drop outline in a 160×210 box: tip at (80,8), round body centred at (80,135), r = 72.
const DROP_PATH = "M80 8 Q110 50 139.3 94.2 A72 72 0 1 1 20.7 94.2 Q50 50 80 8 Z";
const TOP = 8;
const BOTTOM = 207;

const LOOKS: Record<DropLook, { level: number; color: string; ripples: boolean; slow?: boolean }> = {
  flowing: { level: 0.8, color: "var(--color-water)", ripples: true },
  headsup: { level: 0.72, color: "var(--color-water-murky)", ripples: true },
  muddy: { level: 0.14, color: "var(--color-water-cloudy)", ripples: true, slow: true },
  low: { level: 0.32, color: "var(--color-water)", ripples: false },
  repair: { level: 0.06, color: "var(--color-water)", ripples: false },
};

export function DropGauge({ look, width = 120, className = "" }: {
  look: DropLook;
  width?: number;
  className?: string;
}) {
  const clipId = useId();
  const { level, color, ripples, slow } = LOOKS[look];
  const surfaceY = BOTTOM - level * (BOTTOM - TOP);

  return (
    <svg
      viewBox="0 0 160 210"
      width={width}
      height={(width * 210) / 160}
      aria-hidden="true"
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={DROP_PATH} />
        </clipPath>
      </defs>
      <path d={DROP_PATH} fill="var(--color-mist)" />
      <g clipPath={`url(#${clipId})`}>
        <g
          style={{
            transform: `translateY(${surfaceY}px)`,
            transition: "transform 800ms var(--ease-level)",
          }}
        >
          <path
            className={ripples ? "ripple" : undefined}
            d="M0 0 Q20 -6 40 0 T80 0 T120 0 T160 0 T200 0 T240 0 T280 0 T320 0 V220 H0 Z"
            style={{ fill: color, transition: "fill 600ms ease", ...(slow && { animationDuration: "10s" }) }} // muddy: dull, sluggish ripple (DESIGN.md)
          />
        </g>
      </g>
      <path d={DROP_PATH} fill="none" stroke="var(--color-ink)" strokeWidth={4.5} />
    </svg>
  );
}
