"""Physics-informed synthetic training set for the disruption predictor (spec 02).

Rain = REAL Open-Meteo hourly history for Catbalogan 2016-2025 (block bootstrap of contiguous windows).
Turbidity response reuses ml/simulate_july.py (RESP, _store). Added here: spring-yield recession during dry spells
(reservoir drawdown emerges from physics, not labels), optional random power outages, per-trajectory catchment variability.
NOT real incident history.
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import simulate_july as sj
from simulate_july import _store
from wsp_constants import (TURBIDITY_SHUTOFF_NTU, CLARIFIER_CAPACITY_LPS, FILTRATION_CAPACITY_FRACTION,
                           KULADOR_DEGRADED_NTU, MAX_NTU, FLOW_LPS, DROUGHT_RESERVOIR_PCT,
                           FORECAST_HORIZON_H, FORECAST_LOGNORMAL_SIGMA, FORECAST_BLOCK_H, FORECAST_MISS_PROB, FORECAST_MISS_FACTOR,
                           FORECAST_FALSE_ALARM_PROB, FORECAST_FALSE_ALARM_MAX_ACTUAL_MM, FORECAST_FALSE_ALARM_MEAN_MM)

ROOT = Path(__file__).resolve().parent.parent
CACHE_10Y = ROOT / "ml" / "data" / "openmeteo_2016-2025.json"
# v2 column layout of the simulated feature matrix (incl. the slope column; kept for the v3 study code and the dataset frame)
TURB_FEATURES_V2 = ["turbidity_ntu", "turbidity_slope_per_hr", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"]
# v3 (model 2026-10-06.3) = v2 minus turbidity_slope_per_hr: the features the trained/deployed model uses
TURB_FEATURES = [f for f in TURB_FEATURES_V2 if f != "turbidity_slope_per_hr"]
DROUGHT_FEATURES = ["reservoir_pct", "rain_14d_mm", "rain_30d_mm", "days_since_rain_over_5mm"]

# --- ASSUMPTIONS (none are in the WSP) ---
WARMUP_DAYS, USABLE_DAYS, LOOKAHEAD_DAYS = 30, 60, 7        # window = 97 days
TURB_HORIZON_H = 48          # spec: turbidity-driven interruption within 24-48h
DROUGHT_HORIZON_D = 7        # spec: drought shortage within 7 days
SAMPLE_STRIDE_H = 4          # keep every 4th hour for turbidity rows (hourly rows are highly autocorrelated)
RAIN_DAY_MM = 5.0            # "rain event" threshold, spec 02
SPRING_STORE_TAU_H = 336.0   # slow groundwater store feeding springs: 14-day time constant
SPRING_STORE_REF_MM = 35.0   # store at/above which springs yield 100% of normal flow
SPRING_MIN_YIELD = 0.35      # spring yield floor after prolonged dry spell (fraction of normal)
SPRINGS = ("masacpasac", "caramayon_1", "caramayon_2")
GAIN_SIGMA = 0.3             # per-trajectory lognormal spread of catchment turbidity gain
WET_SOIL_GAIN = (0.7, 1.3)   # antecedent wetness multiplies runoff turbidity gain
OUTAGE_PROB, OUTAGE_HOURS = 0.3, (6, 72)   # random Caramayon power outage
DEMAND_SIGMA = 0.08
DRY_SEASON_START_FRAC = 0.5  # share of windows starting Jan 1-Apr 15 so droughts are represented


def load_rain_10y() -> tuple[np.ndarray, pd.DatetimeIndex]:
    if not CACHE_10Y.exists():
        import requests
        r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=120, params=dict(
            latitude=sj.LAT, longitude=sj.LON, start_date="2016-01-01", end_date="2025-12-31",
            hourly="precipitation", timezone=sj.TZ))
        r.raise_for_status(); h = r.json()["hourly"]
        CACHE_10Y.write_text(json.dumps({"latitude": sj.LAT, "longitude": sj.LON, "timezone": sj.TZ, "start": h["time"][0],
                                         "hourly": {"time": h["time"], "precipitation": h["precipitation"]}}, separators=(",", ":")))
    d = json.loads(CACHE_10Y.read_text())["hourly"]
    return np.asarray(d["precipitation"], float), pd.to_datetime(d["time"])


def _trailing_sum(x: np.ndarray, n: int) -> np.ndarray:
    c = np.concatenate([[0.0], np.cumsum(x)])
    i = np.arange(len(x)) + 1
    return c[i] - c[np.maximum(i - n, 0)]


def _trailing_slope(x: np.ndarray, n: int) -> np.ndarray:
    """Least-squares slope over the last n samples (per sample step); partial windows -> 0 until n samples exist."""
    k = np.arange(n) - (n - 1) / 2.0
    out = np.zeros(len(x))
    for i in range(n - 1, len(x)):
        out[i] = float(np.dot(k, x[i - n + 1:i + 1])) / float(np.dot(k, k))
    return out


def forward_sum(x: np.ndarray, n: int) -> np.ndarray:
    """out[t] = sum(x[t+1 .. t+n]) (the window (t, t+n]); truncated at the end of the array."""
    c = np.concatenate([[0.0], np.cumsum(x)])
    t = np.arange(len(x))
    return c[np.minimum(t + n + 1, len(x))] - c[np.minimum(t + 1, len(x))]


def synth_forecast_48h(rain_h: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Training stand-in for a real 48 h rain forecast issued at hour t: actual (t, t+48h] rain x lognormal error + misses +
    false alarms (parameters = ASSUMPTIONS in wsp_constants.py). Errors are constant within FORECAST_BLOCK_H-hour blocks."""
    actual = forward_sum(np.asarray(rain_h, float), FORECAST_HORIZON_H)
    nb = len(actual) // FORECAST_BLOCK_H + 1
    sig = FORECAST_LOGNORMAL_SIGMA
    err = np.exp(rng.normal(-sig * sig / 2, sig, nb))                       # mean-preserving
    miss = rng.random(nb) < FORECAST_MISS_PROB
    fa = rng.random(nb) < FORECAST_FALSE_ALARM_PROB
    fa_mm = rng.exponential(FORECAST_FALSE_ALARM_MEAN_MM, nb)
    b = np.arange(len(actual)) // FORECAST_BLOCK_H
    f = actual * np.where(miss[b], FORECAST_MISS_FACTOR, err[b])
    f = f + np.where(fa[b] & (actual < FORECAST_FALSE_ALARM_MAX_ACTUAL_MM), fa_mm[b], 0.0)
    return f


def turbidity_features(kul_ntu, rain_h, forecast_48h) -> np.ndarray:
    """Hourly feature matrix, columns = TURB_FEATURES_V2 (the model selects TURB_FEATURES by name). Observations use data up to and including hour t;
    forecast_48h[t] = forecast rain for (t, t+48h] (training: synth_forecast_48h; production: weather forecast)."""
    return np.column_stack([kul_ntu, _trailing_slope(np.asarray(kul_ntu, float), 6), _trailing_sum(rain_h, 24),
                            _trailing_sum(rain_h, 72), np.asarray(forecast_48h, float)])


def days_since_big_rain(daily_rain: np.ndarray) -> np.ndarray:
    """Calendar days since the most recent day with >= RAIN_DAY_MM; 0 if today qualifies; if none in the available history,
    the number of days of history available (today included) = lower bound. No other cap."""
    out = np.zeros(len(daily_rain)); last = None
    for i, r in enumerate(daily_rain):
        if r >= RAIN_DAY_MM: last = i
        out[i] = 0 if last == i else (i - last if last is not None else i + 1)
    return out


def drought_features(res_daily_mean, rain_daily) -> np.ndarray:
    """Daily feature matrix, columns = DROUGHT_FEATURES. reservoir_pct = that day's mean level; rain windows are trailing
    calendar days incl. today."""
    rd = np.asarray(rain_daily, float)
    return np.column_stack([res_daily_mean, _trailing_sum(rd, 14), _trailing_sum(rd, 30), days_since_big_rain(rd)])


def _demand_shape(hours: np.ndarray) -> np.ndarray:
    d = 1 + 0.45 * np.exp(-((hours - 7.5) ** 2) / 4) + 0.45 * np.exp(-((hours - 18.5) ** 2) / 4) - 0.35 * np.exp(-((hours - 2.5) ** 2) / 8)
    return d


def _reservoir(supply_frac: np.ndarray, demand: np.ndarray) -> np.ndarray:
    res = np.zeros(len(demand)); lvl = 85.0; g = sj.RESERVOIR_GAIN
    for i in range(len(demand)):
        eff = demand[i] * (0.5 + 0.5 * min(lvl / 30.0, 1.0))
        lvl = min(100.0, max(0.0, lvl + g * (float(supply_frac[i]) - eff)))
        res[i] = lvl
    return res


def simulate_trajectory(rain_h: np.ndarray, hours: np.ndarray, rng: np.random.Generator) -> dict:
    n = len(rain_h)
    k = math.exp(-1.0 / SPRING_STORE_TAU_H); st = float(rain_h[:336].mean()) * SPRING_STORE_TAU_H  # spun-up start
    slow = np.zeros(n)
    for i in range(n):
        st = st * k + float(rain_h[i]); slow[i] = st
    wet_frac = np.clip(slow / SPRING_STORE_REF_MM, 0, 1)
    spring_yield = SPRING_MIN_YIELD + (1 - SPRING_MIN_YIELD) * wet_frac
    wet_gain = WET_SOIL_GAIN[0] + (WET_SOIL_GAIN[1] - WET_SOIL_GAIN[0]) * wet_frac

    ntu = {}
    for k, p in sj.RESP.items():
        base = rng.uniform(*p["base"]) * np.exp(rng.normal(0, 0.15, n))
        gm = math.exp(rng.normal(0, GAIN_SIGMA))
        resp = np.minimum(p["gain"] * gm * wet_gain * _store(rain_h, p["lag"], p["tau"]) ** p["exp"], MAX_NTU)
        ntu[k] = base + resp * np.exp(rng.normal(0, 0.08, n))

    outage = np.zeros(n, bool)
    if rng.random() < OUTAGE_PROB:
        dur = int(rng.integers(*OUTAGE_HOURS)); s0 = int(rng.integers(WARMUP_DAYS * 24, n - dur))
        outage[s0:s0 + dur] = True

    kul_deg = ntu["kulador"] > KULADOR_DEGRADED_NTU
    c1_down = (ntu["caramayon_1"] >= TURBIDITY_SHUTOFF_NTU) | outage
    c2_down = outage

    def supply(with_events: bool) -> np.ndarray:
        s = np.zeros(n)
        for k in sj.INTAKES:
            f = spring_yield if k in SPRINGS else np.ones(n)
            if with_events:
                if k == "kulador": f = np.where(kul_deg, FILTRATION_CAPACITY_FRACTION, f)
                if k == "caramayon_1": f = np.where(c1_down, 0.0, f)
                if k == "caramayon_2": f = np.where(c2_down, 0.0, f)
            s = s + f * FLOW_LPS[k]
        return s / sum(FLOW_LPS.values())

    d = _demand_shape(hours)
    demand = sj.DEMAND_MEAN_FRAC * math.exp(rng.normal(0, DEMAND_SIGMA)) * d / d.mean()
    res = _reservoir(supply(True), demand)                # what sensors would see (outages/turbidity events included)
    res_cf = _reservoir(supply(False), demand)            # supply-only counterfactual: drought label excludes outage/turbidity drops
    stress = np.clip((60 - res) / 60, 0, 1)
    clar = (36 + 5 * (d - 1) + rng.normal(0, 1.5, n)) + 14 * stress
    clar = np.clip(np.where(kul_deg, clar * 0.9, clar), 0, None)
    return dict(kul=ntu["kulador"], c1=ntu["caramayon_1"], res=res, res_cf=res_cf, clar=clar, outage=outage)


def _forward_any(flag: np.ndarray, horizon: int) -> np.ndarray:
    """out[t] = any(flag[t+1 .. t+horizon])."""
    c = np.concatenate([[0], np.cumsum(flag.astype(int))])
    t = np.arange(len(flag)); hi = np.minimum(t + horizon + 1, len(flag))
    return (c[hi] - c[np.minimum(t + 1, len(flag))]) > 0


def build_dataset(n_traj: int = 500, seed: int = 20261006) -> tuple[pd.DataFrame, pd.DataFrame]:
    rain_all, tidx = load_rain_10y()
    win = (WARMUP_DAYS + USABLE_DAYS + LOOKAHEAD_DAYS) * 24
    ss = np.random.SeedSequence(seed)
    rngs = [np.random.default_rng(s) for s in ss.spawn(n_traj)]
    doy = tidx.dayofyear.values
    dry_starts = np.where((tidx.hour.values == 0) & (doy >= 1) & (doy <= 105) & (np.arange(len(tidx)) <= len(tidx) - win))[0]
    any_starts = np.where((tidx.hour.values == 0) & (np.arange(len(tidx)) <= len(tidx) - win))[0]
    hours = np.arange(win) % 24
    trows, drows = [], []
    for j, rng in enumerate(rngs):
        pool = dry_starts if rng.random() < DRY_SEASON_START_FRAC else any_starts
        s0 = int(rng.choice(pool)); rain = rain_all[s0:s0 + win]
        tr = simulate_trajectory(rain, hours, rng)
        # ---- turbidity rows (hourly) ----
        ev = (tr["kul"] >= KULADOR_DEGRADED_NTU) | (tr["c1"] >= TURBIDITY_SHUTOFF_NTU)
        y = _forward_any(ev, TURB_HORIZON_H)
        X = turbidity_features(tr["kul"], rain, synth_forecast_48h(rain, rng))
        lo, hi = WARMUP_DAYS * 24, (WARMUP_DAYS + USABLE_DAYS) * 24
        sel = np.arange(lo, hi, SAMPLE_STRIDE_H)
        df = pd.DataFrame(X[sel], columns=TURB_FEATURES_V2); df["y"] = y[sel].astype(int); df["traj"] = j
        df["already_degraded"] = ev[sel].astype(int); trows.append(df)
        # ---- drought rows (daily) ----
        nd = win // 24
        res_mean = tr["res"].reshape(nd, 24).mean(1)
        cf_min = tr["res_cf"].reshape(nd, 24).min(1)
        rain_d = rain.reshape(nd, 24).sum(1)
        yd = _forward_any(cf_min < DROUGHT_RESERVOIR_PCT, DROUGHT_HORIZON_D)
        Xd = drought_features(res_mean, rain_d)
        dsel = np.arange(WARMUP_DAYS, WARMUP_DAYS + USABLE_DAYS)
        dd = pd.DataFrame(Xd[dsel], columns=DROUGHT_FEATURES); dd["y"] = yd[dsel].astype(int); dd["traj"] = j
        drows.append(dd)
    return pd.concat(trows, ignore_index=True), pd.concat(drows, ignore_index=True)


if __name__ == "__main__":
    t, d = build_dataset(60)
    print(len(t), t.y.mean(), len(d), d.y.mean())
