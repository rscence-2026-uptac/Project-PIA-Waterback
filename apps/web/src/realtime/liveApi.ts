// SPEC: 07 — live status from Dev A's `dashboard-snapshot` Edge Function (GET, anon key).
// Shared by the resident status, the LGU live board, the allocation screen and the operator screen.
// Realtime (postgres_changes on event_log) needs @supabase/supabase-js, which is not installed (hard rule 3),
// so these screens poll this endpoint instead. Swap the polling for a subscription if the package is added.
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { backendConfigured, callFunction } from "../lib/api";

const Status = z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]);

export const LiveDisruption = z.object({
  id: z.string(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  signal_level: z.number().int().min(0).max(4),
  status: Status,
  started_at: z.string(),
  window_start: z.string().nullable().optional(),
  window_end: z.string().nullable().optional(),
  likely_at: z.string().nullable().optional(),
  next_update_at: z.string().nullable().optional(),
  heads_up_from: z.string().nullable().optional(),
});
export type LiveDisruption = z.infer<typeof LiveDisruption>;

// Timestamps are plain strings here (the server sends +00:00 offsets); consumers normalise with new Date().
export const LiveSnapshot = z.object({
  generated_at: z.string(),
  barangays: z.array(z.object({
    barangay_id: z.string(),
    signal_level: z.number().int().min(0).max(4),
    status: Status,
    last_event_at: z.string(),
  })),
  disruption: LiveDisruption.nullable(),
});
export type LiveSnapshot = z.infer<typeof LiveSnapshot>;

const CACHE_MS = 2_000;
let inflight: Promise<LiveSnapshot> | null = null;
let cached: { at: number; value: LiveSnapshot } | null = null;

/** GET dashboard-snapshot. Concurrent callers (and calls within 2 s) share one request. `force` skips the 2 s reuse. */
export async function fetchLiveSnapshot(force = false): Promise<LiveSnapshot> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (inflight) return inflight;
  inflight = callFunction<unknown>("dashboard-snapshot", { method: "GET" })
    .then((raw) => {
      const value = LiveSnapshot.parse(raw);
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Polls while the page is visible; refreshes at once when it becomes visible again. No-op when not configured. */
export function useLiveSnapshot(intervalMs: number) {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    const load = (force: boolean) => {
      fetchLiveSnapshot(force)
        .then((snapshot) => {
          if (cancelled) return;
          setData(snapshot);
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load(attempt > 0);
    const timer = setInterval(() => document.visibilityState === "visible" && load(false), intervalMs);
    const onVisible = () => document.visibilityState === "visible" && load(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, attempt]);

  return { data, failed, refresh };
}
