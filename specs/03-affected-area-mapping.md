# Spec: Affected-area mapping

## What it does
Given a confirmed disruption's system-wide signal level (`PredictorOutput`, `scope: "system"`) from `02-disruption-predictor.md`, fans it out to barangays. The network is blended (CWD 2022 WSP pp.12, 15), so every served barangay inherits the system signal. It determines which barangays are affected — explicitly including households outside CWD's piped network, the equity layer that distinguishes this system from a piped-customers-only outage tool.

## Data contract
```ts
import { z } from "zod";

// `Barangay` (incl. piped/unpiped households, coverage_source, critical_facilities) is defined in 00-data-model.md.

export const AffectedArea = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid().nullable(), // null when no disruption is open (the endpoint still maps the current system signal)
  signal_level: z.number().int().min(0).max(4),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(), // zones 8, 10: hit first at peak/shortage (WSP p.17)
  piped_households_affected: z.number().int().nonnegative().nullable(),
  unpiped_households_affected: z.number().int().nonnegative().nullable(),
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // critical facility present (residents.is_vulnerable is PII and is not read here)
  // Added by the endpoint (not in the zod object above; consumers may ignore them):
  //   resident_state: 'flowing' | 'heads_up' | 'planned_repair' | 'interrupted' | 'not_on_network'
  //   heads_up: boolean   (both from residentState(), see the table below)
  //   heads_up_urgency?: 'possible' | 'likely' | 'very_likely'   (present when heads_up)
  //   suggested_rank: number | null   (1-based allocation priority, heuristic below; null when disruption_id is null)
  //   top_source: { source_id, name, type, safety_score, travel_minutes, exceeds_jmp_benchmark, cost_php_per_unit, provenance, is_simulated } | null
  //               (first still-active source of the persisted spec 04 chain; null until `rank-chain` has run for this disruption/barangay)
});
```

## Acceptance criteria
- [ ] Given a confirmed disruption with system signal ≥ 2, returns all 26 served barangays, split into piped vs. unpiped household counts; `low_pressure_zone` is true for zones 8 and 10
- [ ] Level I barangays (Darahuway Guti, Darahuway Dako, Payao, Lagundi) count as unpiped (equity layer)
- [ ] Unpiped-coverage numbers are cited as an estimate and labeled `unverified` in the UI when `coverage_source` is not `cwd_service_map` — real CWD service-area boundary data wasn't available during the build
- [ ] A barangay with null household counts, or no source data at all, returns `coverage_confidence: "unknown"` and shows "coverage unknown" in the UI rather than a guessed number
- [ ] `service_level: "unserved"` barangays (the 31 non-CWD Catbalogan barangays) are not in the piped fan-out; they get their own resident state `not_on_network` (own backup-source plan, plus a heads-up that sources get busier when signal >= 2) instead of the interrupted screen
- [ ] Signal -> resident-state mapping, v2 (2026-10-06, Dev A decision: **a prediction never says water is off**). Implemented as `residentState(signal_level, cause, service_level, { interruption_observed })` in `packages/shared-types/src/resident-state.ts` (functions copy: `_shared/resident_state.generated.ts`, parity-tested). `interruption_observed` is true only when water has actually stopped: the barangay's disruption status is `confirmed` / `deployed` / `notified` (this covers cause `repair` with a confirmed disruption), OR the latest Kulador `plant_status` at `as_of` is `degraded` / `shutdown`. `affected-areas` reads Kulador from the readings it already fetched; `dashboard-snapshot` does one small query (latest Kulador reading <= now; on failure it falls back to disruption status only):

  | service_level | signal | interruption_observed | cause | resident state | heads_up | heads_up_urgency |
  |---|---|---|---|---|---|---|
  | unserved | any | any | any | `not_on_network` | signal >= 2 | likely (2) / very_likely (3-4) when heads_up |
  | served | 0 | any | any | `flowing` | no | none |
  | served | 1 | no | any | `heads_up` | yes | `possible` ("Water may stop: keep some stored") |
  | served | 2 | no | any | `heads_up` | yes | `likely` ("Store water tonight") |
  | served | 3-4 | no | any | `heads_up` | yes | `very_likely` ("Water likely to stop from <likely_at>: store water now") |
  | served | 1-4 | yes | `repair` | `planned_repair` | no | none |
  | served | 1-4 | yes | turbidity / drought | `interrupted` | no | none |

  A barangay that confirmed restoration is shown as `flowing` at signal 0 (the existing water's-back flow driven by `restored_at` / `resolved`); no separate `restored` kind is added to the enum. The v1 rule (signal 3-4 = interrupted from the prediction alone) told residents water was off up to ~51 h early in the July replay (signal 3 on 19 Jul 21:00, plant normal until 21 Jul 22:00).

- [ ] Output rows feed directly into `04-continuity-ranking.md`'s per-barangay ranking call with no manual re-entry

- [ ] Endpoint `affected-areas`: `GET ?as_of=ISO[&disruption_id=uuid][&min_signal=0-4]` runs the spec 02 predictor at `as_of` (default now) and returns one row for every one of the 57 barangays (served rows inherit the system signal; unserved rows carry `not_on_network`). `min_signal=2` returns `[]` below signal 2, i.e. "every barangay at signal >= 2". `disruption_id` is the given disruption, else the open one, else null
- [ ] Level I rows report `piped_households_affected = 0` and all households as unpiped; any row with a NULL count or `coverage_source = 'unknown'` returns both counts NULL and `coverage_confidence: "unknown"`

- [x] `suggested_rank` (HEURISTIC, not a WSP fact; for the LGU allocation screen, spec 06): 1-based over all returned rows, sorted by signal_level desc, then `vulnerable_flag` (critical facility) first, then service level `level_i` before `level_iii` before `unserved` (equity layer: Level I / unpiped first; unserved are not interrupted by a plant failure), then `low_pressure_zone` first, then `barangay_id` asc. The officer may override it (`AllocationDecision.overridden_from_suggested_rank`). Implemented as `suggestRanks` in `_shared/affected.ts` (tests: `supabase/tests/functions/ranking.test.ts` > suggested_rank)
- [x] `top_source` = first ranked, still-active source of the persisted `continuity_chains` row (spec 04), so the allocation screen can show "Plan A" per barangay without a second call (test: same file > affected-areas top_source)

- [x] Automatic heads-up (prevention, before any allocation): when `disruption-monitor` opens a predicted disruption (signal >= 2) or an open one's signal reaches a new level (2/3/4), every barangay with residents gets a heads-up: per-barangay `predicted` event (`payload.kind = 'heads_up'`) for the PWA + SMS "store water" (dry-run unless `SMS_LIVE=true`). At most one per (disruption, barangay, level); only while the disruption is `predicted`. Served barangays always; unserved ones only if residents exist (shorter "refill stations may be busy" text). Details: `supabase/functions/README.md` > "Automatic heads-up" (tests: `supabase/tests/functions/heads_up.test.ts`)

## Out of scope
- GIS polygon precision beyond a barangay-level centroid
- Real-time population figures (uses the latest available barangay/census count instead)

## Depends on
- specs/00-data-model.md
- specs/02-disruption-predictor.md
2026-10-06: aligned with CWD 2022 WSP (see docs/wsp_findings.md)
2026-10-06: Dev B handoff 2026-10-06: unserved barangays get their own `not_on_network` state; signal -> resident-state mapping table accepted; `piped_households_affected` / `unpiped_households_affected` nullable in shared-types (spec already said nullable)
2026-10-06: `AffectedArea.disruption_id` is now nullable (no open disruption); `vulnerable_flag` = critical facility present only (residents' `is_vulnerable` is PII); added `resident_state` + `heads_up` to the endpoint output; new `affected-areas` Edge Function with `min_signal` filter (see supabase/functions/README.md). Dev B: relax `disruption_id` in `apps/web/src/contracts/spec03.ts`.
2026-10-06: Dev A: added `suggested_rank` (heuristic defined above) and `top_source` to the `affected-areas` output (additive, optional in shared-types); `AffectedArea.disruption_id` is nullable in shared-types too.
2026-10-06: Dev A: automatic heads-up added to `disruption-monitor` (per-barangay `predicted` heads-up event + SMS `sms.heads_up_store_water` / `sms.heads_up_unserved`, idempotent per disruption/barangay/level; monitor response gains `heads_up`; `POST {action:"heads_up"}` resends). No schema change.
2026-10-06: Dev A: resident state v2: a prediction never says water is off. Signal 1-4 is `heads_up` (+ `heads_up_urgency` possible/likely/very_likely) until an interruption is observed (disruption confirmed/deployed/notified, or Kulador plant degraded/shutdown); only then `interrupted` / `planned_repair`. `residentState` takes an optional 4th argument; `affected-areas` and `dashboard-snapshot` outputs gain optional `heads_up_urgency`. Supersedes the "3-4 = interrupted" rows of the accepted table.
