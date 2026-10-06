// SPEC: 07 — dashboard state: snapshot first, then live events applied as they arrive (AC1).
// When the feed drops, the last data stays on screen with its time and the screen offers
// Refresh (AC3); it never silently pretends to be live.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardRow, RealtimeEvent } from "../contracts/spec07";
import type { ScreenState } from "../contracts/spec08";
import { backendConfigured } from "../lib/api";
import { fetchDashboardSnapshot, subscribeEventLog, type FeedStatus } from "./eventFeed";
import { useLiveSnapshot } from "./liveApi";

export type LiveRow = DashboardRow & {
  resident_confirmed: boolean; // a resident_confirmed event arrived (status itself doesn't change)
  changed_at: number | null; // when this row last changed live, for a one-time highlight
};

export interface FeedItem extends RealtimeEvent {
  received_at: number;
}

const FEED_LENGTH = 30;

const LIVE_POLL_MS = 5_000;

/**
 * The dashboard's data. Configured: polls Dev A's dashboard-snapshot every 5 s (Realtime needs @supabase/supabase-js,
 * which isn't installed; the polled snapshot has the same rows). Otherwise: the `// MOCK:` simulator.
 * Which one is decided once at load, so the hook order never changes.
 */
export const useDashboard = backendConfigured ? useLiveDashboard : useMockDashboard;

function useLiveDashboard() {
  const { data, failed, refresh } = useLiveSnapshot(LIVE_POLL_MS);
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const seen = useRef<Map<string, DashboardRow["status"]>>(new Map());

  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    const first = seen.current.size === 0;
    const fresh: FeedItem[] = [];
    const next: LiveRow[] = data.barangays.map((row) => {
      const before = seen.current.get(row.barangay_id);
      const changed = !first && before !== undefined && before !== row.status;
      if (changed && data.disruption) {
        // The feed lists status changes seen between polls; resident_confirmed isn't visible in a snapshot.
        fresh.push({
          table: "event_log", event_type: row.status, disruption_id: data.disruption.id,
          barangay_id: row.barangay_id, occurred_at: row.last_event_at, received_at: now,
        });
      }
      seen.current.set(row.barangay_id, row.status);
      return { ...row, resident_confirmed: false, changed_at: changed ? now : null };
    });
    setRows(next);
    if (fresh.length > 0) setFeed((current) => [...fresh, ...current].slice(0, FEED_LENGTH));
  }, [data]);

  const screenState: ScreenState = !data ? (failed ? "error" : "loading") : failed ? "offline_stale" : "ready";
  const connection: FeedStatus = !data ? (failed ? "dropped" : "connecting") : failed ? "dropped" : "live";
  return { rows, feed, connection, screenState, syncedAt: data?.generated_at ?? null, refresh };
}

function useMockDashboard() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connection, setConnection] = useState<FeedStatus>("connecting");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Reset to "connecting" here (not inside the effect) so each Refresh starts clean.
  const refresh = useCallback(() => {
    setConnection("connecting");
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    fetchDashboardSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        setRows(snapshot.barangays.map((row) => ({ ...row, resident_confirmed: false, changed_at: null })));
        setSyncedAt(snapshot.generated_at);
        setLoaded(true);
        unsubscribe = subscribeEventLog({
          onStatus: (status) => !cancelled && setConnection(status),
          onEvent: (event) => {
            if (cancelled) return;
            const now = Date.now();
            setRows((current) => current.map((row) => (event.barangay_id === null || row.barangay_id === event.barangay_id ? applyEvent(row, event, now) : row)));
            setFeed((current) => [{ ...event, received_at: now }, ...current].slice(0, FEED_LENGTH));
            setSyncedAt(event.occurred_at);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setConnection("dropped");
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt]);

  const screenState: ScreenState =
    !loaded ? (failed ? "error" : "loading") : connection === "dropped" ? "offline_stale" : "ready";

  return { rows, feed, connection, screenState, syncedAt, refresh };
}

function applyEvent(row: LiveRow, event: RealtimeEvent, now: number): LiveRow {
  if (event.event_type === "resident_confirmed") {
    return { ...row, resident_confirmed: true, last_event_at: event.occurred_at, changed_at: now };
  }
  return {
    ...row,
    status: event.event_type,
    signal_level: event.event_type === "resolved" ? 0 : row.signal_level,
    last_event_at: event.occurred_at,
    changed_at: now,
  };
}
