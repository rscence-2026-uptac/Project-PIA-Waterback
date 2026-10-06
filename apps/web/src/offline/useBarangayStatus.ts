// SPEC: 05 — resident/captain status, cache first. Never a blank screen or endless spinner.
import { useCallback, useEffect, useState } from "react";
import type { ScreenState } from "../contracts/spec08";
import type { BarangayStatusView } from "../contracts/spec05";
import { mockSnapshot, type BarangaySnapshot } from "../data/mock";
import { db } from "./db";

export interface BarangayStatus {
  state: ScreenState;
  view: BarangayStatusView | null;
  snapshot: BarangaySnapshot | null;
  retry: () => void;
}

// MOCK: stands in for Dev A's Supabase status query. Throws when offline, like a real fetch.
async function fetchSnapshot(barangayId: string): Promise<BarangaySnapshot> {
  if (!navigator.onLine) throw new Error("offline");
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

    (async () => {
      const cached = await db.barangayStatus.get(barangayId);
      if (cancelled) return;
      if (cached) {
        setSnapshot(cached.snapshot);
        setStale(true);
        setState("offline_stale");
      } else {
        setState("loading");
      }

      try {
        const fresh = await fetchSnapshot(barangayId);
        await db.barangayStatus.put({ barangay_id: barangayId, snapshot: fresh });
        if (cancelled) return;
        setSnapshot(fresh);
        setStale(false);
        setState("ready");
      } catch {
        if (cancelled) return;
        setState(cached ? "offline_stale" : "error");
      }
    })();

    window.addEventListener("online", retry);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
    };
  }, [barangayId, attempt, retry]);

  const view: BarangayStatusView | null = snapshot
    ? { ...snapshot.status, is_stale: stale }
    : null;

  return { state, view, snapshot, retry };
}
