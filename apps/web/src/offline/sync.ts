// SPEC: 05 — sync seam: pushes the local queue to the sync-queue Edge Function.
// Runs on app start, on the window "online" event and right after something is queued.
// local_id is the idempotency key, so a retry never double-counts; items go in queued_at order.
// Only a server answer of synced / already_synced marks an item synced. `rejected` items are
// permanent failures (the server will never take them): they are kept on the device, flagged, not retried.
// Not live: nothing is sent and queued items stay safely on the device.
import { isLive } from "../api/client";
import { postSyncQueue } from "../api/endpoints";
import { db } from "./db";

let running: Promise<number> | null = null;

/** Sends pending items. Resolves with how many were marked synced. Safe to call any time. */
export function syncQueue(): Promise<number> {
  if (!isLive() || !navigator.onLine) return Promise.resolve(0);
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<number> {
  const pending = (await db.queue.orderBy("queued_at").filter((item) => !item.synced && !item.rejected).toArray());
  if (pending.length === 0) return 0;
  let synced = 0;
  // 200 items per request is the endpoint's cap.
  for (let i = 0; i < pending.length; i += 200) {
    const batch = pending.slice(i, i + 200);
    try {
      const { results } = await postSyncQueue(batch);
      for (const result of results) {
        if (result.status === "synced" || result.status === "already_synced") {
          await db.queue.update(result.local_id, { synced: true });
          synced++;
        } else if (result.status === "rejected") {
          await db.queue.update(result.local_id, { rejected: result.code ?? result.error ?? "rejected" });
        }
        // failed = temporary: stays pending for the next run.
      }
    } catch {
      return synced; // network / server trouble: try again on the next trigger
    }
  }
  return synced;
}

let started = false;
/** Wires the triggers once: now, and every time the browser comes back online. */
export function startSync() {
  if (started) return;
  started = true;
  void syncQueue();
  window.addEventListener("online", () => void syncQueue());
}
