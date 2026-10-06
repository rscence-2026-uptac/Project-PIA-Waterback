# Edge Functions

(Other sections, e.g. spec 06 allocation / notify / sync, are added by their own authors below or above.)

## Spec 03 / 07 endpoints

Functions: `affected-areas` (spec 03), `disruption-monitor` (disruption lifecycle), `dashboard-snapshot` (spec 07). All are CORS-enabled and callable with the anon key (`apikey` + `Authorization: Bearer <anon>`); they use the service role internally. Logic lives in `_shared/` (`affected.ts`, `disruption_monitor.ts`, `dashboard_snapshot.ts`, `supabase_data.ts`) and is tested in `supabase/tests/functions/spec03_07.test.ts`. `_shared/resident_state.generated.ts` is a generated copy of `packages/shared-types/src/resident-state.ts` (`node supabase/functions/_shared/gen_resident_state.mjs`; a parity test fails if it drifts).

Base URL: `https://<project-ref>.supabase.co/functions/v1/<name>`.

### `GET affected-areas?as_of=ISO[&disruption_id=uuid][&min_signal=0-4]`
Runs the spec 02 predictor at `as_of` (ISO 8601 with offset; default now) and returns a bare JSON array: one row per barangay (57).
- Served (26): inherit the system signal. Unserved (31): same signal, `resident_state: "not_on_network"`, `heads_up: true` when signal >= 2, counts NULL, `coverage_confidence: "unknown"`.
- `min_signal=2` returns `[]` when the system signal is below 2. Default 0 (all 57 rows always).
- `disruption_id`: the id you pass (404 if unknown), else the newest open disruption, else `null`. The disruption's `cause` drives `planned_repair` vs `interrupted`; with no disruption the cause is the higher of the two model levels.
- Counts: both counts are NULL (and `coverage_confidence: "unknown"`) when either count is NULL or `coverage_source = 'unknown'`. Level I rows: `piped = 0`, `unpiped` = all households. `vulnerable_flag` = critical facility present.
```json
{ "barangay_id": "canlapwas", "disruption_id": "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01", "signal_level": 4, "zone": null,
  "service_level": "level_iii", "low_pressure_zone": false, "piped_households_affected": null,
  "unpiped_households_affected": null, "coverage_confidence": "unknown", "vulnerable_flag": false,
  "resident_state": "interrupted", "heads_up": false }
```
Errors: 400 (`as_of`, `min_signal`, `disruption_id`), 404, 405, 500.

### `POST disruption-monitor`
- `{ "as_of": "2026-07-10T12:00:00+08:00" }` (as_of optional, default now; `"action":"run"` is the default). Runs the predictor. Signal >= 2 and no open disruption (status != resolved) -> inserts a `disruptions` row (`status: predicted`, `started_at = as_of`, cause = higher of turbidity/drought level, `p_*`, `signal_level`) and one system-wide `predicted` event (`barangay_id` NULL, actor `system`). If one is open: updates `p_*`, `signal_level`, `next_update_at` only (status and cause are never changed here). Never opens a second one; the same `as_of` twice is a no-op. Signal dropping below 2 does not close it: only residents' `restored = true` resolves a disruption (spec 06).
- Heuristics, not WSP facts: horizon H = 48 h (turbidity) / 7 d (drought); `window_start = as_of + H/4`, `likely_at = as_of + H/2`, `window_end = as_of + H`; `next_update_at = as_of + 2 h`; `heads_up_from = as_of` when signal <= 2 (else null).
- `{ "action": "confirm", "disruption_id": "<uuid>", "actor": "R. Abella" }` (actor optional, default `operator`): `predicted -> confirmed` + one system-wide `confirmed` event. Repeat or later status -> 200 `unchanged`; resolved -> 409; unknown -> 404.
- Response: `{ "action": "created" | "updated" | "unchanged" | "none" | "confirmed", "disruption": {...} | null, "prediction": {...PredictorOutput} }` (`prediction` is omitted for confirm).
- Known limit: two simultaneous first calls are handled by re-reading after a failed insert, but there is no unique index guarding "one open disruption" (existing smoke tests insert several), so schedule the monitor from one caller (e.g. a single pg_cron job / the operator button).

### `GET dashboard-snapshot`
Returns Dev B's `DashboardSnapshot` plus extras:
```json
{ "generated_at": "2026-07-10T04:00:00.000Z",
  "barangays": [ { "barangay_id": "canlapwas", "signal_level": 4, "status": "notified",
                   "last_event_at": "2026-07-10T03:30:00.000Z", "resident_state": "interrupted" } ],
  "disruption": { "id": "...", "cause": "turbidity", "signal_level": 4, "status": "confirmed", "started_at": "...",
                  "resolved_at": null, "window_start": "...", "window_end": "...", "likely_at": "...", "next_update_at": "...",
                  "heads_up_from": null, "p_turbidity": 0.79, "p_drought": 0.01 } }
```
One row per served barangay (26). The open disruption is the newest with status != resolved; with none: every row has `signal_level 0`, `status "resolved"`, `last_event_at = generated_at`, `disruption: null`.

Per-barangay status = the latest `event_log` row of the open disruption that applies to it (its own `barangay_id`, or NULL = system-wide, which fans out to all served barangays). Rule (`statusAfter` in `_shared/dashboard_snapshot.ts`, reuse it for Realtime INSERTs):

| event_type | card status |
|---|---|
| predicted / confirmed / deployed / notified | same name |
| resolved | `resolved` |
| resident_confirmed, `payload_json.restored = true` | `resolved` (signal shown as 0, resident_state `flowing`) |
| resident_confirmed, restored false / missing | `confirmed` (back on the allocation list, spec 06) |

No events yet: `predicted`, `last_event_at = disruption.started_at`. Realtime: subscribe to `postgres_changes` INSERT on `public.event_log`; `new.barangay_id === null` -> apply to every served card, else to that card; `new.payload_json.restored` is needed for `resident_confirmed`. Realtime on `event_log`/`disruptions` is already enabled, anon can read (RLS select policies).

### Shape differences vs Dev B's mocks
- `AffectedArea.disruption_id` is nullable (no open disruption). Dev B's `contracts/spec03.ts` needs `.nullable()`. Extra fields `resident_state`, `heads_up` (zod strips them if unused). The array has all 57 rows, not just affected ones; Dev B's `AffectedBarangay` extras (`name`, `facilities`, `vulnerable_households`, `no_backup_households`, `suggested_rank`, `reported_not_restored`) are not returned (name is in `barangays`; facilities = `barangays.critical_facilities`; rank is spec 04/06).
- `DashboardSnapshot` extras: `barangays[].resident_state`, top-level `disruption`. Fields and enum match the mock exactly. There is no `restored` status: restored maps to `resolved` with `signal_level 0`, as in Dev B's `mockLive`.
- `RealtimeEvent.barangay_id` is NULL for system-wide events in the DB (the mock always has an id): fan out on the client. `RealtimeEvent.table` and `disruption_id` come from the subscription / `new.disruption_id`.
- `DisruptionDetail.restored_at`, `updated_at` are not in `disruptions`; `window_*`, `likely_at`, `next_update_at`, `heads_up_from` are (set by the monitor heuristics above).

### Deploy
```
supabase functions deploy affected-areas
supabase functions deploy disruption-monitor
supabase functions deploy dashboard-snapshot
# anon-callable: functions verify the JWT by default; the anon key passes. No extra secrets (SUPABASE_URL / SERVICE_ROLE_KEY are injected).
curl -X POST "$URL/functions/v1/disruption-monitor" -H "Authorization: Bearer $ANON" -H "apikey: $ANON" -d '{"as_of":"2026-07-02T06:00:00+08:00"}'
```
