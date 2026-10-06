// MOCK: sample data for every screen, matching design/Wireframes.pdf.
// Real sources, once they exist:
//   status + signal level ........ Dev A's Supabase (specs 00, 02)
//   cause, time window, next update  spec 06 NotificationPayload
//   backup sources ............... spec 04 RankedChain
//   captain round, thank-yous .... no spec yet (flagged)
//   operator readings ............ spec 01 seed data
// Names, counts and readings are sample data, as the wireframes say.
import type { BarangayStatusView } from "../contracts/spec05";
import type { RankedSource } from "../contracts/spec04";
import { WSP_CONSTANTS } from "../contracts/wsp";
import { todayAt } from "../lib/time";

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
  name: string; // "Canlapwas"
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
  live: LiveStatus;
  reported_by: string;
  reported_at: string;
  price_litres: number | null;
  bring_containers: boolean;
  note: string | null;
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

// Barangays named in the wireframes (p.11, "Hours without piped water").
export const BARANGAYS: Barangay[] = [
  { barangay_id: "canlapwas", name: "Canlapwas" },
  { barangay_id: "mercedes", name: "Mercedes" },
  { barangay_id: "guinsorongan", name: "Guinsorongan" },
  { barangay_id: "san-andres", name: "San Andres" },
  { barangay_id: "payao", name: "Payao" },
  { barangay_id: "silanga", name: "Silanga" },
];

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;

function source(
  rank: number,
  letter: string,
  fields: Omit<BackupSource, "rank" | "letter" | "exceeds_jmp_benchmark" | "source_id">,
): BackupSource {
  return {
    ...fields,
    rank,
    letter,
    source_id: `00000000-0000-4000-8000-00000000000${rank}`,
    exceeds_jmp_benchmark: fields.travel_minutes > jmp,
  };
}

/** The wireframe's Plan A–D chain, placed in the given barangay. */
function sourcesFor(barangay: string): BackupSource[] {
  return [
    source(1, "A", {
      name: `Public faucet, ${barangay} plaza`, type: "communal_tap", safety_score: 0.95, safety: "safe",
      travel_minutes: 15, walk_minutes: 6, cost_php_per_unit: 0, price_litres: null,
      live: { kind: "flowing" }, reported_by: "Liza", reported_at: todayAt(7, 40),
      bring_containers: false, note: null,
    }),
    source(2, "B", {
      name: "Bayani Refilling Station", type: "refill_station", safety_score: 0.95, safety: "safe",
      travel_minutes: 22, walk_minutes: 9, cost_php_per_unit: 25, price_litres: 20,
      live: { kind: "open_stock" }, reported_by: "Owner", reported_at: todayAt(7, 52),
      bring_containers: false, note: null,
    }),
    source(3, "C", {
      name: `Barangay deep well, ${barangay} hall`, type: "communal_tap", safety_score: 0.6, safety: "boil",
      travel_minutes: 38, walk_minutes: 14, cost_php_per_unit: 0, price_litres: null,
      live: { kind: "queue", people: 10 }, reported_by: "Liza", reported_at: todayAt(7, 40),
      bring_containers: false, note: null,
    }),
    source(4, "D", {
      name: `LGU water truck at ${barangay} chapel`, type: "trucking", safety_score: 0.95, safety: "safe",
      travel_minutes: 6, walk_minutes: 3, cost_php_per_unit: 0, price_litres: null,
      live: { kind: "scheduled", at: todayAt(14) }, reported_by: "LGU", reported_at: todayAt(6, 31),
      bring_containers: true,
      note: "Your barangay is second on the truck route. Households with elderly or bedridden members are served first.",
    }),
  ];
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
  cause: "turbidity", started_at: todayAt(5, 48), updated_at: todayAt(8),
  window_start: todayAt(16), window_end: todayAt(19), likely_at: todayAt(17, 30),
  next_update_at: todayAt(10), heads_up_from: null,
};

// One scenario per barangay, so every water state can be demoed.
const SCENARIOS: Record<string, { signal_level: number; detail: DisruptionDetail }> = {
  canlapwas: { signal_level: 4, detail: TURBIDITY_OUTAGE },
  mercedes: { signal_level: 3, detail: TURBIDITY_OUTAGE },
  guinsorongan: {
    signal_level: 2,
    detail: { ...NO_DISRUPTION, disruption_id: EVENT_DISRUPTION_ID, cause: "turbidity", heads_up_from: todayAt(2, 0, 1) },
  },
  "san-andres": {
    signal_level: 3,
    detail: {
      disruption_id: "7a2d9c10-4e5f-4b6a-9c8d-1e2f3a4b5c02", restored_at: null,
      cause: "drought", started_at: todayAt(6), updated_at: todayAt(8),
      window_start: todayAt(17), window_end: todayAt(20), likely_at: todayAt(18),
      next_update_at: todayAt(10), heads_up_from: null,
    },
  },
  // Water's back (wireframe p.6): restored at 5:05 PM, 25 minutes before the likely time.
  payao: { signal_level: 0, detail: { ...TURBIDITY_OUTAGE, updated_at: todayAt(17, 5), restored_at: todayAt(17, 5) } },
  silanga: { signal_level: 0, detail: NO_DISRUPTION },
};

/** MOCK: stands in for Dev A's status endpoint. */
export function mockSnapshot(barangayId: string): BarangaySnapshot | null {
  const barangay = BARANGAYS.find((b) => b.barangay_id === barangayId);
  const scenario = SCENARIOS[barangayId];
  if (!barangay || !scenario) return null;
  return {
    status: { barangay_id: barangayId, signal_level: scenario.signal_level, last_synced_at: new Date().toISOString() },
    detail: scenario.detail,
    sources: sourcesFor(barangay.name),
    storage: STORAGE,
    captain: captainFor(barangay.name),
  };
}

// MOCK: operator dashboard (spec 01 seed data + spec 02 detector output, once built).
export const OPERATOR = {
  shift_name: "R. Abella",
  shift_hours: "5 AM–1 PM",
  event_id: "TP-2026-031",
  last_logged_at: todayAt(7),
  latest: { turbidity_ntu: 620, treated_ntu: 3.8, clarifier_inflow_lps: 31, reservoir_pct: 58, plant_status: "degraded" as const },
  raw_over_since: todayAt(2, 40),
  reservoir_falling_per_hour: 4,
  rain_updated_at: todayAt(8),
  rain_since: todayAt(22, 0, -1),
  rain_total_mm: 39,
  dry_spell_days: 0,
  // Hourly raw turbidity, 8 AM yesterday → 8 AM today (25 points).
  turbidity_series: [18, 17, 19, 18, 20, 19, 18, 17, 19, 20, 22, 21, 24, 30, 45, 95, 180, 330, 470, 590, 640, 655, 650, 635, 620],
  // Hourly rainfall in mm over the same 24 hours.
  rain_series: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 12, 10, 8, 4, 1, 0, 0, 0, 0],
  series_end: todayAt(8),
  detector: {
    matched: 3,
    total: 3,
    confirmed_at: todayAt(5, 48),
    rain_mm: 39,
    rain_hours: 6,
    clarifier_from: 46,
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

// MOCK: spec 05 wants a barangay_id on every reading, but the wireframe logs plant-wide
// readings at the Antiao intake. Flagged for Dev A; until then readings use this id.
export const PLANT_INTAKE_ID = "antiao-intake";
