# Disruption predictor: v3 candidate study (turbidity model)

Status: **candidate, not live.** Live v2 files are untouched. Raw numbers: `ml/reports/v3_comparison.md`, `ml/reports/v3_results.json`. Code: `ml/v3_lib.py`, `ml/v3_eval.py`, `ml/test_v3.py`. Export: `ml/predictor_v3_candidate.json`, `ml/predictor_v3_test_vectors.json`. Everything below is on the **synthetic** plant response (real Catbalogan rain, simulated turbidity); none of it is incident history. Drought model not re-studied.

## Comparison (p >= 0.4; 500 trajectories; test = 100 held-out trajectories)
| model | recall | prec | AUC | Brier | events caught / lead med (p25) h | false-alarm episodes /30d | time-split recall / prec / AUC (train 2016-22, test 2023-25) |
|---|---|---|---|---|---|---|---|
| WSP rule (Kulador > 5 NTU or Caramayon I >= 500) | 1.00 | 0.36 | 0.80 | n/a | 100% (alarm always on) | 0 | 1.00 / 0.41 / 0.80 |
| Reactive rule (Kulador >= 250 NTU now) | 0.28 | 0.97 | 0.80 | n/a | 0% | 0 | 0.27 / 0.97 / 0.80 |
| Rain rule: rain_24h + forecast_48h >= 12.1 mm (F1) | 0.82 | 0.81 | 0.932 | n/a | 97% / 47 (26) | 3.6 | 0.82 / 0.82 / 0.923 |
| Rain rule, X = 11.0 mm (recall 0.85 on train) | 0.845 | 0.78 | 0.932 | n/a | 98% / 49 (29) | 4.1 | 0.83 / 0.81 / 0.923 |
| v2 (live, 5 features) | 0.845 | 0.786 | 0.936 | 0.096 | 98% / 48 (26) | 3.9 | 0.84 / 0.81 / 0.928 |
| **v2a** (v2 minus slope) | 0.846 | 0.786 | 0.936 | 0.096 | 98% / 48 (26) | 3.9 | 0.84 / 0.81 / 0.928 |
| Spline-GAM (4 features, 5 knots, L2) | 0.863 | 0.768 | 0.938 | 0.095 | 99% / 51 (32) | 4.7 | 0.86 / 0.79 / 0.930 |
| HistGB, monotone (comparison only) | 0.873 | 0.761 | 0.940 | 0.095 | 99% / 51 (32) | 4.6 | 0.87 / 0.78 / 0.931 |

Event = onset of a Kulador >= 250 NTU / Caramayon I >= 500 NTU episode (episodes < 48 h apart merged; 448 events, 659 in the time split). Caught = alarm in the 48 h before onset; lead clipped at 72 h. Brier is of the class-balanced score, not a calibrated probability: mean p 0.41 vs base rate 0.36; reliability bins over-predict by 0.03-0.09 (p 0.7-0.8 was observed 0.67). Isotonic recalibration (out-of-fold) gives Brier 0.094 (v2a); raw 0.4 then means about 0.33.

## July 2026 replay, honest forecast (Open-Meteo Previous Runs)
Forecast at hour t = day-1 values for (t, t+24 h] + day-2 values for (t+24, t+48 h], i.e. only runs issued at or before t (conservative). Its 48 h total correlates 0.76 with the archive-rain oracle; July rain 289 mm observed vs 261 mm day-1 forecast.
- v2a / v2: daily max level Jul 1-8 = 4 4 4 1 1 3 4 4, **identical to the oracle forecast**. Truth (Kulador >= 250 NTU): events on Jul 2, 3, 8.
- Alarm on from Jul 1 00:00 unbroken, Kulador onset Jul 2 16:00: lead >= 40 h, **censored** at series start. In a June+July pre-roll the run began about 15 days earlier (wet June, alarm nearly always on), so no lead claim beyond "alarm was already up".
- Late-July wet spell: alarm 57 h before its first event hour (oracle 51 h). All 5 July event episodes caught by every model.
- **Non-event alarm rate 49.0%** (oracle forecast: 21.7%). Gate < 20% fails clearly. Rain rules: 46.9% / 52.4%. GAM 55.5%, GBM 54.5%. WSP rule 100%.

## Forecast data (Previous Runs API)
Usable: `previous_day1..5` exist from 2024-01-19 (about 2.7 years, hourly, 17,000 usable 48 h windows 2024-25), null before; not years of training data. Cached: `ml/data/openmeteo_previous_runs_2026-06-07.json` and `_2024-2025.json`. Against the **archive** (ERA5-type) rain in 2024-25 the honest 48 h forecast is biased low: median 0.40x for >= 10 mm windows, 31% misses (< 20% of actual), log-sd 0.62, corr 0.64. Caution: in Jun-Jul 2026 the "archive" is model-based and matches the forecast (mean 17.4 vs 17.2 mm), so part of the 2024-25 gap may be archive-vs-forecast model mismatch, not forecast error against gauges. Treat it as a stress test, not a skill measurement. In that stress world (same test trajectories) v2a trained on the assumed forecast drops to recall 0.70 (event catch 95%, lead 24 h); retrained on the fitted error it recovers to recall 0.81, precision 0.75, 4.6 false-alarm episodes/30d.

## Sensitivity (v2a trained on base world, tested on shifted world: recall / precision)
Forecast sigma 0.3: 0.87 / 0.79. Sigma 0.8: 0.80 / 0.77. Turbidity gain x0.7: 0.90 / 0.68. Gain x1.3: 0.80 / 0.86. Event catch stays 97-99% throughout. Retraining per world moves v2a recall by -0.04 (gain x0.7) to +0.03 (gain x1.3). GAM tracks v2a within 0.02 everywhere.

## Recommendation: adopt v2a as v3 (no GAM, no GBM)
1. v2a matches v2 on every metric (recall 0.846 vs 0.845, AUC 0.936) while removing the one wrong-signed coefficient; all four weights are positive, so the sign gate passes.
2. GAM/GBM buy +1.7-2.7 points recall for -1.8-2.5 points precision and +0.7-0.8 false-alarm episodes/30d (AUC +0.002-0.004). The GAM shapes are not slide-worthy: forecast g rises 3.9 logits between 0 and 2 mm, turbidity g reaches +109 logits at 2000 NTU, and forecast g dips by up to 0.13 logit (monotonicity violations reported, not forced). Selection rule (time-split AUC gain >= 0.01) not met.
3. The honest result: a one-line rain rule performs the same as the model on this synthetic world. The value of v2a is an explainable, per-feature score with a WSP fallback, not accuracy beyond that rule. Recall gate (0.85) is still missed by 0.004 and the July alarm gate is missed by a wide margin with a real forecast; amend spec 02 gates to measured values, as in option A.

## What changes for the Edge Function port
- Drop `turbidity_slope_per_hr` (and the 6-reading window). Four weights from `export.weights` and `export.bias` in `predictor_v3_candidate.json`: bias -3.0683, turbidity 0.009009, rain_24h 0.10002, rain_72h 0.011301, forecast_48h 0.20242. Same sigmoid, same thresholds, same fallback.
- Replace `ml/predictor_test_vectors.json` turbidity vectors with `predictor_v3_test_vectors.json` (31 vectors, incl. out-of-range; parity 1e-16). Bump model version; update `shared-types` predictor schema and spec 02 gates.
- Optional, separate decision: seed/live forecast built from Previous Runs day1/day2 as above instead of the Historical Forecast archive (which is an oracle here).

## Caveats
Synthetic response and assumed thresholds (250 NTU degraded, 48 h horizon); one wet month replayed; WSP 5 NTU rule is always on because simulated raw baseline is 5-20 NTU, so "WSP rule" is a floor, not a fair operator model; event lead times are lenient (any alarm hour in the window); drought model not re-evaluated. Tests: `ml/.venv/bin/python ml/test_v3.py` (5 pass).

## Pitch-safe claims
- "Four-weight logistic score with every coefficient positive and printed; the trend feature was dropped because it added nothing."
- "On held-out simulated trajectories it flagged 98% of turbidity events at least once in the 48 h before onset, median lead about 48 h, about 4 false-alarm episodes per 30 days; the same on a 2023-25 test after training on 2016-22 rain."
- "In our simulation a fixed 5 NTU check is always on and a 250 NTU reactive check gives zero advance warning."
- "It performs on par with a simple rain-total rule, and we show both."
- "July 2026 replay with a day-ahead forecast issued before each hour gives the same Jul 1-8 levels (4 4 4 1 1 3 4 4) as perfect foresight, and an alarm 57 h ahead of the late-July spell."
- Do not claim: calibrated probabilities, measured lead before Jul 2, forecast skill, low false-alarm rate in a wet month (49% of non-event hours alarm), or that ML beats rules.
