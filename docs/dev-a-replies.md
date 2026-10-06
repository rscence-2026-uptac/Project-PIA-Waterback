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

## Resident state v2: a prediction never says water is off
Bug in the table we accepted earlier: signal 3-4 showed "Interrupted" from a prediction alone, up to ~51 h before water stopped (July replay: signal 3 on 19 Jul 21:00, plant normal until 21 Jul 22:00). New rule, now in `residentState` (shared-types) and both endpoints:

| situation | `resident_state` | `heads_up` | `heads_up_urgency` (new, optional) | suggested copy |
|---|---|---|---|---|
| unserved | `not_on_network` | signal >= 2 | likely / very_likely when heads_up | unchanged |
| signal 0 | `flowing` | no | none | |
| signal 1, nothing observed | `heads_up` | yes | `possible` | "Water may stop. Keep some stored" |
| signal 2, nothing observed | `heads_up` | yes | `likely` | "Store water tonight" |
| signal 3-4, nothing observed | `heads_up` | yes | `very_likely` | "Water likely to stop from {likely_at}. Store water now" |
| observed, cause repair | `planned_repair` | no | none | |
| observed, other cause | `interrupted` | no | none | |
| barangay restored | `flowing` (signal 0) + existing water's-back flow | no | none | |

"Observed" (`interruption_observed`) = the barangay's disruption status is `confirmed` / `deployed` / `notified`, OR the latest Kulador `plant_status` at `as_of` is `degraded` / `shutdown`. `affected-areas` and `dashboard-snapshot` compute it for you, so the simplest wiring is: use `resident_state` and `heads_up_urgency` from the API, do not recompute from `signal_level`.

For you (Dev B):
- `apps/web/src/lib/waterState.ts`: `waterState(signal, cause, { interruptionObserved })` now defaults to prediction-only (signal 1-4 = `headsup`). New helpers `interruptionObserved(status, plant)`, `headsUpUrgency`, `headsUpHeadlineKey`, `waterStateFromApi(resident_state)`. `StatusScreen` / `CaptainScreen` still call `waterState(signalLevel, detail.cause)`: pass `{ interruptionObserved }` from the snapshot (or use `waterStateFromApi(row.resident_state)`), otherwise they show the heads-up card for signal 3-4. The mock `started_at` currently means "water stopped"; from the API, `disruptions.started_at` is when the disruption was opened (prediction time), so do not use it to decide "no water".
- New copy keys (FIL/WAR drafts, native review pending): `state.headsup.possible.headline`, `state.headsup.very_likely.headline`, `state.headsup.very_likely.headline_at` ({time}). Use `likely_at` (fallback `heads_up_from`) for {time}.
- The LGU legend tiles keep their level colours (`interruptionObserved: true`); the row chips use the card status.
- `resident_state` enum is unchanged (no `restored` kind). `heads_up_urgency` is optional and additive; the zod objects strip it, add it if you want it.


## Dev A changes in `apps/web` (live wiring, for Dev B to review)

Dev A took over the Supabase wiring from the Dev B backlog. Nothing was committed. Sample data is still the fallback when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing (see `apps/web/README.md`, "Live mode & demo clock").

- **New:** `src/api/` (`client.ts`, `http.ts`, `endpoints.ts`, `rest.ts`, `status.ts`, `allocation.ts`, `operator.ts`, `useResource.ts`, `index.ts`), `src/demo/` (`clockState.ts`, `clock.tsx`), `src/contracts/predictor.ts`, `src/lib/snapshotState.ts`. Dependency `@supabase/supabase-js@2`. `.env.local` (gitignored).
- **Contracts:** `spec03` (resident_state, heads_up, heads_up_urgency; nullable disruption_id was already there), `spec04` (`RankedChain`, `RankedChainBatch`; type is `neighboring_barangay`, already fixed), `spec05` (client-only `rejected` flag on queue items), `spec07` (`DisruptionInfo`, nullable `barangay_id` on `RealtimeEvent`, `payload_json`, `isHeadsUpEvent`, offset-tolerant datetimes).
- **Replaced TODO(Dev A):** `actions/lgu.ts` (real calls, 409 -> `StepOutOfOrder`; the client-side order guard only applies when not live), `offline/sync.ts` (sync-queue, `queued_at` order, `local_id` idempotency, start + `online` + after enqueue; `offline/queue.ts` triggers it), `realtime/eventFeed.ts` (Realtime `event_log` INSERT + `disruptions` INSERT/UPDATE; simulator kept for not-live), `realtime/useDashboard.ts` (fan-out of `barangay_id` null, heads-up events only bump `last_event_at`).
- **Screens touched:** `main.tsx` (provider, control, `startSync`), `StatusScreen` / `CaptainScreen` (`snapshotWaterState`), `AllocationScreen` (split into loader + body; live rows from affected-areas, first-stop hint with Simulated chip, "Confirm disruption" button when status is `predicted`), `LguLayout`, `LiveDashboardScreen` ("All served barangays" label, heads-up tag), `OperatorScreen` (REST charts and latest reading at the demo time, Simulated pill), `offline/useBarangayStatus.ts`.
- **Also:** `data/mock.ts` (snapshot extras, `interruption_observed` for the sample outage), `data/mockLgu.ts` (optional `top_source`), `lib/backupSource.ts` (reachable-first, like `rank-chain`), `copy/strings.ts` (new LGU/operator/live keys; `source.simulated` now starts with "Simulated"), and lint fixes in `PriorityMap`, `SourcesMap`, `Icon`, `consumerTypes` (no behaviour change).
- **Live-mode notes:** `rank-chain` is called when a barangay's status/sources load and a disruption is open (it upserts `continuity_chains`), and in batch once per disruption from the allocation screen. `dashboard-snapshot` takes `as_of` since the stage-demo update (below; newest open disruption either way). A disruption's `started_at` is the prediction time, so it is only shown as "dry since" once an interruption is observed.


## Stage-demo additions (Dev A, taken over from the Dev B backlog; nothing committed)

- **Phone mockup `/demo/phone`**, **operator "why" panel**, **resident/captain heads-up card**, and `dashboard-snapshot?as_of=` (+ `live_events=1`). Flow and details: `apps/web/README.md`, "Stage demo".
- **Backend:** `supabase/functions/_shared/dashboard_snapshot.ts` (optional `as_of`: plant status read at as_of, events cut at as_of, `generated_at = as_of`; `live_events=1` keeps later-stamped events; 400 on a bad `as_of`), `supabase/functions/README.md` (docs), `supabase/tests/functions/spec03_07.test.ts` (new handler test). **Redeploy:** `dashboard-snapshot` only (`supabase functions deploy dashboard-snapshot`). The web app calls it with `live_events=1`, because confirm/deploy/notify/resident events are stamped at real time and would vanish under a replayed past clock; a plain `?as_of=` caller gets the strict cut-off.
- **Web, new:** `src/demo/phone.ts`, `src/screens/demo/PhoneScreen.tsx`, `src/screens/operator/WhyPanel.tsx`, `src/ui/HeadsUpCard.tsx`, `src/lib/drivers.ts`, `src/lib/headsUp.ts`, `src/api/usePrediction.ts`.
- **Web, edited:** `src/main.tsx` (lazy route), `src/demo/clock.tsx` ("Open demo phone" link), `src/api/endpoints.ts` (`live_events`), `src/screens/resident/StatusScreen.tsx` (urgency headline + card, no cause line for heads-up), `src/screens/captain/CaptainScreen.tsx` (compact card), `src/screens/operator/OperatorScreen.tsx` (why panel replaces the sample cards when drivers exist), `src/data/mock.ts` (optional `vulnerable_households`), `src/copy/strings.ts` (`headsup.*`, `why.*`, `phone.*`; FIL/WAR are drafts), `apps/web/README.md`.


## Live vs sample pass (Dev A, 2026-10-07; nothing committed, no writes to the live project)

Goal: in live mode a judge sees backend data or an explicit "Sample" chip.

- **`/lgu/event` is live.** Reads (anon REST): the open or most recent `disruptions` row, its `event_log` (ordered by `occurred_at`, then lifecycle rank: predicted, heads-up, confirmed, deployed allocation, deployed source, notified, resident_confirmed, resolved), `allocations`, `continuity_chains` + `sources` (first stop per barangay) and `sms_outbox` (counts only, masked). Shows the seven-stage strip, the timeline (actor, Asia/Manila time, barangay, overrides from `payload_json.overridden_from_suggested_rank`, heads-up level and recipients, deployed source, restored / reopen), the allocation log with SMS per barangay, and SMS totals (outbound / replies / dry-run vs live / by template). Realtime: `event_log` INSERT triggers a debounced reload. If `sms_outbox` is missing the SMS card says so and the rest still renders. The old sample record (hero, hours chart, carry-forward) is used only when not live.
- **Storage plan** is derived, not sampled: 60 L = 4 people x 15 L (same rule as the heads-up SMS), plus "likely from {time}" (or the window once water has stopped) from the disruption.
- **Captain**: new "Suggested checklist" derived from the state (heads-up: tell vulnerable households, check communal containers; interrupted / repair: coordinate with the first stop, update households; restored: collect thank-yous; flowing: morning round). Morning-round sources are now the barangay's real ranked sources. "Updates delivered" = outbound `sms_outbox` rows for the barangay. "Went to a working source" and the thank-yous stay sample with a chip.
- **Allocation screen (live)**: facilities per barangay from `barangays.critical_facilities`; the spec 09 LGU line counts them. Residential is live. Commercial / industrial, vulnerable-household counts and no-backup counts show "Not in the backend yet" (never a sample number). Trucks and partners keep sample values under a "Sample" chip. Note: on the current live project `critical_facilities` is empty for every barangay (checked 40 rows), so the facility count is 0 until the seed is applied there.
- **Operator (live)**: shift info and the detector / early-warning cards (when the predictor has no `drivers`) carry "Sample"; the open-event pill uses the real disruption; the "since {time}" and reservoir-trend notes are not shown (they were sample values).

### Data still needed to remove the remaining "Sample" labels
| Item | What the backend would need |
|---|---|
| Spec 09 commercial / industrial / residential connection counts | CWD billing classes per barangay: table `connections(barangay_id, consumer_type, connections)`, anon-readable, or an extra field on `affected-areas`. Then one allocation row per (barangay, type) needs `confirm-allocation` to accept `consumer_type` (its decisions are unique per barangay today). |
| LGU facilities beyond 3 types (barangay hall) | extend `barangays.critical_facilities` check to include `barangay_hall`, and seed the facility list (handoff #10). |
| Vulnerable household counts | an aggregate only (never PII): `count(*) filter (where is_vulnerable)` per barangay from `residents`, exposed as a view or in `affected-areas` (`vulnerable_households`). `residents` stays service_role only. |
| No-backup households (no safe source within 30 min) | per-barangay household split by distance to the nearest safe source; needs household points or barangay-level estimates. |
| Trucks / partners | `trucks(id, capacity_l, trips)` and `partners(id, barangay_id, open)` tables, or a `routable` block in `affected-areas`. |
| Operator shift | operator accounts (Auth) or an `operator_shifts` table; none in the 24 h scope. |
| Captain "went to a working source" and thank-yous | an event type or table for source checks and household thanks (`resident-confirmation` with a `thanks` payload, `captain_checks`). |
| Allocation override column | `allocations.overridden_from_suggested_rank int` (today only in the `deployed` event payload; the record reads it from there). |
| `sms_outbox` on the live project | apply migration `20261006000009_sms_outbox.sql` (the REST read returns `PGRST205` there now). |

### Translations
`live.*` and three `phone.*` keys had English placeholders in FIL/WAR; best-effort Filipino and Waray drafts were written (plain, short; the live dashboard is English-only per spec 08 so these only show if that changes). New keys (`sample.*`, `storage.rule/timing_*`, `captain.check.*`, `captain.checklist_*`, `captain.toast_saved`) have FIL/WAR drafts. All FIL/WAR stay covered by `NEEDS_REVIEW = "all"` and carry "DRAFT FIL/WAR: native review" comments. No existing reviewed string was changed. LGU `evrec.*` / `lgu.*` additions are English in all three columns (LGU screens render English only). The demo clock strings (`demo/clock.tsx`) are hard-coded English presenter UI, not copy keys, so they were left alone.

### Changed files (this pass)
- New: `apps/web/src/api/eventRecord.ts`, `apps/web/src/screens/lgu/LiveEventRecord.tsx`.
- Edited: `apps/web/src/api/rest.ts` (event / allocation / chain / sms / facilities reads), `apps/web/src/api/allocation.ts` (facilities), `apps/web/src/api/status.ts` (live captain), `apps/web/src/data/mock.ts` (`CaptainDay.delivered` nullable, `live`), `apps/web/src/lib/time.ts` (`formatManila`, `formatManilaDay`), `apps/web/src/ui/Chip.tsx` (`SampleChip`), `apps/web/src/copy/strings.ts`, `apps/web/src/screens/lgu/EventRecordScreen.tsx`, `apps/web/src/screens/lgu/AllocationScreen.tsx`, `apps/web/src/screens/captain/CaptainScreen.tsx`, `apps/web/src/screens/operator/OperatorScreen.tsx`, `apps/web/src/screens/resident/StatusScreen.tsx`, `apps/web/src/screens/resident/WaterBackView.tsx`, `apps/web/README.md`, `README.md` ("Run locally"), `docs/dev-a-replies.md`.
