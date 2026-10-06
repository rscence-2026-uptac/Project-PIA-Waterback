// SPEC: 07-admin-dashboard.md — data contract, copied from the spec, plus the optional extras
// Dev A's dashboard-snapshot and Realtime rows add (supabase/functions/README.md).
import { z } from "zod";
import { ResidentStateName } from "./spec03";

// The open disruption (newest with status != resolved), when there is one. All times are UTC ISO strings.
export const DisruptionInfo = z.object({
  id: z.string(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  signal_level: z.number().int().min(0).max(4),
  status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
  started_at: z.string(),
  resolved_at: z.string().nullable().optional(),
  window_start: z.string().nullable().optional(),
  window_end: z.string().nullable().optional(),
  likely_at: z.string().nullable().optional(),
  next_update_at: z.string().nullable().optional(),
  heads_up_from: z.string().nullable().optional(),
  p_turbidity: z.number().nullable().optional(),
  p_drought: z.number().nullable().optional(),
});
export type DisruptionInfo = z.infer<typeof DisruptionInfo>;

export const DashboardSnapshot = z.object({
  barangays: z.array(z.object({
    barangay_id: z.string(),
    signal_level: z.number().int().min(0).max(4),
    status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
    last_event_at: z.string().datetime({ offset: true }),
    resident_state: ResidentStateName.optional(),
    heads_up_urgency: z.enum(["possible", "likely", "very_likely"]).optional(),
  })),
  generated_at: z.string().datetime({ offset: true }),
  disruption: DisruptionInfo.nullable().optional(), // null / absent when nothing is open
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>;
export type DashboardRow = DashboardSnapshot["barangays"][number];
export type DisruptionStatus = DashboardRow["status"];

// A new event_log row. In the database barangay_id is NULL for a system-wide event (predicted,
// confirmed, resolved): the client fans those out to every served card. A heads-up is a per-barangay
// `predicted` event with payload_json.kind === "heads_up": it bumps last_event_at, never the status.
export const RealtimeEvent = z.object({
  table: z.literal("event_log"),
  event_type: z.enum(["predicted", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"]),
  disruption_id: z.string().uuid(),
  barangay_id: z.string().nullable(),
  occurred_at: z.string().datetime({ offset: true }),
  payload_json: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;

/** Predicted event written per barangay by the automatic heads-up: shows up in the feed, never changes status. */
export function isHeadsUpEvent(event: Pick<RealtimeEvent, "event_type" | "barangay_id" | "payload_json">): boolean {
  return event.event_type === "predicted" && event.barangay_id !== null && event.payload_json?.kind === "heads_up";
}
