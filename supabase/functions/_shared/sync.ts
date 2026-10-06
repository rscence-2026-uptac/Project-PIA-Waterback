// sync-queue (spec 05 offline queue -> spec 00 tables). Items are processed sequentially in queued_at order;
// local_id is the idempotency key. One bad item never fails the batch: every item gets its own status.
//   synced         first time this local_id was stored
//   already_synced local_id seen before (replay) -> the app marks it synced, not an error
//   rejected       permanent (invalid payload, unknown barangay/disruption, rule violation) -> do not retry
//   failed         transient (database error) -> keep pending, retry later
import { HttpError, parseOrThrow } from "./spec06_http.ts";
import { OfflineQueueItem, QueuedReadingPayload, z } from "./spec06_schemas.ts";
import type { Store } from "./spec06_store.ts";
import { recordConfirmation } from "./confirmation.ts";

export const MAX_ITEMS = 200;
export type SyncStatus = "synced" | "already_synced" | "rejected" | "failed";
export interface SyncResult { local_id: string | null; kind: string | null; status: SyncStatus; code?: string; error?: string; details?: unknown }

export async function syncQueue(store: Store, body: unknown, now: Date) {
  if (!Array.isArray(body)) throw new HttpError(400, "invalid_request", "body must be an array of queue items");
  if (body.length === 0) throw new HttpError(400, "invalid_request", "queue is empty");
  if (body.length > MAX_ITEMS) throw new HttpError(400, "invalid_request", `at most ${MAX_ITEMS} items per request`);

  // Validate each item on its own so one malformed item does not hide the others.
  const parsed = body.map((raw, index) => ({ index, raw, r: OfflineQueueItem.safeParse(raw) }));
  const results: { index: number; res: SyncResult }[] = [];
  const valid = parsed.filter((p) => p.r.success).map((p) => ({ index: p.index, item: (p.r as { data: OfflineQueueItem }).data }));
  for (const p of parsed) {
    if (!p.r.success) {
      const raw = p.raw as { local_id?: unknown; kind?: unknown } | null;
      results.push({ index: p.index, res: {
        local_id: typeof raw?.local_id === "string" ? raw.local_id : null, kind: typeof raw?.kind === "string" ? raw.kind : null,
        status: "rejected", code: "invalid_item", error: "queue item failed validation",
        details: p.r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      } });
    }
  }
  // queued_at order; ties keep the order the app sent them.
  valid.sort((a, b) => Date.parse(a.item.queued_at) - Date.parse(b.item.queued_at) || a.index - b.index);
  for (const { index, item } of valid) results.push({ index, res: await syncOne(store, item, now) });

  // Report in processing order: invalid items first (they were never processable), then valid in queued_at order.
  const out = results.map((r) => r.res);
  const count = (s: SyncStatus) => out.filter((r) => r.status === s).length;
  return { results: out, summary: { synced: count("synced"), already_synced: count("already_synced"), rejected: count("rejected"), failed: count("failed") } };
}

async function syncOne(store: Store, item: OfflineQueueItem, now: Date): Promise<SyncResult> {
  const base = { local_id: item.local_id, kind: item.kind };
  try {
    if (item.kind === "reading") {
      const p = QueuedReadingPayload.safeParse(item.payload);
      if (!p.success) {
        return { ...base, status: "rejected", code: "invalid_payload", error: "reading payload failed validation",
          details: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
      }
      const r = await store.insertReading({
        recorded_at: p.data.recorded_at, intake_id: p.data.intake_id, turbidity_ntu: p.data.turbidity_ntu,
        plant_status: p.data.plant_status, reservoir_pct: p.data.reservoir_pct, clarifier_inflow_lps: p.data.clarifier_inflow_lps,
        treated_turbidity_ntu: p.data.treated_turbidity_ntu, source: "operator", is_simulated: false, client_local_id: item.local_id,
      });
      return { ...base, status: r === "inserted" ? "synced" : "already_synced" };
    }
    const r = await recordConfirmation(store, { ...item.payload, client_local_id: item.local_id }, now);
    return { ...base, status: r.result === "recorded" ? "synced" : "already_synced" };
  } catch (e) {
    if (e instanceof HttpError) {
      // 4xx = the item itself is wrong (permanent); anything else is retryable.
      return { ...base, status: e.status < 500 ? "rejected" : "failed", code: e.code, error: e.message, details: e.details };
    }
    console.error("sync item failed", item.local_id, e);
    return { ...base, status: "failed", code: "internal", error: "temporary error, retry later" };
  }
}
