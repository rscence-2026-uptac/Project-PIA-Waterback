// SPEC: 07 — the one place the dashboard talks to the live backend.
//
// TODO(Dev A): replace the simulator below with Supabase Realtime, keeping these two signatures:
//   fetchDashboardSnapshot → select current status per barangay (disruptions + event_log),
//   subscribeEventLog      → supabase.channel("event_log")
//                              .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, …)
//                              .subscribe(status => SUBSCRIBED → "live", CLOSED/CHANNEL_ERROR/TIMED_OUT → "dropped")
// Needs @supabase/supabase-js + the project URL and anon key (ask before installing, hard rule 3),
// and event_log rows must carry barangay_id (docs/dev-b-handoff.md).
import { DashboardSnapshot, RealtimeEvent, type DashboardRow } from "../contracts/spec07";
import { MOCK_EVENT_INTERVAL_MS, mockSnapshot, nextMockEvent } from "../data/mockLive";

export type FeedStatus = "connecting" | "live" | "dropped";

// MOCK: a pretend server. Its state keeps moving while the screen is subscribed, even when the
// connection has dropped, so a Refresh after reconnecting catches up like a real database would.
type ServerRow = DashboardRow & { confirmed: boolean };
let server: Map<string, ServerRow> | null = null;
let turn = 0;

function serverState() {
  if (!server) {
    server = new Map(mockSnapshot().barangays.map((row) => [row.barangay_id, { ...row, confirmed: false }]));
  }
  return server;
}

function applyToServer(event: RealtimeEvent) {
  // A system-wide event (NULL barangay_id) applies to every row.
  const rows = event.barangay_id === null ? [...serverState().values()] : [serverState().get(event.barangay_id)];
  for (const row of rows) {
    if (!row) continue;
    row.last_event_at = event.occurred_at;
    if (event.event_type === "resident_confirmed") row.confirmed = true;
    else row.status = event.event_type;
    if (event.event_type === "resolved") row.signal_level = 0;
  }
}

/** Current status for every served barangay. Fails when offline, like a real fetch. */
export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!navigator.onLine) throw new Error("offline");
  await new Promise((resolve) => setTimeout(resolve, 200));
  return DashboardSnapshot.parse({
    generated_at: new Date().toISOString(),
    barangays: [...serverState().values()].map(({ barangay_id, signal_level, status, last_event_at }) => ({
      barangay_id, signal_level, status, last_event_at,
    })),
  });
}

/**
 * Streams new event_log rows. Status goes connecting → live, and → dropped when the connection
 * goes; it stays dropped until the screen subscribes again (spec 07 AC3: manual refresh).
 */
export function subscribeEventLog({ onEvent, onStatus }: {
  onEvent: (event: RealtimeEvent) => void;
  onStatus: (status: FeedStatus) => void;
}): () => void {
  let dropped = false;
  const drop = () => {
    if (dropped) return;
    dropped = true;
    onStatus("dropped");
  };

  onStatus("connecting");
  const connectTimer = setTimeout(() => (navigator.onLine ? onStatus("live") : drop()), 300);
  window.addEventListener("offline", drop);

  const tick = setInterval(() => {
    const event = nextMockEvent(serverState(), turn++);
    if (!event) return;
    applyToServer(event);
    if (!dropped && navigator.onLine) onEvent(RealtimeEvent.parse(event));
    else drop();
  }, MOCK_EVENT_INTERVAL_MS);

  return () => {
    clearTimeout(connectTimer);
    clearInterval(tick);
    window.removeEventListener("offline", drop);
  };
}
