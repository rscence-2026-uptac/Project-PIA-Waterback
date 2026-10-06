# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Live mode & demo clock

**Env setup.** Create `apps/web/.env.local` (gitignored, never commit it):

```
VITE_SUPABASE_URL=https://vxlaitnrhlucsmqkjofp.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>   # supabase projects api-keys --project-ref vxlaitnrhlucsmqkjofp
```

Anon key only. The service-role key must never go in the app. `isLive()` (`src/api/client.ts`) is true only when both vars are set.

**Fallback.** Without the vars nothing breaks: every screen keeps using the sample data in `src/data/*` (the status mock, the simulated event feed, the sample allocation list), and write actions show their "not connected yet" state. In live mode a failed request shows the cached last status (offline-stale) or the error state, never silent sample data.

**Demo clock.** One `asOf` instant (`src/demo/`) is shared by every screen, sent as `as_of` to every Edge Function and used as the end of every REST window. Order: URL `?as_of=2026-07-21T22:00+08:00` or `?scenario=late-july|event|crisis|now`, then the value remembered on the phone, then real now. Add `?demo=1` (or `VITE_DEMO=1`) for the floating control (bottom-left, above the tab bar; Escape closes it): Late-July spell (19 Jul 18:00), Event (21 Jul 22:00), Crisis (2 Jul 06:00), Now, step -3 h / +3 h / +1 d, and "Run monitor at this time", which POSTs `disruption-monitor {as_of}` so the disruption and heads-up exist at the demo time. `?demo=0` hides it again. The panel also has "Open demo phone (new tab)". `dashboard-snapshot` now takes the clock too: `as_of` (plant status and event cut-off, `generated_at = as_of`) plus `live_events=1` so allocation / notify / confirmation events, which are stamped at real time, are not hidden by a replayed past clock (redeploy `dashboard-snapshot`).

**API layer** (`src/api/`): `endpoints.ts` has one typed function per Edge Function (predictor, affected-areas, dashboard-snapshot, rank-chain, disruption-monitor, spec 06 writes, sync-queue); `rest.ts` reads `sources`, `readings`, `rainfall_hourly`; `status.ts` builds the resident `BarangaySnapshot` (extra fields: `resident_state`, `heads_up_urgency`, `prediction` with drivers and operator_actions, `interruption_observed`); `allocation.ts` and `operator.ts` feed the LGU and operator screens. Offline queue: `src/offline/sync.ts` posts to `sync-queue` on start, on `online` and right after a save.

**Live vs sample (live mode).** `/lgu/event` is built from the backend (`disruptions`, `event_log`, `allocations`, `continuity_chains`, `sms_outbox`; `src/api/eventRecord.ts`, `src/screens/lgu/LiveEventRecord.tsx`) and refreshes on `event_log` inserts; without the Supabase vars the wireframe sample record is shown. The storage plan is derived (60 L = 4 people x 15 L, the heads-up rule, plus the disruption's likely time / window). The captain checklist is derived from the water state and labelled "Suggested checklist". Anything with no backend source yet (trucks and partners, operator shift, captain thank-yous and "went to a working source", vulnerable and no-backup household counts, commercial / industrial split, the operator detector and early-warning cards) keeps its sample values and carries a "Sample" chip in live mode (`SampleChip` in `src/ui/Chip.tsx`); sample numbers are never added into live totals.

## Stage demo: phone, why panel, heads-up card

**`/demo/phone`** (lazy route, not in the resident nav; opened from the demo clock control or by URL). A CSS feature-phone with a sender picker (the four demo residents: Lagundi/Waray `+639000000001`, Payao/Filipino `...02`, Darahuway Dako/English `...03`, Darahuway Guti/Waray `...04`), an inbox of `sms_outbox` rows for that number's masked form (latest 20, then Realtime INSERTs; outbound = arrives on the phone, inbound = what the resident typed; "dry run" tag; times in Asia/Manila) and a keypad: THANKS / STATUS / SRC or free text, sent as `POST sms-webhook?demo=1 {from, message}`; the auto-reply lands in the inbox through Realtime (the screen also re-reads the inbox 0.7 s after sending). Without the Supabase keys it says so and the keypad is disabled. It works at phone width and fits next to the LGU screen in a half-width window. Code: `src/demo/phone.ts`, `src/screens/demo/PhoneScreen.tsx`.

**Operator "why" panel** (`/operator`, replaces the sample detector and early-warning cards). Reads `disruption-predictor` at the demo clock: `p_turbidity` / `p_drought`, the signal badge, the top 3 drivers of the leading model (text + bar; risk-raising in coral = share of today's risk, protective in sky = "Lowers the risk"), a callout naming any WSP rule that fired (fallback or the p.43 override), `operator_actions` each with its source chip ("WSP p.44", or "PIA WaterBack recommendation"), and the note "Model: v3 logistic, explainable...". If the response has no `drivers` (older deploy) or the app is not live, the old sample cards stay. Code: `src/screens/operator/WhyPanel.tsx`, `src/lib/drivers.ts`, `src/api/usePrediction.ts`.

**Heads-up card** (`/` and `/captain`, `src/ui/HeadsUpCard.tsx`). Shown when the state is heads-up (`resident_state === "heads_up"`): urgency headline (possible / likely / very likely), "Most likely from {likely_at}" (else "Could happen within the next 48 hours"), "Your water is still on", "Store 60 L now (4 people x 15 L each)", "Why we think so" from the top driver, and a link to `/sources`. It never says "no water" or shows dry-since. The captain gets a compact version, plus "N vulnerable households" when a count exists (sample data only today; the live endpoints return a flag, not a count).

### Stage flow with the demo clock

1. Open four windows or tabs side by side (all with `?demo=1`; the clock is shared through localStorage): `/lgu/live`, `/operator`, `/` (resident, barangay Lagundi) and `/demo/phone` (Lagundi).
2. Open the demo clock and jump to **Late-July spell (19 Jul 18:00)**: everything shows "flowing" / signal 0-1 and the why panel shows low probabilities.
3. Step **+3 h** to 19 Jul 21:00, press **Run monitor at this time**. The monitor creates the predicted disruption and sends the heads-up: the phone gets the heads-up SMS (dry run), the resident screen shows the heads-up card (water still on, store 60 L, likely start, why), and the operator why panel shows the drivers and the WSP actions.
4. Jump to **Event (21 Jul 22:00)**; Kulador is degraded in the readings, so the resident flips to **Interrupted** (state v2: interruption observed) and the why panel updates.
5. On `/lgu` confirm the event, allocate trucks and notify residents. The phone receives the "water is off" notify SMS; `/lgu/live` cards move through confirmed, deployed, notified.
6. On the phone press **THANKS**. `sms-webhook` marks Lagundi restored, the auto-reply appears on the phone, and the resident screen turns into "Water's back".

Needs: live mode (`.env.local`), `sms_outbox` migration, `supabase/seed/demo_residents.sql`, and the functions listed in `docs/dev-a-replies.md` redeployed. Rehearse once against a scratch state; `node scripts/demo/demo.mjs reset --yes` (service role) clears it between runs.
