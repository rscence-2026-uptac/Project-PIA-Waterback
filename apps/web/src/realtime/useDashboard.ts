// SPEC: 07 — dashboard state: snapshot first, then live events applied as they arrive (AC1).
// When the feed drops, the last data stays on screen with its time and the screen offers
// Refresh (AC3); it never silently pretends to be live.
import { useCallback, useEffect, useState } from "react";
import { isHeadsUpEvent, type DashboardRow, type RealtimeEvent } from "../contracts/spec07";
import { useAsOf } from "../demo/clockState";
import type { ScreenState } from "../contracts/spec08";
import { fetchDashboardSnapshot, subscribeEventLog, type DisruptionChange, type FeedStatus } from "./eventFeed";

export type LiveRow = DashboardRow & {
  resident_confirmed: boolean; // a resident_confirmed event arrived (status itself doesn't change)
  changed_at: number | null; // when this row last changed live, for a one-time highlight
};

export interface FeedItem extends RealtimeEvent {
  received_at: number;
  heads_up: boolean; // a per-barangay heads-up: shown in the feed, never changes a card's status
}

const FEED_LENGTH = 30;

export function useDashboard() {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [connection, setConnection] = useState<FeedStatus>("connecting");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { asOf, asOfKey } = useAsOf();

  // Reset to "connecting" here (not inside the effect) so each Refresh starts clean.
  const refresh = useCallback(() => {
    setConnection("connecting");
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const load = (quiet: boolean) =>
      fetchDashboardSnapshot(asOf).then((snapshot) => {
        if (cancelled) return;
        setRows((current) => {
          const old = new Map(current.map((row) => [row.barangay_id, row]));
          return snapshot.barangays.map((row) => ({
            ...row,
            resident_confirmed: old.get(row.barangay_id)?.resident_confirmed ?? false,
            changed_at: quiet && old.get(row.barangay_id)?.status !== row.status ? Date.now() : null,
          }));
        });
        setSyncedAt(snapshot.generated_at);
        setLoaded(true);
      });

    load(false)
      .then(() => {
        if (cancelled) return;
        unsubscribe = subscribeEventLog({
          onStatus: (status) => !cancelled && setConnection(status),
          onEvent: (event) => {
            if (cancelled) return;
            const now = Date.now();
            const headsUp = isHeadsUpEvent(event);
            // barangay_id null = system-wide: it applies to every served card.
            setRows((current) =>
              current.map((row) => (event.barangay_id === null || row.barangay_id === event.barangay_id ? applyEvent(row, event, now) : row)),
            );
            setFeed((current) => [{ ...event, received_at: now, heads_up: headsUp }, ...current].slice(0, FEED_LENGTH));
            setSyncedAt(event.occurred_at);
          },
          onDisruption: (change: DisruptionChange) => {
            if (cancelled) return;
            // A new disruption changes which cards exist/what they show: re-read the snapshot.
            if (change.kind === "insert") return void load(true).catch(() => {});
            const level = change.signal_level;
            if (level === null) return;
            const now = Date.now();
            setRows((current) =>
              current.map((row) => (row.status === "resolved" || row.signal_level === level ? row : { ...row, signal_level: level, changed_at: now })),
            );
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, asOfKey]);

  const screenState: ScreenState =
    !loaded ? (failed ? "error" : "loading") : connection === "dropped" ? "offline_stale" : "ready";

  return { rows, feed, connection, screenState, syncedAt, refresh };
}

function applyEvent(row: LiveRow, event: RealtimeEvent, now: number): LiveRow {
  // Heads-up (per-barangay `predicted` with payload kind heads_up): bump the time only, never the status.
  if (isHeadsUpEvent(event)) return { ...row, last_event_at: event.occurred_at, changed_at: now };
  if (event.event_type === "resident_confirmed") {
    if (event.payload_json === undefined) {
      return { ...row, resident_confirmed: true, last_event_at: event.occurred_at, changed_at: now }; // sample feed
    }
    // Live: restored = true resolves the card; anything else puts it back to `confirmed` (allocation list).
    return event.payload_json?.restored === true
      ? { ...row, status: "resolved", signal_level: 0, resident_confirmed: true, last_event_at: event.occurred_at, changed_at: now }
      : { ...row, status: "confirmed", resident_confirmed: true, last_event_at: event.occurred_at, changed_at: now };
  }
  return {
    ...row,
    status: event.event_type,
    signal_level: event.event_type === "resolved" ? 0 : row.signal_level,
    last_event_at: event.occurred_at,
    changed_at: now,
  };
}
