// SPEC: 05 — offline-first storage in IndexedDB (Dexie).
import Dexie, { type Table } from "dexie";
import type { OfflineQueueItem } from "../contracts/spec05";
import type { BarangaySnapshot } from "../data/mock";

export interface CachedStatus {
  barangay_id: string;
  snapshot: BarangaySnapshot;
}

class TubigPatasDB extends Dexie {
  queue!: Table<OfflineQueueItem, string>;
  barangayStatus!: Table<CachedStatus, string>;

  constructor() {
    super("tubig-patas");
    // Booleans can't be indexed in IndexedDB, so `synced` is filtered, not indexed.
    this.version(1).stores({
      queue: "local_id, kind, queued_at",
      statusCache: "purok_id",
    });
    // v2: status is barangay-level now; the old purok cache is dropped, queued readings are kept.
    this.version(2).stores({
      statusCache: null,
      barangayStatus: "barangay_id",
    });
  }
}

export const db = new TubigPatasDB();
