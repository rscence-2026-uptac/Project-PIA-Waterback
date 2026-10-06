// SPEC: 05-operator-pwa.md — data contract, copied from the spec.
// Lives here until packages/shared-types exists (Dev A, PLAN setup step 4).
import { z } from "zod";

export const OperatorReadingForm = z.object({
  barangay_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100),
  clarifier_inflow_lps: z.number().nonnegative(),
});
export type OperatorReadingForm = z.infer<typeof OperatorReadingForm>;

export const OfflineQueueItem = z.object({
  local_id: z.string().uuid(), // client-generated, idempotency key on sync
  kind: z.enum(["reading", "resident_confirmation"]),
  payload: z.record(z.string(), z.unknown()), // spec: z.record(z.unknown()); zod 4 needs the key type
  queued_at: z.string().datetime(),
  synced: z.boolean().default(false),
});
export type OfflineQueueItem = z.infer<typeof OfflineQueueItem>;

export const BarangayStatusView = z.object({
  barangay_id: z.string(),
  signal_level: z.number().int().min(0).max(4),
  last_synced_at: z.string().datetime(),
  is_stale: z.boolean(), // true when served from cache, not a fresh fetch
});
export type BarangayStatusView = z.infer<typeof BarangayStatusView>;
