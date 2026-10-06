import { z } from "zod";

// specs/05-operator-pwa.md (Dev B). Moved here from apps/web/src/contracts/spec05.ts.
export const OperatorReadingForm = z.object({
  intake_id: z.enum(["kulador", "masacpasac", "caramayon_1", "caramayon_2"]), // operator picks Kulador, Masacpasac, Caramayon I or Caramayon II
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),
  clarifier_inflow_lps: z.number().nonnegative().nullable(),
});
export type OperatorReadingForm = z.infer<typeof OperatorReadingForm>;

export const OfflineQueueItem = z.object({
  local_id: z.uuid(), // client-generated, idempotency key on sync (-> client_local_id)
  kind: z.enum(["reading", "resident_confirmation"]),
  payload: z.record(z.string(), z.unknown()), // spec: z.record(z.unknown()); zod 4 needs the key type
  queued_at: z.iso.datetime(),
  synced: z.boolean().default(false),
});
export type OfflineQueueItem = z.infer<typeof OfflineQueueItem>;

export const BarangayStatusView = z.object({
  barangay_id: z.string(),
  signal_level: z.number().int().min(0).max(4),
  last_synced_at: z.iso.datetime(),
  is_stale: z.boolean(), // true when served from cache, not a fresh fetch
});
export type BarangayStatusView = z.infer<typeof BarangayStatusView>;
