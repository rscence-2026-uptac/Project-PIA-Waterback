# PIA Waterback

Backend: `supabase/` (migrations, seeds, Edge Functions; see `supabase/functions/README.md`). Stage driver: `scripts/demo/README.md`.

## Run locally

**Web app** (`apps/web`, Node 20+):
```
cd apps/web && npm install
npm run dev          # http://localhost:5173
npm run build && npm run lint
```
- Mocks (default): with no env vars every screen runs on the sample data in `apps/web/src/data`. Nothing to configure.
- Live: create `apps/web/.env.local` (gitignored) with `VITE_SUPABASE_URL=https://<ref>.supabase.co` and `VITE_SUPABASE_ANON_KEY=<anon key>` (`supabase projects api-keys --project-ref <ref>`). Anon key only; never put the service-role key in the app. Add `?demo=1` to a URL for the demo clock control. Details: `apps/web/README.md`, "Live mode & demo clock".

**Stage driver** (`scripts/demo`, needs the service role, kept in memory only):
```
cd scripts/demo && npm install
node demo.mjs status --from-cli            # --from-cli fetches the keys with the Supabase CLI (logged in, project linked)
node demo.mjs replay --scenario late-july --dry --from-cli
node --test test/*.test.mjs                # offline checks
```
See `scripts/demo/README.md` for the full rehearsal.

**Database tests** (local Postgres; drops and recreates `pia_dev`):
```
PGUSER=$USER supabase/tests/run_local.sh   # stub -> migrations -> seeds -> smoke, RLS, seed checks; ends with ALL PASS
```

**Edge Function and shared-types tests:**
```
cd supabase/tests/functions && npm install && npx vitest run
cd packages/shared-types   && npm install && npx vitest run
```

**ML predictor** (Python 3.13 or 3.14):
```
cd ml && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
.venv/bin/python test_train_predictor.py && .venv/bin/python test_constants_parity.py && .venv/bin/python test_simulate_july.py
```

## SMS demo (simulated handset)

Zero cost, no carrier: every SMS the backend would send is written to the `sms_outbox` table, and a phone mockup shows it live through Realtime. The resident "replies" by calling `sms-webhook` in demo mode. Nothing is ever sent to a real number (`SMS_LIVE` stays unset).

Setup (once): apply migration `20261006000009_sms_outbox.sql`, seed `supabase/seed/demo_residents.sql` (5 demo residents; phones `+639000000001`..`04` are fake placeholders in lagundi, payao, darahuway-dako, darahuway-guti; plus one PWA resident in poblacion-01), deploy `notify-residents` and `sms-webhook`.

### 1. Show incoming SMS (Realtime, anon key)
```ts
supabase.channel("sms")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "sms_outbox" }, (p) => show(p.new))
  .subscribe();
// initial/backfill: supabase.from("sms_outbox").select("*").order("created_at", { ascending: false }).limit(20)
```
Row (`SmsOutbox` in `@pia/shared-types`): `{ id, disruption_id, barangay_id, resident_id, to_masked, template, language, body, direction: "outbound" | "inbound", mode: "dry_run" | "live", created_at }`. Show `direction = "outbound"` rows as messages arriving on the phone of the demo resident whose barangay is `barangay_id` (`to_masked` is e.g. `+63900•••0001`; the full number is never exposed); `inbound` rows are what the resident typed. Filter by `barangay_id` to pick one phone.

### 2. Reply from the phone (keyboard: THANKS / STATUS)
```
POST {SUPABASE_URL}/functions/v1/sms-webhook?demo=1
apikey: <anon key>            (optional: the function is deployed --no-verify-jwt)
Content-Type: application/json

{ "from": "+639000000001", "message": "THANKS" }
```
Demo sender numbers: lagundi `+639000000001`, payao `+639000000002`, darahuway-dako `+639000000003`, darahuway-guti `+639000000004`. Any other number is rejected (401). Response `200 {"keyword":"THANKS","handled":true,"reply":"...","sms":{"mode":"dry_run",...}}`; the reply also arrives as an `outbound` `sms_outbox` row. `THANKS` marks that barangay restored (`resident-confirmation`, `channel: "sms_reply"`), which can resolve the disruption; `STATUS` returns the current water status text. `THANKS` only works after `notify-residents` ran for the barangay (otherwise a polite "no active interruption" reply).

### 3. Terminal version
```
node scripts/demo/demo.mjs sms                 # terminal 1: phone-style tail of sms_outbox
node scripts/demo/demo.mjs run --step          # terminal 2: the scenario; notify step fills the outbox
node scripts/demo/demo.mjs reply lagundi THANKS
```
See `scripts/demo/README.md`.
