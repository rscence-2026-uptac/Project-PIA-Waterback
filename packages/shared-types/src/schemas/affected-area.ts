import { z } from "zod";

// specs/03-affected-area-mapping.md
// NOTE: `Barangay` is defined once, canonically, in ./data-model.ts (superset of spec 03's shape).
export const AffectedArea = z.object({
  barangay_id: z.string(),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(),
  disruption_id: z.uuid().nullable(), // null when no disruption is open
  signal_level: z.number().int().min(0).max(4),
  piped_households_affected: z.number().int().nonnegative().nullable(), // null = unknown (no household counts in the WSP)
  unpiped_households_affected: z.number().int().nonnegative().nullable(), // null = unknown (no household counts in the WSP)
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
  // Endpoint extras (optional): allocation-screen hints from the affected-areas function.
  suggested_rank: z.number().int().positive().nullable().optional(), // heuristic 1-based priority; null without a disruption
  top_source: z.object({
    source_id: z.uuid(),
    name: z.string(),
    type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
    safety_score: z.number().min(0).max(1),
    travel_minutes: z.number().nonnegative(),
    exceeds_jmp_benchmark: z.boolean(),
    cost_php_per_unit: z.number().nonnegative(),
    provenance: z.enum(["wsp", "osm", "web", "placeholder"]),
    is_simulated: z.boolean(),
  }).nullable().optional(), // first ranked source of the persisted chain; null if none yet
});
export type AffectedArea = z.infer<typeof AffectedArea>;
