# Spec: Disruption predictor

## What it does
Outputs two independent, SYSTEM-WIDE probabilities (the network is blended: all intakes feed Kulador, CWD 2022 WSP pp.12, 15; spec 03 fans the signal out to barangays) — `p_turbidity` (a turbidity-driven interruption within 24–48h) and `p_drought` (a drought-driven shortage within 7 days) — via two small L2-regularized logistic regression models, trained on a physics-informed synthetic dataset grounded in CWD's real 2022 WSP thresholds (the drought model is our extension: the WSP has no drought hazard), mapped to a 0–4 signal level. Repair work is never predicted; it stays an operator-logged `disruptions.cause = "repair"` entry.

## Data contract
```ts
import { z } from "zod";

// Turbidity features come from Kulador (and Caramayon I) intake readings.
export const TurbidityFeatures = z.object({
  turbidity_ntu: z.number(),
  turbidity_slope_per_hr: z.number(),       // over the last 6 readings
  rain_24h_mm: z.number(),                   // Open-Meteo
  rain_72h_mm: z.number(),
  forecast_rain_48h_mm: z.number().nonnegative(), // forecast rain in (as_of, as_of+48h], Open-Meteo hourly
});
// order: ["turbidity_ntu","turbidity_slope_per_hr","rain_24h_mm","rain_72h_mm","forecast_rain_48h_mm"]

export const DroughtFeatures = z.object({
  reservoir_pct: z.number().min(0).max(100), // % of 340 m³ usable capacity (WSP p.13)
  rain_14d_mm: z.number(),
  rain_30d_mm: z.number(),
  days_since_rain_over_5mm: z.number().int().nonnegative(),
});
// order: ["reservoir_pct","rain_14d_mm","rain_30d_mm","days_since_rain_over_5mm"]

export const PredictorOutput = z.object({
  scope: z.literal("system"),               // system-wide; no barangay_id
  p_turbidity: z.number().min(0).max(1),
  p_drought: z.number().min(0).max(1),
  signal_level: z.number().int().min(0).max(4), // max of the two levels below
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  computed_at: z.string().datetime(),
  fallback_used: z.boolean(), // true when a missing feature forced the WSP deterministic rule
  forecast_source: z.enum(["seeded", "live", "missing"]).optional(), // origin of forecast_rain_48h_mm; "missing" -> turbidity WSP fallback, fallback_used=true
});

export const PredictorCoefficients = z.object({
  bias: z.number(),
  weights: z.record(z.number()), // keyed by feature name, matches FEATURE_NAMES
});
```

Signal-level mapping (reused on both models, applied independently then combined by `max`):
`p < 0.2 → 0 · 0.2–0.4 → 1 · 0.4–0.6 → 2 · 0.6–0.8 → 3 · p ≥ 0.8 → 4`

## Labels (training)
- **turbidity** = 1 if within the next 48 h Kulador raw turbidity >= 250 NTU (degraded: shut-off 500 NTU x 50% filtration capacity, WSP pp.43, 22; derived assumption) OR Caramayon I turbidity >= `TURBIDITY_SHUTOFF_NTU` (500, WSP p.43).
- **drought** = 1 if within the next 7 days the daily-minimum reservoir level falls below 20% for supply reasons (spring-yield shortfall; outage- and turbidity-caused drops are excluded via a supply-only counterfactual). **20% is our ASSUMPTION**: the WSP has no drought hazard.
- Feature definitions: turbidity slope = least-squares slope over the last 6 hourly Kulador readings (NTU/h); `forecast_rain_48h_mm` = sum of forecast hourly precipitation for (as_of, as_of+48h] (training: actual future rain x lognormal error sigma 0.5 + 10% misses / 10% false alarms, ASSUMPTIONS in `ml/wsp_constants.py`); `reservoir_pct` (drought) = daily mean level; rain windows = trailing hours/calendar days incl. now/today.
- `days_since_rain_over_5mm`: calendar days (Asia/Manila) since the most recent day with >= 5 mm; 0 if today >= 5 mm; if no such day exists in the available history, the number of calendar days of history available **counting today, starting from the first fully covered day** (1 day of history, no wet day -> 1). Lower bound; no other cap. Identical on the trainer (`synthetic.days_since_big_rain`) and the Edge Function.
- v2 removed `clarifier_utilization` (counter-intuitive sign) and `reservoir_trend_pct_per_day` (collinear with `reservoir_pct`). Every coefficient must have the physically intuitive sign: turbidity all positive; drought `reservoir_pct`, `rain_14d_mm`, `rain_30d_mm` negative, `days_since_rain_over_5mm` positive.

## Decision threshold and coefficient file
- **Decision threshold = 0.4** (signal level >= 2, the operational trigger consumed by spec 03). It is fixed and never tuned; `class_weight='balanced'` only (no positive-class boost); C picked by grouped CV AUC.
- Weights are trained on standardized features, then **folded into raw-unit coefficients** so inference is `sigmoid(bias + sum(weight * raw_feature))`, no scaler needed. `ml/predictor_coefficients.json`:
  `{version, trained_at, seed, training_data, signal_level_thresholds: [0.2,0.4,0.6,0.8], decision_threshold: 0.4, turbidity: {features, bias, weights, metrics}, drought: {...}}`; each model block maps onto `PredictorCoefficients` (`bias`, `weights`) above; `metrics` = `{recall, precision, roc_auc, n_test, positive_rate}` on the held-out 20%.
- `ml/predictor_test_vectors.json`: 25+ vectors per model (`{features, p}`, incl. extremes); the TS implementation must reproduce each `p` (|diff| < 1e-9).
- The output is a class-balanced risk score, not a calibrated probability.
- Fallback on a missing feature (WSP deterministic rule, `fallback_used: true`) is owned by the TypeScript side: see `supabase/functions/disruption-predictor`. A missing forecast (`forecast_source: "missing"`) makes turbidity use the WSP fallback with `fallback_used: true`; `forecast_source` is `seeded` (rows from `rain_forecast_hourly`, as_of <= 2026-07-29T23:00+08:00), `live` (Open-Meteo) or `missing`.
- Human-readable explanation, v1 vs v2 table, pitch wording: `docs/predictor.md`.
- Training/evaluation detail and the full assumption list: `ml/reports/training_report.md`; July 2026 demo replay: `ml/reports/july_2026_replay.md`. Reproduce: `ml/.venv/bin/python ml/train_predictor.py`.

## Acceptance criteria
- [x] Trained and evaluated on a held-out 20% split (by trajectory, stratified). Evidence: `ml/train_predictor.py`; turbidity n_test 36,000 (pos. rate 0.357), drought n_test 6,000 (0.188).
- [ ] **Turbidity recall >= 0.85 on the held-out set at p >= 0.4, no class boost. NOT MET: 0.845** (precision 0.786, ROC-AUC 0.936). Drought: recall 0.964 (met). Reported, not tuned: with forecast sigma 0.3 it would be 0.893, sigma 0.8 gives 0.813 (`ml/reports/training_report.md`).
- [x] Precision >= 0.65 on both models. Evidence: turbidity 0.786, drought 0.740 (v1: 0.531 / 0.758).
- [ ] **July 2026 replay: turbidity p >= 0.4 on < 20% of non-event hours. NOT MET: 21.7%** with the oracle archive forecast (14.7% when the 48-72 h pre-event band is excluded); median 25.9% with noisy forecasts (`ml/reports/july_2026_replay.md`).
- [ ] **All coefficient signs intuitive. NOT MET: `turbidity_slope_per_hr` = -0.00089** (tiny, collinear with `turbidity_ntu`; reported, not forced). Drought: all four correct. `ml/test_train_predictor.py` asserts all signs and currently fails on this one.
- [x] Coefficients committed as human-readable JSON (`ml/predictor_coefficients.json`), never a pickled binary
- [ ] Turbidity above the 5 NTU limit is the WSP's treat/bypass trigger; a reading `>= 500` NTU at the Caramayon I source is a temporary source shut-off (p.43) and forces `turbidity_level` 4 (TypeScript side: `supabase/functions/disruption-predictor`)
- [ ] A missing feature (sensor gap) drops the prediction to the WSP's deterministic threshold rule rather than guessing, and sets `fallback_used: true` (TypeScript side)
- [ ] `signal_level` equals the higher of `turbidity_level` and `drought_level`, never an average (TypeScript side)
- [x] Test vectors for TS parity exported (`ml/predictor_test_vectors.json`, 25+ per model, v2 feature lists; match the sklearn pipeline within 1e-9, `ml/test_train_predictor.py`)
- [x] WSP constants in `ml/` match `packages/shared-types/src/constants.ts` (`ml/test_constants_parity.py`)

## Out of scope
- Multiclass cause classification beyond turbidity/drought (repair stays manual)
- Online/continuous retraining during the event
- Per-barangay prediction (system-wide only; spec 03 distributes it)
- Any claim that the training data is real incident history — it's synthetic but physically grounded; state this plainly if asked

## Depends on
- specs/00-data-model.md
2026-10-06: aligned with CWD 2022 WSP (see docs/wsp_findings.md)
2026-10-06: trained predictor: label definitions, 0.4 decision threshold, folded raw-unit coefficient JSON, test vectors; acceptance criteria ticked with evidence (ml/)
2026-10-06: v2 — forecast rain feature, removed collinear features, precision gate
