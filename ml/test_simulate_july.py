"""Plain-assert tests. Run: ml/.venv/bin/python ml/test_simulate_july.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np
import simulate_july as s

rain = s.fetch_rain()
df = s.simulate(rain)
crisis = df[df.is_crisis]


def test_shape():
    assert len(df) == 31 * 24 * 4 == 2976
    assert not df.duplicated(["intake_id", "recorded_at"]).any()
    assert set(df.intake_id) == set(s.INTAKES)
    assert (df.groupby("intake_id").size() == 744).all()


def test_ranges_and_scoping():
    assert (df.turbidity_ntu >= 0).all()
    k = df[df.intake_id == "kulador"]; o = df[df.intake_id != "kulador"]
    assert k.reservoir_pct.between(0, 100).all() and k.clarifier_inflow_lps.notna().all()
    assert o.reservoir_pct.isna().all() and o.clarifier_inflow_lps.isna().all()
    assert (k.clarifier_inflow_lps > s.CLARIFIER_CAPACITY_LPS).any()  # demand-stress utilisation > 1


def test_determinism():
    assert s.simulate(rain).equals(df)
    assert s.to_sql(s.simulate(rain)) == s.to_sql(df)


def test_sql_identical_to_committed_seed():
    committed = Path(__file__).resolve().parent.parent / "supabase/seed/july_readings.sql"
    assert s.to_sql(df) == committed.read_text(), "refactor changed simulate() output"


def test_rain_matches_openmeteo_daily():
    daily = s.fetch_daily()
    mine = rain.groupby(rain.index.date).sum()
    assert len(mine) == 31
    assert (np.abs(mine.values - daily.values) <= 0.1 + 1e-9).all(), (mine - daily).abs().max()


def test_crisis_window():
    c1 = crisis[crisis.intake_id == "caramayon_1"]
    assert ((c1.turbidity_ntu >= s.TURBIDITY_SHUTOFF_NTU) & (c1.plant_status == "shutdown")).any()
    assert (crisis[crisis.intake_id == "kulador"].plant_status == "degraded").any()
    for k in ("caramayon_1", "caramayon_2"):
        out = df[(df.intake_id == k) & df.is_outage]
        assert len(out) > 0 and (out.plant_status == "shutdown").all()


def test_baseline_normal():
    rest = df[~df.is_crisis]
    assert (rest.plant_status == "normal").mean() >= 0.8


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)
    print("ALL PASS")
