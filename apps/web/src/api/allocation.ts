// The open disruption for the LGU screens, live or sample. Live: the open disruption from dashboard-snapshot at the
// demo clock's as_of. Sample: the wireframe's event (data/mockLgu.ts).
// The allocation list itself is Dev B's spec 10 cluster ranking (lib/need.ts); it is computed on the device from
// seed data, so only the event and the confirm / notify writes come from the backend.
import { OPEN_EVENT } from "../data/mockLgu";
import type { Cause } from "../data/mock";
import { useAsOf } from "../demo/clockState";
import { isLive } from "./client";
import { getDashboardSnapshot } from "./endpoints";
import { useResource } from "./useResource";

export interface OpenEvent {
  disruption_id: string;
  code: string;
  cause: Cause;
  status: "predicted" | "confirmed" | "deployed" | "notified" | "resolved" | null; // null = sample
  signal_level: number; // the predictor's system-wide level (spec 02)
  flagged_by: string;
  flagged_at: string | null;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
  live: boolean;
}

// MOCK: the sample event is a confirmed signal-4 turbidity outage (same one the resident screens use).
const SAMPLE_EVENT: OpenEvent = { ...OPEN_EVENT, status: null, signal_level: 4, live: false };

export const eventCode = (id: string) => `EVT-${id.slice(0, 8).toUpperCase()}`;

/** The open disruption at as_of, or null. Sample mode: the wireframe's event. */
export async function loadOpenEvent(asOf: Date, signal?: AbortSignal): Promise<OpenEvent | null> {
  if (!isLive()) return SAMPLE_EVENT;
  const snap = await getDashboardSnapshot(asOf, signal);
  const d = snap.disruption;
  if (!d || d.status === "resolved") return null;
  return {
    disruption_id: d.id,
    code: eventCode(d.id),
    cause: d.cause,
    status: d.status,
    signal_level: d.signal_level,
    flagged_by: d.status === "predicted" ? "the predictor" : "the operator",
    flagged_at: d.started_at,
    window_start: d.window_start ?? null,
    window_end: d.window_end ?? null,
    likely_at: d.likely_at ?? null,
    live: true,
  };
}

export function useOpenEvent() {
  const { asOf, asOfKey } = useAsOf();
  return useResource((signal) => loadOpenEvent(asOf, signal), [asOfKey]);
}
