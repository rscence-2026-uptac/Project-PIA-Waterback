# Disruption predictor: training report (v2)

Version 2026-10-06.2, seed 20261006. Regenerate: `ml/.venv/bin/python ml/train_predictor.py` (deterministic).

**Training data is synthetic and physics-informed; not real incident history.** Rain is real Open-Meteo hourly precipitation for Catbalogan (11.7769, 124.8852), 2016-2025; turbidity/reservoir response is simulated (`ml/synthetic.py`, reusing `ml/simulate_july.py`) around the CWD 2022 WSP thresholds.

## v1 -> v2 changes

- v1 reached turbidity recall only through a 1.5x positive-class weight boost; precision was 0.53 and it alarmed on ~42% of non-event rows, because the label depends on rain in the next 48 h that no feature could see.
- **Added `forecast_rain_48h_mm`** (forecast rain in (t, t+48h]). In training it is simulated from the real future rain with an assumed forecast-error model (below).
- **Removed `clarifier_utilization`** (v1 sign was negative, counter-intuitive) and **`reservoir_trend_pct_per_day`** (collinear with `reservoir_pct`, v1 sign positive).
- **Removed the recall boost**: `class_weight='balanced'` only. Threshold stays 0.4. New gates: precision >= 0.65 on both models, July non-event alarm rate < 20%, all coefficient signs physically intuitive.

## Dataset

- 500 trajectories, each a contiguous real-rain window of 30+60+7 days (warm-up / usable / label look-ahead); 50% of windows start Jan 1-Apr 15 so dry spells (drought positives) are well represented.
- Split 80/20 **by trajectory** (no row leakage), stratified on whether a trajectory contains positives: 400 train / 100 test trajectories.
- Random Caramayon power outages in 30% of trajectories (6-72 h); drought labels use a supply-only counterfactual reservoir so outage/turbidity-caused drops are not labelled drought.

| model | rows | positive rate (all) | train rows | train pos. rate | test rows | test pos. rate |
|---|---|---|---|---|---|---|
| turbidity (hourly, every 4th h) | 180000 | 0.371 | 144000 | 0.375 | 36000 | 0.357 |
| drought (daily) | 30000 | 0.185 | 24000 | 0.184 | 6000 | 0.188 |

## Forecast feature in training (ASSUMPTIONS, `ml/wsp_constants.py`)

`forecast_rain_48h_mm` = actual rain in (t, t+48 h] x lognormal error (sigma 0.5, mean-preserving), redrawn every 6 h; in 10% of blocks a miss (only 10% of the rain forecast); in 10% of blocks with < 2 mm actual a false alarm (exponential, mean 8 mm).

Justification: **all values are ASSUMPTIONS, not fitted to any skill measurement.** The only forecast data we have is Open-Meteo's Historical Forecast archive, which stitches the first hours of each successive model run (not a true 24-48 h-ahead forecast), and for 2026-06/07 it is value-identical to the archive rain (see `docs/predictor.md`), so it cannot measure 2-day skill. Tropical convective rain is hard to forecast at 1-2 day lead, so a deliberately noisy model is used (sigma 0.5 = typical +/-65% error on a 48 h total; 10% misses and false alarms). I did not tune these to pass the gates.

## Held-out metrics at the fixed decision threshold p >= 0.4 (signal level >= 2): v1 vs v2

| model | version | recall | precision | ROC-AUC | C (L2) | confusion [[TN,FP],[FN,TP]] |
|---|---|---|---|---|---|---|
| turbidity | v1 (1.5x boost on turbidity) | 0.862 | 0.531 | 0.839 | | |
| turbidity | **v2** | 0.845 | 0.786 | 0.936 | 0.03 | [[20185, 2965], [1986, 10864]] |
| drought | v1 (1.5x boost on turbidity) | 0.972 | 0.758 | 0.989 | | |
| drought | **v2** | 0.964 | 0.740 | 0.989 | 0.01 | [[4491, 381], [41, 1087]] |

Turbidity **onset recall** (only rows whose current Kulador turbidity is still below 250 NTU, i.e. a genuine early warning, 9297 positive rows): recall 0.786, precision 0.721 (v1: 0.809 / 0.438).

## Gates

| gate | value | result |
|---|---|---|
| turbidity recall >= 0.85 | 0.845 | **FAIL** |
| turbidity precision >= 0.65 | 0.786 | PASS |
| turbidity all coefficient signs intuitive | ['turbidity_slope_per_hr'] | **FAIL** |
| drought recall >= 0.85 | 0.964 | PASS |
| drought precision >= 0.65 | 0.740 | PASS |
| drought all coefficient signs intuitive | all ok | PASS |
| July replay non-event alarm rate < 0.2 | 0.217 | **FAIL** |

Gates are evaluated as specified and were not relaxed: no threshold move, no class-weight boost, no label change.

## Coefficients (raw units; probability = sigmoid(bias + sum(weight x feature)))

### turbidity  (bias -3.06754)

| feature | raw weight | standardized weight | expected sign | sign | meaning |
|---|---|---|---|---|---|
| `turbidity_ntu` | +0.00911163 | +1.832 | + | ok | current Kulador raw turbidity (per NTU) |
| `turbidity_slope_per_hr` | -0.000890287 | -0.025 | + | **WRONG** | how fast turbidity is rising (per NTU/h over last 6 readings) |
| `rain_24h_mm` | +0.0987684 | +1.086 | + | ok | rain in the last 24 h (per mm) |
| `rain_72h_mm` | +0.0111871 | +0.271 | + | ok | rain in the last 72 h (per mm) |
| `forecast_rain_48h_mm` | +0.202249 | +4.289 | + | ok | forecast rain in the next 48 h (per mm) |

### drought  (bias 4.23759)

| feature | raw weight | standardized weight | expected sign | sign | meaning |
|---|---|---|---|---|---|
| `reservoir_pct` | -0.0577301 | -1.841 | - | ok | reservoir level, daily mean (per % of 340 m3 usable) |
| `rain_14d_mm` | -0.00997805 | -0.677 | - | ok | rain over the last 14 days (per mm) |
| `rain_30d_mm` | -0.00867621 | -0.984 | - | ok | rain over the last 30 days (per mm) |
| `days_since_rain_over_5mm` | +0.0631485 | +0.900 | + | ok | dry-spell length (per day since a >=5 mm rain day) |

## Forecast-quality sensitivity (informational; headline row is the declared assumption)

Turbidity model re-trained under other forecast-error assumptions. Shows how much the gates depend on how good the real forecast is.

| forecast-error assumption | recall | precision | ROC-AUC | forecast weight | slope weight |
|---|---|---|---|---|---|
| sigma 0.3, no miss/false alarm | 0.893 | 0.847 | 0.969 | +0.3325 | -0.00246 |
| sigma 0.5, no miss/false alarm | 0.873 | 0.818 | 0.956 | +0.2669 | -0.00212 |
| sigma 0.5, miss 10% / false alarm 10% (HEADLINE) | 0.845 | 0.786 | 0.936 | +0.2022 | -0.00089 |
| sigma 0.8, miss 10% / false alarm 10% | 0.813 | 0.752 | 0.916 | +0.1415 | -0.00071 |

## Labels

- **turbidity** = 1 if within the next 48 h Kulador raw turbidity >= 250 NTU (degraded; derived: shut-off 500 NTU x 50% filtration capacity, WSP pp.43, 22) OR Caramayon I turbidity >= 500 NTU (temporary source shut-off, WSP p.43).
- **drought** = 1 if within the next 7 days the daily-minimum reservoir level falls below 20% for supply reasons (spring-yield shortfall). **20% is our ASSUMPTION**; the WSP has no drought hazard.

## Assumptions added (none are in the WSP)

- Spring yield recession: slow store with 14-day time constant; Masacpasac/Caramayon I/II yield = 0.35 + 0.65 x min(1, store/35 mm).
- Antecedent wetness scales runoff turbidity gain by 0.7-1.3; per-trajectory lognormal gain spread sigma 0.3; demand spread sigma 0.08.
- Caramayon II normal flow 40 L/s; Kulador degraded at 250 NTU (see `ml/wsp_constants.py`).
- `reservoir_pct` for the drought model is the **daily mean** level. `days_since_rain_over_5mm`: calendar days (Asia/Manila) since the most recent day with >= 5 mm; 0 if today >= 5 mm; if there is none in the available history, the number of days of history available (a lower bound). No other cap.
- Class weights: `balanced` only. Hourly turbidity rows subsampled every 4th hour; C chosen from a fixed grid by grouped 5-fold CV ROC-AUC on the train split only. The 0.4 threshold is never tuned. Output is a risk score from a class-balanced fit, not a calibrated probability.
