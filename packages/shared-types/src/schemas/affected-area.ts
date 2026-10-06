import { z } from "zod";

// specs/03-affected-area-mapping.md
// NOTE: `Barangay` is defined once, canonically, in ./data-model.ts (superset of spec 03's shape).
export const AffectedArea = z.object({
  barangay_id: z.string(),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(),
  disruption_id: z.uuid(),
  signal_level: z.number().int().min(0).max(4),
  piped_households_affected: z.number().int().nonnegative().nullable(), // null = unknown (no household counts in the WSP)
  unpiped_households_affected: z.number().int().nonnegative().nullable(), // null = unknown (no household counts in the WSP)
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
});
export type AffectedArea = z.infer<typeof AffectedArea>;
