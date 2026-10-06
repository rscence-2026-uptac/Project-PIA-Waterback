# Dev A replies to the Dev B handoff

Answers to `docs/dev-b-handoff.md` (2026-10-06), item by item. Dev B's file stays theirs; we answer here. Branch `backend`. Everything below is in the repo except where it says "next".

Migration: `supabase/migrations/20261006000006_dev_b_handoff.sql` (columns only, still thirteen tables). Seed: `supabase/seed/barangays.sql` (57-row upsert). Specs updated: 00, 01, 03.

## 1. Plant-wide readings vs `readings.barangay_id`
Nothing to do. Readings are per intake (`intake_id`), as you built it.

## 2. Treated turbidity: done
`readings.treated_turbidity_ntu numeric check (>= 0)`, nullable, Kulador only, compared against `TURBIDITY_LIMIT_NTU`. Also added `readings.client_local_id text unique` so the offline queue can use your `local_id` as the idempotency key (same `local_id` replayed = no second row). In shared-types: `Reading.treated_turbidity_ntu`, `Reading.client_local_id`. Send `null` for non-Kulador intakes.

## 2a. Barangay names: done
`barangays.name` is now the official PSGC name (`Poblacion 5 (Barangay 5)`, `Canlapwas (Poblacion)`, `Muñoz (Poblacion 14)`, `Guindaponan`, `Bunuanan`, `Darahuway Gote`, `Darahuway Daco`). The WSP spelling is kept in the new `barangays.wsp_name` column (null where it matches). Ids are unchanged. The seed is an upsert, so the remote picks up the renames. Shared-types `Barangay.wsp_name` added.

## 2b. Unserved barangays: option (b), their own state
Unserved barangays get a separate `not_on_network` state with their own backup-source plan, plus a heads-up when the system signal is 2 or higher (their backup sources get busier). They do not get "interrupted", because CWD does not pipe water to them.
- All 57 Catbalogan barangays are now in `barangays`: 26 served and 31 `service_level = 'unserved'` (zone, coordinates and household counts NULL, `coverage_source = 'unknown'`).
- Ids match `apps/web/src/data/barangays.ts` for all 57 (served ids already matched; the 31 unserved ids are the same slugs, e.g. `canhawan-gote`, `new-mahayag`, `san-roque`). No mismatches.
- Helper: `residentState(signal_level, cause, service_level)` in `packages/shared-types/src/resident-state.ts` returns `{ state, heads_up }`. Specced in spec 03.

## 2c. `AffectedArea` nullable counts: done
`piped_households_affected` and `unpiped_households_affected` are `.nullable()` in shared-types, matching spec 03 (null = "coverage unknown").

## 3. Disruption timing fields: done
New nullable `timestamptz` columns on `disruptions`: `window_start`, `window_end`, `likely_at`, `next_update_at`, `heads_up_from`. Also on the shared-types `Disruption` schema (default `null`).

`restored_at` is not a new column:
- Per barangay: the `occurred_at` of that barangay's `resident_confirmed` event whose `payload_json.restored = true`.
- Whole disruption: the existing `disruptions.resolved_at`.

Documented in spec 00.

## 4. Edge Functions (allocation, deploy, notify, sync): in progress, next
`confirmAllocation`, `deployResponse`, `notifyResidents` and the offline-queue sync are the next Edge Functions. Contracts stay as in spec 06. Sync will push in `queued_at` order and dedupe on `client_local_id` (columns above exist now), so you can wire `apps/web/src/offline/sync.ts` against that. No function is deployed yet.

## 5. Server rules (spec 06 AC3 and AC4): in progress, next
Will be enforced in the Edge Functions: only `restored === true` can move a disruption to `resolved`; `restored === false` never writes `resolved` and puts the barangay back on the allocation list. Escalation or a cap after N "not restored" reports is out of scope for the 24 h build.

## 6. SMS templates and keywords: in progress, next
Noted. The `sms-webhook` and Semaphore sending are next. We will import the templates from shared-types if you move `apps/web/src/copy/sms.ts` there; until then, tell us the file path to read from.

## 7. Signal level to resident screen: accepted
Your table is adopted as written and is now in spec 03 (acceptance criteria) and in code as `residentState`: unserved = `not_on_network` (heads-up at signal 2 or higher); served 0 = `flowing`, 1-2 = `heads_up`, 3-4 = `interrupted`, or `planned_repair` when `cause = repair`.

## 8. Officer identity
Keep the mock `mock-officer-1` for the demo. There is no auth in the 24 h scope. `allocations.officer_id` is free text, so the mock id is stored as is.

## 9. Live dashboard: `event_log.barangay_id` and Realtime
Added `event_log.barangay_id text references barangays(barangay_id)`, nullable, with an index on `(barangay_id, occurred_at desc)`.
- `NULL` means a system-wide event (`predicted`, `confirmed`). We write it once; the dashboard fans it out to the served barangays.
- Barangay-specific events (`deployed`, `notified`, `resident_confirmed`) set it.
- `event_log.client_local_id text unique` is the idempotency key for resident confirmations replayed from the offline queue.
- Realtime stays on for `event_log`, `disruptions`, `allocations`.
- Supabase URL and anon key: shared separately by Dev A (not written in the repo).

## shared-types is now zod 4
`@pia/shared-types` moved to zod 4 (`z.uuid()`, `z.iso.datetime()`, `z.iso.date()`, `z.record(key, value)`). You can import `@pia/shared-types` and delete the copies in `apps/web/src/contracts/`. Spec 05's `z.record(z.unknown())` is `z.record(z.string(), z.unknown())` there. Note `z.uuid()` is strict (RFC variant), so fixtures need real v4 UUIDs.
