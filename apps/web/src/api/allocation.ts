// LGU allocation + open event, live or sample. Live: affected-areas (suggested_rank, top_source) and the
// open disruption from dashboard-snapshot. Sample: data/mockLgu.ts. One row per barangay when live,
// because confirm-allocation takes unique barangay_ids. Spec 09: only the LGU facility count is live (barangays.critical_facilities);
// commercial / industrial need CWD billing classes and stay out of live mode.
import { CATBALOGAN_BARANGAYS } from "../data/barangays";
import { AFFECTED_GROUPS, BARANGAY_POINTS, OPEN_EVENT, type AffectedGroupRow } from "../data/mockLgu";
import { BARANGAYS, type Cause } from "../data/mock";
import type { BarangayPoint } from "../contracts/spec09";
import type { AffectedArea } from "../contracts/spec03";
import { useAsOf } from "../demo/clockState";
import { isLive } from "./client";
import { fetchFacilities } from "./rest";
import { getAffectedAreas, getDashboardSnapshot, postRankChainBatch } from "./endpoints";
import { useResource } from "./useResource";

export interface OpenEvent {
  disruption_id: string;
  code: string;
  cause: Cause;
  status: "predicted" | "confirmed" | "deployed" | "notified" | "resolved" | null; // null = sample
  flagged_by: string;
  flagged_at: string | null;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
  live: boolean;
}

export interface AllocationData {
  event: OpenEvent | null; // null = no open disruption at this as_of
  groups: AffectedGroupRow[];
  points: BarangayPoint[];
}

const nameOf = (id: string) => BARANGAYS.find((b) => b.barangay_id === id)?.name ?? id;

const SAMPLE_EVENT: OpenEvent = { ...OPEN_EVENT, status: null, live: false };

const POINTS: BarangayPoint[] = CATBALOGAN_BARANGAYS
  .filter((b): b is typeof b & { lat: number; lng: number } => b.lat !== null && b.lng !== null)
  .map((b) => ({ barangay_id: b.barangay_id, name: b.name.replace(/\s*\(.*\)$/, ""), lat: b.lat, lng: b.lng }));

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
    flagged_by: d.status === "predicted" ? "the predictor" : "the operator",
    flagged_at: d.started_at,
    window_start: d.window_start ?? null,
    window_end: d.window_end ?? null,
    likely_at: d.likely_at ?? null,
    live: true,
  };
}

const rankedFor = new Set<string>(); // disruptions rank-chain was already run for this session

const FACILITY_TYPES = ["health_station", "school", "evacuation_center"] as const;

function toGroup(area: AffectedArea, facilities: string[] = []): AffectedGroupRow {
  const known = area.piped_households_affected !== null && area.unpiped_households_affected !== null;
  return {
    barangay_id: area.barangay_id,
    name: nameOf(area.barangay_id),
    consumer_type: "residential",
    connections_affected: known ? area.piped_households_affected! + area.unpiped_households_affected! : null,
    coverage_confidence: area.coverage_confidence,
    // barangays.critical_facilities (live). Counts of vulnerable households / no-backup connections have no backend source yet.
    facilities: FACILITY_TYPES.filter((f) => facilities.includes(f)),
    vulnerable_residents: 0,
    no_backup_connections: 0,
    suggested_rank: area.suggested_rank ?? 0,
    service_level: area.service_level,
    reported_not_restored: false,
    vulnerable_flag: area.vulnerable_flag,
    top_source: area.top_source ?? null,
  };
}

export async function loadAllocation(asOf: Date, signal?: AbortSignal): Promise<AllocationData> {
  if (!isLive()) return { event: SAMPLE_EVENT, groups: AFFECTED_GROUPS, points: BARANGAY_POINTS };
  const event = await loadOpenEvent(asOf, signal);
  if (!event) return { event: null, groups: [], points: POINTS };

  let areas = await getAffectedAreas(asOf, { disruptionId: event.disruption_id, signal });
  const needsChains = event.status !== "predicted" && !rankedFor.has(event.disruption_id)
    && areas.some((a) => a.suggested_rank !== null && a.suggested_rank !== undefined && !a.top_source);
  if (needsChains) {
    rankedFor.add(event.disruption_id);
    // Spec 04: run the batch once after confirmation so affected-areas can return top_source.
    try {
      await postRankChainBatch(event.disruption_id, undefined, signal);
      areas = await getAffectedAreas(asOf, { disruptionId: event.disruption_id, signal });
    } catch {
      // The list still works without first-stop hints.
    }
  }
  const shown = areas.filter((a) => a.signal_level >= 2 && a.suggested_rank);
  const facilities = await fetchFacilities(shown.map((a) => a.barangay_id)).catch(() => new Map<string, string[]>());
  const groups = shown
    .map((a) => toGroup(a, facilities.get(a.barangay_id)))
    .sort((a, b) => a.suggested_rank - b.suggested_rank);
  return { event, groups, points: POINTS };
}

export function useAllocationData() {
  const { asOf, asOfKey } = useAsOf();
  return useResource((signal) => loadAllocation(asOf, signal), [asOfKey]);
}

export function useOpenEvent() {
  const { asOf, asOfKey } = useAsOf();
  return useResource((signal) => loadOpenEvent(asOf, signal), [asOfKey]);
}
