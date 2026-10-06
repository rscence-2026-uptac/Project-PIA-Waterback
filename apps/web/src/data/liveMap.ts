// SPEC: 05 — turns Dev A's `dashboard-snapshot` into the BarangaySnapshot the resident screens already read.
// Live: signal level, cause, times, restored state. Still MOCK: storage plan and captain round (no backend for
// them). Backup sources stay seed-based (data/seedSources.ts), re-ranked for the live cause.
import type { LiveSnapshot } from "../realtime/liveApi";
import { mockExtras, noDisruptionDetail, type BarangaySnapshot, type DisruptionDetail } from "./mock";

const iso = (v: string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);

export function snapshotFromLive(barangayId: string, live: LiveSnapshot): BarangaySnapshot | null {
  const row = live.barangays.find((b) => b.barangay_id === barangayId); // only the 26 served barangays have a row
  const d = live.disruption;
  const generated = iso(live.generated_at) ?? new Date().toISOString();

  let detail: DisruptionDetail;
  if (!d) {
    detail = { ...noDisruptionDetail(), updated_at: generated };
  } else {
    // `resolved` on a barangay's row while a disruption exists = residents there confirmed water is back.
    const restored = row?.status === "resolved" && d.status !== "resolved";
    detail = {
      disruption_id: d.id,
      cause: d.cause,
      started_at: iso(d.started_at),
      updated_at: generated,
      window_start: iso(d.window_start),
      window_end: iso(d.window_end),
      likely_at: iso(d.likely_at),
      next_update_at: iso(d.next_update_at) ?? generated,
      heads_up_from: iso(d.heads_up_from),
      restored_at: restored && row ? iso(row.last_event_at) : null,
    };
  }

  const extras = mockExtras(barangayId, detail.cause); // MOCK: storage + captain; sources are seed-based
  if (!extras) return null;
  return {
    status: { barangay_id: barangayId, signal_level: row?.signal_level ?? 0, last_synced_at: generated },
    detail,
    ...extras,
  };
}
