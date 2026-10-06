"""v3 candidate study: shared library (data build, models, export, metrics). Does NOT touch v2 artefacts.

Deterministic. Same synthetic world as ml/synthetic.py (identical rng stream, verified in test_v3.py), but keeps the
full hourly series per trajectory (for event-level scoring), the rain-window start date (for the time split), and
Caramayon I turbidity (for the WSP rule baseline). Synthetic plant response; real rain. NOT incident history.
"""
from __future__ import annotations
import contextlib, copy, json, math, sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import SplineTransformer, StandardScaler

ML = Path(__file__).resolve().parent
sys.path.insert(0, str(ML))
import synthetic as syn
import simulate_july as sj
from wsp_constants import (KULADOR_DEGRADED_NTU, TURBIDITY_SHUTOFF_NTU, TURBIDITY_LIMIT_NTU, DROUGHT_RESERVOIR_PCT,
                           FORECAST_BLOCK_H, FORECAST_HORIZON_H, FORECAST_MISS_FACTOR)

SEED = 20261006
DECISION = 0.4
THRESHOLDS = [0.2, 0.4, 0.6, 0.8]
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0]
F5 = syn.TURB_FEATURES                                   # v2 feature order
V2A_COLS = [0, 2, 3, 4]                                  # v2 minus turbidity_slope_per_hr
V2A_FEATURES = [F5[i] for i in V2A_COLS]
LO, HI = syn.WARMUP_DAYS * 24, (syn.WARMUP_DAYS + syn.USABLE_DAYS) * 24
WIN = (syn.WARMUP_DAYS + syn.USABLE_DAYS + syn.LOOKAHEAD_DAYS) * 24
NUSE = HI - LO                                           # usable hours per trajectory (1440)
STRIDE = syn.SAMPLE_STRIDE_H


def level(p: float) -> int:
    return sum(p >= t for t in THRESHOLDS)


# ----------------------------------------------------------------------------------------------- data
def synth_forecast_param(rain_h, rng, mu_log, sigma, miss_p, fa_p, fa_mean, fa_max_actual=2.0):
    """Generalised training forecast (same structure as syn.synth_forecast_48h) with a log-bias mu_log: used for the EMPIRICAL
    forecast-error variant fitted to Open-Meteo Previous Runs (2024-2025)."""
    actual = syn.forward_sum(np.asarray(rain_h, float), FORECAST_HORIZON_H)
    nb = len(actual) // FORECAST_BLOCK_H + 1
    err = np.exp(rng.normal(mu_log, sigma, nb)); miss = rng.random(nb) < miss_p
    fa = rng.random(nb) < fa_p; fa_mm = rng.exponential(fa_mean, nb)
    b = np.arange(len(actual)) // FORECAST_BLOCK_H
    f = actual * np.where(miss[b], FORECAST_MISS_FACTOR, err[b])
    return f + np.where(fa[b] & (actual < fa_max_actual), fa_mm[b], 0.0)


@contextlib.contextmanager
def patched_world(sigma=None, gain=1.0):
    keep_s, keep_r = syn.FORECAST_LOGNORMAL_SIGMA, copy.deepcopy(sj.RESP)
    try:
        if sigma is not None: syn.FORECAST_LOGNORMAL_SIGMA = sigma
        for k in sj.RESP: sj.RESP[k]["gain"] = keep_r[k]["gain"] * gain
        yield
    finally:
        syn.FORECAST_LOGNORMAL_SIGMA = keep_s
        for k in sj.RESP: sj.RESP[k]["gain"] = keep_r[k]["gain"]


def build(n_traj=500, seed=SEED, sigma=None, gain=1.0, emp=None) -> dict:
    """Full-resolution twin of syn.build_dataset. emp = dict(mu_log, sigma, miss_p, fa_p, fa_mean) -> empirical forecast error."""
    rain_all, tidx = syn.load_rain_10y()
    rngs = [np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(n_traj)]
    doy = tidx.dayofyear.values; ar = np.arange(len(tidx))
    dry_starts = np.where((tidx.hour.values == 0) & (doy >= 1) & (doy <= 105) & (ar <= len(tidx) - WIN))[0]
    any_starts = np.where((tidx.hour.values == 0) & (ar <= len(tidx) - WIN))[0]
    hours = np.arange(WIN) % 24
    X = np.zeros((n_traj, NUSE, 5)); Y = np.zeros((n_traj, NUSE), np.int8); EV = np.zeros((n_traj, NUSE), bool)
    C1 = np.zeros((n_traj, NUSE)); XD = np.zeros((n_traj, syn.USABLE_DAYS, 4)); YD = np.zeros((n_traj, syn.USABLE_DAYS), np.int8)
    start, end = [], []
    with patched_world(sigma, gain):
        for j, rng in enumerate(rngs):
            pool = dry_starts if rng.random() < syn.DRY_SEASON_START_FRAC else any_starts
            s0 = int(rng.choice(pool)); rain = rain_all[s0:s0 + WIN]
            tr = syn.simulate_trajectory(rain, hours, rng)
            ev = (tr["kul"] >= KULADOR_DEGRADED_NTU) | (tr["c1"] >= TURBIDITY_SHUTOFF_NTU)
            y = syn._forward_any(ev, syn.TURB_HORIZON_H)
            fc = (synth_forecast_param(rain, rng, **emp) if emp else syn.synth_forecast_48h(rain, rng))
            Xf = syn.turbidity_features(tr["kul"], rain, fc)
            X[j], Y[j], EV[j], C1[j] = Xf[LO:HI], y[LO:HI], ev[LO:HI], tr["c1"][LO:HI]
            nd = WIN // 24
            res_mean = tr["res"].reshape(nd, 24).mean(1); cf_min = tr["res_cf"].reshape(nd, 24).min(1)
            yd = syn._forward_any(cf_min < DROUGHT_RESERVOIR_PCT, syn.DROUGHT_HORIZON_D)
            Xd = syn.drought_features(res_mean, rain.reshape(nd, 24).sum(1))
            sel = np.arange(syn.WARMUP_DAYS, syn.WARMUP_DAYS + syn.USABLE_DAYS)
            XD[j], YD[j] = Xd[sel], yd[sel]
            start.append(tidx[s0]); end.append(tidx[s0 + WIN - 1])
    return dict(X=X, Y=Y, EV=EV, C1=C1, XD=XD, YD=YD, start=pd.DatetimeIndex(start), end=pd.DatetimeIndex(end), n=n_traj, seed=seed)


def split_random(d: dict):
    """v2's split: 80/20 by trajectory, stratified on (turbidity-positive, drought-positive), random_state = seed."""
    trajs = np.arange(d["n"])
    strat = d["Y"].max(1).astype(int) * 2 + d["YD"].max(1).astype(int)
    return train_test_split(trajs, test_size=0.2, random_state=d["seed"], stratify=strat)


def split_time(d: dict):
    """Train: windows entirely within 2016-2022. Test: windows starting 2023 or later. Straddlers dropped."""
    tr = np.flatnonzero(d["end"].year <= 2022); te = np.flatnonzero(d["start"].year >= 2023)
    return tr, te


def rows(d: dict, trajs, key="X", stride=STRIDE):
    """Stride-sampled (v2-style) training/eval rows: X (n,5), y, group."""
    X = d[key][trajs][:, ::stride].reshape(-1, 5); y = d["Y"][trajs][:, ::stride].reshape(-1)
    g = np.repeat(trajs, NUSE // stride)
    return X, y.astype(int), g


# ----------------------------------------------------------------------------------------------- models
class Model:
    """kind in {linear, gam, gbm}; predicts from the 5-column v2 feature matrix."""
    def __init__(self, name, kind, cols, pipe, params):
        self.name, self.kind, self.cols, self.pipe, self.params = name, kind, cols, pipe, params

    def predict(self, X5):
        X = np.asarray(X5, float).reshape(-1, 5)[:, self.cols]
        return self.pipe.predict_proba(X)[:, 1]


def _cv_pick(make, grid, X, y, g, seed):
    scores = {}
    for key in grid:
        a = []
        for i, j in GroupKFold(n_splits=5).split(X, y, g):
            m = make(*key).fit(X[i], y[i]); a.append(roc_auc_score(y[j], m.predict_proba(X[j])[:, 1]))
        scores[key] = float(np.mean(a))
    best = max(scores.values())
    return min((k for k, s in scores.items() if s >= best - 1e-4), key=lambda k: (k[0], k[1]) if len(k) > 1 else k), scores


def fit_linear(name, cols, X5, y, g, seed=SEED, C=None):
    X = X5[:, cols]
    mk = lambda C_: make_pipeline(StandardScaler(), LogisticRegression(C=C_, class_weight="balanced", max_iter=2000, random_state=seed))
    if C is None:
        (C,), sc = _cv_pick(lambda c: mk(c), [(c,) for c in C_GRID], X, y, g, seed)
    return Model(name, "linear", cols, mk(C).fit(X, y), dict(C=C))


def knots_for(x, k):
    """k knots per feature: min, (k-2) interior quantiles of the POSITIVE values (rain is zero-inflated), max. Deterministic."""
    pos = x[x > np.min(x)] if np.any(x > np.min(x)) else x
    inner = np.quantile(pos, np.linspace(0, 1, k)[1:-1]) if k > 2 else np.array([])
    kn = np.unique(np.concatenate([[x.min()], inner, [x.max()]]))
    return kn


def _gam_pipe(knots, C, seed):
    tfs = [(f"s{i}", SplineTransformer(degree=3, knots=kn.reshape(-1, 1), extrapolation="constant", include_bias=True), [i]) for i, kn in enumerate(knots)]
    return make_pipeline(ColumnTransformer(tfs), StandardScaler(), LogisticRegression(C=C, class_weight="balanced", max_iter=3000, random_state=seed))


def fit_gam(name, cols, X5, y, g, seed=SEED, k=None, C=None):
    X = X5[:, cols]
    mk = lambda k_, C_: _gam_pipe([knots_for(X[:, i], k_) for i in range(X.shape[1])], C_, seed)
    if k is None or C is None:
        (k, C), sc = _cv_pick(mk, [(k_, c) for k_ in (3, 4, 5) for c in (0.01, 0.1, 1.0, 10.0)], X, y, g, seed)
    knots = [knots_for(X[:, i], k) for i in range(X.shape[1])]
    return Model(name, "gam", cols, _gam_pipe(knots, C, seed).fit(X, y), dict(k=k, C=C, knots=[kn.tolist() for kn in knots]))


def fit_gbm(name, cols, X5, y, g, seed=SEED):
    X = X5[:, cols]
    clf = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.08, max_depth=4, min_samples_leaf=50, l2_regularization=1.0,
                                         monotonic_cst=[1] * len(cols), class_weight="balanced", early_stopping=False, random_state=seed)
    return Model(name, "gbm", cols, clf.fit(X, y), dict(monotonic_cst=[1] * len(cols)))


class V2Json:
    """The LIVE v2 model, read from ml/predictor_coefficients.json (read-only). Same 5 columns."""
    name, kind = "v2", "v2json"
    def __init__(self):
        m = json.loads((ML / "predictor_coefficients.json").read_text())["turbidity"]
        self.w = np.array([m["weights"][f] for f in F5]); self.b = m["bias"]; self.cols = list(range(5)); self.params = {}
    def predict(self, X5): return 1 / (1 + np.exp(-(np.asarray(X5, float).reshape(-1, 5) @ self.w + self.b)))


# ---- GAM export: fold scaler + LR weights into per-feature piecewise cubics ----------------------------
def gam_export(model: Model, ref_x=None) -> dict:
    """sigmoid(bias + sum_f g_f(clamp(x_f))). g_f piecewise cubic on its knot intervals (exact), constant outside [x_min, x_max]."""
    ct, sc, lr = model.pipe.steps[0][1], model.pipe.steps[1][1], model.pipe.steps[2][1]
    w = lr.coef_[0] / sc.scale_; bias = float(lr.intercept_[0] - np.sum(lr.coef_[0] * sc.mean_ / sc.scale_))
    feats = [F5[c] for c in model.cols]; terms = {}; off = 0
    sv = np.array([0, 1 / 3, 2 / 3, 1.0]); V = np.vander(sv, 4, increasing=True)
    for i, f in enumerate(feats):
        tf = ct.named_transformers_[f"s{i}"]; nb = tf.n_features_out_; wf = w[off:off + nb]; off += nb
        kn = np.array(model.params["knots"][i]); g = lambda x: tf.transform(np.asarray(x, float).reshape(-1, 1)) @ wf
        c0 = float(g([kn[0]])[0]); bias += c0                       # centre: g_f(x_min) = 0
        pieces = []
        for a, b in zip(kn[:-1], kn[1:]):
            gv = g(a + sv * (b - a)) - c0
            pieces.append(dict(x0=float(a), w=float(b - a), c=np.linalg.solve(V, gv).tolist()))
        terms[f] = dict(x_min=float(kn[0]), x_max=float(kn[-1]), pieces=pieces)
    return dict(format="gam_pp", features=feats, bias=bias, terms=terms)


def gam_eval_term(t: dict, x):
    x = np.clip(np.asarray(x, float), t["x_min"], t["x_max"]); out = np.zeros(x.shape)
    xs = np.array([p["x0"] for p in t["pieces"]]); i = np.clip(np.searchsorted(xs, x, side="right") - 1, 0, len(xs) - 1)
    for k, p in enumerate(t["pieces"]):
        m = i == k
        if m.any():
            s = (x[m] - p["x0"]) / p["w"]; out[m] = sum(c * s ** e for e, c in enumerate(p["c"]))
    return out


def export_predict(exp: dict, feats: dict) -> float:
    """Reference implementation of the exported format (what the TS port must do)."""
    if exp["format"] == "linear":
        z = exp["bias"] + sum(exp["weights"][f] * float(feats[f]) for f in exp["features"])
    else:
        z = exp["bias"] + sum(float(gam_eval_term(exp["terms"][f], np.array([float(feats[f])]))[0]) for f in exp["features"])
    return 1 / (1 + math.exp(-z)) if z >= 0 else math.exp(z) / (1 + math.exp(z))


def linear_export(model: Model) -> dict:
    sc, lr = model.pipe.steps[0][1], model.pipe.steps[1][1]
    w = lr.coef_[0] / sc.scale_; b = float(lr.intercept_[0] - np.sum(lr.coef_[0] * sc.mean_ / sc.scale_))
    feats = [F5[c] for c in model.cols]
    return dict(format="linear", features=feats, bias=b, weights={f: float(x) for f, x in zip(feats, w)})


def shape_table(exp: dict, grids: dict) -> dict:
    out = {}
    for f in exp["features"]:
        xs = np.array(grids[f], float)
        out[f] = (exp["weights"][f] * (xs - xs[0]) if exp["format"] == "linear" else gam_eval_term(exp["terms"][f], xs)).tolist()
    return out


# ----------------------------------------------------------------------------------------------- baselines (no ML)
class WspRule:
    """Kulador raw turbidity > thr NTU OR Caramayon I >= 500 NTU. thr=5: WSP permissible limit (name 'WSP rule'); thr=250: reactive plant-degraded state."""
    kind = "rule"
    def __init__(self, thr=TURBIDITY_LIMIT_NTU, name="WSP rule"): self.thr, self.name = thr, name
    def alarm(self, X5, c1): return (X5[..., 0] > self.thr) | (c1 >= TURBIDITY_SHUTOFF_NTU)
    def score(self, X5, c1): return X5[..., 0] + 1e3 * (c1 >= TURBIDITY_SHUTOFF_NTU)


class RainRule:
    kind = "rule"
    def __init__(self, name, thr): self.name, self.thr = name, thr
    def score(self, X5, c1=None): return X5[..., 2] + X5[..., 4]
    def alarm(self, X5, c1=None): return self.score(X5) >= self.thr


def fit_rain_rules(X5, y):
    s = X5[:, 2] + X5[:, 4]; cand = np.unique(np.quantile(s, np.linspace(0.3, 0.995, 400)))
    best_f1, thr_f1, thr_r = -1, None, None
    P = y.sum()
    for x in cand:
        a = s >= x; tp = (a & (y == 1)).sum(); fp = (a & (y == 0)).sum(); f1 = 2 * tp / (2 * tp + fp + (P - tp) + 1e-12)
        if f1 > best_f1: best_f1, thr_f1 = f1, float(x)
        if tp / P >= 0.85: thr_r = float(x)                              # largest threshold still reaching recall 0.85
    return RainRule(f"rain-sum rule (F1, X={thr_f1:.1f} mm)", thr_f1), RainRule(f"rain-sum rule (recall 0.85, X={thr_r:.1f} mm)", thr_r)


# ----------------------------------------------------------------------------------------------- metrics
def row_metrics(score, alarm, y):
    tp = int((alarm & (y == 1)).sum()); fp = int((alarm & (y == 0)).sum()); fn = int((~alarm & (y == 1)).sum())
    return dict(recall=tp / max(tp + fn, 1), precision=tp / max(tp + fp, 1), roc_auc=float(roc_auc_score(y, score)),
                alarm_rate=float(alarm.mean()), n=int(len(y)), pos_rate=float(y.mean()))


def _runs(flag):
    d = np.diff(np.concatenate([[0], flag.astype(int), [0]]))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1) - 1))


def _merge(runs, gap):
    out = []
    for s, e in runs:
        if out and s - out[-1][1] <= gap: out[-1] = (out[-1][0], e)
        else: out.append((s, e))
    return out


def event_metrics(alarm, ev, y, lookback=72, merge_gap_alarm=6, merge_gap_event=48):
    """alarm/ev/y: (n_traj, NUSE). Event = onset of an episode of event hours (episodes merged if < 48 h apart); only onsets with
    >= lookback usable hours before them are scored. Caught = alarm in [onset-48, onset-1]; lead = onset minus the start of the
    (<=6 h gap merged) alarm run reaching back from the latest alarm hour in that window, clipped to the 72 h lookback.
    False-alarm episode = alarm run (gaps <= 6 h merged) with no event hour in (run start, run end + 48 h]."""
    n_ev = caught = 0; leads = []; fa = 0; n_ep = 0
    for a, e, yy in zip(alarm, ev, y):
        for s0, _ in _merge(_runs(e), merge_gap_event):
            if s0 < lookback or e[max(s0 - 1, 0)]: continue
            n_ev += 1; w = a[s0 - 48:s0]
            if w.any():
                caught += 1; last = s0 - 48 + int(np.flatnonzero(w)[-1]); s = last
                while s > s0 - lookback and (a[s - 1] or a[max(s - merge_gap_alarm - 1, 0):s].any()): s -= 1
                leads.append(s0 - s)
        for s, t in _merge(_runs(a), merge_gap_alarm):
            n_ep += 1
            if not (yy[s:t + 1].any() or e[s:t + 1].any()): fa += 1
    days = alarm.shape[0] * NUSE / 24
    return dict(n_events=n_ev, caught=caught, missed=n_ev - caught, catch_rate=caught / max(n_ev, 1),
                lead_median=float(np.median(leads)) if leads else float("nan"), lead_p25=float(np.quantile(leads, .25)) if leads else float("nan"),
                fa_per_30d=fa / days * 30, alarm_episodes_per_30d=n_ep / days * 30)


def reliability(p, y, bins=10):
    e = np.linspace(0, 1, bins + 1); b = np.clip(np.digitize(p, e[1:-1]), 0, bins - 1); out = []
    for i in range(bins):
        m = b == i
        out.append(dict(bin=f"{e[i]:.1f}-{e[i+1]:.1f}", n=int(m.sum()), mean_pred=float(p[m].mean()) if m.any() else None, obs=float(y[m].mean()) if m.any() else None))
    return out


def evaluate(models, rules, d, test, c1_rows=True):
    """Row-level (stride-4) + event-level (hourly) for each model/rule on the given test trajectories."""
    Xr, yr, _ = rows(d, test); c1r = d["C1"][test][:, ::STRIDE].reshape(-1)
    Xh = d["X"][test]; c1h = d["C1"][test]; res = {}
    for m in models:
        p = m.predict(Xr); ph = m.predict(Xh.reshape(-1, 5)).reshape(len(test), NUSE)
        r = row_metrics(p, p >= DECISION, yr); r["brier"] = float(brier_score_loss(yr, p))
        r.update({"ev_" + k: v for k, v in event_metrics(ph >= DECISION, d["EV"][test], d["Y"][test]).items()})
        res[m.name] = r
    for rl in rules:
        a = rl.alarm(Xr, c1r) if isinstance(rl, WspRule) else rl.alarm(Xr)
        s = rl.score(Xr, c1r); ah = rl.alarm(Xh, c1h) if isinstance(rl, WspRule) else rl.alarm(Xh)
        r = row_metrics(s, a, yr); r["brier"] = None
        r.update({"ev_" + k: v for k, v in event_metrics(ah, d["EV"][test], d["Y"][test]).items()})
        res[rl.name] = r
    return res
