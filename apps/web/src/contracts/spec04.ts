// SPEC: 04-continuity-ranking.md — RankedSource, copied from the spec (Dev A owns the ranking).
import { z } from "zod";

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
export type RankedSource = z.infer<typeof RankedSource>;
