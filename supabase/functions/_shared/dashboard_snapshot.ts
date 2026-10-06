// Spec 07: dashboard snapshot (pure derivation + request handler with injected data access).
import { json, preflight } from "./http.ts";
import { residentState } from "./resident_state.generated.ts";
import type { ResidentStateKind, ServiceLevel } from "./resident_state.generated.ts";
import type { DisruptionRow } from "./disruption_monitor.ts";

export type CardStatus = "predicted" | "confirmed" | "deployed" | "notified" | "resolved";
export type EventType = "predicted" | "confirmed" | "deployed" | "notified" | "resident_confirmed" | "resolved";
export const LIFECYCLE_RANK: Record<EventType, number> = {
  predicted: 0, confirmed: 1, deployed: 2, notified: 3, resident_confirmed: 4, resolved: 5,
};
export interface EventRow {
  id?: string | number;
  event_type: EventType;
  barangay_id: string | null; // NULL = system-wide
  occurred_at: string;
  payload_json: { restored?: boolean } | null;
}
export interface ServedBarangay { barangay_id: string; service_level: ServiceLevel }
export interface DashboardRowOut {
  barangay_id: string;
  signal_level: number;
  status: CardStatus;
  last_event_at: string;
  /** Extra (not in spec 07's zod object): what a resident of this barangay sees. */
  resident_state: ResidentStateKind;
}

/**
 * How one event_log row moves a card (same rule for the snapshot and for Realtime INSERTs on the client).
 * resident_confirmed with restored=true -> 'resolved' (and signal 0); restored=false -> back to 'confirmed' (needs allocation again, spec 06).
 */
export function statusAfter(e: Pick<EventRow, "event_type" | "payload_json">): CardStatus {
  if (e.event_type === "resident_confirmed") return e.payload_json?.restored === true ? "resolved" : "confirmed";
  return e.event_type;
}

export function buildSnapshot(
  served: ServedBarangay[], disruption: DisruptionRow | null, events: EventRow[], generatedAt: Date,
) {
  const gen = generatedAt.toISOString();
  // Deterministic order: occurred_at (instant), then lifecycle rank, then id (events without id keep input order).
  const sorted = events.map((e, i) => ({ e, i }))
    .sort((a, b) => Date.parse(a.e.occurred_at) - Date.parse(b.e.occurred_at)
      || LIFECYCLE_RANK[a.e.event_type] - LIFECYCLE_RANK[b.e.event_type]
      || (a.e.id != null && b.e.id != null ? (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0) : 0)
      || a.i - b.i)
    .map((x) => x.e);
  const rows: DashboardRowOut[] = served.map((b) => {
    if (!disruption) {
      return { barangay_id: b.barangay_id, signal_level: 0, status: "resolved", last_event_at: gen, resident_state: residentState(0, null, b.service_level).state };
    }
    // System-wide events (barangay_id NULL) fan out to every served barangay; the latest applicable event wins.
    let status: CardStatus = disruption.status === "resolved" ? "resolved" : "predicted";
    let last = disruption.started_at;
    let restored = disruption.status === "resolved";
    for (const e of sorted) {
      if (e.barangay_id != null && e.barangay_id !== b.barangay_id) continue;
      status = statusAfter(e); last = e.occurred_at;
      restored = status === "resolved";
    }
    const signal = restored ? 0 : disruption.signal_level;
    return { barangay_id: b.barangay_id, signal_level: signal, status, last_event_at: last, resident_state: residentState(signal, disruption.cause, b.service_level).state };
  });
  return { generated_at: gen, barangays: rows, disruption };
}

export interface SnapshotDeps {
  fetchServed: () => Promise<ServedBarangay[]>;
  findOpen: () => Promise<DisruptionRow | null>;
  fetchEvents: (disruptionId: string) => Promise<EventRow[]>;
  now?: () => Date;
}

export async function handleSnapshot(req: Request, deps: SnapshotDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  try {
    const now = (deps.now ?? (() => new Date()))();
    const [served, disruption] = await Promise.all([deps.fetchServed(), deps.findOpen()]);
    const events = disruption ? await deps.fetchEvents(disruption.id) : [];
    return json(200, buildSnapshot(served, disruption, events, now));
  } catch (e) {
    console.error("dashboard-snapshot failed", e);
    return json(500, { error: "failed to build snapshot" });
  }
}
