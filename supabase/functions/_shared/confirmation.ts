// resident-confirmation (spec 06 AC3-AC4), also used by sync-queue and sms-webhook (THANKS).
//
// RESOLUTION RULE (decision; spec 06 is silent on multi-barangay disruptions):
//   AC3 says only a resident confirmation may flip a disruption to `resolved`. A disruption spans many barangays, so
//   ONE barangay saying "restored" must not close it for the others. We resolve when EVERY barangay that was notified
//   for this disruption currently counts as restored. A barangay counts as restored when the latest of its
//   `notified` / `resident_confirmed` events is a `resident_confirmed` with restored = true (latest wins: a later
//   "not restored" report, or a fresh `notified` after a re-allocation, un-restores it).
//   AC4: restored = false never writes `resolved`; it writes the event with payload.reopen = true and moves the
//   disruption back to `deployed`, so the barangay shows on the allocation screen again.
import { HttpError } from "./spec06_http.ts";
import { clampToNow, parseOrThrow } from "./spec06_http.ts";
import { ResidentConfirmationRequest } from "./spec06_schemas.ts";
import type { DisruptionStatus, EventRow, Store } from "./spec06_store.ts";
import { eventOrderKey } from "./spec06_store.ts";

export interface BarangayRestoreState { restored: boolean; reopen: boolean }

/** barangay_id -> state, for barangays that have a `notified` event. Latest notified/resident_confirmed event wins. */
export function barangayStates(events: EventRow[]): Map<string, BarangayRestoreState> {
  const rel = events
    .filter((e) => e.barangay_id && (e.event_type === "notified" || e.event_type === "resident_confirmed"))
    .map((e, i) => ({ e, i, k: eventOrderKey(e) }))
    .sort((a, b) => a.k - b.k || a.i - b.i);
  const out = new Map<string, BarangayRestoreState>();
  for (const { e } of rel) {
    const id = e.barangay_id!;
    if (e.event_type === "notified") out.set(id, { restored: false, reopen: false });
    else if (out.has(id)) {
      const restored = e.payload_json?.restored === true;
      out.set(id, { restored, reopen: !restored });
    }
  }
  return out;
}

export interface ConfirmationResult {
  result: "recorded" | "already_synced";
  disruption_id: string;
  barangay_id: string;
  restored: boolean;
  reopen: boolean;
  disruption_status: DisruptionStatus;
  resolved: boolean;
  pending_barangays: string[];
}

export async function recordConfirmation(store: Store, body: unknown, now: Date): Promise<ConfirmationResult> {
  const c = parseOrThrow(ResidentConfirmationRequest, body);
  const key = c.client_local_id ?? null;
  const disruption = await store.getDisruption(c.disruption_id);
  if (!disruption) throw new HttpError(404, "disruption_not_found", `no disruption ${c.disruption_id}`);
  const known = await store.getBarangays([c.barangay_id]);
  if (!known.length) throw new HttpError(422, "unknown_barangay", "unknown barangay_id", [c.barangay_id]);

  const events = await store.listEvents(c.disruption_id);
  const summary = (d: DisruptionStatus, es: EventRow[], result: ConfirmationResult["result"], resolvedNow = false): ConfirmationResult => {
    const states = barangayStates(es);
    return {
      result, disruption_id: c.disruption_id, barangay_id: c.barangay_id, restored: c.restored, reopen: !c.restored,
      disruption_status: d, resolved: d === "resolved" || resolvedNow,
      pending_barangays: [...states].filter(([, s]) => !s.restored).map(([id]) => id),
    };
  };

  // Idempotency first: a replay must be answered the same way even if the disruption has moved on since.
  if (key && events.some((e) => e.client_local_id === key)) return summary(disruption.status, events, "already_synced");

  if (!events.some((e) => e.event_type === "notified" && e.barangay_id === c.barangay_id)) {
    throw new HttpError(409, "barangay_not_notified", `barangay ${c.barangay_id} was not notified for this disruption`);
  }
  if (disruption.status === "resolved" && !c.restored) {
    throw new HttpError(409, "disruption_resolved", "disruption is already resolved; a new report needs a new disruption");
  }

  const at = now.toISOString();
  const [inserted] = await store.insertEvents([{
    disruption_id: c.disruption_id, event_type: "resident_confirmed", actor: c.confirmed_by,
    occurred_at: clampToNow(c.confirmed_at, now), barangay_id: c.barangay_id, client_local_id: key,
    payload_json: {
      confirmed_by: c.confirmed_by, channel: c.channel, restored: c.restored, reopen: !c.restored,
      confirmed_at: new Date(c.confirmed_at).toISOString(), recorded_at: at,
    },
  }]);
  if (!inserted) return summary(disruption.status, events, "already_synced"); // lost a race with the same key

  if (!c.restored) { // AC4: never `resolved`; back to the allocation screen
    if (disruption.status !== "resolved") await store.setDisruptionStatus(c.disruption_id, "deployed", ["notified", "deployed"]);
    return summary(disruption.status === "resolved" ? "resolved" : "deployed", await store.listEvents(c.disruption_id), "recorded");
  }

  // restored = true: resolve only when every notified barangay is restored.
  const after = await store.listEvents(c.disruption_id);
  const states = barangayStates(after);
  const allRestored = states.size > 0 && [...states.values()].every((s) => s.restored);
  if (disruption.status === "resolved" || !allRestored) return summary(disruption.status, after, "recorded");

  const changed = await store.setDisruptionStatus(c.disruption_id, "resolved", ["notified", "deployed"], at);
  if (changed) {
    await store.insertEvents([{
      disruption_id: c.disruption_id, event_type: "resolved", actor: "system", occurred_at: at, barangay_id: null,
      payload_json: { rule: "all_notified_barangays_restored", barangays: [...states.keys()], recorded_at: at },
    }]);
  }
  return summary("resolved", await store.listEvents(c.disruption_id), "recorded", changed);
}
