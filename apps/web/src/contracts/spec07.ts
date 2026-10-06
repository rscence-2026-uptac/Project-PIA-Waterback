// SPEC: 07-admin-dashboard.md — data contract, copied from the spec.
import { z } from "zod";

export const DashboardSnapshot = z.object({
  barangays: z.array(z.object({
    barangay_id: z.string(),
    signal_level: z.number().int().min(0).max(4),
    status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
    last_event_at: z.string().datetime(),
  })),
  generated_at: z.string().datetime(),
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>;
export type DashboardRow = DashboardSnapshot["barangays"][number];
export type DisruptionStatus = DashboardRow["status"];

export const RealtimeEvent = z.object({
  table: z.literal("event_log"),
  event_type: z.enum(["predicted", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"]),
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  occurred_at: z.string().datetime(),
});
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;
