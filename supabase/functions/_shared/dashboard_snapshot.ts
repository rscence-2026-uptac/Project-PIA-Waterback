// Spec 07: dashboard snapshot (pure derivation + request handler with injected data access).
import { json, parseAsOf, preflight } from "./http.ts";
import { residentState } from "./resident_state.generated.ts";
import type { HeadsUpUrgency, ResidentStateKind, ServiceLevel } from "./resident_state.generated.ts";
import { interruptionObserved } from "./interruption.ts";
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
  payload_json: { restored?: boolean; kind?: string } | null;
}
export interface ServedBarangay { barangay_id: string; service_level: ServiceLevel }
export interface DashboardRowOut {
  barangay_id: string;
  signal_level: number;
  status: CardStatus;
  last_event_at: string;
  /** Extra (not in spec 07's zod object): what a resident of this barangay sees. */
  resident_state: ResidentStateKind;
  /** Extra, optional: present when the resident sees a heads-up (possible / likely / very_likely). */
  heads_up_urgency?: HeadsUpUrgency;
}

/**
 * How one event_log row moves a card (same rule for the snapshot and for Realtime INSERTs on the client).
 * resident_confirmed with restored=true -> 'resolved' (and signal 0); restored=false -> back to 'confirmed' (needs allocation again, spec 06).
 */
export function statusAfter(e: Pick<EventRow, "event_type" | "payload_json">): CardStatus {
  if (e.event_type === "resident_confirmed") return e.payload_json?.restored === true ? "resolved" : "confirmed";
  return e.event_type;
}

/**
 * Automatic heads-up = per-barangay 'predicted' event with payload.kind 'heads_up' (see _shared/heads_up.ts).
 * It is a notification, NOT a lifecycle step: it bumps last_event_at but never moves a card's status
 * (clients applying Realtime INSERTs must skip it in statusAfter the same way).
 */
const isHeadsUp = (e: Pick<EventRow, "event_type" | "payload_json">) => e.event_type === "predicted" && e.payload_json?.kind === "heads_up";

export function buildSnapshot(
  served: ServedBarangay[], disruption: DisruptionRow | null, events: EventRow[], generatedAt: Date,
  opts: { plant_status?: string | null } = {},
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
      last = e.occurred_at;
      if (isHeadsUp(e)) continue;
      status = statusAfter(e);
      restored = status === "resolved";
    }
    const signal = restored ? 0 : disruption.signal_level;
    // v2: a prediction never says water is off. Interrupted only when this barangay's card is confirmed/deployed/notified
    // or the latest Kulador reading says the plant is degraded/shutdown (plant_status = read at generated_at by the handler).
    const rs = residentState(signal, disruption.cause, b.service_level, { interruption_observed: interruptionObserved(status, opts.plant_status) });
    return { barangay_id: b.barangay_id, signal_level: signal, status, last_event_at: last, resident_state: rs.state, ...(rs.heads_up_urgency ? { heads_up_urgency: rs.heads_up_urgency } : {}) };
  });
  return { generated_at: gen, barangays: rows, disruption };
}

export interface SnapshotDeps {
  fetchServed: () => Promise<ServedBarangay[]>;
  findOpen: () => Promise<DisruptionRow | null>;
  fetchEvents: (disruptionId: string) => Promise<EventRow[]>;
  /** plant_status of the newest Kulador reading at or before `at`. Optional: failure/absence = disruption status only. */
  fetchPlantStatus?: (at: Date) => Promise<string | null>;
  now?: () => Date;
}

export async function handleSnapshot(req: Request, deps: SnapshotDeps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "GET") return json(405, { error: "method not allowed" });
  try {
    const now = (deps.now ?? (() => new Date()))();
    // Optional ?as_of= (ISO 8601 with offset): the demo clock. Plant status is read at as_of, events are cut at as_of
    // (unless live_events=1) and generated_at = as_of. Default = now (unchanged behaviour).
    const q = new URL(req.url).searchParams;
    const parsed = parseAsOf(q.get("as_of"), now);
    if (!parsed.ok) return json(400, { error: parsed.error });
    const asOf = parsed.asOf;
    // live_events=1: keep events stamped after as_of. Allocation/notify/confirm events are written at real time, so a
    // replayed clock (e.g. 21 Jul) would otherwise hide the steps the presenter just performed.
    const keepLater = q.get("live_events") === "1";
    const [served, disruption] = await Promise.all([deps.fetchServed(), deps.findOpen()]);
    const fetched = disruption ? await deps.fetchEvents(disruption.id) : [];
    const events = keepLater ? fetched : fetched.filter((e) => Date.parse(e.occurred_at) <= asOf.getTime());
    let plant: string | null = null;
    if (disruption && deps.fetchPlantStatus) {
      try { plant = await deps.fetchPlantStatus(asOf); } catch (e) { console.error("dashboard-snapshot: plant_status lookup failed (disruption status only)", e); }
    }
    return json(200, buildSnapshot(served, disruption, events, asOf, { plant_status: plant }));
  } catch (e) {
    console.error("dashboard-snapshot failed", e);
    return json(500, { error: "failed to build snapshot" });
  }
}
