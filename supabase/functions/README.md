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

## Spec 06 endpoints

Functions: `confirm-allocation`, `deploy-response`, `notify-residents`, `resident-confirmation`, `sync-queue`, `sms-webhook`. All `POST`, JSON, CORS-open, callable with the anon key (`apikey` + `Authorization: Bearer <anon>`); writes use the service role inside the function. No auth beyond that (Dev A decision for the demo: `officer_id` is the mock `mock-officer-1`, stored as sent). Logic is in `_shared/` (`allocation.ts`, `notify.ts`, `confirmation.ts`, `sync.ts`, `sms_inbound.ts`, `sms_send.ts`, `sms_templates.ts`; data access `spec06_store.ts` / `spec06_supabase.ts`; schemas `spec06_schemas.ts`, a zod 4 copy of shared-types and Dev B's spec 05 contracts, imported as `npm:zod@4.6.5`). Tests: `supabase/tests/functions/spec06.test.ts` (in-memory store, mocked fetch). No migration was needed.

Errors, all functions: `{ "error": "<message>", "code": "<code>", "details"?: ... }`. 400 `invalid_request` (zod failure, `details` = `[{path, message}]`; also duplicate barangay/rank, mixed disruption ids) or `invalid_json`; 404 `disruption_not_found` / `source_not_found`; 405; 409 (state rule, codes below); 422 `unknown_barangay` / `unknown_intake`; 500 `internal` (no details leaked).

### Event order (spec 06)
`confirm-allocation` writes `deployed` (payload `step: "allocation"`) per barangay -> `deploy-response` adds a second `deployed` (payload `step: "source"`) -> `notify-residents` writes `notified` -> `resident-confirmation` writes `resident_confirmed` -> `resolved` (system-wide, `barangay_id` NULL) only from the rule below. Every event has `barangay_id` set (except `resolved`) and `payload_json.recorded_at` (server receive time; used for ordering because `occurred_at` of confirmations is the client time, capped at now). Each step checks the previous one happened (409 otherwise).
Disruption status: `confirmed -> deployed` (confirm-allocation) `-> notified` (notify-residents) `-> resolved` (resident-confirmation). A "not restored" report moves it back to `deployed`.

### `confirm-allocation`  (replaces `TODO(Dev A)` in `confirmAllocation`, apps/web/src/actions/lgu.ts)
Body: `AllocationDecision[]` (1-100, one disruption, unique `barangay_id` and `priority_rank`). Disruption must be `confirmed`, `deployed` or `notified` (re-allocation after "not restored"), else 409 `disruption_not_confirmed`.
Writes `allocations` rows (`decided_at` = server now, `note`) + one `deployed` event per barangay (actor = `officer_id`; payload `priority_rank`, `overridden_from_suggested_rank`, `overridden` bool, `note`). `overridden_from_suggested_rank` is audited in the event payload (the `allocations` table has no such column).
```json
POST /functions/v1/confirm-allocation
[{"disruption_id":"3f6b2f0e-6d57-4c53-9a0c-1b2c3d4e5f60","barangay_id":"payao","priority_rank":1,"officer_id":"mock-officer-1","overridden_from_suggested_rank":null}]
-> {"disruption_id":"3f6b...","status":"deployed","allocations":1,"events_written":1}
```

### `deploy-response`  (replaces `TODO(Dev A)` in `deployResponse`)
Body: `DeployResponse`. Needs the barangay's allocation (409 `barangay_not_allocated`, or `allocation_not_confirmed` if the disruption is not yet `deployed`) and an existing `sources` row (404). No column/table fits, so the deployed source is a second `deployed` event: actor `deployed_by`, `occurred_at` = `deployed_at` (capped at now), payload `{step:"source", source_id, source_name, in_ranked_chain}` (`in_ranked_chain` is null when no continuity chain exists; a source outside the chain is allowed and flagged, not rejected).
-> `{"disruption_id","barangay_id","source_id","source_name":"Bayani Refilling","recorded":true}`

### `notify-residents`  (replaces `TODO(Dev A)` in `notifyResidents`)
Body: `NotificationPayload[]` (1-200, one disruption; a barangay may appear once per channel). Needs disruption `deployed`/`notified` (409) and an allocation per barangay (409 `barangay_not_allocated`, `details` = ids).
1. Writes one `notified` event per barangay (actor `system`, payload `channels`, `status`, `cause`, `expected_duration_hint`, `store_water_advice`, `nearest_source_name`) and sets the disruption to `notified`. **The `notified` event IS the PWA delivery**: the residents' PWAs read `event_log` through Realtime. Web Push is out of scope.
2. For payloads with `channel: "sms"`, texts every resident of that barangay with `channel = 'sms'` and a phone, in their language, using `sms.water_off` (or `sms.water_off_no_store` when `store_water_advice` is false). Times come from the disruption's `started_at`, `window_start/end`, `likely_at` (Asia/Manila); missing values fall back to "later today"/"later". Events are written before the SMS, so a slow carrier never delays the PWA.
```json
-> {"disruption_id":"...","status":"notified","notified":[{"barangay_id":"payao","channels":["pwa_push","sms"],"sms_recipients":2}],
    "sms":{"mode":"dry_run","planned":2,"sent":0,"failed":0,"errors":[],"would_send":[{"to":"+*********567","message":"PIA WATERBACK: Water OFF in Payao since 11:45AM. ..."}]}}
```
**SMS dry-run switch.** Nothing is sent (`fetch` is never called) unless the env var `SMS_LIVE` is exactly `"true"`. Dry-run returns `would_send` with masked numbers. Live: Semaphore `POST https://api.semaphore.co/api/v4/messages` (form: `apikey`, `number` comma-joined, `message`, `sendername`), one request per distinct message text, in parallel, 8 s timeout each; failures are reported in `sms.failed/errors` and never fail the call (events are already written). Without `SEMAPHORE_API_KEY` live mode reports every message failed.
**10 s acceptance criterion.** Measured only with mocks: 26 barangays, 520 SMS residents, Semaphore stub at 150 ms -> well under 2 s total (test `latency`). Real network adds ~6 Supabase round trips plus Semaphore latency; expected a few seconds, not measured against the live project.

### `resident-confirmation`  (called by the PWA / captain screen; also reused by `sync-queue` and `sms-webhook`)
Body: `ResidentConfirmation` + optional `client_local_id` (idempotency key, `event_log.client_local_id`). Needs a `notified` event for that barangay (409 `barangay_not_notified`). Writes `resident_confirmed` (actor `confirmed_by`, `barangay_id`, payload `confirmed_by, channel, restored, reopen, confirmed_at`).
- **AC3** only `restored = true` can write `resolved`. **Resolution rule (decision):** the disruption resolves when *every barangay that was notified* is restored (latest `notified`/`resident_confirmed` event of the barangay is a `restored = true` confirmation). One barangay confirming does not close the others. Then `disruptions.status = resolved`, `resolved_at = now`, plus a system-wide `resolved` event (`payload.rule = "all_notified_barangays_restored"`).
- **AC4** `restored = false` never writes `resolved`; event payload `reopen: true`; the disruption goes back to `deployed` so the barangay returns to the allocation screen (the app can find it as: latest `resident_confirmed` of the barangay has `payload_json.reopen = true`). Re-allocating and re-notifying makes the barangay "not restored" again until a new confirmation.
- Replay with the same `client_local_id` -> 200 `result: "already_synced"`, nothing written (also after the disruption was resolved). On a resolved disruption `restored: false` is 409 `disruption_resolved`; `restored: true` is logged without a second `resolved`.
-> `{"result":"recorded","disruption_id","barangay_id","restored":true,"reopen":false,"disruption_status":"resolved","resolved":true,"pending_barangays":[]}`

### `sync-queue`  (replaces the `TODO(Dev A backend)` in apps/web/src/offline/sync.ts)
Body: `OfflineQueueItem[]` (1-200). Items are processed one by one in `queued_at` order (ties keep array order); `local_id` is the idempotency key. Response `{ "results": [...], "summary": {...} }`, results in processing order (invalid items first), each `{local_id, kind, status, code?, error?, details?}`:
`synced` (stored) | `already_synced` (replay; mark synced) | `rejected` (permanent: invalid item/payload, unknown barangay/disruption, rule violation such as `barangay_not_notified`; do not retry) | `failed` (temporary DB error; keep pending).
- `reading`: payload = `OperatorReadingForm` + `treated_turbidity_ntu` (nullable) + `recorded_at`; inserts into `readings` (`source: "operator"`, `is_simulated: false`, `client_local_id = local_id`).
- `resident_confirmation`: delegated to `resident-confirmation` with `client_local_id = local_id`, so AC3/AC4 apply.
The HTTP status is 200 even when items are rejected; only a non-array/empty/oversized body is 400.

### `sms-webhook`  (Semaphore incoming)
Deploy with `--no-verify-jwt` (set in `supabase/config.toml`); protected by a shared secret: `https://<ref>.supabase.co/functions/v1/sms-webhook?token=<SMS_WEBHOOK_SECRET>` (mandatory when `SMS_LIVE=true`, otherwise 401). Accepts JSON or form-encoded bodies with sender `number|sender|from|msisdn|phone`, text `message|text|content|body`, optional `message_id|id`. ASSUMPTION: Semaphore's inbound payload shape was not verified against their docs; adjust `extractInbound` if it differs. Looks the resident up by phone (`+639...`, any PH format accepted) and replies in their language through the same dry-run-safe sender.
| Keyword | Behavior |
|---|---|
| `STATUS` | Implemented. Interrupted in the resident's barangay -> the `sms.water_off` text; otherwise "Water is flowing in X". Unregistered number -> sign-up hint. |
| `THANKS` | Implemented. Writes a `resident_confirmed` (`restored: true`, `channel: "sms_reply"`, `confirmed_by: "resident"`, key `sms:<message id>`); may resolve per the rule above. No active interruption -> polite reply, nothing written. |
| `JOIN <code>`, `SRC`, `STORED`, `OPEN <gallons>`, `OUT`, `CLOSED` | Not implemented in the demo: reply "`<KEYWORD>` is not available in this demo yet. Reply STATUS ...". |
| anything else | Help reply. |
Response: `{keyword, handled, reply, sms}`; in dry-run nothing is sent.

### Env vars and deploy
| Var | Used by | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all | provided by Supabase automatically |
| `SMS_LIVE` | notify-residents, sms-webhook | must be exactly `true` to send; unset = dry-run |
| `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME` | same | only read when live |
| `SMS_WEBHOOK_SECRET` | sms-webhook | required when live |
```bash
supabase secrets set SMS_WEBHOOK_SECRET=... # add SMS_LIVE=true SEMAPHORE_API_KEY=... SEMAPHORE_SENDER_NAME=... only for the live demo
for f in confirm-allocation deploy-response notify-residents resident-confirmation sync-queue; do supabase functions deploy $f; done
supabase functions deploy sms-webhook --no-verify-jwt
```
Local: `supabase functions serve --env-file .env.local` (leave `SMS_LIVE` out).

### Mismatches with spec 06 / Dev B's code, and suggested spec edits
1. **Function names.** `lgu.ts` says `allocate` (confirmAllocation and deployResponse) and `notify`; the real ones are `confirm-allocation`, `deploy-response`, `notify-residents`. Dev B: change the three `TODO` URLs.
2. **Resolution rule.** Spec 06 AC3/AC4 read as if one confirmation closes the disruption. Implemented: all notified barangays must be restored. Suggest AC3: "...only a `resident_confirmed` with `restored = true` may flip a disruption to `resolved`, and only when every barangay notified for it has a restored confirmation."
3. **`notified` is the PWA push.** AC2 says "PWA push and SMS". Suggest: "PWA delivery is the `notified` event read through Realtime; Web Push is P1."
4. **Two `deployed` events per barangay** (allocation, then source). Suggest adding `deployed` payload shapes to the spec, or a `source_id` column on `allocations`.
5. **`ResidentConfirmation` needs `client_local_id`** (optional) for the offline queue; `OfflineQueueItem.local_id` is mapped to it. Add to the contract.
6. **Strict ordering** (not in the spec): allocation needs a `confirmed` disruption; notify needs a prior allocation per barangay; confirmation needs a prior `notified`. Spec 03's monitor must therefore run `confirm` before the LGU screen can confirm an allocation.
7. **`overridden_from_suggested_rank`** is stored in the `deployed` event payload because `allocations` has no column for it. Suggest a nullable `allocations.overridden_from_suggested_rank int` if the allocation log (`/lgu/event`) should read it from the table.
8. **SMS templates:** six rows copied unchanged from `apps/web/src/copy/sms.ts` (a test compares them when that file exists; re-sync by hand). Added in `sms_templates.ts` (REVIEW the Filipino/Waray drafts): `sms.water_off_no_store`, `sms.status_flowing`, `sms.thanks_ack`, `sms.not_registered`, `sms.not_in_demo`, `sms.help`, `sms.no_active`. Suggest adding them to spec 08's SmsTemplate table / Dev B's file so there is one source. SMS window is rounded to whole hours; the `{litres}` value is a fixed 60 L (4 people x 15 L), because `NotificationPayload` carries no storage plan.
9. **EventLogEntry** in spec 06 lacks `barangay_id` and `payload_json` (they exist in spec 00 / the table).
