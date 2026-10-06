// SPEC: 04-continuity-ranking.md — RankedSource, copied from the spec (Dev A owns the ranking).
import { z } from "zod";

export const SourceType = z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]);

export const RankedSource = z.object({
  source_id: z.string().uuid(),
  name: z.string(),
  type: SourceType,
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),
  exceeds_jmp_benchmark: z.boolean(), // travel_minutes > 30, flagged not excluded
  cost_php_per_unit: z.number().nonnegative(),
  rank: z.number().int().positive(),
  // Extras (optional so older payloads still parse): label simulated vs verified rows in the UI.
  provenance: z.enum(["wsp", "osm", "web", "placeholder"]).optional(),
  is_simulated: z.boolean().optional(),
  source_ref: z.string().nullable().optional(),
});
export type RankedSource = z.infer<typeof RankedSource>;

// rank-chain response (supabase/functions/README.md, "POST rank-chain"). Extras are optional.
export const RankedChain = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().optional(),
  ranked_sources: z.array(RankedSource),
  excluded: z.array(z.object({ source_id: z.string(), name: z.string(), type: SourceType.optional(), reason: z.string() })).optional(),
  warning: z.string().optional(),
  computed_at: z.string().optional(),
});
export type RankedChain = z.infer<typeof RankedChain>;

export const RankedChainBatch = z.object({
  disruption_id: z.string(),
  cause: z.string().optional(),
  chains: z.array(RankedChain),
});
export type RankedChainBatch = z.infer<typeof RankedChainBatch>;
