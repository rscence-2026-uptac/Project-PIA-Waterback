import { z } from "zod";

// specs/01-seed-data.md (WSP_CONSTANTS lives in ../constants.ts)
export const ReadingSeedRow = z.object({
  recorded_at: z.string().datetime(),
  intake_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),
  clarifier_inflow_lps: z.number().nonnegative().nullable(),
  source: z.literal("operator"), // seed rows are explicitly labeled simulated, not sensor-sourced
});
export type ReadingSeedRow = z.infer<typeof ReadingSeedRow>;

export const OpenMeteoPullConfig = z.object({
  latitude: z.number(),
  longitude: z.number(),
  start_date: z.string(), // ISO date
  end_date: z.string(),
  daily: z.array(z.literal("precipitation_sum")),
});
export type OpenMeteoPullConfig = z.infer<typeof OpenMeteoPullConfig>;
