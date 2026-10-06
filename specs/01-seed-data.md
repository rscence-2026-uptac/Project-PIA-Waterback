# Spec: Seed data

## What it does
Seeds the database with CWD's real 2022 Water Safety Plan constants and a plausible simulated July readings series, plus a one-time Open-Meteo rainfall pull, so every other spec has non-empty, source-cited data to build and demo against — and so every acceptance criterion in this backlog is checked against this seed, never against live CWD numbers we don't have during the event.

## Data contract
```ts
import { z } from "zod";

// packages/shared-types — every magic number named once, commented with its source
export const WSP_CONSTANTS = {
  TURBIDITY_LIMIT_NTU: 5,          // source: CWD 2022 WSP p.43–44 (permissible limit, not a warning)
  TURBIDITY_SHUTOFF_NTU: 500,      // source: CWD 2022 WSP p.43 (>= 500, Caramayon I source shut-off)
  CLARIFIER_CAPACITY_CMD: 4000,    // source: CWD 2022 WSP p.16
  CLARIFIER_CAPACITY_LPS: 46.3,    // source: CWD 2022 WSP p.16 (4,000 CMD ÷ 86.4)
  RESERVOIR_TOTAL_M3: 440,         // source: CWD 2022 WSP p.13
  RESERVOIR_FIRE_RESERVE_M3: 100,  // source: CWD 2022 WSP p.13
  RESERVOIR_USABLE_M3: 340,        // source: CWD 2022 WSP p.13 (440 − 100)
  JMP_ROUNDTRIP_MIN: 30,           // source: WHO/UNICEF JMP benchmark (not WSP)
  SERVED_BARANGAYS: 26,            // source: CWD 2022 WSP p.17,19
  SERVICE_ZONES: 10,               // source: CWD 2022 WSP p.17
  LOW_PRESSURE_ZONES: [8, 10],     // source: CWD 2022 WSP p.17 (farthest from source)
} as const;

export const ReadingSeedRow = z.object({
  recorded_at: z.string().datetime(),
  intake_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),        // only Kulador rows
  clarifier_inflow_lps: z.number().nonnegative().nullable(),   // only Kulador rows
  source: z.literal("operator"), // seed rows are explicitly labeled simulated, not sensor-sourced
});

export const OpenMeteoPullConfig = z.object({
  latitude: z.number(),
  longitude: z.number(),
  start_date: z.string(), // ISO date
  end_date: z.string(),
  daily: z.array(z.literal("precipitation_sum")),
});
```

## Acceptance criteria
- [ ] `supabase/seed/cwd_wsp_constants.sql`, `intakes.sql` and `barangays.sql` (in that order, re-runnable) load the ten WSP constants (5/500 NTU, 4,000 CMD ≈ 46.3 L/s, 440/100/340 m³, JMP 30 min, 26 barangays, 10 zones), 4 intakes and 26 barangays — each constant row commented `-- source: CWD 2022 WSP p.X`
- [ ] `supabase/seed/july_readings.sql` (still to build) loads at least 30 days of hourly reading rows per intake, explicitly labeled "simulated proposed sensors — CWD monitors turbidity daily (WSP pp.43–47)" (never presented as real CWD telemetry, on-screen or in the pitch)
- [ ] `supabase/seed/openmeteo_rainfall.ts` pulls and stores at least 30 days of real historical rainfall for Catbalogan from Open-Meteo's free API
- [ ] Every magic number used anywhere in the codebase (thresholds, JMP benchmark) is imported from `packages/shared-types`'s `WSP_CONSTANTS` — never re-typed as a literal in a component or function

## Out of scope
- Live/real-time ingestion from an actual CWD SCADA feed (doesn't exist / no access)
- Backfilling more than one month of history

## Depends on
- specs/00-data-model.md
2026-10-06: aligned with CWD 2022 WSP (see docs/wsp_findings.md)
