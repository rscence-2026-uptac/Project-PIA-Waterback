import { z } from "zod";

// specs/06-allocation-and-notify.md
export const AllocationDecision = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  overridden_from_suggested_rank: z.number().int().positive().nullable(), // null = accepted as suggested
  note: z.string().optional(),
});
export type AllocationDecision = z.infer<typeof AllocationDecision>;

export const DeployResponse = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  source_id: z.string().uuid(), // the ranked_chain entry actually deployed
  deployed_by: z.string(),
  deployed_at: z.string().datetime(),
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
  sent_at: z.string().datetime(),
});
export type NotificationPayload = z.infer<typeof NotificationPayload>;

export const ResidentConfirmation = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  confirmed_by: z.enum(["resident", "barangay_captain"]),
  channel: z.enum(["pwa", "sms_reply"]),
  restored: z.boolean(), // false => re-enters allocation, matches the "no, adjust" loop
  confirmed_at: z.string().datetime(),
});
export type ResidentConfirmation = z.infer<typeof ResidentConfirmation>;

export const EventLogEntry = z.object({
  disruption_id: z.string().uuid(),
  event_type: z.enum(["deployed", "notified", "resident_confirmed", "resolved"]),
  actor: z.string(),
  occurred_at: z.string().datetime(),
});
export type EventLogEntry = z.infer<typeof EventLogEntry>;
