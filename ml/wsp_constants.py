"""WSP constants: single Python source, parity-checked against packages/shared-types/src/constants.ts
(ml/test_constants_parity.py). Names match WSP_CONSTANTS there. No magic numbers elsewhere in ml/."""

# --- Shared with constants.ts (WSP_CONSTANTS) ---
TURBIDITY_LIMIT_NTU = 5          # source: CWD 2022 WSP pp.43-44 (permissible limit; above -> treat/bypass to clarifier)
TURBIDITY_SHUTOFF_NTU = 500      # source: CWD 2022 WSP p.43 (>= 500 temporary shut-off at Caramayon I source)
CLARIFIER_CAPACITY_CMD = 4000    # source: CWD 2022 WSP p.16
CLARIFIER_CAPACITY_LPS = 46.3    # source: CWD 2022 WSP p.16 (derived: 4,000 CMD / 86.4)
RESERVOIR_TOTAL_M3 = 440         # source: CWD 2022 WSP p.13
RESERVOIR_FIRE_RESERVE_M3 = 100  # source: CWD 2022 WSP p.13
RESERVOIR_USABLE_M3 = 340        # source: CWD 2022 WSP p.13 (derived: 440 - 100)
JMP_ROUNDTRIP_MIN = 30           # source: WHO/UNICEF JMP benchmark
SERVED_BARANGAYS = 26            # source: CWD 2022 WSP pp.17,19
SERVICE_ZONES = 10               # source: CWD 2022 WSP p.17
LOW_PRESSURE_ZONES = [8, 10]     # source: CWD 2022 WSP p.17 (farthest from source, low/zero pressure at peak)

WSP_CONSTANTS = {
    "TURBIDITY_LIMIT_NTU": TURBIDITY_LIMIT_NTU, "TURBIDITY_SHUTOFF_NTU": TURBIDITY_SHUTOFF_NTU,
    "CLARIFIER_CAPACITY_CMD": CLARIFIER_CAPACITY_CMD, "CLARIFIER_CAPACITY_LPS": CLARIFIER_CAPACITY_LPS,
    "RESERVOIR_TOTAL_M3": RESERVOIR_TOTAL_M3, "RESERVOIR_FIRE_RESERVE_M3": RESERVOIR_FIRE_RESERVE_M3,
    "RESERVOIR_USABLE_M3": RESERVOIR_USABLE_M3, "JMP_ROUNDTRIP_MIN": JMP_ROUNDTRIP_MIN,
    "SERVED_BARANGAYS": SERVED_BARANGAYS, "SERVICE_ZONES": SERVICE_ZONES, "LOW_PRESSURE_ZONES": LOW_PRESSURE_ZONES,
}

# --- Python-only (NOT in constants.ts) ---
# WSP p.22: filtration has "insufficient capacity (only 50%)".
FILTRATION_CAPACITY_FRACTION = 0.5
# ASSUMPTION (derived, not in WSP): with half the filtration capacity the plant can only treat raw water up to half
# the shut-off load -> Kulador "degraded" above 250 NTU.
KULADOR_DEGRADED_NTU = TURBIDITY_SHUTOFF_NTU * FILTRATION_CAPACITY_FRACTION

# ASSUMPTION: Caramayon II normal flow is not stated in the WSP.
CARAMAYON_2_FLOW_LPS = 40.0
KULADOR_FLOW_LPS = 46.3          # source: WSP p.16
MASACPASAC_FLOW_LPS = 55.0       # source: WSP p.12
CARAMAYON_1_FLOW_LPS = 91.0      # source: WSP p.12
FLOW_LPS = {"kulador": KULADOR_FLOW_LPS, "masacpasac": MASACPASAC_FLOW_LPS,
            "caramayon_1": CARAMAYON_1_FLOW_LPS, "caramayon_2": CARAMAYON_2_FLOW_LPS}

# ASSUMPTION: sensor/physical cap on simulated turbidity.
MAX_NTU = 4000.0
# ASSUMPTION (spec 02): drought = daily-min reservoir below this % of usable capacity for supply reasons. WSP has no drought hazard.
DROUGHT_RESERVOIR_PCT = 20.0

# --- Forecast-error model used ONLY to generate the training feature forecast_rain_48h_mm (not in constants.ts) ---
# training forecast = actual rain in (t, t+48h] x lognormal error (mean-preserving), constant within FORECAST_BLOCK_H blocks
# (forecast errors are autocorrelated hour to hour), with occasional misses and false alarms.
# All values are ASSUMPTIONS, not fitted: Open-Meteo's Historical Forecast archive stitches the first hours of each model run,
# so it is NOT a true 24-48 h-ahead forecast and cannot be used to measure 2-day skill; in the 2026-06/07 window it was
# value-identical to the archive rain (see docs/predictor.md). Tropical convective rain is hard to forecast at 1-2 day lead,
# so a deliberately noisy model is used: sigma 0.5 means a typical +/-65% error on a 48 h total (68% of cases within x0.6..x1.65).
FORECAST_HORIZON_H = 48
FORECAST_LOGNORMAL_SIGMA = 0.5   # ASSUMPTION
FORECAST_BLOCK_H = 6             # ASSUMPTION: error redrawn every 6 h
FORECAST_MISS_PROB = 0.10        # ASSUMPTION: 10% of blocks the model misses most of the rain...
FORECAST_MISS_FACTOR = 0.1       # ...forecasting only 10% of it
FORECAST_FALSE_ALARM_PROB = 0.10 # ASSUMPTION: 10% of blocks with little actual rain get a spurious forecast...
FORECAST_FALSE_ALARM_MAX_ACTUAL_MM = 2.0   # ...when actual 48 h rain is below this
FORECAST_FALSE_ALARM_MEAN_MM = 8.0         # ...of exponential mean size
