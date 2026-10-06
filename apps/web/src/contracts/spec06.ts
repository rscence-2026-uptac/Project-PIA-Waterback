// SPEC: 06-allocation-and-notify.md — data contract, copied from the spec.
// Same shapes as packages/shared-types/src/schemas/allocation.ts on Dev A's backend branch;
// switch to that import once it merges (it uses zod 3, the app uses zod 4).
import { z } from "zod";

export const AllocationDecision = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  overridden_from_suggested_rank: z.number().int().positive().nullable(), // null = accepted as suggested
  note: z.string().optional(),
  cluster_id: z.string().optional(), // SPEC: 10 — the settlement cluster this rank is for (additive; barangay_id kept)
});
export type AllocationDecision = z.infer<typeof AllocationDecision>;

export const DeployResponse = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  source_id: z.string().uuid(), // the ranked_chain entry actually deployed
  deployed_by: z.string(),
  deployed_at: z.string().datetime({ offset: true }),
});
export type DeployResponse = z.infer<typeof DeployResponse>;

export const NotificationPayload = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  channel: z.enum(["pwa_push", "sms"]),
  status: z.string(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  expected_duration_hint: z.string().optional(), // plain-language, not a committed SLA
  store_water_advice: z.boolean(),
  nearest_source_name: z.string(),
  sent_at: z.string().datetime({ offset: true }),
});
export type NotificationPayload = z.infer<typeof NotificationPayload>;

export const ResidentConfirmation = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  confirmed_by: z.enum(["resident", "barangay_captain"]),
  channel: z.enum(["pwa", "sms_reply"]),
  restored: z.boolean(), // false => re-enters allocation, matches the "no, adjust" loop
  confirmed_at: z.string().datetime(),
  client_local_id: z.string().uuid().optional(), // offline queue local_id, so a retried sync is not counted twice
});
export type ResidentConfirmation = z.infer<typeof ResidentConfirmation>;

export const EventLogEntry = z.object({
  disruption_id: z.string().uuid(),
  event_type: z.enum(["deployed", "notified", "resident_confirmed", "resolved"]),
  actor: z.string(),
  occurred_at: z.string().datetime({ offset: true }),
});
export type EventLogEntry = z.infer<typeof EventLogEntry>;
