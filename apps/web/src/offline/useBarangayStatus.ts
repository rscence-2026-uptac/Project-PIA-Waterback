// SPEC: 05 — resident/captain status, cache first. Never a blank screen or endless spinner.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenState } from "../contracts/spec08";
import type { BarangayStatusView } from "../contracts/spec05";
import { fetchLiveSnapshot } from "../api/status";
import { isLive } from "../api/client";
import { useAsOf } from "../demo/clockState";
import { mockSnapshot, type BarangaySnapshot } from "../data/mock";
import { db, SNAPSHOT_SCHEMA, type CachedStatus } from "./db";

export interface BarangayStatus {
  state: ScreenState;
  view: BarangayStatusView | null;
  snapshot: BarangaySnapshot | null;
  retry: () => void;
}

// Live: the Edge Functions at the demo clock's as_of (api/status.ts). Not live: MOCK sample data.
// Throws when offline, like a real fetch.
async function fetchSnapshot(barangayId: string, asOf: Date): Promise<BarangaySnapshot> {
  if (!navigator.onLine) throw new Error("offline");
  if (isLive()) return fetchLiveSnapshot(barangayId, asOf);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const snapshot = mockSnapshot(barangayId);
  if (!snapshot) throw new Error(`No status for ${barangayId}`);
  return snapshot;
}

export function useBarangayStatus(barangayId: string | null): BarangayStatus {
  const [state, setState] = useState<ScreenState>("loading");
  const [snapshot, setSnapshot] = useState<BarangaySnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { asOf, asOfKey } = useAsOf();
  const hasFresh = useRef<string | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!barangayId) return;
    let cancelled = false;

    (async () => {
      let cached: CachedStatus | undefined;
      try {
        cached = await db.barangayStatus.get(barangayId);
      } catch {
        cached = undefined; // IndexedDB unavailable: carry on to the network, never hang on loading
      }
      if (cancelled) return;
      if (cached && cached.schema !== SNAPSHOT_SCHEMA) cached = undefined; // old shape: ignore
      if (hasFresh.current === barangayId) {
        // Re-fetching (retry or a new as_of): keep what is on screen, don't flash "offline".
      } else if (cached && (cached.snapshot.live === true) === isLive()) {
        setSnapshot(cached.snapshot);
        // Only call it stale while offline; otherwise the fetch below replaces it within a moment.
        const offline = !navigator.onLine;
        setStale(offline);
        setState(offline ? "offline_stale" : "ready");
      } else {
        setState("loading");
      }

      try {
        const fresh = await fetchSnapshot(barangayId, asOf);
        try {
          await db.barangayStatus.put({ barangay_id: barangayId, snapshot: fresh, schema: SNAPSHOT_SCHEMA });
        } catch {
          // A failed cache write must not discard the fresh snapshot.
        }
        if (cancelled) return;
        hasFresh.current = barangayId;
        setSnapshot(fresh);
        setStale(false);
        setState("ready");
      } catch {
        if (cancelled) return;
        setStale(true);
        setState(cached || hasFresh.current === barangayId ? "offline_stale" : "error");
      }
    })();

    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangayId, attempt, retry, asOfKey]);

  const view: BarangayStatusView | null = snapshot
    ? { ...snapshot.status, is_stale: stale }
    : null;

  return { state, view, snapshot, retry };
}
