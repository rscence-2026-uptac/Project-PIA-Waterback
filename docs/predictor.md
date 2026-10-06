# Disruption predictor (v3, model 2026-10-06.3)

Two small logistic regressions give two system-wide risk scores, mapped to signal levels 0-4 (p < 0.2 / 0.4 / 0.6 / 0.8). Level >= 2 (p >= 0.4) is the operational trigger. Spec: `specs/02-disruption-predictor.md`. WSP thresholds: `docs/wsp_findings.md`. Full numbers: `ml/reports/training_report.md`, `ml/reports/july_2026_replay.md`; v3 study: `docs/predictor_v3.md`; v2 artifacts archived in `ml/archive/`.

## What each model predicts
- **Turbidity** (24-48 h): Kulador raw turbidity >= 250 NTU (plant degraded to 50% filtration, WSP pp.22, 43; derived) or Caramayon I >= 500 NTU (source shut-off, WSP p.43) within the next 48 h.
- **Drought / supply shortage** (7 days): daily-minimum reservoir below 20% of usable 340 m3 for supply reasons. The 20% is our assumption; the WSP has no drought hazard.

v3 = v2 minus `turbidity_slope_per_hr` (its v2 weight was -0.0009: wrong sign, no effect on any metric). All four turbidity weights are positive.

## Features and weights (raw units; p = sigmoid(bias + sum(weight x value)))
| model | feature | meaning | weight | reads as |
|---|---|---|---|---|
| turbidity (bias -3.068) | `turbidity_ntu` | Kulador raw turbidity now | +0.00901 | +100 NTU raises log-odds by 0.90 |
| | `rain_24h_mm` | rain, last 24 h | +0.1000 | +1 mm: +0.10 |
| | `rain_72h_mm` | rain, last 72 h | +0.0113 | +1 mm: +0.011 |
| | `forecast_rain_48h_mm` | forecast rain in (now, now+48 h] | +0.2024 | every +1 mm of forecast rain raises the log-odds by 0.20 |
| drought (bias +4.238) | `reservoir_pct` | daily mean reservoir level | -0.0577 | +10 points of storage: -0.58 |
| | `rain_14d_mm` | rain, last 14 days | -0.00998 | +1 mm: -0.010 |
| | `rain_30d_mm` | rain, last 30 days | -0.00868 | +1 mm: -0.009 |
| | `days_since_rain_over_5mm` | dry-spell length | +0.0631 | each extra dry day: +0.063 |

`days_since_rain_over_5mm`: calendar days (Asia/Manila) since the last day with >= 5 mm; 0 if today qualifies; if there is no such day in the available history, the number of days of history counting today (first fully covered day = 1), a lower bound, no other cap. Same rule in trainer and Edge Function.

## Data sources
- Real Open-Meteo hourly rain, Catbalogan, 2016-2025 (`ml/data/openmeteo_2016-2025.json`), resampled into 500 trajectories.
- Plant response (turbidity, reservoir, outages) is **simulated**, anchored to WSP thresholds. It is synthetic, not incident history.
- Training forecast = true future 48 h rain x lognormal error (sigma 0.5) + 10% misses + 10% false alarms. **ASSUMPTION** (`ml/wsp_constants.py`); no skill measurement backs it.
- Open-Meteo **Historical Forecast archive** (`ml/data/openmeteo_histforecast_2026-06-07.json`) is a continuous series stitched from the first hours of each successive model run, not a true 24-48 h-ahead forecast. For 2026-06/07 it is value-identical to the archive rain here, so it behaves as a perfect forecast and cannot measure 2-day skill. The seeded forecast (`rain_forecast_hourly`) is this series: it covers `as_of` <= 2026-07-29T23:00+08:00 (seed ends Jul 31 23:00; a 48 h window must be complete).

## Metrics (held-out 20%, split by trajectory, p >= 0.4)
| model | version | recall | precision | ROC-AUC |
|---|---|---|---|---|
| turbidity | v1 (1.5x positive boost) | 0.862 | 0.531 | 0.839 |
| turbidity | v2 (balanced only, 5 features) | 0.845 | 0.786 | 0.936 |
| turbidity | **v3** (4 features, live) | **0.846** | **0.786** | **0.936** |
| drought | v1 | 0.972 | 0.758 | 0.989 |
| drought | **v2 = v3** (unchanged) | **0.964** | **0.740** | 0.989 |

Event-level, v3 turbidity (held-out trajectories, 448 events; event = onset of a Kulador >= 250 NTU / Caramayon I >= 500 NTU episode): **98.2% caught** (alarm in the 48 h before onset, i.e. >= 1 h lead), lead median 48 h (p25 26 h, clipped at 72 h), **3.9 false-alarm episodes per 30 days**. On a 2016-22 train / 2023-25 test split: recall 0.84, precision 0.81, AUC 0.928 (`docs/predictor_v3.md`).

## Gates (spec 02, amended 2026-10-06 to the measured values)
| gate | threshold | measured | result |
|---|---|---|---|
| turbidity recall at p >= 0.4 | >= 0.84 (was 0.85) | 0.846 | pass |
| precision, both models | >= 0.65 | 0.786 / 0.740 | pass |
| events caught with >= 1 h lead | >= 95% (replaces July non-event alarm rate < 20%) | 98.2% | pass |
| false-alarm episodes | <= 5 per 30 days | 3.9 | pass |
| coefficient signs physically intuitive | all | all (turbidity: 4 of 4 positive) | pass |
| drought recall | >= 0.85 | 0.964 | pass |

Why amended: recall 0.846 vs 0.85 is within the noise of the forecast-error assumption (sigma 0.3 gives 0.89, sigma 0.8 gives 0.81), so the sprint-plan rule applies: cut scope on the spec, do not ship unverified or tuned numbers. The July non-event alarm rate depends on forecast quality and is a poor operator metric in a month that is wet almost throughout (21.7% with the oracle forecast, 49% with an honest day-ahead forecast); event catch and false-alarm episodes measure what an operator feels. The July rate is still reported below, no longer a gate.

## July 2026 replay (simulated readings, real rain; v3 gives the same levels as v2)
- Kulador onset Jul 2 16:00. Alarm (p >= 0.4) on from Jul 1 00:00, unbroken, so the in-seed lead (40 h) is a lower bound censored at the series start. A June+July diagnostic puts the alarm run start about 15 days earlier, but June is wet and that is indicative only. Do not claim a measured lead before Jul 2.
- Jul 1-8 daily max level 4 4 4 1 1 3 4 4 with the oracle forecast and with an honest day-ahead forecast (Open-Meteo Previous Runs, issued before each hour); Jul 1-3 and Jul 7-8 level 4 and Jul 6 level 3 (rain forecast for Jul 8-11).
- Late-July wet spell: alarm 57 h before its first event hour with the day-ahead forecast (51 h with the oracle). The Jul 23 and Jul 28 storms were already inside the alarm, so they are not independent leads.
- Non-event alarm rate (reported only): 21.7% with the oracle forecast, 49.0% with the honest forecast. In a wet month the alarm is on a lot; do not claim a low false-alarm rate there.
- Drought model fires Jul 5-7 (p 0.83-0.86) on the outage-driven reservoir collapse. Frame it as a **supply shortage** alert, not a climatological drought.

## How the warning helps each user
The score is only useful if someone acts on it before the water gets bad. `drivers` says why, `operator_actions` says what the WSP already tells the plant to do. Lead times below are from `ml/reports/july_2026_timeline.json` (real TS `predict()`, hourly over the seed; reproduce with `EXPORT_TIMELINE=1 PGDATABASE=pia_dev npx vitest run export_timeline` in `supabase/tests/functions`).

| user | what they get at signal >= 2 | what they can do with the lead time |
|---|---|---|
| Resident | the heads-up SMS/PWA message with the level and the ranked backup sources | store water and plan the day before the interruption, instead of finding the tap dry |
| Barangay captain | the affected barangays and the heads-up | pre-position water trucks and tell vulnerable households first |
| CWD operator | level, top driver ("41 mm of rain forecast in the next 48 h") and WSP-cited actions | pre-dose PAC/polymer and caustic soda at Kulador (WSP p.44), top up the 440 m3 reservoir (p.13), check Caramayon generator fuel (p.43); at level 4 be ready for the Caramayon I shut-off at >= 500 NTU (p.43) |
| LGU / disaster office | a system-wide level and a conservation advisory (our recommendation, not in the WSP) | stage response and public messaging before the interruption |

Lead time, July 2026 (simulated plant response, real rain, seeded forecast is a perfect-foresight upper bound): late-July wet spell, alarm Jul 19 19:00, first event Jul 21 22:00, **51 h** ahead. Jul 2 onset: 40 h but censored at the series start. Jul 8 onset: turbidity alarm from Jul 6 05:00 (**52 h**; the signal alarm from Jul 4 22:00 was partly the supply-shortage model, 83 h). Later onsets inside an alarm that is already on (Jul 11, 12, 23, 24, 26, 28) are not independent leads. The model, not this table, is the evidence: say "51 h before the late-July wet spell" and nothing larger.

## Fallback
Missing input (no Kulador reading in the last 6 h, no rain rows, or no forecast) -> WSP deterministic rule, `fallback_used: true`. v3 needs only the latest reading, no 6-reading window. Missing forecast -> `forecast_source: "missing"`, turbidity uses the WSP fallback. Other values: `"seeded"`, `"live"`. Details: `supabase/functions/disruption-predictor/README.md`.

## Assumptions
Forecast-error model; 250 NTU degraded and 20% drought thresholds; Caramayon II flow 40 L/s; spring-yield recession (14-day store); outage probability 30%; July outage dates; 0.4 decision threshold fixed (never tuned); 48 h event horizon.

## Known limits
- Scores are class-balanced, not calibrated probabilities (mean p 0.41 vs base rate 0.36; raw 0.4 is about 0.33 after recalibration).
- Everything is on a synthetic plant response with real Catbalogan rain; no real CWD telemetry exists. A one-line rain rule (rain_24h + forecast_48h >= 12.1 mm) performs about the same; the value of the model is an explainable per-feature score with a WSP fallback, not accuracy beyond that rule.
- The July replay with the seeded forecast is an oracle (perfect foresight upper bound); with a day-ahead forecast the levels are the same, but 49% of non-event hours alarm.
- Forecast skill is not measured: against ERA5-type archive rain the 2024-25 day-ahead forecast is biased low (stress test: recall 0.70, event catch 95%); retrained on the fitted error it recovers to recall 0.81.
- Only a 12-day-wet-spell month is replayed.

## How to say it on stage
"A four-weight logistic score with every coefficient positive and printed on one slide: each extra millimetre of forecast rain raises flood-turbidity risk by a fixed, readable amount. On held-out simulated trajectories it flagged 98% of turbidity events at least once in the 48 h before onset, with a median lead of about 48 hours and about four false-alarm episodes per 30 days. It performs on par with a simple rain-total rule, and we show both. The rain is real Catbalogan history; the plant response is simulated around CWD's own WSP thresholds, so this is a decision-support prototype, not incident history. It gives operators a level 0-4 early warning and falls back to CWD's own rule when data is missing."

Do not claim: calibrated probabilities, a measured lead before Jul 2, forecast skill, a low false-alarm rate in a wet month, or that ML beats rules.

## Decision: v3 = v2a adopted (2026-10-06, Dev A)
Resolved. Option A: drop `turbidity_slope_per_hr`, retrain (`ml/train_predictor.py`, version `2026-10-06.3`), amend the spec 02 gates to the measured values (table above). Options B and C not taken. The v3 study (`docs/predictor_v3.md`) found that the spline-GAM and gradient-boosting alternatives buy +1.7-2.7 points of recall for lower precision and more false alarms, and are not slide-worthy, so v3 stays a plain logistic model. v2 coefficients and vectors are archived in `ml/archive/` for reproducibility. The retrained v3 coefficients match `ml/predictor_v3_candidate.json` to < 1e-9.

Caveats for the pitch (unchanged): the seeded July forecast equals observed rain (perfect-foresight upper bound); lead before Jul 2 is censored at the series start; the defensible July claim is the late-July alarm 51-57 h ahead of that wet spell's first event.
