# Disruption predictor (v2, model 2026-10-06.2)

Two small logistic regressions give two system-wide risk scores, mapped to signal levels 0-4 (p < 0.2 / 0.4 / 0.6 / 0.8). Level >= 2 (p >= 0.4) is the operational trigger. Spec: `specs/02-disruption-predictor.md`. WSP thresholds: `docs/wsp_findings.md`. Full numbers: `ml/reports/training_report.md`, `ml/reports/july_2026_replay.md`.

## What each model predicts
- **Turbidity** (24-48 h): Kulador raw turbidity >= 250 NTU (plant degraded to 50% filtration, WSP pp.22, 43; derived) or Caramayon I >= 500 NTU (source shut-off, WSP p.43) within the next 48 h.
- **Drought / supply shortage** (7 days): daily-minimum reservoir below 20% of usable 340 m3 for supply reasons. The 20% is our assumption; the WSP has no drought hazard.

## Features and weights (raw units; p = sigmoid(bias + sum(weight x value)))
| model | feature | meaning | weight | reads as |
|---|---|---|---|---|
| turbidity (bias -3.068) | `turbidity_ntu` | Kulador raw turbidity now | +0.00911 | +100 NTU raises log-odds by 0.91 |
| | `turbidity_slope_per_hr` | trend over last 6 readings | **-0.00089** | wrong sign, negligible (see limits) |
| | `rain_24h_mm` | rain, last 24 h | +0.0988 | +1 mm: +0.10 |
| | `rain_72h_mm` | rain, last 72 h | +0.0112 | +1 mm: +0.011 |
| | `forecast_rain_48h_mm` | forecast rain in (now, now+48 h] | +0.2022 | every +1 mm of forecast rain raises the log-odds by 0.20 |
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
| turbidity | **v2** (balanced only) | **0.845** | **0.786** | 0.936 |
| drought | v1 | 0.972 | 0.758 | 0.989 |
| drought | **v2** | 0.964 | 0.740 | 0.989 |

Gates (recall >= 0.85, precision >= 0.65, July non-event alarm rate < 20%, all signs intuitive): **drought passes all. Turbidity misses three, narrowly**: recall 0.845, July non-event alarm rate 21.7%, slope sign. Not tuned away. With a better forecast (sigma 0.3) recall is 0.893; with a worse one (0.8) 0.813, so the gate depends on real forecast quality.

## July 2026 replay (simulated readings, real rain)
- Kulador onset Jul 2 16:00. Alarm (p >= 0.4) on from Jul 1 00:00, unbroken, so the in-seed lead (40 h) is a lower bound censored at the series start. A separate June+July diagnostic shows the alarm run starting Jun 26 14:00 after p < 0.4 at 13:00, but June is wet and that is indicative only.
- Jul 1-3 level 4; Jul 4-5 level 1; Jul 6 level 3 and Jul 7 level 4 (rain forecast for Jul 8-11); Jul 8 level 4. Alarm hours were 21.7% of non-event hours (oracle forecast); median 25.9% with noisy forecasts, so expect more false alarms in real use.
- Jul 19-31 is one continuous wet spell; alarm from Jul 19 19:00 (51 h before its first event hour). The Jul 23 and Jul 28 storms were already inside the alarm, so they are not independent leads.
- Drought model fires Jul 5-7 (p 0.83-0.86) on the outage-driven reservoir collapse. Frame it as a **supply shortage** alert, not a climatological drought.

## Fallback
Missing input -> WSP deterministic rule, `fallback_used: true`. Missing forecast -> `forecast_source: "missing"`, turbidity uses the WSP fallback. Other values: `"seeded"`, `"live"`. Details: `supabase/functions/disruption-predictor/README.md`.

## Assumptions
Forecast-error model; 250 NTU degraded and 20% drought thresholds; Caramayon II flow 40 L/s; spring-yield recession (14-day store); outage probability 30%; July outage dates; 0.4 decision threshold fixed (never tuned).

## Known limits
- Turbidity misses recall/alarm gates narrowly; `turbidity_slope_per_hr` has a small negative sign (collinear with current turbidity, falling turbidity after a peak still precedes events). Not forced.
- Scores are class-balanced, not calibrated probabilities.
- Only a 12-day-wet-spell month is replayed; no real CWD telemetry exists.
- The July replay forecast is an oracle; real forecasts will be noisier.

## How to say it on stage
"Two tiny logistic models, with every coefficient printed on one slide: each extra millimetre of forecast rain raises flood-turbidity risk by a fixed amount. The rain is real Catbalogan history and the forecast comes from Open-Meteo; the plant response is simulated around CWD's own WSP thresholds, so this is a decision-support prototype, not incident history. It gives operators a level 0-4 early warning, and falls back to CWD's own rule when data is missing."

## Open decision: v2 turbidity gates (2026-10-06)
Status: **pending**, Dev A to decide. v2 is a clear improvement over v1 (precision 0.53 → 0.79, ROC-AUC 0.84 → 0.94, no class-weight boost) but misses three turbidity gates narrowly:
- recall 0.845 vs ≥ 0.85
- July non-event alarm rate 21.7% vs < 20% (with an oracle forecast; about 26% with realistic forecast noise)
- `turbidity_slope_per_hr` has a wrong but tiny sign (−0.0009), collinear with `turbidity_ntu`

Options:
- **A** (recommended): drop the slope feature, retrain, and amend the spec 02 gates to the measured values with this rationale.
- **B**: accept v2 as is.
- **C**: add a Caramayon I turbidity feature and keep tuning.

Caveats for the pitch:
- The July replay forecast is the Open-Meteo historical-forecast archive. For this period it is identical to the observed rain, so it is a perfect-foresight upper bound.
- Lead time before Jul 2 is censored at the series start. The defensible claim is that the late-July alarm started 51 h before that wet spell's first event.
