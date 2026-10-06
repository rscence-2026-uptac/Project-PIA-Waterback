// SPEC: 05 — offline queue -> Dev A's `sync-queue` Edge Function.
// Items are sent oldest first; `local_id` is the idempotency key, so a retry never double-counts.
// synced / already_synced / rejected -> marked synced (rejected is permanent, retrying won't help; the reason is
// logged with console.warn because the queue item type has no field for it). failed -> stays pending and is retried on the next run.
import { backendConfigured, callFunction } from "../lib/api";
import { db } from "./db";
import { pendingItems } from "./queue";

const MAX_BATCH = 200;
const INTERVAL_MS = 30_000;

type ItemStatus = "synced" | "already_synced" | "rejected" | "failed";
interface SyncResponse {
  results: { local_id: string; status: ItemStatus; code?: string; error?: string }[];
}

let running: Promise<number> | null = null;

/** Sends pending items. Resolves to how many were marked synced. Never throws (offline is normal). */
export function syncQueue(): Promise<number> {
  if (!backendConfigured || !navigator.onLine) return Promise.resolve(0);
  if (running) return running; // one run at a time
  running = (async () => {
    try {
      const items = (await pendingItems()).slice(0, MAX_BATCH);
      if (items.length === 0) return 0;
      const response = await callFunction<SyncResponse>("sync-queue", { body: items });
      let done = 0;
      for (const result of response.results) {
        if (result.status === "failed") continue; // temporary: try again next time
        if (result.status === "rejected") console.warn("sync-queue rejected an item", result.local_id, result.code ?? result.error);
        await db.queue.update(result.local_id, { synced: true });
        done++;
      }
      return done;
    } catch (error) {
      console.warn("Sync will retry later", error);
      return 0;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Call after enqueue(): sends the new item right away when online. */
export function requestSync(): void {
  void syncQueue();
}

let started = false;
/** Start once from main.tsx: on load, when the connection returns, and every 30 s. */
export function startSync(): void {
  if (started || !backendConfigured) return;
  started = true;
  void syncQueue();
  window.addEventListener("online", () => void syncQueue());
  setInterval(() => void syncQueue(), INTERVAL_MS);
}
