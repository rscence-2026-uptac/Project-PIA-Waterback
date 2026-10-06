"""Tests for the v3 candidate study. Run: ml/.venv/bin/python -m pytest ml/test_v3.py -s  (or python ml/test_v3.py)
Monotonicity is REPORTED (printed + asserted only to be computable), never forced."""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import v3_lib as L
import synthetic as syn

ML = L.ML
_SMALL = {}


def small():
    if not _SMALL:
        d = L.build(60); tr = np.arange(48); X, y, g = L.rows(d, tr); _SMALL.update(d=d, X=X, y=y, g=g)
    return _SMALL


def test_build_matches_v2_synthetic():
    d = L.build(8); t, dd = syn.build_dataset(8)
    X, y, _ = L.rows(d, np.arange(8))
    assert np.array_equal(X, t[syn.TURB_FEATURES].values) and np.array_equal(y, t.y.values)
    assert np.array_equal(d["XD"].reshape(-1, 4), dd[syn.DROUGHT_FEATURES].values) and np.array_equal(d["YD"].reshape(-1), dd.y.values)


def test_deterministic():
    s = small()
    a = L.gam_export(L.fit_gam("g", L.V2A_COLS, s["X"], s["y"], s["g"], k=4, C=1.0))
    b = L.gam_export(L.fit_gam("g", L.V2A_COLS, s["X"], s["y"], s["g"], k=4, C=1.0))
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    l1 = L.linear_export(L.fit_linear("l", L.V2A_COLS, s["X"], s["y"], s["g"], C=0.1)); l2 = L.linear_export(L.fit_linear("l", L.V2A_COLS, s["X"], s["y"], s["g"], C=0.1))
    assert l1 == l2
    d2 = L.build(8); d3 = L.build(8)
    assert np.array_equal(d2["X"], d3["X"])


def test_export_matches_sklearn_in_process():
    s = small(); rng = np.random.default_rng(1)
    for m in (L.fit_gam("g", L.V2A_COLS, s["X"], s["y"], s["g"], k=5, C=1.0), L.fit_linear("l", L.V2A_COLS, s["X"], s["y"], s["g"], C=0.1)):
        exp = L.gam_export(m) if m.kind == "gam" else L.linear_export(m)
        Xt = s["d"]["X"][48:].reshape(-1, 5)[rng.choice(12 * 1440, 300, replace=False)]
        Xt = np.vstack([Xt, Xt.max(0) * 4 + 1, np.zeros((1, 5))])          # incl. out-of-range and zeros (clamping)
        ps = m.predict(Xt)
        pe = np.array([L.export_predict(exp, dict(zip(exp["features"], r[m.cols]))) for r in Xt])
        assert np.abs(ps - pe).max() < 1e-6, np.abs(ps - pe).max()


def test_committed_vectors_match_exported_format():
    cand = json.loads((ML / "predictor_v3_candidate.json").read_text()); v = json.loads((ML / "predictor_v3_test_vectors.json").read_text())
    assert len(v["vectors"]) >= 25 and v["features"] == cand["export"]["features"]
    worst = max(abs(L.export_predict(cand["export"], x["features"]) - x["p"]) for x in v["vectors"])
    print("max |export - sklearn| on vectors:", worst)
    assert worst < 1e-6
    for x in v["vectors"]: assert x["level"] == L.level(x["p"])


def test_monotonic_report():
    cand = json.loads((ML / "predictor_v3_candidate.json").read_text()); exp = cand["export"]
    rep = {}
    for f in exp["features"]:
        if exp["format"] == "linear": rep[f] = dict(violation=exp["weights"][f] < 0, max_decline=0.0); continue
        t = exp["terms"][f]; rng_hi = t["x_max"]
        xs = np.linspace(t["x_min"], rng_hi, 800); g = L.gam_eval_term(t, xs); dg = np.diff(g)
        rep[f] = dict(violation=bool((dg < -1e-9).any()), max_decline=float(-dg.min()) if (dg < 0).any() else 0.0, frac_decreasing=float((dg < -1e-9).mean()))
    print("monotonicity report (expected non-decreasing for all four features):", json.dumps(rep))
    assert set(rep) == set(exp["features"])


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"): f(); print("ok", n)
