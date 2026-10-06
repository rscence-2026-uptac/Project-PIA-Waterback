# Spec: Data model

## What it does
Defines the thirteen core Postgres tables — `intakes`, `barangays`, `residents`, `wsp_constants`, `rainfall_daily`, `rainfall_hourly`, `rain_forecast_hourly`, `readings`, `disruptions`, `sources`, `continuity_chains`, `allocations`, `event_log` — that every other spec reads from or writes to, plus the RLS posture used for the demo. Every other spec's data contract is a view onto these tables, so this one ships first. The hierarchy is LGU → Barangay → Resident: the barangay is the unit everything is computed, ranked and allocated per, and the LGU stays implicit (single LGU, Catbalogan City). `residents` holds PII (phone numbers) and is readable by `service_role` only. Readings are taken at water intakes and the plant, not per barangay (CWD 2022 WSP pp.43–47), so `readings.intake_id` references `intakes`. The network is blended: all intakes feed the single Kulador plant and one distribution network (WSP pp.12, 15), so a Kulador problem hits the whole service area. Deep wells (Tumalistis, Executive, Payao, Lagundi; WSP pp.13–14) are out of scope. PostGIS is not used: barangay centroid lat/lng suffices (spec 03 out-of-scope). Every `barangay_id` column in `sources`, `continuity_chains`, `allocations`, `residents` is a FK to `barangays(barangay_id)`. `allocations.officer_id` is text holding a Supabase Auth user id; LGU seed accounts are created separately, not in this migration (demo: the mock officer id `mock-officer-1`, no auth).

Semantics added by the Dev B handoff (migration `20261006000006_dev_b_handoff.sql`): `event_log.barangay_id` is NULL for a system-wide event (`predicted`, `confirmed`); the dashboard fans it out to every served barangay, and barangay-specific events (`deployed`, `notified`, `resident_confirmed`) set it. Per-barangay "restored at" is not a column: it is the `occurred_at` of the barangay's `resident_confirmed` event whose `payload_json.restored = true`; disruption-level restored is `disruptions.resolved_at`. `restored = false` never writes `resolved`. `readings.client_local_id` and `event_log.client_local_id` are unique idempotency keys for the offline queue (Dev B `local_id`); replays with the same id must not insert twice. `barangays.name` is the official PSA PSGC name and `wsp_name` the CWD WSP spelling where it differs.

## Data contract
```ts
import { z } from "zod";

export const Intake = z.object({
  intake_id: z.string(),                        // 'kulador' | 'masacpasac' | 'caramayon_1' | 'caramayon_2'
  name: z.string(),
  type: z.enum(["surface", "spring", "deep_well"]),
  rated_capacity_lps: z.number().nonnegative().nullable(), // null = not stated in WSP
  treated_at_kulador: z.boolean(),
  power_dependent: z.boolean(),                 // pumped sources fail with the power
  wsp_page: z.string(),                         // e.g. "p.12"
});

export const Barangay = z.object({
  barangay_id: z.string(),
  name: z.string(),                // official PSA PSGC name, e.g. 'Poblacion 5 (Barangay 5)', 'Muñoz (Poblacion 14)'
  wsp_name: z.string().nullable().default(null), // CWD WSP spelling where it differs (alias), e.g. 'Darahuway Dako'
  lat: z.number().nullable(),      // approximate OSM centroid only, no PostGIS; null = unknown
  lng: z.number().nullable(),
  zone: z.number().int().min(1).max(10).nullable(), // WSP p.17 zoning; null = not legible from map
  service_level: z.enum(["level_iii", "level_i", "unserved"]).default("level_iii"), // Level I = communal points (WSP p.19)
  piped_households: z.number().int().nonnegative().nullable(),   // null = unknown (not in WSP)
  unpiped_households: z.number().int().nonnegative().nullable(),
  coverage_source: z.enum(["cwd_service_map", "estimate", "unknown"]),
  critical_facilities: z.array(z.enum(["health_station", "school", "evacuation_center"])).default([]),
});

export const Resident = z.object({
  id: z.string().uuid(),
  barangay_id: z.string(),
  display_name: z.string().nullable(),
  phone: z.string().regex(/^\+639[0-9]{9}$/).nullable(), // PH mobile, E.164; PII
  preferred_language: z.enum(["waray", "filipino", "english"]).default("waray"),
  channel: z.enum(["pwa", "sms"]),
  is_vulnerable: z.boolean().default(false), // elderly/PWD household
  created_at: z.string().datetime(),
});

export const WspConstant = z.object({  // loaded by seed/cwd_wsp_constants.sql; code-side truth stays WSP_CONSTANTS
  key: z.string(),
  value: z.number(),
  unit: z.string(),
  source: z.string(),
});

export const RainfallDaily = z.object({
  date: z.string().date(),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo"),
  fetched_at: z.string().datetime().optional(),
});

export const RainfallHourly = z.object({  // predictor rain_24h/72h/14d/30d features (spec 02); seed/rainfall_hourly.sql
  ts: z.string().datetime({ offset: true }),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo"),
});

export const RainForecastHourly = z.object({  // forecast_rain_48h_mm feature (spec 02 v2); seed/rain_forecast_hourly.sql
  ts: z.string().datetime({ offset: true }),
  precipitation_mm: z.number().nonnegative(),
  source: z.string().default("open-meteo-historical-forecast"),
  fetched_at: z.string().datetime().optional(),
});

export const Reading = z.object({
  id: z.string().uuid(),
  recorded_at: z.string().datetime(),
  intake_id: z.string(),                          // FK intakes; readings are per intake, not per barangay
  turbidity_ntu: z.number().nonnegative(),       // WSP: 5 NTU limit; >= 500 NTU shuts off Caramayon I (p.43)
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100).nullable(),      // % of 340 m³ usable (WSP p.13); only Kulador rows
  clarifier_inflow_lps: z.number().nonnegative().nullable(), // vs 46.3 L/s clarifier (WSP p.16); only Kulador rows
  source: z.enum(["operator", "sensor"]),
  treated_turbidity_ntu: z.number().nonnegative().nullable().default(null), // Kulador only; checked against TURBIDITY_LIMIT_NTU
  client_local_id: z.string().nullable().default(null), // offline-queue idempotency key, unique when set
  is_simulated: z.boolean().default(false), // true = seeded/simulated data, never real CWD telemetry (spec 01)
});

export const Disruption = z.object({
  id: z.string().uuid(),
  started_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  p_turbidity: z.number().min(0).max(1).nullable(), // null for operator-logged repair work
  p_drought: z.number().min(0).max(1).nullable(),
  signal_level: z.number().int().min(0).max(4),
  status: z.enum(["predicted", "confirmed", "deployed", "notified", "resolved"]),
  window_start: z.string().datetime().nullable().default(null),   // "back today between 4-7 PM"
  window_end: z.string().datetime().nullable().default(null),
  likely_at: z.string().datetime().nullable().default(null),      // "most likely 5:30 PM"
  next_update_at: z.string().datetime().nullable().default(null), // "next update by 10:00 AM"
  heads_up_from: z.string().datetime().nullable().default(null),  // "likely to stop from 2 AM" (signal 1-2)
});

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

export const ContinuityChain = z.object({
  id: z.string().uuid(),
  barangay_id: z.string(),
  disruption_id: z.string().uuid(),
  ranked_source_ids: z.array(z.string().uuid()), // ordered safety desc, time asc, cost asc
  computed_at: z.string().datetime(),
});

export const Allocation = z.object({
  id: z.string().uuid(),
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  decided_at: z.string().datetime(),
  note: z.string().optional(),
});

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
  barangay_id: z.string().nullable().default(null), // NULL = system-wide event, fanned out to served barangays
  client_local_id: z.string().nullable().default(null), // idempotency key for offline-queued resident confirmations
  actor: z.string(), // user id or 'system'
  occurred_at: z.string().datetime(),
  payload_json: z.record(z.unknown()).optional(),
});
```

## Acceptance criteria
- [ ] All thirteen tables created via the Supabase migrations `supabase/migrations/20261006000001_init.sql`, `20261006000002_intakes_zones.sql`, `20261006000004_rainfall_hourly.sql`, `20261006000005_rain_forecast_hourly.sql` and `20261006000006_dev_b_handoff.sql` (columns only) (Supabase CLI requires timestamp prefixes), applies cleanly on a fresh project
- [ ] Seeded `intakes` = 4, `barangays` = 57: 26 served + 31 `unserved`; unknown zone, coordinates and household counts are NULL, never guessed
- [ ] Of the 26 served, 4 are `level_i`; `barangays.name` is the official PSGC name and `wsp_name` holds the WSP spelling for renamed rows; ids unchanged
- [ ] `readings.client_local_id` and `event_log.client_local_id` are unique; `event_log.barangay_id` is an FK to `barangays` (NULL allowed); `readings.treated_turbidity_ntu >= 0`
- [ ] Inserting one seed row per table from `01-seed-data.md` succeeds with no constraint errors
- [ ] RLS: read access open to the anon key on every table except `residents` (demo simplicity), writes restricted to the `service_role` used by Edge Functions — documented as a hackathon-scope decision, not a production security posture
- [ ] anon key cannot read `residents` (PII): no anon/authenticated policy, `service_role` only
- [ ] `residents.phone` rejects anything that is not PH mobile E.164 (`+639XXXXXXXXX`)
- [ ] `event_log.event_type` enum matches every step in the process-flow diagram, in order: predicted → confirmed → deployed → notified → resident_confirmed → resolved

## Out of scope
- Deep-well sources (Tumalistis, Executive, Payao, Lagundi) as intakes
- Multi-tenant LGU A/B/C switch — cut per Final features doc
- Historical partitioning / archiving
- A full audit trail beyond `event_log`

## Depends on
- none — build first

## Changelog
2026-10-06: added wsp_constants, rainfall_daily; dropped PostGIS (pending Dev B okay)
2026-10-06: hierarchy is LGU → Barangay → Resident; puroks removed, barangays + residents added (pending Dev B okay)
2026-10-06: aligned with CWD 2022 WSP (see docs/wsp_findings.md)
2026-10-06: added readings.is_simulated (migration 20261006000003) so the UI can label seed data as simulated
2026-10-06: added rainfall_hourly (migration 20261006000004) — hourly rain for the predictor's 24h/72h windows; twelve tables
2026-10-06: added rain_forecast_hourly (migration 20261006000005) — hourly rain forecast (Open-Meteo historical-forecast archive) so forecast_rain_48h_mm is deterministic and offline-safe for the demo; thirteen tables
2026-10-06: Dev B handoff 2026-10-06 (migration 20261006000006, columns only, still thirteen tables): readings.treated_turbidity_ntu + client_local_id; event_log.barangay_id (NULL = system-wide) + client_local_id; disruptions window_start/window_end/likely_at/next_update_at/heads_up_from; barangays.wsp_name, name = official PSGC name; per-barangay restored-at = resident_confirmed event with restored=true
