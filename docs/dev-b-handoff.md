# Dev B → Dev A handoff

Changes from the frontend side (specs 05–08) that touch the backend, plus what the screens expect from you. Newest first. Reply inline or in the PR, and tick items off as they're settled.

Last updated: 2026-10-06 · branch `des`

## Action needed from Dev A

### 1. Plant-wide readings can't satisfy the `readings.barangay_id` FK — decide
- The operator logs one reading for the **Antiao intake** (wireframe p.9), not per barangay. Spec 05's `OperatorReadingForm` still needs `barangay_id`, and `readings.barangay_id` is a FK to `barangays`.
- **For now:** the app sends `barangay_id: "antiao-intake"` (`apps/web/src/data/mock.ts`, `PLANT_INTAKE_ID`). **That insert will fail the FK.**
- **Options:**
  - (a) Seed an `antiao-intake` row (but it isn't a barangay).
  - (b) Make `readings.barangay_id` nullable and add `intake_id`.
  - (c) Fan one reading out to every barangay the intake serves.
- **Dev B leans (b).** Whichever you pick, spec 05's contract changes too, so tell Dev B.

### 2. Treated turbidity isn't in the contract — add a column or drop it
- The operator form (wireframe p.9) has **Treated turbidity (NTU)**, checked against the 5 NTU WSP limit.
- It's queued as `payload.treated_turbidity_ntu` but isn't in `Reading` / `readings`.
- **Ask:** add `treated_turbidity_ntu numeric check (>= 0)` to `readings` and `Reading`, or say to drop the field.

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

## Done on the Dev B side (FYI, no action)

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
