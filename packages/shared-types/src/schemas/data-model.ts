import { z } from "zod";

// specs/00-data-model.md
export const Reading = z.object({
  id: z.string().uuid(),
  recorded_at: z.string().datetime(),
  intake_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),       // CWD 2022 WSP: >= 500 NTU temporary shut-off
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(), // % of 340 m³ usable capacity, WSP
  clarifier_inflow_lps: z.number().nonnegative().nullable(), // rated capacity 46.3 L/s (4,000 CMD), WSP
  source: z.enum(["operator", "sensor"]),
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
  id: z.string().uuid(),
  started_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  p_turbidity: z.number().min(0).max(1).nullable(), // null for operator-logged repair work
  p_drought: z.number().min(0).max(1).nullable(),
  signal_level: z.number().int().min(0).max(4),
  status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
});
export type Disruption = z.infer<typeof Disruption>;

export const Source = z.object({
  id: z.string().uuid(),
  barangay_id: z.string(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_barangay"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),  // scored against WHO/UNICEF JMP 30-min benchmark
  cost_php_per_unit: z.number().nonnegative(),
  active: z.boolean(),
});
export type Source = z.infer<typeof Source>;

export const ContinuityChain = z.object({
  id: z.string().uuid(),
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
  ranked_source_ids: z.array(z.string().uuid()), // ordered safety desc, time asc, cost asc
  computed_at: z.string().datetime(),
});
export type ContinuityChain = z.infer<typeof ContinuityChain>;

export const Allocation = z.object({
  id: z.string().uuid(),
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  decided_at: z.string().datetime(),
  note: z.string().optional(),
});
export type Allocation = z.infer<typeof Allocation>;

export const EventLog = z.object({
  id: z.string().uuid(),
  disruption_id: z.string().uuid(),
  event_type: z.enum([
    "predicted",          // Predict risk
    "confirmed",          // Risk high? = yes
    "deployed",           // LGU sets priority -> Deploy response
    "notified",           // Notify residents
    "resident_confirmed", // Resident feedback / confirms receipt
    "resolved",           // Restored? = yes -> Log the event
  ]),
  actor: z.string(), // user id or 'system'
  occurred_at: z.string().datetime(),
  payload_json: z.record(z.unknown()).optional(),
});
export type EventLog = z.infer<typeof EventLog>;

// Added to spec 00 (reference tables). Canonical Barangay: the unit of computation/ranking/allocation (LGU -> Barangay -> Resident).
export const Barangay = z.object({
  barangay_id: z.string(),
  name: z.string(),
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
  id: z.string().uuid(),
  barangay_id: z.string(),
  display_name: z.string().nullable(),
  phone: z.string().regex(/^\+639\d{9}$/).nullable(),
  preferred_language: z.enum(["waray", "filipino", "english"]).default("waray"),
  channel: z.enum(["pwa", "sms"]),
  is_vulnerable: z.boolean().default(false),
  created_at: z.string().datetime(),
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
  date: z.string().date(),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo"),
  fetched_at: z.string().datetime().optional(),
});
export type RainfallDaily = z.infer<typeof RainfallDaily>;
