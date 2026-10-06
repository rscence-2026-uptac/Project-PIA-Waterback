import { z } from "zod";

// specs/00-data-model.md
export const Reading = z.object({
  id: z.uuid(),
  recorded_at: z.iso.datetime({ offset: true }),
  intake_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),       // CWD 2022 WSP: >= 500 NTU temporary shut-off
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(), // % of 340 m³ usable capacity, WSP
  clarifier_inflow_lps: z.number().nonnegative().nullable(), // rated capacity 46.3 L/s (4,000 CMD), WSP
  source: z.enum(["operator", "sensor"]),
  treated_turbidity_ntu: z.number().nonnegative().nullable().default(null), // Kulador only; compared against TURBIDITY_LIMIT_NTU (WSP pp.43-44)
  client_local_id: z.string().nullable().default(null), // offline-queue idempotency key (Dev B local_id); unique when set
  is_simulated: z.boolean().default(false), // true = seeded/simulated, never real CWD telemetry (spec 01)
});
export type Reading = z.infer<typeof Reading>;

export const INTAKE_IDS = ["kulador", "masacpasac", "caramayon_1", "caramayon_2"] as const;

// CWD 2022 WSP: the four water intakes (docs/wsp_findings.md)
export const Intake = z.object({
  intake_id: z.string(),
  name: z.string(),
  type: z.enum(["surface", "spring", "deep_well"]),
  rated_capacity_lps: z.number().nonnegative().nullable(),
  treated_at_kulador: z.boolean(),
  power_dependent: z.boolean(),
  wsp_page: z.string(),
});
export type Intake = z.infer<typeof Intake>;

export const Disruption = z.object({
  id: z.uuid(),
  started_at: z.iso.datetime({ offset: true }),
  resolved_at: z.iso.datetime({ offset: true }).nullable(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  p_turbidity: z.number().min(0).max(1).nullable(), // null for operator-logged repair work
  p_drought: z.number().min(0).max(1).nullable(),
  signal_level: z.number().int().min(0).max(4),
  status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
  // status-screen timing (Dev B handoff item 3); all nullable. Per-barangay "restored at" is NOT a column:
  // it is the resident_confirmed event with payload_json.restored = true (spec 00).
  window_start: z.iso.datetime({ offset: true }).nullable().default(null),
  window_end: z.iso.datetime({ offset: true }).nullable().default(null),
  likely_at: z.iso.datetime({ offset: true }).nullable().default(null),
  next_update_at: z.iso.datetime({ offset: true }).nullable().default(null),
  heads_up_from: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type Disruption = z.infer<typeof Disruption>;

export const Source = z.object({
  id: z.uuid(),
  barangay_id: z.string(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),  // scored against WHO/UNICEF JMP 30-min benchmark
  cost_php_per_unit: z.number().nonnegative(),
  active: z.boolean(),
  provenance: z.enum(["wsp", "osm", "web", "placeholder"]).default("placeholder"), // where the row came from
  source_ref: z.string().nullable().default(null),   // citation (URL or WSP page); required for non-placeholder rows
  is_simulated: z.boolean().default(false),          // true = simulated placeholder, never a real facility
  lat: z.number().min(-90).max(90).nullable().default(null),    // source location when known
  lng: z.number().min(-180).max(180).nullable().default(null),
  network_dependent: z.boolean().default(false),   // fed from the blended CWD network: dry in a system-wide failure (rank-chain excludes it for turbidity/drought)
});
export type Source = z.infer<typeof Source>;

export const ContinuityChain = z.object({
  id: z.uuid(),
  barangay_id: z.string(),
  disruption_id: z.uuid(),
  ranked_source_ids: z.array(z.uuid()), // ordered safety desc, time asc, cost asc
  computed_at: z.iso.datetime({ offset: true }),
});
export type ContinuityChain = z.infer<typeof ContinuityChain>;

export const Allocation = z.object({
  id: z.uuid(),
  disruption_id: z.uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  decided_at: z.iso.datetime({ offset: true }),
  note: z.string().optional(),
});
export type Allocation = z.infer<typeof Allocation>;

export const EventLog = z.object({
  id: z.uuid(),
  disruption_id: z.uuid(),
  event_type: z.enum([
    "predicted",          // Predict risk
    "confirmed",          // Risk high? = yes
    "deployed",           // LGU sets priority -> Deploy response
    "notified",           // Notify residents
    "resident_confirmed", // Resident feedback / confirms receipt
    "resolved",           // Restored? = yes -> Log the event
  ]),
  barangay_id: z.string().nullable().default(null), // null = system-wide event (predicted/confirmed); dashboard fans it out to served barangays
  client_local_id: z.string().nullable().default(null), // idempotency key for resident confirmations from the offline queue
  actor: z.string(), // user id or 'system'
  occurred_at: z.iso.datetime({ offset: true }),
  payload_json: z.record(z.string(), z.unknown()).optional(),
});
export type EventLog = z.infer<typeof EventLog>;

// Added to spec 00 (reference tables). Canonical Barangay: the unit of computation/ranking/allocation (LGU -> Barangay -> Resident).
export const Barangay = z.object({
  barangay_id: z.string(),
  name: z.string(), // official PSA PSGC name
  wsp_name: z.string().nullable().default(null), // CWD WSP spelling where it differs (search alias)
  zone: z.number().int().min(1).max(10).nullable(),
  service_level: z.enum(["level_iii", "level_i", "unserved"]).default("level_iii"),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  piped_households: z.number().int().nonnegative().nullable(),
  unpiped_households: z.number().int().nonnegative().nullable(), // estimate — see spec 03
  coverage_source: z.enum(["cwd_service_map", "estimate", "unknown"]),
  critical_facilities: z.array(z.enum(["health_station", "school", "evacuation_center"])).default([]),
});
export type Barangay = z.infer<typeof Barangay>;

// Residents are PII: service_role-only in the DB, never readable with the anon key.
export const Resident = z.object({
  id: z.uuid(),
  barangay_id: z.string(),
  display_name: z.string().nullable(),
  phone: z.string().regex(/^\+639\d{9}$/).nullable(),
  preferred_language: z.enum(["waray", "filipino", "english"]).default("waray"),
  channel: z.enum(["pwa", "sms"]),
  is_vulnerable: z.boolean().default(false),
  created_at: z.iso.datetime({ offset: true }),
});
export type Resident = z.infer<typeof Resident>;

export const WspConstant = z.object({
  key: z.string(),
  value: z.number(),
  unit: z.string(),
  source: z.string(),
});
export type WspConstant = z.infer<typeof WspConstant>;

export const RainfallDaily = z.object({
  date: z.iso.date(),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo"),
  fetched_at: z.iso.datetime({ offset: true }).optional(),
});
export type RainfallDaily = z.infer<typeof RainfallDaily>;

export const RainfallHourly = z.object({
  ts: z.iso.datetime({ offset: true }),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo"),
});
export type RainfallHourly = z.infer<typeof RainfallHourly>;

export const RainForecastHourly = z.object({ // forecast_rain_48h_mm feature (spec 02 v2); seed/rain_forecast_hourly.sql
  ts: z.iso.datetime({ offset: true }),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo-historical-forecast"),
  fetched_at: z.iso.datetime({ offset: true }).optional(),
});
export type RainForecastHourly = z.infer<typeof RainForecastHourly>;

// Simulated-handset log (migration 20261006000009). World-readable with the anon key, so the number is ALWAYS masked
// (first 6 chars + last 4 digits, e.g. "+63900•••0001"); never the full phone. Writes: service_role only.
export const SmsOutbox = z.object({
  id: z.uuid(),
  disruption_id: z.uuid().nullable(),
  barangay_id: z.string().nullable(),
  resident_id: z.uuid().nullable(),
  to_masked: z.string().regex(/^\+63\d{3}•{3}\d{4}$/), // recipient (outbound) or sender (inbound)
  template: z.string().nullable(),   // SmsKey, e.g. "sms.water_off"; null for inbound
  language: z.enum(["waray", "filipino", "english"]).nullable(),
  body: z.string().min(1),
  direction: z.enum(["outbound", "inbound"]),
  mode: z.enum(["dry_run", "live"]),
  created_at: z.iso.datetime({ offset: true }),
});
export type SmsOutbox = z.infer<typeof SmsOutbox>;
