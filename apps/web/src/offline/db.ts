// SPEC: 05 — offline-first storage in IndexedDB (Dexie).
import Dexie, { type Table } from "dexie";
import type { OfflineQueueItem } from "../contracts/spec05";
import type { BarangaySnapshot } from "../data/mock";

export interface CachedStatus {
  barangay_id: string;
  snapshot: BarangaySnapshot;
}

class WaterBackDB extends Dexie {
  queue!: Table<OfflineQueueItem, string>;
  barangayStatus!: Table<CachedStatus, string>;

  constructor() {
    // Renamed from "tubig-patas" with the app; a fresh database, so no purok-era versions to migrate.
    super("pia-waterback");
    // Booleans can't be indexed in IndexedDB, so `synced` is filtered, not indexed.
    this.version(1).stores({
      queue: "local_id, kind, queued_at",
      barangayStatus: "barangay_id",
    });
  }
}

export const db = new WaterBackDB();
