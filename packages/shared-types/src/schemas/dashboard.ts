import { z } from "zod";

// specs/07-admin-dashboard.md (Dev B). Moved here from apps/web/src/contracts/spec07.ts.
export const DashboardSnapshot = z.object({
  barangays: z.array(z.object({
    barangay_id: z.string(),
    signal_level: z.number().int().min(0).max(4),
    status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
    last_event_at: z.iso.datetime(),
  })),
  generated_at: z.iso.datetime(),
});
export type DashboardSnapshot = z.infer<typeof DashboardSnapshot>;
export type DashboardRow = DashboardSnapshot["barangays"][number];
export type DisruptionStatus = DashboardRow["status"];

export const RealtimeEvent = z.object({
  table: z.literal("event_log"),
  event_type: z.enum(["predicted", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"]),
  disruption_id: z.uuid(),
  barangay_id: z.string(),
  occurred_at: z.iso.datetime(),
});
export type RealtimeEvent = z.infer<typeof RealtimeEvent>;
