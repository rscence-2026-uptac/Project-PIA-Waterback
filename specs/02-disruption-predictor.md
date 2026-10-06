# Spec: Disruption predictor

## What it does
Outputs two independent probabilities per purok — `p_turbidity` (a turbidity-driven interruption within 24–48h) and `p_drought` (a drought-driven shortage within 7 days) — via two small L2-regularized logistic regression models, trained on a physics-informed synthetic dataset grounded in CWD's real 2022 WSP thresholds, mapped to a 0–4 signal level. Repair work is never predicted; it stays an operator-logged `disruptions.cause = "repair"` entry.

## Data contract
```ts
import { z } from "zod";

export const TurbidityFeatures = z.object({
  turbidity_ntu: z.number(),
  turbidity_slope_per_hr: z.number(),       // over the last 6 readings
  rain_24h_mm: z.number(),                   // Open-Meteo
  rain_72h_mm: z.number(),
  clarifier_utilization: z.number().min(0).max(2), // inflow ÷ 46 L/s rated capacity
});

export const DroughtFeatures = z.object({
  reservoir_pct: z.number().min(0).max(100), // % of 340 m³ usable capacity
  reservoir_trend_pct_per_day: z.number(),    // 7-day trend
  rain_14d_mm: z.number(),
  rain_30d_mm: z.number(),
  days_since_rain_over_5mm: z.number().int().nonnegative(),
});

export const PredictorOutput = z.object({
  purok_id: z.string(),
  p_turbidity: z.number().min(0).max(1),
  p_drought: z.number().min(0).max(1),
  signal_level: z.number().int().min(0).max(4), // max of the two levels below
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  computed_at: z.string().datetime(),
  fallback_used: z.boolean(), // true when a missing feature forced the WSP deterministic rule
});

export const PredictorCoefficients = z.object({
  bias: z.number(),
  weights: z.record(z.number()), // keyed by feature name, matches FEATURE_NAMES
});
```

Signal-level mapping (reused on both models, applied independently then combined by `max`):
`p < 0.2 → 0 · 0.2–0.4 → 1 · 0.4–0.6 → 2 · 0.6–0.8 → 3 · p ≥ 0.8 → 4`

## Acceptance criteria
- [ ] Trained and evaluated on a held-out 20% split of the synthetic set
- [ ] Recall ≥ 0.85 on the positive class at the chosen threshold — tuned toward recall on purpose: a missed warning costs more than a false alarm here
- [ ] Coefficients committed to the repo as human-readable JSON (`ml/predictor_coefficients.json`), never a pickled binary
- [ ] A missing feature (sensor gap) drops the purok to the WSP's deterministic threshold rule rather than guessing, and sets `fallback_used: true`
- [ ] `signal_level` for a purok equals the higher of `turbidity_level` and `drought_level`, never an average

## Out of scope
- Multiclass cause classification beyond turbidity/drought (repair stays manual)
- Online/continuous retraining during the event
- Any claim that the training data is real incident history — it's synthetic but physically grounded; state this plainly if asked

## Depends on
- specs/00-data-model.md
