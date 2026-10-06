# Demo scripts

Stage / rehearsal driver for the PIA Waterback backend. It calls only the deployed Edge Functions with the **anon** key (exactly as the app does); the service-role key is used only by `reset`, `verify-realtime`'s cleanup, and (optionally) `status`.

## Setup

```
cd scripts/demo && npm install      # only dependency: @supabase/supabase-js@2
```
Node 20+ (Node 22+ recommended for Realtime's built-in WebSocket; 26 tested).

Config, either:
- a gitignored `.env` at the repo root with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`), or the same variables in the environment; or
- `--from-cli` on any command: keys are fetched at runtime with `supabase projects api-keys --project-ref <ref> -o json` (ref from `supabase/.temp/project-ref`) and kept in memory only.

Missing config exits with a clear message. Keys are never printed.

## Commands

```
node scripts/demo/demo.mjs <command> [flags]
```

| Command | What it does |
|---|---|
| `status` | Open disruption, row counts (disruptions, event_log, allocations, continuity_chains, non-simulated readings) and whether the DB is at **clean baseline** (all zero). |
| `reset --yes` | Service role. Deletes ALL rows in `event_log`, `allocations`, `continuity_chains`, `disruptions`, and `readings` where `is_simulated = false`. Prints counts deleted. |
| `run [--as-of ISO] [--step] [--top N] [--with-reopen]` | The 11-step stage scenario (default as_of `2026-07-02T06:00:00+08:00`, top 3). `--step` waits for Enter before each step. `--with-reopen` first sends one `restored=false` (disruption goes back to `deployed`) before the `restored=true` confirmations. Prints per-step timings; exit code 1 on any failed step. |
| `listen [--seconds S]` | Realtime with the anon key: `postgres_changes` INSERT on `event_log` and UPDATE on `disruptions`. Prints type, `barangay_id` (or `ALL (system-wide)`), `occurred_at`, and receive latency. This is the data path of Dev B's `/lgu/live`. |
| `verify-realtime [--reset] [--keep] [--with-reopen]` | Refuses unless the baseline is clean (or `--reset`). Starts a listener, runs the full scenario, waits up to 10 s for stragglers, asserts every `event_log` row of the disruption was received, in lifecycle order, reports median/max latency, then resets (unless `--keep`). Exit 0 only if everything passed. |

Scenario steps: predictor, monitor create, monitor confirm, rank-chain (batch), affected-areas (`min_signal=2`, sorted by `suggested_rank`, on-network barangays only), confirm-allocation (`mock-officer-1`), deploy-response (each barangay's chain #1 source), notify-residents (checks elapsed < 10 s), dashboard-snapshot, resident-confirmation to resolved, final snapshot.

Notes on output: latency in `listen`/`verify-realtime` is local receive time minus Realtime `commit_timestamp`, so it includes local clock skew. Client-supplied `deployed_at` / `sent_at` / `confirmed_at` are generated at call time (+08:00) and never earlier than the server's last response time, so they are not before the allocation (server caps them at its own now).

### Simulated handset (zero-cost SMS)

| Command | What it does |
|---|---|
| `sms [--seconds S] [--history N]` | Anon key, Realtime `INSERT` on `sms_outbox`: prints each message phone-style (barangay, masked number, language, body; `(simulated)` = dry-run). `--history N` first prints the last N rows. |
| `reply <barangay_id\|+63900000000X> <KEYWORD>` | Calls `sms-webhook?demo=1` as that seeded demo resident (`lagundi`, `payao`, `darahuway-dako`, `darahuway-guti`), e.g. `reply lagundi THANKS` or `reply payao STATUS`. Prints the auto-reply. Only the fake demo block is accepted. |

`run` prints, in the notify step, how many SMS went to the outbox. `reset --yes` also clears `sms_outbox` (never `residents`). Needs migration `20261006000009` and `supabase/seed/demo_residents.sql` applied.

**SMS stage flow**
```
terminal 1:  node scripts/demo/demo.mjs sms
terminal 2:  node scripts/demo/demo.mjs run --step      # at "Notify residents" the phones light up in terminal 1
terminal 2:  node scripts/demo/demo.mjs reply lagundi THANKS   # resident confirms; run the other top barangays too
```
Use `reply <barangay> THANKS` instead of the scenario's own confirmation step if you want the audience to see the resident side (stop `run --step` before the "Resident confirmation" step, reply from each notified barangay, then run `status`).

## Recommended stage flow

```
node scripts/demo/demo.mjs status          # confirm clean baseline
node scripts/demo/demo.mjs reset --yes     # only if it is not clean
node scripts/demo/demo.mjs run --step      # press Enter through the story
node scripts/demo/demo.mjs reset --yes     # back to baseline for the next run
```
Open Dev B's `/lgu/live` in the browser (or `listen` in a second terminal) before `run` to show events arriving live.

## Rehearsal

1. `verify-realtime` (no flags) end to end; it resets for you. Run it after every Edge Function redeploy.
2. `run --step` a couple of times, then `reset --yes`.
3. `run --with-reopen` once to rehearse the "not restored" loop.
4. `status` must say CLEAN BASELINE before going on stage.

## Safety

- `reset` only touches the runtime scopes above (plus `sms_outbox`). It never touches `barangays`, `sources`, `intakes`, `wsp_constants`, `rainfall_*`, `rain_forecast_hourly`, `residents`, or simulated readings. It requires `--yes` and the service-role key.
- SMS stays dry-run: `notify-residents` only sends when the function secret `SMS_LIVE` is exactly `true`. `run` aborts if the response says the mode is not `dry_run`. In dry-run, SMS recipients come from the `residents` table; with no seeded residents `planned` is 0.
- Do not run against a project with real data in the runtime tables: `reset` deletes all of it.
