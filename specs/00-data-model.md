# Spec: Data model

## What it does
Defines the ten core Postgres tables — `barangays`, `residents`, `wsp_constants`, `rainfall_daily`, `readings`, `disruptions`, `sources`, `continuity_chains`, `allocations`, `event_log` — that every other spec reads from or writes to, plus the RLS posture used for the demo. Every other spec's data contract is a view onto these tables, so this one ships first. The hierarchy is LGU → Barangay → Resident: the barangay is the unit everything is computed, ranked and allocated per, and the LGU stays implicit (single LGU, Catbalogan City). `residents` holds PII (phone numbers) and is readable by `service_role` only. PostGIS is not used: barangay centroid lat/lng suffices (spec 03 out-of-scope). Every `barangay_id` column in `readings`, `sources`, `continuity_chains`, `allocations`, `residents` is a FK to `barangays(barangay_id)`. `allocations.officer_id` is text holding a Supabase Auth user id; LGU seed accounts are created separately, not in this migration.

## Data contract
```ts
import { z } from "zod";

export const Barangay = z.object({
  barangay_id: z.string(),
  name: z.string(),
  lat: z.number(),                 // centroid only, no PostGIS
  lng: z.number(),
  piped_households: z.number().int().nonnegative(),
  unpiped_households: z.number().int().nonnegative(),
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

export const Reading = z.object({
  id: z.string().uuid(),
  recorded_at: z.string().datetime(),
  barangay_id: z.string(),
  turbidity_ntu: z.number().nonnegative(),       // CWD 2022 WSP: >500 NTU forces shutdown
  plant_status: z.enum(["normal", "degraded", "shutdown"]),
  reservoir_pct: z.number().min(0).max(100),      // % of 340 m³ usable capacity, WSP
  clarifier_inflow_lps: z.number().nonnegative(), // rated capacity 46 L/s, WSP
  source: z.enum(["operator", "sensor"]),
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
  actor: z.string(), // user id or 'system'
  occurred_at: z.string().datetime(),
  payload_json: z.record(z.unknown()).optional(),
});
```

## Acceptance criteria
- [ ] All ten tables created via one Supabase migration (`supabase/migrations/20261006000001_init.sql` (Supabase CLI requires timestamp prefixes)), applies cleanly on a fresh project
- [ ] Inserting one seed row per table from `01-seed-data.md` succeeds with no constraint errors
- [ ] RLS: read access open to the anon key on every table except `residents` (demo simplicity), writes restricted to the `service_role` used by Edge Functions — documented as a hackathon-scope decision, not a production security posture
- [ ] anon key cannot read `residents` (PII): no anon/authenticated policy, `service_role` only
- [ ] `residents.phone` rejects anything that is not PH mobile E.164 (`+639XXXXXXXXX`)
- [ ] `event_log.event_type` enum matches every step in the process-flow diagram, in order: predicted → confirmed → deployed → notified → resident_confirmed → resolved

## Out of scope
- Multi-tenant LGU A/B/C switch — cut per Final features doc
- Historical partitioning / archiving
- A full audit trail beyond `event_log`

## Depends on
- none — build first

## Changelog
2026-10-06: added wsp_constants, rainfall_daily; dropped PostGIS (pending Dev B okay)
2026-10-06: hierarchy is LGU → Barangay → Resident; puroks removed, barangays + residents added (pending Dev B okay)
