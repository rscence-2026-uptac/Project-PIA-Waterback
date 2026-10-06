"""Plain-assert tests for the predictor. Run: ml/.venv/bin/python ml/test_train_predictor.py"""
import json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np
import train_predictor as tp
import synthetic as syn

ML = Path(__file__).parent
COEF = json.loads((ML / "predictor_coefficients.json").read_text())
VEC = json.loads((ML / "predictor_test_vectors.json").read_text())
_R = {}


def run():  # cache one training run
    if "r" not in _R: _R["r"] = tp.train()
    return _R["r"]


def test_feature_lists_match_contract():
    # spec 02 / supabase/functions/disruption-predictor contract (v2); order matters
    assert syn.TURB_FEATURES == ["turbidity_ntu", "turbidity_slope_per_hr", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"]
    assert syn.DROUGHT_FEATURES == ["reservoir_pct", "rain_14d_mm", "rain_30d_mm", "days_since_rain_over_5mm"]
    assert COEF["version"] == "2026-10-06.2" == tp.VERSION
    assert COEF["turbidity"]["features"] == syn.TURB_FEATURES and COEF["drought"]["features"] == syn.DROUGHT_FEATURES


def test_days_since_rule():
    f = syn.days_since_big_rain
    assert list(f(np.array([0, 0, 6.0, 0, 0, 5.0, 1, 0]))) == [1, 2, 0, 1, 2, 0, 1, 2]   # none yet -> days of history; >=5 counts; 0 today
    assert f(np.array([4.9, 0, 0]))[2] == 3                                               # 4.9 mm is not a rain day


def test_schema():
    assert COEF["version"] and COEF["trained_at"] and isinstance(COEF["seed"], int)
    assert COEF["training_data"].startswith("synthetic, physics-informed") and "not real incident history" in COEF["training_data"]
    assert COEF["signal_level_thresholds"] == [0.2, 0.4, 0.6, 0.8] and COEF["decision_threshold"] == 0.4
    ts = (ML.parent / "packages/shared-types/src/constants.ts").read_text()
    m = re.search(r"SIGNAL_LEVEL_THRESHOLDS\s*=\s*\[([^\]]*)\]", ts)
    assert [float(x) for x in m.group(1).split(",")] == COEF["signal_level_thresholds"]
    for key, feats in (("turbidity", syn.TURB_FEATURES), ("drought", syn.DROUGHT_FEATURES)):
        m = COEF[key]
        assert m["features"] == feats and list(m["weights"]) == feats
        assert isinstance(m["bias"], float) and all(isinstance(v, float) for v in m["weights"].values())
        assert set(m["metrics"]) == {"recall", "precision", "roc_auc", "n_test", "positive_rate"}
        assert isinstance(m["metrics"]["n_test"], int)
    assert set(COEF) == {"version", "trained_at", "seed", "training_data", "signal_level_thresholds", "decision_threshold", "turbidity", "drought"}


def test_dataset_size():
    r = run()
    assert r["turb"]["extra"]["n_total"] >= 20000 and r["dro"]["extra"]["n_total"] >= 3000
    assert 0.05 < r["turb"]["extra"]["positive_rate_all"] < 0.95 and 0.05 < r["dro"]["extra"]["positive_rate_all"] < 0.95


def test_gates_recall_precision():
    for key, k in (("turbidity", "turb"), ("drought", "dro")):
        m = COEF[key]["metrics"]
        assert m["recall"] >= 0.85, (key, "recall", m)
        assert m["precision"] >= 0.65, (key, "precision", m)
    r = run()
    for k in ("turb", "dro"):
        assert r[k]["model"]["metrics"] == COEF["turbidity" if k == "turb" else "drought"]["metrics"]


def test_no_class_weight_boost_or_moved_threshold():
    assert COEF["decision_threshold"] == 0.4 and not hasattr(tp, "BOOST_GRID")
    assert "boost" not in run()["turb"]["extra"]


def test_july_non_event_alarm_rate():
    rp = tp.july_replay(COEF["turbidity"], COEF["drought"])
    assert rp["main"]["nonevent_rate"] < 0.20, rp["main"]["nonevent_rate"]


def test_vectors():
    r = run()
    for key, k, feats in (("turbidity", "turb", syn.TURB_FEATURES), ("drought", "dro", syn.DROUGHT_FEATURES)):
        v = VEC[key]; assert len(v) >= 25
        for e in v:
            assert list(e["features"]) == feats
            assert abs(tp.predict_folded(COEF[key], e["features"]) - e["p"]) < 1e-9          # file coefficients
            x = np.array([[e["features"][f] for f in feats]])
            assert abs(r[k]["pipe"].predict_proba(x)[0, 1] - e["p"]) < 1e-9                  # sklearn pipeline
        ps = [e["p"] for e in v]; assert min(ps) < 0.2 and max(ps) > 0.9, (key, min(ps), max(ps))  # extremes covered


def test_determinism():
    a = tp.train(); b = run()
    for k in ("turb", "dro"):
        assert a[k]["model"]["bias"] == b[k]["model"]["bias"] and a[k]["model"]["weights"] == b[k]["model"]["weights"]
    for key, k in (("turbidity", "turb"), ("drought", "dro")):  # committed file == fresh training
        assert COEF[key]["bias"] == b[k]["model"]["bias"] and COEF[key]["weights"] == b[k]["model"]["weights"]


def test_signs():
    for key in ("turbidity", "drought"):
        for f, w in COEF[key]["weights"].items():
            assert w * tp.EXPECTED_SIGN[f] > 0, f"{key}.{f} weight {w:+.5g} has the wrong (counter-intuitive) sign"


if __name__ == "__main__":
    failed = []
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            try: fn(); print("ok", name)
            except AssertionError as e: failed.append(name); print("FAIL", name, "->", e)
    print("ALL PASS" if not failed else f"FAILED: {failed}")
    sys.exit(1 if failed else 0)
