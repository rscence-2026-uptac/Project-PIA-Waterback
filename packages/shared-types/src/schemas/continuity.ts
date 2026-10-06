import { z } from "zod";

// specs/04-continuity-ranking.md
export const RankSourcesInput = z.object({
  barangay_id: z.string(),
  disruption_id: z.uuid(),
});
export type RankSourcesInput = z.infer<typeof RankSourcesInput>;

export const RankedSource = z.object({
  source_id: z.uuid(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),
  exceeds_jmp_benchmark: z.boolean(), // travel_minutes > 30, flagged not excluded
  cost_php_per_unit: z.number().nonnegative(),
  rank: z.number().int().positive(),
});
export type RankedSource = z.infer<typeof RankedSource>;

export const RankedChain = z.object({
  barangay_id: z.string(),
  disruption_id: z.uuid(),
  ranked_sources: z.array(RankedSource),
  computed_at: z.iso.datetime(),
});
export type RankedChain = z.infer<typeof RankedChain>;
