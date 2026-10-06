// SPEC: 05 — every write goes into the local queue first, then syncs when online.
import { OfflineQueueItem } from "../contracts/spec05";
import { db } from "./db";
import { syncQueue } from "./sync";

export async function enqueue(
  kind: OfflineQueueItem["kind"],
  payload: Record<string, unknown>,
  localId: string = crypto.randomUUID(), // pass one in when the payload must carry the same id
) {
  const item = OfflineQueueItem.parse({
    local_id: localId,
    kind,
    payload,
    queued_at: new Date().toISOString(),
    synced: false,
  });
  await db.queue.add(item);
  void syncQueue(); // best effort: does nothing when offline or not live
  return item;
}

export function pendingItems(kind?: OfflineQueueItem["kind"]) {
  return db.queue
    .orderBy("queued_at")
    .filter((item) => !item.synced && !item.rejected && (!kind || item.kind === kind))
    .toArray();
}

export async function latestItem(kind: OfflineQueueItem["kind"]) {
  const items = await db.queue.where("kind").equals(kind).sortBy("queued_at");
  return items.at(-1) ?? null;
}