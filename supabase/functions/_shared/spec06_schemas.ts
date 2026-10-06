// Spec 06 / 05 request contracts, zod 4. COPY of packages/shared-types/src/schemas/allocation.ts and Dev B's
// OperatorReadingForm / OfflineQueueItem (apps/web/src/contracts/spec05.ts): Edge Functions cannot import outside
// supabase/functions, so keep this file in step with those when they change.
// (The "npm:" specifier is Deno's; the vitest config aliases it to the repo's zod 4.)
import { z } from "npm:zod@4.6.5";
export { z };

export const AllocationDecision = z.object({
  disruption_id: z.uuid(),
  barangay_id: z.string().min(1),
  priority_rank: z.number().int().positive(),
  officer_id: z.string().min(1),
  overridden_from_suggested_rank: z.number().int().positive().nullable(), // null = accepted as suggested
  note: z.string().optional(),
});
export type AllocationDecision = z.infer<typeof AllocationDecision>;

export const DeployResponse = z.object({
  disruption_id: z.uuid(),
  barangay_id: z.string().min(1),
  source_id: z.uuid(), // the ranked_chain entry actually deployed
  deployed_by: z.string().min(1),
  deployed_at: z.iso.datetime(),
});
export type DeployResponse = z.infer<typeof DeployResponse>;

export const NotificationPayload = z.object({
  disruption_id: z.uuid(),
  barangay_id: z.string().min(1),
  channel: z.enum(["pwa_push", "sms"]),
  status: z.string(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  expected_duration_hint: z.string().optional(),
  store_water_advice: z.boolean(),
  nearest_source_name: z.string(),
  sent_at: z.iso.datetime(),
});
export type NotificationPayload = z.infer<typeof NotificationPayload>;

export const ResidentConfirmation = z.object({
  disruption_id: z.uuid(),
  barangay_id: z.string().min(1),
  confirmed_by: z.enum(["resident", "barangay_captain"]),
  channel: z.enum(["pwa", "sms_reply"]),
  restored: z.boolean(),
  confirmed_at: z.iso.datetime(),
});
export type ResidentConfirmation = z.infer<typeof ResidentConfirmation>;

/** The resident-confirmation endpoint also takes the offline-queue idempotency key. */
export const ResidentConfirmationRequest = ResidentConfirmation.extend({
  client_local_id: z.string().min(1).max(200).optional(),
});
export type ResidentConfirmationRequest = z.infer<typeof ResidentConfirmationRequest>;

export const OperatorReadingForm = z.object({
  intake_id: z.enum(["kulador", "masacpasac", "caramayon_1", "caramayon_2"]),
  turbidity_ntu: z.number().nonnegative(),
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),
  clarifier_inflow_lps: z.number().nonnegative().nullable(),
});

/** Payload of a queued `reading` item: the form + treated turbidity (Kulador only, else null) + when it was taken. */
export const QueuedReadingPayload = OperatorReadingForm.extend({
  treated_turbidity_ntu: z.number().nonnegative().nullable().default(null),
  recorded_at: z.iso.datetime(),
});
export type QueuedReadingPayload = z.infer<typeof QueuedReadingPayload>;

export const OfflineQueueItem = z.object({
  local_id: z.uuid(),
  kind: z.enum(["reading", "resident_confirmation"]),
  payload: z.record(z.string(), z.unknown()),
  queued_at: z.iso.datetime(),
  synced: z.boolean().default(false),
});
export type OfflineQueueItem = z.infer<typeof OfflineQueueItem>;
