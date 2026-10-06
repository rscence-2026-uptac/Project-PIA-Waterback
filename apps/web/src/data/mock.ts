// MOCK: sample data for every screen, matching design/Wireframes.pdf.
// Real sources, once they exist:
//   status + signal level ........ Dev A's Supabase (specs 00, 02)
//   cause, time window, next update  spec 06 NotificationPayload
//   backup sources ............... Dev A's seed (data/seedSources.ts), ranked like spec 04; RankedChain later
//   captain round, thank-yous .... no spec yet (flagged)
//   operator readings ............ spec 01 seed data
// Names, counts and readings are sample data, as the wireframes say.
import type { BarangayStatusView } from "../contracts/spec05";
import type { PredictorOutput } from "../contracts/predictor";
import type { ResidentStateName } from "../contracts/spec03";
import type { RankedSource } from "../contracts/spec04";
import { rankSeedSources, toBackupSource } from "../lib/backupSource";
import { fromNow } from "../lib/time";
import { CATBALOGAN_BARANGAYS } from "./barangays";
import { SEED_SOURCES } from "./seedSources";

export type Cause = "turbidity" | "drought" | "repair";
export type Safety = "safe" | "boil" | "washing";
export type LiveStatus =
  | { kind: "flowing" }
  | { kind: "open_stock" }
  | { kind: "queue"; people: number }
  | { kind: "scheduled"; at: string }
  | { kind: "long_queue" }
  | { kind: "dry" };

export interface Barangay {
  barangay_id: string;
  name: string; // short, for screens: "Poblacion 5", "Canlapwas"
  official: string; // PSGC: "Poblacion 5 (Barangay 5)", "Canlapwas (Poblacion)"
  served: boolean; // one of the 26 CWD serves (WSP p.8)
}

export interface DisruptionDetail {
  disruption_id: string | null;
  cause: Cause | null;
  started_at: string | null;
  updated_at: string;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
  next_update_at: string;
  heads_up_from: string | null;
  restored_at: string | null; // set once residents confirm water is back (spec 06)
}

export interface BackupSource extends RankedSource {
  letter: string;
  walk_minutes: number;
  safety: Safety;
  // Live status and who reported it come from captains and partners (no feed yet); absent = not shown.
  live?: LiveStatus;
  reported_by?: string;
  reported_at?: string;
  price_litres: number | null;
  bring_containers: boolean;
  note: string | null;
  lat: number | null; // null = no fixed location (simulated truck stop, neighbour supply)
  lng: number | null;
}

export interface CaptainSource {
  id: string;
  name: string;
  letter: string;
  safety: Safety;
  checked_at: string | null;
  status: "flowing" | "long_queue" | "dry" | null;
}

export interface CaptainDay {
  name: string;
  households_reached: number;
  delivered: number | null; // live: outbound SMS logged for this barangay (sms_outbox); null = log unavailable
  to_working: number;
  checks_today: number;
  thanks: { quote: string; who: string; at: string }[];
  more_thanks: number;
  sources: CaptainSource[];
  /** True when built from the backend: only `sources` (ranked chain / sources table) and `delivered` (sms_outbox) are real. */
  live?: boolean;
}

export interface StoragePlan {
  people: number;
  per_person_l: number;
  container_l: number;
  containers: number;
}

export interface BarangaySnapshot {
  status: Omit<BarangayStatusView, "is_stale">;
  detail: DisruptionDetail;
  sources: BackupSource[];
  storage: StoragePlan;
  captain: CaptainDay;
  // Live-mode extras (absent on the sample snapshot). The resident-state mockup and the operator "why" panel read these.
  live?: boolean; // built from the Edge Functions, not from sample data
  resident_state?: ResidentStateName; // from affected-areas / dashboard-snapshot
  heads_up_urgency?: "possible" | "likely" | "very_likely";
  interruption_observed?: boolean; // disruption confirmed/deployed/notified: water has actually stopped
  prediction?: PredictorOutput | null; // spec 02 output at as_of, incl. drivers and operator_actions
  status_label?: "predicted" | "confirmed" | "deployed" | "notified" | "resolved" | null; // this barangay's lifecycle card status
  as_of?: string; // the demo clock instant this snapshot was read at
  vulnerable_households?: number; // captain heads-up card; no live endpoint returns it yet
}

// Every Catbalogan barangay (data/barangays.ts, official PSGC names). `name` is the short form
// used on screens ("Poblacion 5", "Canlapwas"); `official` is the full PSGC name for the picker.
export const BARANGAYS: Barangay[] = CATBALOGAN_BARANGAYS.map((brgy) => ({
  barangay_id: brgy.barangay_id,
  name: brgy.name.replace(/\s*\(.*\)$/, ""),
  official: brgy.name,
  served: brgy.served,
}));

/** Dev A's seed sources for the barangay, ranked as spec 04 would for this cause. */
export function sourcesFor(barangayId: string, cause: Cause | null): BackupSource[] {
  const rows = SEED_SOURCES.filter((src) => src.barangay_id === barangayId);
  return rankSeedSources(rows, cause).map(toBackupSource);
}

// MOCK: no household storage data yet.
const STORAGE: StoragePlan = { people: 4, per_person_l: 15, container_l: 20, containers: 3 };

function captainFor(barangay: string): CaptainDay {
  return {
    name: "Liza",
    households_reached: 212,
    delivered: 212,
    to_working: 38,
    checks_today: 4,
    thanks: [
      { quote: "“The faucet tip saved us a long walk. Thank you.”", who: "A household near the chapel", at: fromNow(-1) },
      { quote: "“Thanks for checking the well so early.”", who: "A household on the riverside", at: fromNow(-1.5) },
    ],
    more_thanks: 5,
    sources: [
      { id: "cs-1", name: `Public faucet, ${barangay} plaza`, letter: "A", safety: "safe", checked_at: fromNow(-2.5), status: "flowing" },
      { id: "cs-2", name: `Deep well, ${barangay} hall`, letter: "C", safety: "boil", checked_at: null, status: null },
      { id: "cs-3", name: "Rainwater tank, daycare", letter: "E", safety: "washing", checked_at: null, status: null },
    ],
  };
}

// MOCK: the open event every affected barangay shares (PIA-2026-031 in the wireframes).
export const EVENT_DISRUPTION_ID = "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01";

// MOCK: every time below is computed when called (never at module load), relative to the phone's clock,
// so a tab left open past midnight isn't stale and "now" always sits before the restore window during a demo.
function noDisruption(): DisruptionDetail {
  return {
    disruption_id: null, restored_at: null,
    cause: null, started_at: null, window_start: null, window_end: null, likely_at: null,
    heads_up_from: null, updated_at: fromNow(-0.5), next_update_at: fromNow(2),
  };
}

/** The sample turbidity outage. The resident screens and the LGU / operator mocks all read this one. */
export function turbidityOutage(): DisruptionDetail {
  return {
    disruption_id: EVENT_DISRUPTION_ID, restored_at: null,
    cause: "turbidity", started_at: fromNow(-3.5), updated_at: fromNow(-0.5),
    window_start: fromNow(8), window_end: fromNow(11), likely_at: fromNow(9.5),
    next_update_at: fromNow(2), heads_up_from: null,
  };
}

function headsUp(): DisruptionDetail {
  return { ...noDisruption(), disruption_id: EVENT_DISRUPTION_ID, cause: "turbidity", heads_up_from: fromNow(2) };
}

function lowRiver(): DisruptionDetail {
  return {
    disruption_id: "7a2d9c10-4e5f-4b6a-9c8d-1e2f3a4b5c02", restored_at: null,
    cause: "drought", started_at: fromNow(-2.5), updated_at: fromNow(-0.5),
    window_start: fromNow(9), window_end: fromNow(12), likely_at: fromNow(10),
    next_update_at: fromNow(2), heads_up_from: null,
  };
}

// The predictor is system-wide (spec 02, scope: "system"): every intake feeds Kulador and the
// network is blended (WSP pp.12, 15), so one signal level reaches all 26 barangays (spec 03).
// Change DEMO_SYSTEM to demo another state; every barangay follows it.
type SystemScenario = "turbidity_outage" | "heads_up" | "low_river" | "normal";
const DEMO_SYSTEM: SystemScenario = "turbidity_outage";

function systemFor(scenario: SystemScenario): { signal_level: number; detail: DisruptionDetail } {
  switch (scenario) {
    case "turbidity_outage": return { signal_level: 4, detail: turbidityOutage() };
    case "heads_up": return { signal_level: 2, detail: headsUp() };
    case "low_river": return { signal_level: 3, detail: lowRiver() };
    case "normal": return { signal_level: 0, detail: noDisruption() };
  }
}

// Per-barangay differences come only after allocation: a barangay whose residents confirmed
// water is back (spec 06) shows the resolved state. Payao demos "Water's back" (wireframe p.6).
function resolvedFor(barangayId: string): DisruptionDetail | undefined {
  if (barangayId !== "payao") return undefined;
  const restoredAt = fromNow(-0.5);
  return { ...turbidityOutage(), updated_at: restoredAt, restored_at: restoredAt };
}

/** The "no disruption" detail, for the live mapper when the server has no open disruption. */
export const noDisruptionDetail = noDisruption;

/** Seed-based sources, storage plan and captain round: still sample data in live mode (no backend for them yet). */
export function mockExtras(barangayId: string, cause: Cause | null): Pick<BarangaySnapshot, "sources" | "storage" | "captain"> | null {
  const barangay = BARANGAYS.find((b) => b.barangay_id === barangayId);
  if (!barangay) return null;
  return { sources: sourcesFor(barangayId, cause), storage: STORAGE, captain: captainFor(barangay.name) };
}

/** MOCK: stands in for Dev A's status endpoint (used only when the backend isn't configured). */
export function mockSnapshot(barangayId: string): BarangaySnapshot | null {
  const barangay = BARANGAYS.find((b) => b.barangay_id === barangayId);
  if (!barangay) return null;
  const system = systemFor(DEMO_SYSTEM);
  const resolved = DEMO_SYSTEM === "turbidity_outage" ? resolvedFor(barangayId) : undefined;
  const detail = resolved ?? system.detail;
  return {
    status: {
      barangay_id: barangayId,
      signal_level: resolved ? 0 : system.signal_level,
      last_synced_at: new Date().toISOString(),
    },
    detail,
    // The sample scenario is an observed outage at signal 3-4 (the server rule, specs/03).
    interruption_observed: !resolved && system.signal_level >= 3,
    sources: sourcesFor(barangayId, detail.cause),
    storage: STORAGE,
    captain: captainFor(barangay.name),
  };
}

// The four intakes an operator logs (spec 05 OperatorReadingForm.intake_id; supabase/seed/intakes.sql,
// CWD 2022 WSP pp.11-12, 15). Reservoir, clarifier and treated turbidity exist only at Kulador.
export type IntakeId = "kulador" | "masacpasac" | "caramayon_1" | "caramayon_2";
export const INTAKES: { intake_id: IntakeId; name: string; plant: boolean }[] = [
  { intake_id: "kulador", name: "Kulador (Antiao River)", plant: true },
  { intake_id: "masacpasac", name: "Masacpasac", plant: false },
  { intake_id: "caramayon_1", name: "Caramayon I", plant: false },
  { intake_id: "caramayon_2", name: "Caramayon II", plant: false },
];

export interface IntakeReading {
  turbidity_ntu: number;
  plant_status: "normal" | "degraded" | "shutdown";
  treated_ntu: number | null;
  clarifier_inflow_lps: number | null;
  reservoir_pct: number | null;
}

// MOCK: operator dashboard (spec 01 seed data + spec 02 detector output, once built).
// Every time here is relative to the same sample outage the resident and LGU mocks use (turbidityOutage()),
// so the three roles tell one story. Evaluated at module load, which is fine for a staff screen opened fresh.
const OUTAGE = turbidityOutage();
export const OPERATOR = {
  shift_name: "R. Abella",
  shift_hours: "5 AM–1 PM",
  event_id: "PIA-2026-031",
  last_logged_at: fromNow(-1),
  latest: {
    kulador: { turbidity_ntu: 620, plant_status: "degraded", treated_ntu: 3.8, clarifier_inflow_lps: 31, reservoir_pct: 58 },
    masacpasac: { turbidity_ntu: 14, plant_status: "normal", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
    caramayon_1: { turbidity_ntu: 540, plant_status: "shutdown", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
    caramayon_2: { turbidity_ntu: 38, plant_status: "normal", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
  } satisfies Record<IntakeId, IntakeReading>,
  over_since: fromNow(-5.5), // the raw reading crossed the limit before the operator confirmed
  reservoir_falling_per_hour: 4,
  rain_updated_at: fromNow(-0.5),
  rain_since: fromNow(-10),
  rain_total_mm: 39,
  dry_spell_days: 0,
  // Hourly raw turbidity per intake, the 24 hours up to now (25 points).
  turbidity_series: {
    kulador: [18, 17, 19, 18, 20, 19, 18, 17, 19, 20, 22, 21, 24, 30, 45, 95, 180, 330, 470, 590, 640, 655, 650, 635, 620],
    masacpasac: [4, 4, 5, 4, 4, 5, 4, 4, 5, 5, 6, 6, 7, 8, 10, 12, 14, 15, 16, 16, 15, 15, 14, 14, 14],
    caramayon_1: [12, 11, 12, 13, 12, 12, 11, 12, 13, 14, 15, 16, 20, 28, 60, 140, 260, 410, 520, 560, 575, 570, 560, 550, 540],
    caramayon_2: [6, 6, 7, 6, 6, 7, 6, 6, 7, 8, 9, 10, 12, 15, 20, 26, 32, 36, 40, 42, 41, 40, 39, 38, 38],
  } satisfies Record<IntakeId, number[]>,
  // Hourly rainfall in mm over the same 24 hours.
  rain_series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 12, 10, 8, 4, 1, 0, 0, 0, 0],
  series_end: fromNow(0),
  detector: {
    matched: 3,
    total: 3,
    confirmed_at: OUTAGE.started_at!,
    rain_mm: 39,
    rain_hours: 6,
    clarifier_from: 46.3,
    clarifier_to: 31,
    low_source: { n: 0, total: 3 },
    repair: { n: 0, total: 2 },
    window_start: OUTAGE.window_start!,
    window_end: OUTAGE.window_end!,
    likely_at: OUTAGE.likely_at!,
    next_update_at: OUTAGE.next_update_at,
    remind_at: fromNow(1.75),
  },
};
