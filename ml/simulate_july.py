"""Simulated July 2026 intake readings driven by REAL Open-Meteo rainfall (Catbalogan).

SIMULATED readings; not CWD telemetry. Functions: fetch_rain -> simulate -> to_sql.
Run: ml/.venv/bin/python ml/simulate_july.py   (writes supabase/seed/{july_readings,rainfall_daily}.sql)
"""
from __future__ import annotations
import json, math, sys, uuid
from pathlib import Path
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "ml" / "data" / "openmeteo_2026-07.json"
SEED_DIR = ROOT / "supabase" / "seed"
SEED = 20260706
LAT, LON, TZ = 11.7769, 124.8852, "Asia/Manila"  # 11°46'36.83" N, 124°53'06.63" E, catbaloganwd.gov.ph

from wsp_constants import (TURBIDITY_LIMIT_NTU, TURBIDITY_SHUTOFF_NTU, CLARIFIER_CAPACITY_LPS, FILTRATION_CAPACITY_FRACTION,
                           KULADOR_DEGRADED_NTU, MAX_NTU, FLOW_LPS)  # WSP constants live in ml/wsp_constants.py

INTAKES = ["kulador", "masacpasac", "caramayon_1", "caramayon_2"]
# Crisis scenario. Tribune (2026-07-07) gives NO dates for rain/outage/restoration, only that the mayor's EO was
# "Monday morning" (2026-07-06) and that the outage coincided with turbid Antiao river after heavy rain.
# ASSUMPTIONS: real rain peaks 2026-07-01/02; power outage and its end are chosen to bracket Mon 07-06.
SCENARIO = {
    "outage_start": "2026-07-04T18:00",   # ASSUMPTION
    "outage_end": "2026-07-07T18:00",     # ASSUMPTION (supply restored overnight 07-07/08)
    "crisis_start": "2026-07-02T00:00",
    "crisis_end": "2026-07-08T00:00",
}
# per-intake response: lag (h), decay tau (h), gain (NTU per mm in store), baseline NTU range
RESP = {
    "kulador":     dict(lag=3, tau=6.0,  gain=40.0, exp=1.0, base=(5, 20)),   # river: fast, strong, linear
    "masacpasac":  dict(lag=6, tau=10.0, gain=0.3,  exp=1.5, base=(0.5, 3)),  # spring: weak response
    "caramayon_1": dict(lag=5, tau=10.0, gain=4.0,  exp=2.2, base=(0.5, 3)),  # spring "turbid in heavy rain": >=500 NTU when store ~9 mm
    "caramayon_2": dict(lag=5, tau=10.0, gain=1.5,  exp=2.2, base=(0.5, 3)),
}
DEMAND_MEAN_FRAC = 0.85   # mean demand as fraction of full supply (assumption)
RESERVOIR_GAIN = 25.0     # %/h per unit supply-demand imbalance (assumption)


def fetch_rain(start: str = "2026-07-01", end: str = "2026-07-31", use_cache: bool = True) -> pd.Series:
    """Hourly precipitation (mm) indexed by tz-aware Asia/Manila timestamps. Raw response cached on disk."""
    if use_cache and CACHE.exists():
        data = json.loads(CACHE.read_text())
    else:
        import requests
        r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=60, params=dict(
            latitude=LAT, longitude=LON, start_date=start, end_date=end, hourly="precipitation",
            daily="precipitation_sum", timezone=TZ))
        r.raise_for_status()
        data = r.json()
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(data))
    idx = pd.to_datetime(data["hourly"]["time"]).tz_localize(TZ)
    return pd.Series(data["hourly"]["precipitation"], index=idx, name="precipitation_mm", dtype=float)


def fetch_daily() -> pd.Series:
    data = json.loads(CACHE.read_text())
    return pd.Series(data["daily"]["precipitation_sum"], index=pd.to_datetime(data["daily"]["time"]).date)


def _store(rain: np.ndarray, lag: int, tau: float) -> np.ndarray:
    """Lagged leaky-bucket of rainfall: exponential decay with time constant tau (hours)."""
    shifted = np.concatenate([np.zeros(lag), rain])[: len(rain)]
    out = np.zeros(len(rain)); s = 0.0; k = math.exp(-1.0 / tau)
    for i, r in enumerate(shifted):
        s = s * k + r; out[i] = s
    return out


def simulate(rain: pd.Series, scenario: dict = SCENARIO, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = rain.index; n = len(idx); hours = idx.hour.values
    r = rain.values
    outage = np.asarray((idx >= pd.Timestamp(scenario["outage_start"], tz=TZ)) & (idx < pd.Timestamp(scenario["outage_end"], tz=TZ)))

    ntu = {}
    for k, p in RESP.items():
        base = rng.uniform(*p["base"]) * np.exp(rng.normal(0, 0.15, n))
        ntu[k] = base + np.minimum(p["gain"] * _store(r, p["lag"], p["tau"]) ** p["exp"], MAX_NTU) * np.exp(rng.normal(0, 0.08, n))
    status = {}
    # All intakes blend into the Kulador plant, which treats raw water to the 5 NTU limit (TURBIDITY_LIMIT_NTU, WSP pp.43-44);
    # raw turbidity above the plant's treatable range (KULADOR_DEGRADED_NTU) means treated output can no longer meet it.
    for k in INTAKES:
        status[k] = np.where(ntu[k] > KULADOR_DEGRADED_NTU, "degraded", "normal")
    status["caramayon_1"] = np.where((ntu["caramayon_1"] >= TURBIDITY_SHUTOFF_NTU) | outage, "shutdown", status["caramayon_1"])
    status["caramayon_2"] = np.where(outage, "shutdown", status["caramayon_2"])

    # plant supply fraction (of full normal supply): shutdown -> 0, kulador degraded -> half (50% filtration)
    supply = np.zeros(n)
    for k in INTAKES:
        f = np.where(status[k] == "shutdown", 0.0, 1.0)
        if k == "kulador":
            f = np.where(status[k] == "degraded", FILTRATION_CAPACITY_FRACTION, f)
        supply += f * FLOW_LPS[k]
    supply_frac = supply / sum(FLOW_LPS.values())

    # diurnal demand: morning (06-09) and evening (17-20) peaks, low at night; mean-normalised
    d = 1 + 0.45 * np.exp(-((hours - 7.5) ** 2) / 4) + 0.45 * np.exp(-((hours - 18.5) ** 2) / 4) - 0.35 * np.exp(-((hours - 2.5) ** 2) / 8)
    demand = DEMAND_MEAN_FRAC * d / d.mean()
    # during a supply crisis consumers also draw less (rationing): demand throttled when level is low
    res = np.zeros(n); lvl = 85.0
    for i in range(n):
        eff_demand = demand[i] * (0.5 + 0.5 * min(lvl / 30.0, 1.0))
        lvl = min(100.0, max(0.0, lvl + RESERVOIR_GAIN * (supply_frac[i] - eff_demand)))
        res[i] = lvl
    stress = np.clip((60 - res) / 60, 0, 1)
    clar = (36 + 5 * (d - 1) + rng.normal(0, 1.5, n)) + 14 * stress  # >46.3 under demand stress
    clar = np.clip(np.where(status["kulador"] == "degraded", clar * 0.9, clar), 0, None)

    frames = []
    for k in INTAKES:
        kul = k == "kulador"
        frames.append(pd.DataFrame(dict(
            recorded_at=idx, intake_id=k, turbidity_ntu=np.round(ntu[k], 2), plant_status=status[k],
            reservoir_pct=np.round(res, 1) if kul else np.nan,
            clarifier_inflow_lps=np.round(clar, 1) if kul else np.nan)))
    df = pd.concat(frames, ignore_index=True)
    df["is_crisis"] = (df.recorded_at >= pd.Timestamp(scenario["crisis_start"], tz=TZ)) & (df.recorded_at < pd.Timestamp(scenario["crisis_end"], tz=TZ))
    df["is_outage"] = df.recorded_at.map(lambda t: bool(outage[idx.get_loc(t)]))
    return df


NS = uuid.UUID("6f1d3a5e-0a4c-4b1e-9f55-5a1f0c0de001")
HEADER = f"""-- SIMULATED readings driven by REAL Open-Meteo rainfall; not CWD telemetry. Generated by ml/simulate_july.py (seed {SEED}).
-- Labeled "simulated proposed sensors — CWD monitors turbidity daily (WSP pp.43-47)".
-- Crisis assumptions (Tribune 2026-07-07 states no dates; mayor's EO was Mon 2026-07-06):
--   * rain: real Open-Meteo hourly precipitation, Catbalogan ({LAT}, {LON}); biggest early-July rain 07-01/02
--   * Caramayon power outage ASSUMED {SCENARIO['outage_start']} to {SCENARIO['outage_end']} (+08:00): both Caramayon intakes 'shutdown'
--   * Caramayon I also 'shutdown' whenever turbidity >= {TURBIDITY_SHUTOFF_NTU} NTU (WSP p.43)
--   * Kulador 'degraded' when raw turbidity > {KULADOR_DEGRADED_NTU:g} NTU (= shut-off x {FILTRATION_CAPACITY_FRACTION} filtration capacity, WSP p.22; derived assumption)
-- Re-runnable: ids are deterministic uuid5(intake|recorded_at); on conflict do nothing.
"""


def to_sql(df: pd.DataFrame, batch: int = 500) -> str:
    out = [HEADER]
    cols = "(id, recorded_at, intake_id, turbidity_ntu, plant_status, reservoir_pct, clarifier_inflow_lps, source, is_simulated)"
    rows = []
    for t in df.itertuples():
        ts = t.recorded_at.isoformat()  # includes +08:00
        rid = uuid.uuid5(NS, f"{t.intake_id}|{ts}")
        f = lambda v: "null" if pd.isna(v) else repr(float(v))
        rows.append(f"('{rid}','{ts}','{t.intake_id}',{float(t.turbidity_ntu)!r},'{t.plant_status}',{f(t.reservoir_pct)},{f(t.clarifier_inflow_lps)},'operator',true)")
    for i in range(0, len(rows), batch):
        out.append(f"insert into readings {cols} values\n  " + ",\n  ".join(rows[i:i + batch]) + "\non conflict (id) do nothing;\n")
    return "\n".join(out)


def rainfall_sql(rain: pd.Series) -> str:
    daily = rain.groupby(rain.index.date).sum().round(1)
    vals = ",\n  ".join(f"('{d}',{v!r},'open-meteo')" for d, v in daily.items())
    return ("-- REAL daily rainfall for Catbalogan, summed from Open-Meteo hourly precipitation (ml/simulate_july.py). Re-runnable.\n"
            f"insert into rainfall_daily (date, precipitation_mm, source) values\n  {vals}\n"
            "on conflict (date) do update set precipitation_mm = excluded.precipitation_mm, source = excluded.source;\n")


def main():
    rain = fetch_rain(); df = simulate(rain)
    (SEED_DIR / "july_readings.sql").write_text(to_sql(df))
    (SEED_DIR / "rainfall_daily.sql").write_text(rainfall_sql(rain))
    d = df.copy(); d["date"] = d.recorded_at.dt.date
    kul = d[d.intake_id == "kulador"].groupby("date").agg(kul_ntu=("turbidity_ntu", "max"), res_min=("reservoir_pct", "min"))
    c1 = d[d.intake_id == "caramayon_1"].groupby("date").agg(c1_ntu=("turbidity_ntu", "max"))
    st = d.groupby("date").apply(lambda g: "/".join(f"{k[0]}{v}" for k, v in g.plant_status.value_counts().items()), include_groups=False).rename("status_hrs")
    tab = kul.join(c1).join(st); tab.insert(0, "rain_mm", rain.groupby(rain.index.date).sum().round(1))
    print(tab.to_string())


if __name__ == "__main__":
    main()
