// SPEC: 07 — the one place the dashboard talks to the live backend.
//
// Live mode (Supabase env vars present): snapshot = dashboard-snapshot Edge Function, feed = Supabase Realtime
// postgres_changes on event_log INSERT and disruptions INSERT/UPDATE. Not live: the simulator below keeps the
// screen working on sample data. Both modes keep the same two signatures.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getClient, isLive } from "../api/client";
import { getDashboardSnapshot } from "../api/endpoints";
import { DashboardSnapshot, RealtimeEvent, type DashboardRow } from "../contracts/spec07";
import { MOCK_EVENT_INTERVAL_MS, mockSnapshot, nextMockEvent } from "../data/mockLive";

export type FeedStatus = "connecting" | "live" | "dropped";

/** A disruptions row change (INSERT = a new disruption, UPDATE = status / signal moved). */
export interface DisruptionChange {
  kind: "insert" | "update";
  id: string;
  status: DashboardRow["status"] | null;
  signal_level: number | null;
}

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
  const row = event.barangay_id ? serverState().get(event.barangay_id) : undefined;
  if (!row) return;
  row.last_event_at = event.occurred_at;
  if (event.event_type === "resident_confirmed") row.confirmed = true;
  else row.status = event.event_type;
  if (event.event_type === "resolved") row.signal_level = 0;
}

/** Current status for every served barangay. Fails when offline, like a real fetch. */
export async function fetchDashboardSnapshot(asOf: Date): Promise<DashboardSnapshot> {
  if (!navigator.onLine) throw new Error("offline");
  if (isLive()) return getDashboardSnapshot(asOf);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return DashboardSnapshot.parse({
    generated_at: new Date().toISOString(),
    barangays: [...serverState().values()].map(({ barangay_id, signal_level, status, last_event_at }) => ({
      barangay_id, signal_level, status, last_event_at,
    })),
  });
}

function subscribeMock({ onEvent, onStatus }: SubscribeArgs): () => void {
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

export interface SubscribeArgs {
  onEvent: (event: RealtimeEvent) => void;
  onStatus: (status: FeedStatus) => void;
  onDisruption?: (change: DisruptionChange) => void;
}

const STATUSES = ["predicted", "confirmed", "deployed", "notified", "resolved"] as const;

/** Realtime on the live project: event_log INSERT (+ disruptions INSERT/UPDATE). Anon can read both tables. */
function subscribeLive({ onEvent, onStatus, onDisruption }: SubscribeArgs): () => void {
  const supabase = getClient()!;
  onStatus("connecting");
  const channel: RealtimeChannel = supabase
    .channel(`dashboard-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      const parsed = RealtimeEvent.safeParse({
        table: "event_log",
        event_type: row.event_type,
        disruption_id: row.disruption_id,
        barangay_id: row.barangay_id ?? null,
        occurred_at: new Date(String(row.occurred_at)).toISOString(),
        payload_json: row.payload_json ?? {},
      });
      if (parsed.success) onEvent(parsed.data);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "disruptions" }, (payload) => {
      if (payload.eventType === "DELETE") return;
      const row = payload.new as Record<string, unknown>;
      const status = STATUSES.find((s) => s === row.status) ?? null;
      onDisruption?.({
        kind: payload.eventType === "INSERT" ? "insert" : "update",
        id: String(row.id),
        status,
        signal_level: typeof row.signal_level === "number" ? row.signal_level : null,
      });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus("live");
      else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus("dropped");
    });
  const drop = () => onStatus("dropped");
  window.addEventListener("offline", drop);
  return () => {
    window.removeEventListener("offline", drop);
    void supabase.removeChannel(channel);
  };
}

/**
 * Streams new event_log rows. Status goes connecting → live, and → dropped when the connection
 * goes; it stays dropped until the screen subscribes again (spec 07 AC3: manual refresh).
 * Events can have barangay_id null (system-wide): the caller fans them out to the served cards.
 */
export function subscribeEventLog(args: SubscribeArgs): () => void {
  return isLive() ? subscribeLive(args) : subscribeMock(args);
}
