# Spec: Continuity ranking

## What it does
Ranks a purok's backup water sources (Plan A/B/C/D) safety → time → cost, where travel time is scored against the WHO/UNICEF JMP 30-minute round-trip benchmark, producing the `continuity_chains` row that the LGU allocation screen (`06`) reads from.

## Data contract
```ts
import { z } from "zod";

export const RankSourcesInput = z.object({
  purok_id: z.string(),
  disruption_id: z.string().uuid(),
});

export const RankedSource = z.object({
  source_id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_purok"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),
  exceeds_jmp_benchmark: z.boolean(), // travel_minutes > 30, flagged not excluded
  cost_php_per_unit: z.number().nonnegative(),
  rank: z.number().int().positive(),
});

export const RankedChain = z.object({
  purok_id: z.string(),
  disruption_id: z.string().uuid(),
  ranked_sources: z.array(RankedSource),
  computed_at: z.string().datetime(),
});
```

## Acceptance criteria
- [ ] For a seeded purok with 3 or more candidate sources, returns them ordered safety desc, then time asc, then cost asc
- [ ] Ties are broken deterministically by `source_id` so the demo is repeatable run to run
- [ ] A source with `travel_minutes > 30` (the JMP benchmark) is flagged via `exceeds_jmp_benchmark: true`, not excluded — it may be the only option
- [ ] A source with `active: false` is never included in `ranked_sources`, only recorded as excluded in the function's own log output

## Out of scope
- Dynamic, traffic- or flood-aware travel-time routing
- Crowd-sourced live source status (operator/captain-updated only, not resident-reported)

## Depends on
- specs/00-data-model.md
- specs/03-affected-area-mapping.md
