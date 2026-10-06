// MOCK: sample data for every screen, matching design/Wireframes.pdf.
// Real sources, once they exist:
//   status + signal level ........ Dev A's Supabase (specs 00, 02)
//   cause, time window, next update  spec 06 NotificationPayload
//   backup sources ............... Dev A's seed (data/seedSources.ts), ranked like spec 04; RankedChain later
//   captain round, thank-yous .... no spec yet (flagged)
//   operator readings ............ spec 01 seed data
// Names, counts and readings are sample data, as the wireframes say.
import type { BarangayStatusView } from "../contracts/spec05";
import type { RankedSource } from "../contracts/spec04";
import { rankSeedSources, toBackupSource } from "../lib/backupSource";
import { fromNow, todayAt } from "../lib/time";
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
  delivered: number;
  to_working: number;
  checks_today: number;
  thanks: { quote: string; who: string; at: string }[];
  more_thanks: number;
  sources: CaptainSource[];
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
function sourcesFor(barangayId: string, cause: Cause | null): BackupSource[] {
  const rows = SEED_SOURCES.filter((src) => src.barangay_id === barangayId);
  return rankSeedSources(rows, cause).map(toBackupSource);
}

const STORAGE: StoragePlan = { people: 4, per_person_l: 15, container_l: 20, containers: 3 };

function captainFor(barangay: string): CaptainDay {
  return {
    name: "Liza",
    households_reached: 212,
    delivered: 212,
    to_working: 38,
    checks_today: 4,
    thanks: [
      { quote: "“The faucet tip saved us a long walk. Thank you.”", who: "A household near the chapel", at: todayAt(7, 58) },
      { quote: "“Thanks for checking the well so early.”", who: "A household on the riverside", at: todayAt(7, 51) },
    ],
    more_thanks: 5,
    sources: [
      { id: "cs-1", name: `Public faucet, ${barangay} plaza`, letter: "A", safety: "safe", checked_at: todayAt(7, 40), status: "flowing" },
      { id: "cs-2", name: `Deep well, ${barangay} hall`, letter: "C", safety: "boil", checked_at: null, status: null },
      { id: "cs-3", name: "Rainwater tank, daycare", letter: "E", safety: "washing", checked_at: null, status: null },
    ],
  };
}

// MOCK: the open event every affected barangay shares (TP-2026-031 in the wireframes).
export const EVENT_DISRUPTION_ID = "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01";

const NO_DISRUPTION: DisruptionDetail = {
  disruption_id: null, restored_at: null,
  cause: null, started_at: null, window_start: null, window_end: null, likely_at: null,
  heads_up_from: null, updated_at: todayAt(8), next_update_at: todayAt(10),
};

const TURBIDITY_OUTAGE: DisruptionDetail = {
  disruption_id: EVENT_DISRUPTION_ID, restored_at: null,
  // MOCK: window is relative to the phone's clock so "now" always sits before it during a demo.
  cause: "turbidity", started_at: fromNow(-3.5), updated_at: fromNow(-0.5),
  window_start: fromNow(8), window_end: fromNow(11), likely_at: fromNow(9.5),
  next_update_at: fromNow(2), heads_up_from: null,
};

const HEADS_UP: DisruptionDetail = {
  ...NO_DISRUPTION, disruption_id: EVENT_DISRUPTION_ID, cause: "turbidity", heads_up_from: todayAt(2, 0, 1),
};

const LOW_RIVER: DisruptionDetail = {
  disruption_id: "7a2d9c10-4e5f-4b6a-9c8d-1e2f3a4b5c02", restored_at: null,
  cause: "drought", started_at: fromNow(-2.5), updated_at: fromNow(-0.5), // MOCK: relative to now, see above
  window_start: fromNow(9), window_end: fromNow(12), likely_at: fromNow(10),
  next_update_at: fromNow(2), heads_up_from: null,
};

// The predictor is system-wide (spec 02, scope: "system"): every intake feeds Kulador and the
// network is blended (WSP pp.12, 15), so one signal level reaches all 26 barangays (spec 03).
// Change DEMO_SYSTEM to demo another state; every barangay follows it.
type SystemScenario = "turbidity_outage" | "heads_up" | "low_river" | "normal";
const DEMO_SYSTEM: SystemScenario = "turbidity_outage";

const SYSTEM: Record<SystemScenario, { signal_level: number; detail: DisruptionDetail }> = {
  turbidity_outage: { signal_level: 4, detail: TURBIDITY_OUTAGE },
  heads_up: { signal_level: 2, detail: HEADS_UP },
  low_river: { signal_level: 3, detail: LOW_RIVER },
  normal: { signal_level: 0, detail: NO_DISRUPTION },
};

// Per-barangay differences come only after allocation: a barangay whose residents confirmed
// water is back (spec 06) shows the resolved state. Payao demos "Water's back" (wireframe p.6).
const RESOLVED: Record<string, DisruptionDetail> = {
  payao: { ...TURBIDITY_OUTAGE, updated_at: todayAt(17, 5), restored_at: todayAt(17, 5) },
};

/** MOCK: stands in for Dev A's status endpoint. */
export function mockSnapshot(barangayId: string): BarangaySnapshot | null {
  const barangay = BARANGAYS.find((b) => b.barangay_id === barangayId);
  if (!barangay) return null;
  const system = SYSTEM[DEMO_SYSTEM];
  const resolved = DEMO_SYSTEM === "turbidity_outage" ? RESOLVED[barangayId] : undefined;
  return {
    status: {
      barangay_id: barangayId,
      signal_level: resolved ? 0 : system.signal_level,
      last_synced_at: new Date().toISOString(),
    },
    detail: resolved ?? system.detail,
    sources: sourcesFor(barangayId, (resolved ?? system.detail).cause),
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
export const OPERATOR = {
  shift_name: "R. Abella",
  shift_hours: "5 AM–1 PM",
  event_id: "TP-2026-031",
  last_logged_at: todayAt(7),
  latest: {
    kulador: { turbidity_ntu: 620, plant_status: "degraded", treated_ntu: 3.8, clarifier_inflow_lps: 31, reservoir_pct: 58 },
    masacpasac: { turbidity_ntu: 14, plant_status: "normal", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
    caramayon_1: { turbidity_ntu: 540, plant_status: "shutdown", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
    caramayon_2: { turbidity_ntu: 38, plant_status: "normal", treated_ntu: null, clarifier_inflow_lps: null, reservoir_pct: null },
  } satisfies Record<IntakeId, IntakeReading>,
  over_since: todayAt(2, 40),
  reservoir_falling_per_hour: 4,
  rain_updated_at: todayAt(8),
  rain_since: todayAt(22, 0, -1),
  rain_total_mm: 39,
  dry_spell_days: 0,
  // Hourly raw turbidity per intake, 8 AM yesterday → 8 AM today (25 points).
  turbidity_series: {
    kulador: [18, 17, 19, 18, 20, 19, 18, 17, 19, 20, 22, 21, 24, 30, 45, 95, 180, 330, 470, 590, 640, 655, 650, 635, 620],
    masacpasac: [4, 4, 5, 4, 4, 5, 4, 4, 5, 5, 6, 6, 7, 8, 10, 12, 14, 15, 16, 16, 15, 15, 14, 14, 14],
    caramayon_1: [12, 11, 12, 13, 12, 12, 11, 12, 13, 14, 15, 16, 20, 28, 60, 140, 260, 410, 520, 560, 575, 570, 560, 550, 540],
    caramayon_2: [6, 6, 7, 6, 6, 7, 6, 6, 7, 8, 9, 10, 12, 15, 20, 26, 32, 36, 40, 42, 41, 40, 39, 38, 38],
  } satisfies Record<IntakeId, number[]>,
  // Hourly rainfall in mm over the same 24 hours.
  rain_series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 12, 10, 8, 4, 1, 0, 0, 0, 0],
  series_end: todayAt(8),
  detector: {
    matched: 3,
    total: 3,
    confirmed_at: todayAt(5, 48),
    rain_mm: 39,
    rain_hours: 6,
    clarifier_from: 46.3,
    clarifier_to: 31,
    low_source: { n: 0, total: 3 },
    repair: { n: 0, total: 2 },
    window_start: todayAt(16),
    window_end: todayAt(19),
    likely_at: todayAt(17, 30),
    next_update_at: todayAt(10),
    remind_at: todayAt(9, 45),
  },
  early_warnings: [
    { date: "14 Aug", cause: "turbidity" as const, notice: "2 h 05 m" },
    { date: "2 Jul", cause: "repair" as const, notice: "1 day" },
    { date: "20 May", cause: "low_source" as const, notice: "3 days" },
  ],
};
