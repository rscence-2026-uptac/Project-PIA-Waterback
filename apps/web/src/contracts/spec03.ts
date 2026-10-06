// SPEC: 03-affected-area-mapping.md — AffectedArea, copied from the spec (Dev A owns the mapping).
// Mirrors packages/shared-types/src/schemas/affected-area.ts (zod 4 there, same shape).
import { z } from "zod";
import { SourceType } from "./spec04";

export const AffectedArea = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid().nullable(), // null when no disruption is open
  signal_level: z.number().int().min(0).max(4),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(), // zones 8, 10: hit first at peak/shortage (WSP p.17)
  piped_households_affected: z.number().int().nonnegative().nullable(),
  unpiped_households_affected: z.number().int().nonnegative().nullable(),
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
  // Endpoint extras (optional): allocation-screen hints from the affected-areas function.
  suggested_rank: z.number().int().positive().nullable().optional(), // heuristic 1-based priority; null without a disruption
  top_source: z
    .object({
      source_id: z.string().uuid(),
      name: z.string(),
      type: SourceType,
      safety_score: z.number().min(0).max(1),
      travel_minutes: z.number().nonnegative(),
      exceeds_jmp_benchmark: z.boolean(),
      cost_php_per_unit: z.number().nonnegative(),
      provenance: z.enum(["wsp", "osm", "web", "placeholder"]),
      is_simulated: z.boolean(),
    })
    .nullable()
    .optional(), // first ranked source of the persisted chain; null if none yet
});
export type AffectedArea = z.infer<typeof AffectedArea>;
