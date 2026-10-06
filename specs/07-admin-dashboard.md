# Spec: Admin / partner dashboard

## What it does
A realtime CDRRMO/MENRO/partner dashboard showing live disruption status, allocation decisions, and event history across all barangays, via a Supabase Realtime subscription on `event_log`.

## Data contract
```ts
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

export const RealtimeEvent = z.object({
  table: z.literal("event_log"),
  event_type: z.enum(["predicted", "confirmed", "deployed", "notified", "resident_confirmed", "resolved"]),
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  occurred_at: z.string().datetime(),
});
```

## Acceptance criteria
- [ ] Dashboard updates within 2 seconds of a new `event_log` row, for every event type, without a manual page refresh
- [ ] Shows current signal level and open/resolved status per barangay at a glance, color-coded against the 0–4 scale
- [ ] If the Realtime websocket drops, the dashboard degrades to a manual-refresh button rather than crashing or silently going stale — consistent with the intermittent-connectivity design used everywhere else

## Out of scope
- Role-based multi-user permissions beyond one shared admin view
- Export/reporting beyond the simple trend view already listed in Final features

## Depends on
- specs/06-allocation-and-notify.md
- specs/08-ui-ux-guidelines.md
