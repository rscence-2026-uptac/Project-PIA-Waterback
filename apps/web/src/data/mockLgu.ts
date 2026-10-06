// MOCK: LGU allocation screen (wireframe p.10) and event record (wireframe p.11).
// Real sources, once they exist:
//   affected barangays ........ spec 03 AffectedArea + barangays table (Dev A)
//   suggested order ........... spec 03/04 need + 30-min access ranking (Dev A)
//   officer ................... Supabase Auth LGU seed accounts (Dev A)
//   event record, alloc log ... event_log + allocations tables (spec 00, written by spec 06 functions)
import type { AffectedArea } from "../contracts/spec03";
import { EVENT_DISRUPTION_ID, type Cause } from "./mock";
import { todayAt } from "../lib/time";

export type Facility = "health_station" | "school" | "evacuation_center";

// The wireframe deliberately shows "[Officer name]" until real accounts exist.
export const OFFICER = { id: "mock-officer-1", name: "[Officer name]" };

export const OPEN_EVENT = {
  disruption_id: EVENT_DISRUPTION_ID,
  code: "TP-2026-031",
  cause: "turbidity" as Cause,
  flagged_by: "CWD",
  flagged_at: todayAt(5, 48),
  window_start: todayAt(16),
  window_end: todayAt(19),
  likely_at: todayAt(17, 30),
};

export interface AffectedBarangay extends AffectedArea {
  name: string;
  facilities: Facility[];
  vulnerable_households: number; // bedridden, elderly or PWD on the barangay list
  no_backup_households: number; // off-network with no safe source within 30 min
  suggested_rank: number;
  reported_not_restored: boolean; // a ResidentConfirmation with restored = false came in
}

// The predictor is system-wide (spec 02), so every affected barangay carries the same signal level.
// Zones aren't readable from the WSP map yet (seed has zone = null), so low_pressure_zone is false.
function row(
  suggested_rank: number,
  fields: Omit<AffectedBarangay, "suggested_rank" | "disruption_id" | "signal_level" | "zone" | "service_level" | "low_pressure_zone">
    & Partial<Pick<AffectedBarangay, "service_level">>,
): AffectedBarangay {
  return {
    signal_level: 4, zone: null, service_level: "level_iii", low_pressure_zone: false,
    ...fields, suggested_rank, disruption_id: EVENT_DISRUPTION_ID,
  };
}

// Suggested order: need first (facilities, elderly/PWD), then households with no backup in 30 min.
export const AFFECTED: AffectedBarangay[] = [
  row(1, {
    barangay_id: "canlapwas", name: "Canlapwas", facilities: ["health_station", "school"],
    piped_households_affected: 760, unpiped_households_affected: 60, coverage_confidence: "estimate",
    vulnerable_flag: true, vulnerable_households: 41, no_backup_households: 34, reported_not_restored: false,
  }),
  row(2, {
    barangay_id: "mercedes", name: "Mercedes", facilities: ["health_station"],
    piped_households_affected: 640, unpiped_households_affected: 50, coverage_confidence: "estimate",
    vulnerable_flag: true, vulnerable_households: 37, no_backup_households: 28, reported_not_restored: false,
  }),
  row(3, {
    barangay_id: "san-andres", name: "San Andres", facilities: ["school"],
    piped_households_affected: 580, unpiped_households_affected: 30, coverage_confidence: "estimate",
    vulnerable_flag: true, vulnerable_households: 30, no_backup_households: 20, reported_not_restored: true,
  }),
  row(4, {
    barangay_id: "guinsorongan", name: "Guinsorongan", facilities: ["evacuation_center"],
    piped_households_affected: 520, unpiped_households_affected: 40, coverage_confidence: "estimate",
    vulnerable_flag: true, vulnerable_households: 22, no_backup_households: 14, reported_not_restored: false,
  }),
  // Level I: communal points only, so every household counts as unpiped (spec 03 equity layer).
  row(5, {
    barangay_id: "payao", name: "Payao", facilities: [], service_level: "level_i",
    piped_households_affected: 0, unpiped_households_affected: 390, coverage_confidence: "estimate",
    vulnerable_flag: true, vulnerable_households: 18, no_backup_households: 0, reported_not_restored: false,
  }),
  // No household data: spec 03 says show "coverage unknown", never a guessed number.
  row(6, {
    barangay_id: "maulong", name: "Maulong", facilities: [],
    piped_households_affected: null, unpiped_households_affected: null, coverage_confidence: "unknown",
    vulnerable_flag: false, vulnerable_households: 0, no_backup_households: 0, reported_not_restored: false,
  }),
];

export const ROUTABLE = { trucks: 2, trips_each: 2, truck_litres: 24000, truck_deadline: todayAt(19), partners_open: 4, partners_total: 6 };

// ---------- Event record (closed event, wireframe p.11) ----------

export type TimelineKind =
  | "predicted" | "confirmed" | "deployed_priorities" | "notified" | "deployed_truck" | "resident_confirmed" | "resolved";

export const CLOSED_EVENT = {
  code: "TP-2026-031",
  cause: "turbidity" as Cause,
  started_at: todayAt(5, 48),
  restored_at: todayAt(17, 5),
  likely_at: todayAt(17, 30),
  barangays: 6,
  households: 3410,
  truck_litres_delivered: 22800,
  off_network_tracked: 96,
  notice_minutes: 45,
  previous: { month: "August", notice_minutes: 170 },
  // event_log rows (spec 00 event_type) with what each one says on the timeline.
  timeline: [
    { at: todayAt(2, 40), kind: "predicted", vars: { limit: 500 } },
    { at: todayAt(5, 48), kind: "confirmed", vars: { actor: "R. Abella" } },
    { at: todayAt(6, 31), kind: "deployed_priorities", vars: { actor: OFFICER.name } },
    { at: todayAt(6, 33), kind: "notified", vars: { n: "3,410" } },
    { at: todayAt(9, 0), kind: "deployed_truck", vars: { place: "Canlapwas health station" } },
    { at: todayAt(14, 0), kind: "deployed_truck", vars: { place: "Canlapwas chapel" } },
    { at: todayAt(17, 2), kind: "resident_confirmed", vars: { n: 212 } },
    { at: todayAt(17, 5), kind: "resolved", vars: {} },
  ] as { at: string; kind: TimelineKind; vars: Record<string, string | number> }[],
  // allocations + their audit trail: who was prioritized, when, by whom (spec 06 AC5).
  allocation_log: [
    { at: todayAt(6, 24), kind: "generated", by: null, vars: {} },
    { at: todayAt(6, 31), kind: "confirmed", by: OFFICER.name, vars: { first: "Canlapwas" } },
    { at: todayAt(11, 10), kind: "moved", by: OFFICER.name, vars: { name: "Guinsorongan", from: 4, to: 5, reason: "evacuation center emptied at 11 AM" } },
    { at: todayAt(17, 5), kind: "closed", by: null, vars: {} },
  ] as { at: string; kind: "generated" | "confirmed" | "moved" | "closed"; by: string | null; vars: Record<string, string | number> }[],
  hours_without_water: [
    { name: "Canlapwas", hours: 41 },
    { name: "Mercedes", hours: 33 },
    { name: "Guinsorongan", hours: 28 },
    { name: "San Andres", hours: 22 },
    { name: "Payao", hours: 17 },
    { name: "Maulong", hours: 12 },
  ],
  carry_forward: { mm: 30, places: "Canlapwas and Mercedes" },
};
