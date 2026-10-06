# Spec: Affected-area mapping

## What it does
Given a confirmed disruption's per-purok signal level from `02-disruption-predictor.md`, determines which puroks/barangays are affected — explicitly including households outside CWD's piped network, the equity layer that distinguishes this system from a piped-customers-only outage tool.

## Data contract
```ts
import { z } from "zod";

export const Purok = z.object({
  purok_id: z.string(),
  barangay: z.string(),
  piped_households: z.number().int().nonnegative(),
  unpiped_households: z.number().int().nonnegative(), // estimate — see acceptance criteria
  coverage_source: z.enum(["cwd_service_map", "estimate", "unknown"]),
  critical_facilities: z.array(z.enum(["health_station", "school", "evacuation_center"])).default([]),
});

export const AffectedArea = z.object({
  purok_id: z.string(),
  disruption_id: z.string().uuid(),
  signal_level: z.number().int().min(0).max(4),
  piped_households_affected: z.number().int().nonnegative(),
  unpiped_households_affected: z.number().int().nonnegative(),
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
});
```

## Acceptance criteria
- [ ] Given a confirmed disruption, returns every purok at signal level ≥ 2, split into piped vs. unpiped household counts
- [ ] Unpiped-coverage numbers are cited as an estimate and labeled `unverified` in the UI when `coverage_source` is not `cwd_service_map` — real CWD service-area boundary data wasn't available during the build
- [ ] A purok with no source data at all returns `coverage_confidence: "unknown"` and shows "coverage unknown" in the UI rather than a guessed number
- [ ] Output rows feed directly into `04-continuity-ranking.md`'s per-purok ranking call with no manual re-entry

## Out of scope
- GIS polygon precision beyond a purok-level centroid
- Real-time population figures (uses the latest available barangay/census count instead)

## Depends on
- specs/00-data-model.md
- specs/02-disruption-predictor.md
