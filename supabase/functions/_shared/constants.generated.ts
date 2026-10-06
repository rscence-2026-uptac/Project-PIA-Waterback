// GENERATED from packages/shared-types/src/constants.ts — never hand-edit. Regenerate: node supabase/functions/_shared/gen_model.mjs
// Every magic number named once, commented with its source (specs/01-seed-data.md).
export const WSP_CONSTANTS = {
  TURBIDITY_LIMIT_NTU: 5,          // source: CWD 2022 WSP pp.43-44 (permissible limit; above -> treat/bypass to clarifier)
  TURBIDITY_SHUTOFF_NTU: 500,      // source: CWD 2022 WSP p.43 (>= 500 temporary shut-off at Caramayon I source)
  CLARIFIER_CAPACITY_CMD: 4000,    // source: CWD 2022 WSP p.16
  CLARIFIER_CAPACITY_LPS: 46.3,    // source: CWD 2022 WSP p.16 (derived: 4,000 CMD / 86.4)
  RESERVOIR_TOTAL_M3: 440,         // source: CWD 2022 WSP p.13
  RESERVOIR_FIRE_RESERVE_M3: 100,  // source: CWD 2022 WSP p.13
  RESERVOIR_USABLE_M3: 340,        // source: CWD 2022 WSP p.13 (derived: 440 - 100)
  JMP_ROUNDTRIP_MIN: 30,           // source: WHO/UNICEF JMP benchmark
  SERVED_BARANGAYS: 26,            // source: CWD 2022 WSP pp.17,19
  SERVICE_ZONES: 10,               // source: CWD 2022 WSP p.17
  LOW_PRESSURE_ZONES: [8, 10],     // source: CWD 2022 WSP p.17 (farthest from source, low/zero pressure at peak)
} as const;

/** True for zones 8 and 10 (low/zero pressure at peak demand). */
export function isLowPressureZone(zone: number | null | undefined): boolean {
  return zone != null && (WSP_CONSTANTS.LOW_PRESSURE_ZONES as readonly number[]).includes(zone);
}

// source: sprint plan / spec 02 — PAGASA-style 0–4 signal scale
export const SIGNAL_LEVEL_THRESHOLDS = [0.2, 0.4, 0.6, 0.8] as const;

export type SignalLevel = 0 | 1 | 2 | 3 | 4;

/** p < 0.2 → 0 · 0.2–0.4 → 1 · 0.4–0.6 → 2 · 0.6–0.8 → 3 · p ≥ 0.8 → 4 (lower bound inclusive) */
export function toSignalLevel(p: number): SignalLevel {
  let level = 0;
  for (const t of SIGNAL_LEVEL_THRESHOLDS) if (p >= t) level++;
  return level as SignalLevel;
}
