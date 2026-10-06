# Sprint plan — spec-driven build, 24 hours

Oct 6, 2026 · @Rolf Genree

## How spec-driven development runs here

No one writes implementation code until its spec is locked. A spec is a single markdown file in `/specs`, short enough to write and review in 15 minutes, answering four questions: what does this do, what goes in and out (as a Zod/TypeScript shape), how do we know it works (a bullet list of acceptance criteria), and what's explicitly out of scope for the 24 hours. The other dev reads and okays it before code starts — that's the whole review process; there's no time for anything heavier.

**Definition of Ready** (a spec can be built from): the data contract is typed, acceptance criteria are written as testable bullets (not "works correctly"), and it names which other specs it depends on.

**Definition of Done** (a feature is built): it passes its own acceptance criteria against the seed data, it's deployed to the dev URL (not just running locally), and it's been demoed live to the other dev in under two minutes. If a feature can't clear its own spec's bullets, it doesn't ship — cut scope on the spec, don't ship an unverified feature.

**Spec template** (copy this for every file in `/specs`):

````markdown
# Spec: <feature name>

## What it does
One or two sentences.

## Data contract
```ts
// Zod schema or TS type for input/output
```

## Acceptance criteria
- [ ] ...
- [ ] ...

## Out of scope
- ...

## Depends on
- specs/<other-file>.md
````

## Spec backlog

Nine specs cover every P0 feature from the final concept. Write and lock all nine in hour 0–1 (a paragraph each is enough at that stage); build order follows the dependency column.

| # | Spec file | Covers (PIA phase → feature) | Owner | Depends on |
| --- | --- | --- | --- | --- |
| 00 | `00-data-model.md` | Foundation: readings, disruptions, sources, continuity\_chains, allocations, event\_log tables | Dev A | none — build first |
| 01 | `01-seed-data.md` | Foundation: CWD WSP constants, simulated July readings, Open-Meteo pull | Dev A (data sourced by Teammate 3) | 00 |
| 02 | `02-disruption-predictor.md` | Prevention/Intervention: predict turbidity-risk and drought-risk probabilities via logistic regression; repair work stays operator-logged | Dev A | 00 |
| 03 | `03-affected-area-mapping.md` | Intervention: which puroks/barangays are hit, including unpiped households | Dev A | 00, 02 |
| 04 | `04-continuity-ranking.md` | Intervention: rank backup sources per purok, safety → time → cost | Dev A | 00, 03 |
| 05 | `05-operator-pwa.md` | Prevention + client shell: operator dashboard, resident/captain PWA, offline queue | Dev B | 00, 08 |
| 06 | `06-allocation-and-notify.md` | Action: LGU allocation screen, resident notification (PWA + SMS), event log | Dev B (API from Dev A) | 02, 03, 04, 05, 08 |
| 07 | `07-admin-dashboard.md` | Action: CDRRMO/partner dashboard, realtime subscription | Dev B | 06, 08 |
| 08 | `08-ui-ux-guidelines.md` | Cross-cutting: offline/low-bandwidth states, elderly & PWD-friendly layout, Waray/Filipino/English copy, SMS template limits | Teammate 3 (with Dev B) | none — write first, informs 05, 06, 07 |

Each spec's acceptance criteria get checked against the seed data from `01-seed-data.md` — never against live CWD numbers, which we won't have during the event.

## Disruption predictor — model design

**What it predicts.** Two independent probabilities per purok, not one multi-class label: `p_turbidity` (a turbidity-driven interruption within the next 24–48h) and `p_drought` (a drought-driven shortage within the next 7 days). Repair work stays out of the model entirely — it's operator-scheduled or mechanical, not forecastable from environmental readings, so it stays a manual log entry per spec 02.

**Why two small models, not one big one.** The two failure modes run on different clocks (hours vs. weeks) and different drivers (rainfall/turbidity vs. reservoir trend/dry-spell length). Two independent binary models keep each one simple, fast to train, and easy to explain on stage: one number, one meaning — not "the model decided."

**Model: L2-regularized logistic regression** (scikit-learn `LogisticRegression`, `class_weight='balanced'` for the rare-event imbalance), one per failure mode. Chosen over a neural net or gradient-boosted trees for three reasons that matter more here than raw accuracy: it trains in under five seconds on a laptop with no GPU; inference is one dot-product and a sigmoid, portable to a Supabase Edge Function as about fifteen lines of hand-written TypeScript with no Python runtime at inference time; and every coefficient is a feature weight that reads off a slide — the same "explainable, no black box" position already committed to for the allocation engine, now extended to prediction.

**Features — turbidity model** (hourly): current turbidity (NTU) · turbidity slope over the last 6 readings (NTU/hour) · rainfall, last 24h and last 72h (mm, Open-Meteo) · clarifier utilization = inflow ÷ 46 L/s rated capacity (2022 WSP).

**Features — drought model** (daily): reservoir level (% of 340 m³ usable capacity, WSP) · 7-day reservoir trend (%/day) · rainfall, trailing 14 and 30 days (mm) · days since last rainfall event >5mm.

**Training data — stated plainly.** Catbalogan has no public historical log of actual disruption events, and building one in 24 hours isn't possible. The model trains on a physics-informed synthetic dataset: a generator samples thousands of plausible rainfall/turbidity/reservoir trajectories — rainfall drawn from Open-Meteo's real historical distribution for Catbalogan, turbidity and reservoir response simulated with noise around the WSP's own real thresholds (turbidity >500 NTU forces a shutdown; the clarifier can't exceed 46 L/s) — and each simulated day is labeled by those same real thresholds. The model then learns a smoothed, continuous probability curve approaching that hard threshold instead of only firing at the cliff edge, which is the actual value ML adds over the WSP's own deterministic rule: an earlier, graded warning instead of a binary alarm. State this plainly if asked — synthetic but physically grounded, not real incident history; swapping in real incident logs later changes the training set, not the architecture.

**Output → signal level** (reuses the PAGASA-style 0–4 scale from earlier sessions): p < 0.2 → Level 0 · 0.2–0.4 → Level 1 · 0.4–0.6 → Level 2 · 0.6–0.8 → Level 3 · p ≥ 0.8 → Level 4. A purok's overall signal is the higher of its two levels.

**Acceptance criteria for spec 02:**

- [ ] Trained and evaluated on a held-out 20% split of the synthetic set
- [ ] Recall ≥ 0.85 on the positive class at the chosen threshold — tuned toward recall on purpose: a missed warning costs more than a false alarm here
- [ ] Coefficients committed to the repo as human-readable JSON, never a pickled binary
- [ ] Documented fallback: a missing feature (sensor gap) drops to the WSP's deterministic threshold rule rather than guessing — consistent with the graceful-degradation design everywhere else in the system

```python
# ml/train_predictor.py — run once during H2.5–8, output committed to the repo
from sklearn.linear_model import LogisticRegression
import json

model = LogisticRegression(class_weight='balanced', max_iter=1000)
model.fit(X_train, y_train)  # X_train: synthetic feature rows, y_train: threshold-derived labels

json.dump({
    'bias': model.intercept_[0],
    'weights': dict(zip(FEATURE_NAMES, model.coef_[0])),
}, open('predictor_coefficients.json', 'w'), indent=2)
```

```ts
// supabase/functions/disruption-predictor/model.ts — generated from predictor_coefficients.json, never hand-edited
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function turbidityRisk(f: TurbidityFeatures): number {
  const z = W.bias
    + W.turbidity * f.turbidity
    + W.turbiditySlope * f.turbiditySlope
    + W.rain24h * f.rain24h
    + W.rain72h * f.rain72h
    + W.clarifierUtil * f.clarifierUtil;
  return sigmoid(z);
}
```

## Sprint timeline

&#91;embedded content: 4 phases, 2 integration gates, 1 dry-run — H0 to H24\]

Every feature gets built once — there's no sprint 2 to catch what sprint 1 missed. The two gates are where the team stops and checks that the backend and frontend actually talk to each other before going further into scope.

## Hour-by-hour schedule

| Hours | Dev A (backend/data) | Dev B (frontend/client) | Teammate 3 | Gate |
| --- | --- | --- | --- | --- |
| H0–1 | Write specs 00, 02, 03, 04 with the team | Write specs 05, 06, 07 with the team | Write specs 01 and 08; open GitHub issues for all nine | — |
| H1–2.5 | Supabase project, `00-data-model.md` migration, RLS skeleton, LGU seed accounts, load `01-seed-data.md` | Vite/PWA scaffold, routing, Tailwind tokens, repo structure | Compile source numbers for `01-seed-data.md`: WSP constants, plausible July readings — handed to Dev A to load, no code | — |
| H2.5–8 | Build 02 (disruption predictor: train + port logistic regression) and 03 (affected-area mapping) against seed data | Build 05: operator dashboard entry UI + resident/captain PWA shell + offline queue stub | Draft demo script v1; start judge Q&A prep from the comparison table in the main tab | **Integration 1** (end of block): Dev B's dashboard can call Dev A's live predictor endpoint and show a real predicted risk level |
| H8–14 | Build 04 (continuity ranking) and the allocation/notify/event-log API half of 06 | Build the UI half of 06 (allocation screen, resident notification view) and start 07 (admin dashboard) | Build pitch deck outline from the merged concept; keep refining Q&A prep | **Integration 2** (end of block): a seeded disruption flows end-to-end — predicted, mapped, ranked, allocated, and a resident sees a notification |
| H14–16 | Dev A rests H14–15, then reviews Dev B's 06/07 work | Dev B rests H15–16, then reviews Dev A's work | Keeps testing against each spec's acceptance criteria as it lands | — |
| H16–19 | Finish 07 (realtime subscription), re-seed with full CWD WSP constants | SMS roundtrip test (Semaphore), offline-sync test (airplane mode → reconnect) | Full dry-run, timed to 5 minutes | **Demo dry-run**: the live-stage demo moments (offline sync, allocation override, SMS reply) all work without a developer typing SQL to fix them |
| H19–21 | Bug fixes only — no new specs | Bug fixes only, Waray/Filipino copy pass | Judge Q&A rehearsal — grills both devs as a water-district engineer would | — |
| H21–23 | Freeze backend, deploy final build, smoke-test prod URL | Freeze frontend, deploy final build, smoke-test prod URL | Record backup demo video; finalize deck | — |
| H23–24 | Buffer | Buffer | Final rehearsal, all three, full run-through | — |

## Checkpoint gates and fallbacks

A gate isn't a status meeting — it's a pass/fail check against the specs' own acceptance criteria. If a gate fails, cut scope immediately rather than pushing the fix into the next block; the schedule has no slack built in except the H23–24 buffer.

| Gate | Pass means | If it fails |
| --- | --- | --- |
| Integration 1 (≈H8) | Dashboard calls the live disruption-predictor endpoint and renders a real risk probability (not mock data) | Drop spec 03's "unpiped households" layer to P1 and ship prediction + piped-area mapping only |
| Integration 2 (≈H14) | A seeded disruption flows detected → mapped → ranked → allocated → resident notified, with no manual database edits in between | Drop the hash-chain upgrade entirely (already P1); drop SMS and demo app-only; keep the allocation screen — it's the strongest judge-facing feature |
| Demo dry-run (≈H19) | Every planned on-stage demo moment (offline sync, SMS reply, allocation override) works twice in a row without a dev intervening | Pick the two most reliable moments for the live demo and show the third as the recorded backup video instead of live |

## Repo and spec folder setup

```
tubig-patas/
  specs/
    00-data-model.md
    01-seed-data.md
    02-disruption-predictor.md
    03-affected-area-mapping.md
    04-continuity-ranking.md
    05-operator-pwa.md
    06-allocation-and-notify.md
    07-admin-dashboard.md
    08-ui-ux-guidelines.md
  apps/
    web/                     # React + Vite PWA: resident/captain, operator, admin routes
  ml/
    train_predictor.py      # scikit-learn LogisticRegression x2, synthetic data generator
    predictor_coefficients.json   # exported weights, checked in, human-readable
  supabase/
    migrations/              # one file per schema change, numbered
    functions/               # disruption-predictor, rank-chain, allocate, notify, sms-webhook
    seed/
      cwd_wsp_constants.sql  # cited to the 2022 WSP, per spec 01
      july_readings.sql      # simulated, per spec 01
      openmeteo_rainfall.ts
  packages/
    shared-types/            # Zod schemas imported by both web and functions
  .env.example
```

Setup order for H1–2.5, Dev A driving while Dev B scaffolds `apps/web` in parallel:

1. `npm create vite@latest apps/web -- --template react-ts`, add `vite-plugin-pwa`, Tailwind
2. Create the Supabase project (free tier), enable the **PostGIS** extension
3. `supabase init`, write migration 001 per `00-data-model.md`
4. Put every magic number from `01-seed-data.md` (NTU thresholds, the 30-minute JMP benchmark, clarifier capacity) into `packages/shared-types` as named constants, each commented with its source
5. `.env.example` with placeholders only — never commit real keys
6. Branch strategy: trunk-based, commit to `main` directly once a spec's own acceptance criteria pass locally — there's no time for a PR review cycle; the spec file stands in for review
7. Skip CI/CD setup entirely — not worth the time against a rubric that cares the system runs, not that it has green checkmarks
