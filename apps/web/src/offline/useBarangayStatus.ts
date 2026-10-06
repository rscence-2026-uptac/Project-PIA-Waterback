// SPEC: 05 — resident/captain status, cache first. Never a blank screen or endless spinner.
import { useCallback, useEffect, useState } from "react";
import type { ScreenState } from "../contracts/spec08";
import type { BarangayStatusView } from "../contracts/spec05";
import { snapshotFromLive } from "../data/liveMap";
import { mockSnapshot, type BarangaySnapshot } from "../data/mock";
import { backendConfigured } from "../lib/api";
import { fetchLiveSnapshot } from "../realtime/liveApi";
import { db, SNAPSHOT_SCHEMA, type CachedStatus } from "./db";

export interface BarangayStatus {
  state: ScreenState;
  view: BarangayStatusView | null;
  snapshot: BarangaySnapshot | null;
  retry: () => void;
}

const POLL_MS = 15_000;

// Live when the backend is configured (dashboard-snapshot). Throws on any failure so the caller falls back to the
// cached snapshot. Only the unconfigured build uses the MOCK snapshot, so a failed live fetch never shows fake data.
async function fetchSnapshot(barangayId: string, force: boolean): Promise<BarangaySnapshot> {
  if (!navigator.onLine) throw new Error("offline");
  if (backendConfigured) {
    const snapshot = snapshotFromLive(barangayId, await fetchLiveSnapshot(force));
    if (!snapshot) throw new Error(`No status for ${barangayId}`);
    return snapshot;
  }
  // MOCK: stands in for Dev A's Supabase status query.
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
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!barangayId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      let cached: CachedStatus | undefined;
      try {
        cached = await db.barangayStatus.get(barangayId);
      } catch {
        cached = undefined; // IndexedDB unavailable: carry on to the network, never hang on loading
      }
      if (cancelled) return;
      if (cached && cached.schema !== SNAPSHOT_SCHEMA) cached = undefined;
      if (cached) {
        setSnapshot(cached.snapshot);
        // Only call it stale while offline; otherwise the fetch below replaces it within a moment.
        const offline = !navigator.onLine;
        setStale(offline);
        setState(offline ? "offline_stale" : "ready");
      } else {
        setState("loading");
      }

      const load = async (force: boolean) => {
        try {
          const fresh = await fetchSnapshot(barangayId, force);
          try {
            await db.barangayStatus.put({ barangay_id: barangayId, snapshot: fresh, schema: SNAPSHOT_SCHEMA });
          } catch {
            // A failed cache write must not discard the fresh snapshot.
          }
          if (cancelled) return;
          setSnapshot(fresh);
          setStale(false);
          setState("ready");
        } catch {
          if (cancelled) return;
          setStale(true);
          // Keep whatever is already on screen (the cache or the last good poll); only a first load can be an error.
          setState((current) => (current === "ready" || current === "offline_stale" || cached ? "offline_stale" : "error"));
        }
      };
      await load(attempt > 0);
      if (cancelled || !backendConfigured) return;
      // Poll while the page is visible (spec 05: a restore shows up within seconds, not on reload).
      pollTimer = setInterval(() => {
        if (document.visibilityState === "visible") void load(false);
      }, POLL_MS);
    })();

    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      window.removeEventListener("online", retry);
    };
  }, [barangayId, attempt, retry]);

  const view: BarangayStatusView | null = snapshot
    ? { ...snapshot.status, is_stale: stale }
    : null;

  return { state, view, snapshot, retry };
}
