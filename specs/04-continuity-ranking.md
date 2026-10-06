# Spec: Continuity ranking

## What it does
Ranks a barangay's backup water sources (Plan A/B/C/D) safety → time → cost, where travel time is scored against the WHO/UNICEF JMP 30-minute round-trip benchmark, producing the `continuity_chains` row that the LGU allocation screen (`06`) reads from.

## Data contract
```ts
import { z } from "zod";

export const RankSourcesInput = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
});

export const RankedSource = z.object({
  source_id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),
  exceeds_jmp_benchmark: z.boolean(), // travel_minutes > 30, flagged not excluded
  cost_php_per_unit: z.number().nonnegative(),
  rank: z.number().int().positive(),
});

export const RankedChain = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
  ranked_sources: z.array(RankedSource),
  computed_at: z.string().datetime(),
});
```

## Extensions (Dev A, 2026-10-06; all additive)
- **Batch mode.** `POST rank-chain {disruption_id, barangay_ids?: string[]}` ranks many barangays in one call and returns `{disruption_id, cause, chains: RankedChain[]}`. With `barangay_ids` omitted it ranks every barangay affected per spec 03 at the disruption's signal (signal >= 2 -> all 57, unserved included; below 2 -> `chains: []`). Single mode `{barangay_id, disruption_id}` returns one `RankedChain`.
- **Neighboring-barangay rule (Dev A decision).** The CWD network is blended (WSP pp.12, 15), so when the disruption `cause` is system-wide (`turbidity`, `drought`) a `neighboring_barangay` source is dry too and is EXCLUDED (reason `system_wide_cause_neighbor_blended_network`). It is included only for `cause = repair` (a localized repair can leave neighbors on supply).
- **Extra fields.** Each ranked source also carries `provenance` (`wsp|osm|web|placeholder`), `is_simulated`, `source_ref` so the UI can label simulated vs verified rows. `RankedChain` also carries `excluded: [{source_id, name, type, reason}]` (reason `inactive` or the rule above) and, when nothing is eligible, `ranked_sources: []` with `warning: "no_eligible_sources"` (a batch never fails for one empty chain).
- **Persistence.** One `continuity_chains` row per (disruption, barangay), upserted by the service role (unique index, migration `20261006000008`): re-running replaces `ranked_source_ids` and `computed_at`. Empty chains are persisted too. `affected-areas` reads it back as `top_source` (spec 03).
- **Ordering.** safety_score desc, travel_minutes asc, cost_php_per_unit asc, then `source_id` asc. `exceeds_jmp_benchmark = travel_minutes > WSP_CONSTANTS.JMP_ROUNDTRIP_MIN` (30), flagged never excluded.

## Acceptance criteria
- [x] For a seeded barangay with 3 or more candidate sources, returns them ordered safety desc, then time asc, then cost asc _Evidence: `supabase/tests/functions/ranking.test.ts` > rankSources "AC1" (4 candidates; also all 57 seeded barangays x 3 causes, order checked pairwise)._
- [x] Ties are broken deterministically by `source_id` so the demo is repeatable run to run _Evidence: same file, "AC2" (equal keys, input shuffled, ties by source_id)._
- [x] A source with `travel_minutes > 30` (the JMP benchmark) is flagged via `exceeds_jmp_benchmark: true`, not excluded — it may be the only option _Evidence: same file, "AC3" (30 min not flagged, 31 and 400 flagged and kept; seeded far unserved barangay keeps its > 30 min refill row)._
- [x] A source with `active: false` is never included in `ranked_sources`, only recorded as excluded in the function's own log output (also returned in the response's `excluded` array) _Evidence: same file, "AC4" (inactive absent from `ranked_sources`, present in `excluded`, logged by `rank-chain excluded`)._

## Out of scope
- Dynamic, traffic- or flood-aware travel-time routing
- Crowd-sourced live source status (operator/captain-updated only, not resident-reported)

## Depends on
- specs/00-data-model.md
- specs/03-affected-area-mapping.md
2026-10-06: Dev A: `rank-chain` Edge Function + `_shared/ranking.ts`; batch mode; `neighboring_barangay` excluded for turbidity/drought, kept for repair; extra source fields (`provenance`, `is_simulated`, `source_ref`), `excluded`, `warning`; persistence upsert (migration 000008 unique index); ACs ticked with test evidence. Note: Dev B's `contracts/spec04.ts` has type `neighboring_purok`; the spec and DB enum are `neighboring_barangay`.
