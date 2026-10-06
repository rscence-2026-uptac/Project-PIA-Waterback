# Spec: Seed data

## What it does
Seeds the database with CWD's real 2022 Water Safety Plan constants and a plausible simulated July readings series, plus a one-time Open-Meteo rainfall pull, so every other spec has non-empty, source-cited data to build and demo against — and so every acceptance criterion in this backlog is checked against this seed, never against live CWD numbers we don't have during the event.

## Data contract
```ts
import { z } from "zod";

// packages/shared-types — every magic number named once, commented with its source
export const WSP_CONSTANTS = {
  TURBIDITY_WARNING_NTU: 5,     // source: CWD 2022 Water Safety Plan
  TURBIDITY_SHUTDOWN_NTU: 500,  // source: CWD 2022 Water Safety Plan — forces shutdown
  CLARIFIER_CAPACITY_LPS: 46,   // source: CWD 2022 Water Safety Plan
  RESERVOIR_USABLE_M3: 340,     // source: CWD 2022 Water Safety Plan
  JMP_ROUNDTRIP_MIN: 30,        // source: WHO/UNICEF JMP benchmark
} as const;

export const ReadingSeedRow = z.object({
  recorded_at: z.string().datetime(),
  purok_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100),
  clarifier_inflow_lps: z.number().nonnegative(),
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
- [ ] `supabase/seed/cwd_wsp_constants.sql` loads the 5/500 NTU thresholds, 46 L/s clarifier capacity, and 340 m³ usable reservoir capacity — each row commented `-- source: CWD 2022 WSP`
- [ ] `supabase/seed/july_readings.sql` loads at least 30 days of hourly reading rows, explicitly labeled simulated (never presented as real CWD telemetry, on-screen or in the pitch)
- [ ] `supabase/seed/openmeteo_rainfall.ts` pulls and stores at least 30 days of real historical rainfall for Catbalogan from Open-Meteo's free API
- [ ] Every magic number used anywhere in the codebase (thresholds, JMP benchmark) is imported from `packages/shared-types`'s `WSP_CONSTANTS` — never re-typed as a literal in a component or function

## Out of scope
- Live/real-time ingestion from an actual CWD SCADA feed (doesn't exist / no access)
- Backfilling more than one month of history

## Depends on
- specs/00-data-model.md
