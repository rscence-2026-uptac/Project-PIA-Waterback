# Spec: Data model

## What it does
Defines the six core Postgres tables — `readings`, `disruptions`, `sources`, `continuity_chains`, `allocations`, `event_log` — that every other spec reads from or writes to, plus the RLS posture used for the demo. Every other spec's data contract is a view onto these tables, so this one ships first.

## Data contract
```ts
import { z } from "zod";

export const Reading = z.object({
  id: z.string().uuid(),
  recorded_at: z.string().datetime(),
  purok_id: z.string(),
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
  purok_id: z.string(),
  name: z.string(),
  type: z.enum(["piped", "refill_station", "trucking", "communal_tap", "neighboring_purok"]),
  safety_score: z.number().min(0).max(1),
  travel_minutes: z.number().nonnegative(),  // scored against WHO/UNICEF JMP 30-min benchmark
  cost_php_per_unit: z.number().nonnegative(),
  active: z.boolean(),
});

export const ContinuityChain = z.object({
  id: z.string().uuid(),
  purok_id: z.string(),
  disruption_id: z.string().uuid(),
  ranked_source_ids: z.array(z.string().uuid()), // ordered safety desc, time asc, cost asc
  computed_at: z.string().datetime(),
});

export const Allocation = z.object({
  id: z.string().uuid(),
  disruption_id: z.string().uuid(),
  purok_id: z.string(),
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
- [ ] All six tables created via one Supabase migration (`supabase/migrations/001_init.sql`), applies cleanly on a fresh project
- [ ] Inserting one seed row per table from `01-seed-data.md` succeeds with no constraint errors
- [ ] RLS: read access open to the anon key (demo simplicity), writes restricted to the `service_role` used by Edge Functions — documented as a hackathon-scope decision, not a production security posture
- [ ] `event_log.event_type` enum matches every step in the process-flow diagram, in order: predicted → confirmed → deployed → notified → resident_confirmed → resolved

## Out of scope
- Multi-tenant LGU A/B/C switch — cut per Final features doc
- Historical partitioning / archiving
- A full audit trail beyond `event_log`

## Depends on
- none — build first
