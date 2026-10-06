// MOCK: the live dashboard's sample data and event simulator (spec 07), until Dev A's
// Supabase Realtime on event_log is connected (see realtime/eventFeed.ts).
// The predictor is system-wide (spec 02), so every served barangay shares one signal level;
// what changes live is each barangay's status as the response reaches it.
import type { DashboardRow, DashboardSnapshot, RealtimeEvent } from "../contracts/spec07";
import { BARANGAYS, EVENT_DISRUPTION_ID } from "./mock";

const SYSTEM_SIGNAL = 4;
const served = BARANGAYS.filter((b) => b.served);

// Where each barangay starts, so the board isn't uniform: a few already further along.
const START: Record<string, DashboardRow["status"]> = {
  canlapwas: "notified",
  mercedes: "notified",
  "san-andres": "deployed",
  guinsorongan: "deployed",
  payao: "resolved",
};

export function mockSnapshot(): DashboardSnapshot {
  const now = Date.now();
  return {
    generated_at: new Date(now).toISOString(),
    barangays: served.map((b, i) => ({
      barangay_id: b.barangay_id,
      signal_level: START[b.barangay_id] === "resolved" ? 0 : SYSTEM_SIGNAL,
      status: START[b.barangay_id] ?? "confirmed",
      last_event_at: new Date(now - (i + 1) * 4 * 60_000).toISOString(),
    })),
  };
}

const NEXT: Record<DashboardRow["status"], RealtimeEvent["event_type"] | null> = {
  predicted: "confirmed",
  confirmed: "deployed",
  deployed: "notified",
  notified: "resident_confirmed",
  resolved: null,
};

/**
 * Picks the next event: moves one barangay a step along predicted → confirmed → deployed →
 * notified → resident_confirmed → resolved, round-robin so the whole board progresses.
 */
export function nextMockEvent(rows: Map<string, { status: DashboardRow["status"]; confirmed: boolean }>, turn: number): RealtimeEvent | null {
  const open = served.filter((b) => rows.get(b.barangay_id)?.status !== "resolved");
  if (open.length === 0) return null;
  const brgy = open[turn % open.length];
  const row = rows.get(brgy.barangay_id)!;
  const event_type = row.status === "notified" && row.confirmed ? "resolved" : NEXT[row.status];
  if (!event_type) return null;
  return {
    table: "event_log",
    event_type,
    disruption_id: EVENT_DISRUPTION_ID,
    barangay_id: brgy.barangay_id,
    occurred_at: new Date().toISOString(),
  };
}

export const MOCK_EVENT_INTERVAL_MS = 4000;
