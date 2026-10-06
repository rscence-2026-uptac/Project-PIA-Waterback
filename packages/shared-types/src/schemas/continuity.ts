import { z } from "zod";

// specs/04-continuity-ranking.md
export const RankSourcesInput = z.object({
  barangay_id: z.string(),
  disruption_id: z.uuid(),
});
export type RankSourcesInput = z.infer<typeof RankSourcesInput>;

// Batch form of the same endpoint: barangay_ids omitted = every barangay affected per spec 03 at the disruption's signal.
export const RankSourcesBatchInput = z.object({
  disruption_id: z.uuid(),
  barangay_ids: z.array(z.string()).optional(),
});
export type RankSourcesBatchInput = z.infer<typeof RankSourcesBatchInput>;

export const RankedSource = z.object({
  source_id: z.uuid(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
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

// Candidates removed before ranking: inactive (spec 04 AC4), or a neighboring barangay on a system-wide cause (blended network).
export const ExcludedSource = z.object({
  source_id: z.uuid(),
  name: z.string(),
  type: RankedSource.shape.type,
  reason: z.enum(["inactive", "system_wide_cause_neighbor_blended_network"]),
});
export type ExcludedSource = z.infer<typeof ExcludedSource>;

export const RankedChain = z.object({
  barangay_id: z.string(),
  disruption_id: z.uuid(),
  ranked_sources: z.array(RankedSource),
  excluded: z.array(ExcludedSource).optional(),
  warning: z.literal("no_eligible_sources").optional(), // empty ranked_sources: the batch still succeeds
  computed_at: z.iso.datetime({ offset: true }),
});
export type RankedChain = z.infer<typeof RankedChain>;
