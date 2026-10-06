# Spec: Affected-area mapping

## What it does
Given a confirmed disruption's system-wide signal level (`PredictorOutput`, `scope: "system"`) from `02-disruption-predictor.md`, fans it out to barangays. The network is blended (CWD 2022 WSP pp.12, 15), so every served barangay inherits the system signal. It determines which barangays are affected — explicitly including households outside CWD's piped network, the equity layer that distinguishes this system from a piped-customers-only outage tool.

## Data contract
```ts
import { z } from "zod";

// `Barangay` (incl. piped/unpiped households, coverage_source, critical_facilities) is defined in 00-data-model.md.

export const AffectedArea = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
  signal_level: z.number().int().min(0).max(4),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(), // zones 8, 10: hit first at peak/shortage (WSP p.17)
  piped_households_affected: z.number().int().nonnegative().nullable(),
  unpiped_households_affected: z.number().int().nonnegative().nullable(),
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
});
```

## Acceptance criteria
- [ ] Given a confirmed disruption with system signal ≥ 2, returns all 26 served barangays, split into piped vs. unpiped household counts; `low_pressure_zone` is true for zones 8 and 10
- [ ] Level I barangays (Darahuway Guti, Darahuway Dako, Payao, Lagundi) count as unpiped (equity layer)
- [ ] Unpiped-coverage numbers are cited as an estimate and labeled `unverified` in the UI when `coverage_source` is not `cwd_service_map` — real CWD service-area boundary data wasn't available during the build
- [ ] A barangay with null household counts, or no source data at all, returns `coverage_confidence: "unknown"` and shows "coverage unknown" in the UI rather than a guessed number
- [ ] Output rows feed directly into `04-continuity-ranking.md`'s per-barangay ranking call with no manual re-entry

## Out of scope
- GIS polygon precision beyond a barangay-level centroid
- Real-time population figures (uses the latest available barangay/census count instead)

## Depends on
- specs/00-data-model.md
- specs/02-disruption-predictor.md
2026-10-06: aligned with CWD 2022 WSP (see docs/wsp_findings.md)
