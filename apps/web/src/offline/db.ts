// SPEC: 05 — offline-first storage in IndexedDB (Dexie).
import Dexie, { type Table } from "dexie";
import type { OfflineQueueItem } from "../contracts/spec05";
import type { BarangaySnapshot } from "../data/mock";

export interface CachedStatus {
  barangay_id: string;
  snapshot: BarangaySnapshot;
  schema: number; // SNAPSHOT_SCHEMA when written; other values are ignored on read
}

/** Bump when BarangaySnapshot changes shape, so old cached snapshots aren't shown as if current. */
export const SNAPSHOT_SCHEMA = 2;

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
    // Same stores; the bump marks the cache entries' `schema` field (stale entries are ignored on read).
    this.version(2).stores({
      queue: "local_id, kind, queued_at",
      barangayStatus: "barangay_id",
    });
  }
}

export const db = new WaterBackDB();
