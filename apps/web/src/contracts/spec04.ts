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
