# Dev B → Dev A handoff

Changes from the frontend side (specs 05–08) that touch the backend, plus what the screens expect from you. Newest first. Reply inline or in the PR, and tick items off as they're settled.

Last updated: 2026-10-06 · branch `des`

## Action needed from Dev A

### 1. ~~Plant-wide readings vs. the `readings.barangay_id` FK~~ — resolved by your WSP change
- Done in `1b396e2` (`origin/backend`): readings are per intake (`intake_id`).
- The app now follows spec 05 exactly. The operator picks Kulador, Masacpasac, Caramayon I or Caramayon II, and the reservoir and clarifier fields appear only for Kulador (sent as `null` otherwise).
- The `antiao-intake` placeholder is gone.
- `des` has your spec 05 copied verbatim, so the merge shouldn't conflict.

### 2. Treated turbidity isn't in the contract — add a column or drop it
- The operator form (wireframe p.9) has **Treated turbidity (NTU)**, checked against `TURBIDITY_LIMIT_NTU` (5).
- Per the WSP it only exists at Kulador, so the app shows it only for Kulador and queues it as `payload.treated_turbidity_ntu`. It's `null` for the other intakes.
- It isn't in `Reading` / `readings`.
- **Ask:** add `treated_turbidity_ntu numeric check (>= 0)`, nullable like reservoir/clarifier, or say to drop the field.

### 2a. Barangay names: fact-check against the official PSGC list (new)
I checked `supabase/seed/barangays.sql` against the official PSA PSGC names for Catbalogan City (57 barangays), via [PhilAtlas](https://www.philatlas.com/visayas/r08/samar/catbalogan.html), on 2026-10-06. The PSA page itself ([psa.gov.ph](https://psa.gov.ph/classification/psgc/barangays/0806005000)) blocks automated reads, so double-check it there.

These seed names differ from the official ones:

| Seed (`name`) | Official PSGC name | Seed id (kept) |
|---|---|---|
| Poblacion 1 … Poblacion 13 | Poblacion 1 (Barangay 1) … Poblacion 13 (Barangay 13) | `poblacion-01` … `poblacion-13` |
| Canlapwas | Canlapwas (Poblacion) | `canlapwas` |
| Muñoz | Muñoz (Poblacion 14) | `munoz` |
| Guindapunan | **Guindaponan** | `guindapunan` |
| Bunu-anan | **Bunuanan** | `bunu-anan` |
| Darahuway Guti | **Darahuway Gote** | `darahuway-guti` |
| Darahuway Dako | **Darahuway Daco** | `darahuway-dako` |

- The WSP spellings may be local usage, so the app keeps them as **search aliases**. The app shows the official name and keeps your ids, so nothing breaks.
- **Ask:** update `name` in the seed to the official spelling, or tell Dev B which one you want shown.
- Silanga **is** a Catbalogan barangay; it's just not one of the 26 CWD serves.

### 2b. Onboarding now covers all 57 Catbalogan barangays — what do unserved ones see? (new)
- The resident onboarding is now a **searchable dropdown** instead of a 26-row scroll list. It's limited to Catbalogan City for now.
- It matches official names, numbers ("5" finds Poblacion 5 / Barangay 5) and old spellings ("Munoz", "Darahuway Dako").
- It lists all **57** barangays (`apps/web/src/data/barangays.ts`, with a `served` flag), not just the 26 CWD serves.
- The other 31 are outside the piped network (spec 03 `service_level: "unserved"`). For now they get the same system-wide status and backup-source plan as everyone else.
- **Ask:** what status should an unserved barangay get from the backend? Options:
  - (a) Same system signal, since their backup sources get busier too.
  - (b) A separate "not on the piped network" state.
  - (c) Leave them out of status entirely.

### 2c. `AffectedArea` in shared-types doesn't match spec 03 (new)
- Spec 03 makes `piped_households_affected` / `unpiped_households_affected` **nullable**, because the WSP has no household counts.
- `packages/shared-types/src/schemas/affected-area.ts` still has them required.
- The app follows the spec: a barangay with null counts shows "coverage unknown" on the LGU screen. Maulong is the sample.

### 3. Status data the screens show that no table holds yet
The resident, captain and LGU screens need these per disruption. `disruptions` / `NotificationPayload` don't have them yet (`expected_duration_hint` is only a string).

| Field | Used for |
|---|---|
| `window_start`, `window_end` | "Back today between 4–7 PM" |
| `likely_at` | "Most likely 5:30 PM" |
| `next_update_at` | "Next update by 10:00 AM" |
| `heads_up_from` | "Likely to stop from 2 AM" (signal 1–2) |
| `restored_at` | "Water's back at 5:05 PM" screen, record duration |

**Ask:** add these to `disruptions` (or a view), or tell Dev B where they'll come from. The app's expected per-barangay shape is `BarangaySnapshot` in `apps/web/src/data/mock.ts`: status, detail, ranked sources, storage plan, captain day.

### 4. Edge Functions the app is wired to call
All backend calls go through **one file**, `apps/web/src/actions/lgu.ts`. Each function already checks its input against the spec 06 schemas. Replace the `TODO(Dev A)` lines:

| Function in app | Input | Your Edge Function should |
|---|---|---|
| `confirmAllocation` | `AllocationDecision[]` (with `overridden_from_suggested_rank`) | write `allocations` + `deployed` event |
| `deployResponse` | `DeployResponse` | record the deployed source |
| `notifyResidents` | `NotificationPayload[]` | PWA push + Semaphore SMS, `notified` event (AC: under 10 s on seed) |

The offline queue sync is a separate seam in `apps/web/src/offline/sync.ts`:
- **Order:** push `pending` items in `queued_at` order.
- **Idempotency:** use `local_id` as the idempotency key.
- **When:** run on app start and on the browser's "online" event.

Item kinds:
- `reading`: `OperatorReadingForm` + `treated_turbidity_ntu` + `recorded_at`
- `resident_confirmation`: `ResidentConfirmation` (spec 06)

### 5. Rules the server must enforce (spec 06 AC3–AC4)
- Only `ResidentConfirmation.restored === true` may move a disruption to `resolved`.
- `restored === false` must **not** write `resolved`. The barangay goes back onto the allocation screen; the app tags it "Reported not restored".
- Open question, not specced: a cap or escalation after N "not restored" reports.

### 6. SMS: templates and keywords are ready
- **Templates:** `apps/web/src/copy/sms.ts` holds the `SmsTemplate` rows (EN / FIL / WAR).
  - Every one fits one GSM-7 segment with worst-case values; there's a check in the file.
  - There's no peso sign (use `P25`).
  - The prefix is now **`PIA WATERBACK:`**.
- **`sms-webhook` keywords** (wireframe p.8): `JOIN <code>`, `STATUS`, `SRC`, `STORED`, `THANKS`, `OPEN <gallons>`, `OUT`, `CLOSED`.
- **Copy location:** the templates live in the web app today. Move them to `packages/shared-types` if your function needs to import them.

### 7. Signal level → what residents see (proposal, please confirm)
No spec defines it. The app uses `apps/web/src/lib/waterState.ts`:

| Signal | Resident screen |
|---|---|
| 0 | Flowing |
| 1–2 | Heads-up ("Store water tonight") |
| 3–4 | Interrupted, or "Planned repair" when `cause = repair` |

### 8. Officer identity
`officer_id` is a mock (`mock-officer-1`, shown as "[Officer name]" like the wireframe) until the LGU seed accounts / Supabase Auth exist. Tell Dev B the auth approach and the screen will read the signed-in officer.

With the predictor now system-wide (`scope: "system"`), every served barangay gets the same level. Per-barangay differences only come after allocation. For example, a barangay whose residents confirmed water is back shows "Water's back".

## Done on the Dev B side (FYI, no action)

- **Aligned with your CWD 2022 WSP review** (`1b396e2`, `docs/wsp_findings.md`):
  - **Spec 05 / intakes:** spec 05 is copied verbatim; operator readings are per intake, as in item 1.
  - **Constants:** the app now uses `TURBIDITY_LIMIT_NTU` (5) and `TURBIDITY_SHUTOFF_NTU` (500), with the clarifier at 46.3 L/s. `TURBIDITY_WARNING_NTU` and `TURBIDITY_SHUTDOWN_NTU` are gone. The page citations are in the operator footnote.
  - **500 NTU shut-off:** shown only for **Caramayon I**, as a source shut-off (badge, chart line, detector signal). Kulador above 5 NTU shows "treat through the clarifier".
  - **Barangays:** the picker lists your 26 seeded barangays with the same ids. Silanga, which isn't a CWD barangay, is gone from the sample data; Maulong is the "coverage unknown" example, and Payao is marked Level I.
  - **System-wide predictor:** sample status uses one system-wide scenario for all barangays (`DEMO_SYSTEM` in `apps/web/src/data/mock.ts`). Payao stays "Water's back" as the post-allocation example.

- **Renamed to PIA WaterBack** in the app, the PWA manifest (home-screen name "WaterBack"), `DESIGN.md`, `.impeccable/design.json`, the concept doc and the code-structure docs.
  - The wireframes PDF still says Tubig Patas.
  - The local IndexedDB is now `pia-waterback`.
- **Barangay-level everywhere:** specs 05–07 and the app use `barangay_id`, matching your schema.
- **Spec 06 `confirmed_by`:** now `"barangay_captain"`, matching `packages/shared-types`. On screen the role reads "Barangay water captain".
- **Spec 03 rule:** the LGU screen labels estimated off-network counts "estimate" and shows "coverage unknown" with no number.
- **Contract copies:** the app keeps them in `apps/web/src/contracts/` because it uses **zod 4** and `shared-types` uses **zod 3**.
  - Spec 05's `z.record(z.unknown())` has to be `z.record(z.string(), z.unknown())` in zod 4.
  - Dev B will switch the imports to `@pia/shared-types` once the versions line up. Your call whether shared-types moves to zod 4.
- **Sample data:** every screen runs on sample data marked `// MOCK:` in `apps/web/src/data/mock.ts` and `mockLgu.ts`. That sample data is where to look for the shapes the screens expect.

## Screens built (for reference)

| Route | Spec | Wireframe |
|---|---|---|
| `/` resident status, `/sources`, `/settings` | 05 | p.4, p.5 |
| `/` "Water's back" (resolved barangay) | 06 | p.6 |
| `/captain` | 05, 06 | p.7 |
| `/operator` | 05 | p.9 |
| `/lgu` allocation | 06 | p.10 |
| `/lgu/event` event record + allocation log | 06, MEM-1 | p.11 |
| `/admin` | 07 (placeholder) | — |
