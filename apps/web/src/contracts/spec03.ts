// SPEC: 03-affected-area-mapping.md — AffectedArea, copied from the spec (Dev A owns the mapping).
// The spec makes household counts nullable (the WSP doesn't give them); shared-types still has
// them required — flagged in docs/dev-b-handoff.md. This copy follows the spec.
import { z } from "zod";

export const AffectedArea = z.object({
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
  signal_level: z.number().int().min(0).max(4),
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]),
  low_pressure_zone: z.boolean(), // zones 8, 10: hit first at peak/shortage (WSP p.17)
  piped_households_affected: z.number().int().nonnegative().nullable(),
  unpiped_households_affected: z.number().int().nonnegative().nullable(),
  coverage_confidence: z.enum(["confirmed", "estimate", "unknown"]),
  vulnerable_flag: z.boolean(), // elderly/PWD households or critical facility present
});
export type AffectedArea = z.infer<typeof AffectedArea>;
