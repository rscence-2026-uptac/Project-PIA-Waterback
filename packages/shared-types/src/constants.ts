// Every magic number named once, commented with its source (specs/01-seed-data.md).
export const WSP_CONSTANTS = {
  TURBIDITY_WARNING_NTU: 5,     // source: CWD 2022 Water Safety Plan
  TURBIDITY_SHUTDOWN_NTU: 500,  // source: CWD 2022 Water Safety Plan — forces shutdown
  CLARIFIER_CAPACITY_LPS: 46,   // source: CWD 2022 Water Safety Plan
  RESERVOIR_USABLE_M3: 340,     // source: CWD 2022 Water Safety Plan
  JMP_ROUNDTRIP_MIN: 30,        // source: WHO/UNICEF JMP benchmark
} as const;

// source: sprint plan / spec 02 — PAGASA-style 0–4 signal scale
export const SIGNAL_LEVEL_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;

export type SignalLevel = 0 | 1 | 2 | 3 | 4;

/** p < 0.2 → 0 · 0.2–0.4 → 1 · 0.4–0.6 → 2 · 0.6–0.8 → 3 · p ≥ 0.8 → 4 (lower bound inclusive) */
export function toSignalLevel(p: number): SignalLevel {
  let level = 0;
  for (const t of SIGNAL_LEVEL_THRESHOLDS) if (p >= t) level++;
  return level as SignalLevel;
}
