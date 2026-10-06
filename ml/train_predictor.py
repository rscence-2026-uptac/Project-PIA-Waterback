"""Train the two disruption-predictor logistic regressions (spec 02) and export human-readable coefficients.

Run: ml/.venv/bin/python ml/train_predictor.py   (deterministic; writes ml/predictor_coefficients.json,
ml/predictor_test_vectors.json, ml/reports/training_report.md, ml/reports/july_2026_replay.md). Never pickles.
"""
from __future__ import annotations
import json, math, sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synthetic as syn
import simulate_july as sj
from wsp_constants import KULADOR_DEGRADED_NTU, TURBIDITY_SHUTOFF_NTU, DROUGHT_RESERVOIR_PCT

ML = Path(__file__).resolve().parent
SEED = 20261006
N_TRAJ = 500
VERSION = "2026-10-06.2"
THRESHOLDS = [0.2, 0.4, 0.6, 0.8]      # signal_level_thresholds (constants.ts SIGNAL_LEVEL_THRESHOLDS)
DECISION = 0.4                          # signal level >= 2; NEVER tuned
GATE_RECALL, GATE_PRECISION, GATE_NONEVENT_ALARM = 0.85, 0.65, 0.20   # acceptance gates (spec 02); never relaxed to pass
C_GRID = [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 100.0]
TRAINING_DATA = "synthetic, physics-informed; rain = real Open-Meteo 2016-2025 Catbalogan; not real incident history"
MEANING = {
    "turbidity_ntu": "current Kulador raw turbidity (per NTU)",
    "turbidity_slope_per_hr": "how fast turbidity is rising (per NTU/h over last 6 readings)",
    "rain_24h_mm": "rain in the last 24 h (per mm)",
    "rain_72h_mm": "rain in the last 72 h (per mm)",
    "forecast_rain_48h_mm": "forecast rain in the next 48 h (per mm)",
    "reservoir_pct": "reservoir level, daily mean (per % of 340 m3 usable)",
    "rain_14d_mm": "rain over the last 14 days (per mm)",
    "rain_30d_mm": "rain over the last 30 days (per mm)",
    "days_since_rain_over_5mm": "dry-spell length (per day since a >=5 mm rain day)",
}


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z)) if z >= 0 else math.exp(z) / (1.0 + math.exp(z))


def predict_folded(model: dict, feats: dict) -> float:
    return sigmoid(model["bias"] + sum(model["weights"][k] * float(feats[k]) for k in model["features"]))


def fold(pipe, features: list[str]) -> dict:
    sc, lr = pipe.named_steps["standardscaler"], pipe.named_steps["logisticregression"]
    w, mu, sd = lr.coef_[0], sc.mean_, sc.scale_
    w_raw = w / sd
    b_raw = float(lr.intercept_[0] - np.sum(w * mu / sd))
    return {"features": features, "bias": b_raw, "weights": {f: float(x) for f, x in zip(features, w_raw)},
            "std_weights": {f: float(x) for f, x in zip(features, w)}}


def fit_one(df: pd.DataFrame, features: list[str], train_trajs, test_trajs, name: str) -> dict:
    tr, te = df[df.traj.isin(train_trajs)], df[df.traj.isin(test_trajs)]
    Xtr, ytr, Xte, yte = tr[features].values, tr.y.values, te[features].values, te.y.values
    # C chosen by grouped 5-fold CV ROC-AUC on the TRAIN split only (ties -> smaller C); threshold untouched.
    cv = GroupKFold(n_splits=5)
    scores = {}
    for C in C_GRID:
        a = []
        for i, j in cv.split(Xtr, ytr, tr.traj.values):
            m = make_pipeline(StandardScaler(), LogisticRegression(C=C, class_weight="balanced", max_iter=1000)).fit(Xtr[i], ytr[i])
            a.append(roc_auc_score(ytr[j], m.predict_proba(Xtr[j])[:, 1]))
        scores[C] = float(np.mean(a))
    best = max(scores.values()); C = min(c for c, s in scores.items() if s >= best - 1e-4)
    # class_weight='balanced' only (v1's positive-class boost is gone). Threshold untouched.
    pipe = make_pipeline(StandardScaler(), LogisticRegression(C=C, class_weight="balanced", max_iter=1000, random_state=SEED)).fit(Xtr, ytr)
    p = pipe.predict_proba(Xte)[:, 1]; pred = (p >= DECISION).astype(int)
    cm = confusion_matrix(yte, pred, labels=[0, 1])
    m = {"recall": float(recall_score(yte, pred)), "precision": float(precision_score(yte, pred)),
         "roc_auc": float(roc_auc_score(yte, p)), "n_test": int(len(yte)), "positive_rate": float(yte.mean())}
    extra = {"C": C, "cv_auc": scores, "confusion": cm.tolist(), "n_train": int(len(ytr)), "train_positive_rate": float(ytr.mean()),
             "n_total": int(len(df)), "positive_rate_all": float(df.y.mean()), "test_pred_positive_rate": float(pred.mean())}
    if "already_degraded" in te:  # onset recall: rows whose current raw turbidity is not yet in the event state
        o = te.already_degraded.values == 0
        extra["onset_recall"] = float(recall_score(yte[o], pred[o])); extra["onset_n_pos"] = int(yte[o].sum())
        extra["onset_precision"] = float(precision_score(yte[o], pred[o]))
    model = fold(pipe, features); model["metrics"] = m
    # sanity: folded == pipeline
    Xs = Xte[:200]; pf = np.array([predict_folded(model, dict(zip(features, r))) for r in Xs])
    assert np.abs(pf - pipe.predict_proba(Xs)[:, 1]).max() < 1e-9
    return {"name": name, "model": model, "pipe": pipe, "extra": extra, "test_df": te}


def make_vectors(res: dict, features: list[str], seed: int) -> list[dict]:
    """>=25 vectors: test-set quantile rows + hand-made extremes. p from folded sigmoid on 4-dp-rounded features."""
    rng = np.random.default_rng(seed)
    te = res["test_df"]; rows = te[features].sample(n=20, random_state=seed).values.tolist()
    lo, hi = te[features].min().values, te[features].max().values
    rows += [lo.tolist(), hi.tolist(), ((lo + hi) / 2).tolist(), te[features].median().values.tolist(), np.zeros(len(features)).tolist()]
    rows += [(lo + (hi - lo) * rng.random(len(features))).tolist() for _ in range(5)]
    out = []
    for r in rows:
        f = {k: (int(round(v)) if k == "days_since_rain_over_5mm" else round(float(v), 4)) for k, v in zip(features, r)}
        out.append({"features": f, "p": predict_folded(res["model"], f)})
        assert abs(out[-1]["p"] - res["pipe"].predict_proba(np.array([[f[k] for k in features]]))[0, 1]) < 1e-9
    return out


def level(p: float) -> int:
    return sum(p >= t for t in THRESHOLDS)


def june_rain() -> np.ndarray:
    """REAL June 2026 hourly rain (context for trailing rain windows at the start of July). Cached in ml/data."""
    f = ML / "data" / "openmeteo_2026-06.json"
    if not f.exists():
        import requests
        r = requests.get("https://archive-api.open-meteo.com/v1/archive", timeout=60, params=dict(
            latitude=sj.LAT, longitude=sj.LON, start_date="2026-06-01", end_date="2026-06-30", hourly="precipitation", timezone=sj.TZ))
        r.raise_for_status(); f.write_text(json.dumps(r.json()))
    return np.asarray(json.loads(f.read_text())["hourly"]["precipitation"], float)


def hist_forecast() -> np.ndarray:
    """Open-Meteo Historical Forecast archive (stitched first hours of successive runs), hourly 2026-06-01..07-31 (1464 h)."""
    f = ML / "data" / "openmeteo_histforecast_2026-06-07.json"
    return np.asarray(json.loads(f.read_text())["hourly"]["precipitation"], float)


def _episodes(ev: np.ndarray, merge_gap_h: int = 48) -> list[tuple[int, int]]:
    """Event episodes (start, end) = contiguous event hours, merged when separated by < merge_gap_h hours."""
    idx = np.flatnonzero(ev); out = []
    for i in idx:
        if out and i - out[-1][1] <= merge_gap_h: out[-1] = (out[-1][0], int(i))
        else: out.append((int(i), int(i)))
    return out


def _alarm_run_start(alarm: np.ndarray, i: int) -> int:
    """Start index of the unbroken p>=threshold run that contains hour i (i itself must be in alarm), else i."""
    j = i
    while j > 0 and alarm[j - 1]: j -= 1
    return j if alarm[i] else i


def july_replay(tm: dict, dm: dict) -> dict:
    rain = sj.fetch_rain(); df = sj.simulate(rain)
    jun = june_rain(); rain_ctx = np.concatenate([jun, rain.values]); off = len(jun); n = len(rain)
    k = df[df.intake_id == "kulador"].reset_index(drop=True); c1 = df[df.intake_id == "caramayon_1"].reset_index(drop=True)
    hf = hist_forecast(); assert len(hf) == len(rain_ctx)
    fc_archive = syn.forward_sum(hf, syn.FORECAST_HORIZON_H)[off:]
    ev = (k.turbidity_ntu.values >= KULADOR_DEGRADED_NTU) | (c1.turbidity_ntu.values >= TURBIDITY_SHUTOFF_NTU)
    label = syn._forward_any(ev, syn.TURB_HORIZON_H)                # True label per hour (needs 48 h look-ahead)
    valid = np.arange(n) < n - syn.TURB_HORIZON_H                    # last 48 h of July: label and forecast both truncated
    t = k.recorded_at; day = t.dt.date.values
    onset = int(np.argmax(ev)); crisis_start = pd.Timestamp(sj.SCENARIO["crisis_start"], tz=sj.TZ)

    def run(fc):
        # trailing rain windows use June context; Kulador slope uses the July series (June readings unknown)
        X = syn.turbidity_features(k.turbidity_ntu.values, rain.values, fc)
        X[:, 2] = syn._trailing_sum(rain_ctx, 24)[off:]; X[:, 3] = syn._trailing_sum(rain_ctx, 72)[off:]
        return np.array([predict_folded(tm, dict(zip(syn.TURB_FEATURES, r))) for r in X])

    def summarize(pt):
        al = pt >= DECISION
        ne = valid & ~label
        label72 = syn._forward_any(ev, 72); ne72 = valid & ~label72   # non-event AND no event in the 48-72 h band either
        eps = []
        for (s0, e0) in _episodes(ev):
            rs = _alarm_run_start(al, s0)
            eps.append(dict(onset=t[s0], onset_idx=s0, onset_p=float(pt[s0]), run_start=t[rs], run_start_idx=rs,
                            run_lead_h=int(s0 - rs), censored=bool(rs == 0), alarm_at_onset=bool(al[s0]),
                            quiet_before=bool((~al[:rs]).any()) if rs > 0 else False))
        return dict(nonevent_rate=float(al[ne].mean()), n_nonevent=int(ne.sum()), nonevent_alarm_hours=int(al[ne].sum()),
                    nonevent_rate_ex72=float(al[ne72].mean()), n_nonevent_ex72=int(ne72.sum()), n_alarm_hours=int(al[valid].sum()), event_recall=float(al[valid & label].mean()),
                    event_precision=float(label[valid & al].mean()) if (valid & al).any() else float("nan"),
                    first_alert_idx=int(np.argmax(al)) if al.any() else None, eps=eps, p=pt)

    main = summarize(run(fc_archive))
    # sensitivity: realistic (noisy) forecasts drawn from the TRAINING forecast-error model, 20 seeds
    sens = []
    for sd in range(20):
        fc = syn.synth_forecast_48h(rain_ctx, np.random.default_rng(1000 + sd))[off:]
        sens.append(summarize(run(fc)))
    pt = main["p"]
    # pre-roll diagnostic: a separately simulated June+July series (different noise from the seeded July series; used ONLY to ask
    # "was p < 0.4 before the alarm started?"). June intake readings do not exist in the seeded data.
    ridx = pd.date_range("2026-06-01", periods=len(rain_ctx), freq="h", tz=sj.TZ)
    dfp = sj.simulate(pd.Series(rain_ctx, index=ridx, name="precipitation_mm"))
    kp = dfp[dfp.intake_id == "kulador"].reset_index(drop=True)
    Xp = syn.turbidity_features(kp.turbidity_ntu.values, rain_ctx, syn.forward_sum(hf, syn.FORECAST_HORIZON_H))
    pp = np.array([predict_folded(tm, dict(zip(syn.TURB_FEATURES, r))) for r in Xp]); alp = pp >= DECISION
    on_p = off + onset; rs_p = _alarm_run_start(alp, on_p)
    below = np.flatnonzero(~alp[:on_p])
    preroll = dict(run_start=ridx[rs_p], lead_h=int(on_p - rs_p), last_below=None if len(below) == 0 else ridx[int(below[-1])],
                   june_alarm_rate=float(alp[:off].mean()), onset_alarm=bool(alp[on_p]))
    # drought model (daily)
    nd = n // 24
    res_mean = k.reservoir_pct.values.reshape(nd, 24).mean(1); rain_d = rain.values.reshape(nd, 24).sum(1)
    Xd = syn.drought_features(res_mean, rain_d)
    rd_ctx = rain_ctx.reshape(-1, 24).sum(1); od = off // 24
    Xd[:, 1] = syn._trailing_sum(rd_ctx, 14)[od:]; Xd[:, 2] = syn._trailing_sum(rd_ctx, 30)[od:]; Xd[:, 3] = syn.days_since_big_rain(rd_ctx)[od:]
    pdr = np.array([predict_folded(dm, dict(zip(syn.DROUGHT_FEATURES, r))) for r in Xd])
    days = sorted(set(day))[:8]
    rows = []
    for i, d in enumerate(days):
        m = day == d; ph = pt[m]
        rows.append(dict(date=str(d), rain=float(rain.values[m].sum()), kul_max=float(k.turbidity_ntu.values[m].max()),
                         p_max=float(ph.max()), p_mean=float(ph.mean()), level_max=level(float(ph.max())),
                         hours_ge2=int((ph >= DECISION).sum()), p_drought=float(pdr[i]), drought_level=level(float(pdr[i])),
                         fc48_at_00=float(fc_archive[m][0])))
    pre = pt[:onset]; first_pre = int(np.argmax(pre >= DECISION)) if (pre >= DECISION).any() else None
    return dict(main=main, sens=sens, rows=rows, onset=t[onset], onset_idx=onset, crisis_start=crisis_start, first_event_ntu=float(k.turbidity_ntu.values[onset]),
                first_alert_pre_onset=None if first_pre is None else t[first_pre], first_alert_pre_onset_idx=first_pre,
                p_drought_max=float(pdr.max()), pdr=pdr, drought_days=[str(d) for d in sorted(set(day))], t=t, ev=ev, label=label,
                p_series=pt, preroll=preroll, hours=n, tail_excluded=int((~valid).sum()))


def train(n_traj: int = N_TRAJ, seed: int = SEED) -> dict:
    tdf, ddf = syn.build_dataset(n_traj, seed)
    trajs = np.arange(n_traj)
    # split by trajectory, stratified on (has turbidity positive, has drought positive)
    strat = (tdf.groupby("traj").y.max().reindex(trajs).values * 2 + ddf.groupby("traj").y.max().reindex(trajs).values)
    tr_t, te_t = train_test_split(trajs, test_size=0.2, random_state=seed, stratify=strat)
    turb = fit_one(tdf, syn.TURB_FEATURES, tr_t, te_t, "turbidity")
    dro = fit_one(ddf, syn.DROUGHT_FEATURES, tr_t, te_t, "drought")
    return dict(turb=turb, dro=dro, tdf=tdf, ddf=ddf, n_traj=n_traj, seed=seed, n_train_traj=len(tr_t), n_test_traj=len(te_t))


def coefficient_json(r: dict) -> dict:
    def part(x): m = x["model"]; return {"features": m["features"], "bias": m["bias"], "weights": m["weights"], "metrics": m["metrics"]}
    return {"version": VERSION, "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "seed": r["seed"],
            "training_data": TRAINING_DATA, "signal_level_thresholds": THRESHOLDS, "decision_threshold": DECISION,
            "turbidity": part(r["turb"]), "drought": part(r["dro"])}


EXPECTED_SIGN = {"turbidity_ntu": 1, "turbidity_slope_per_hr": 1, "rain_24h_mm": 1, "rain_72h_mm": 1, "forecast_rain_48h_mm": 1,
                 "reservoir_pct": -1, "rain_14d_mm": -1, "rain_30d_mm": -1, "days_since_rain_over_5mm": 1}
V1 = {"turbidity": dict(recall=0.862, precision=0.531, roc_auc=0.839), "drought": dict(recall=0.972, precision=0.758, roc_auc=0.989)}
SENS_GRID = [("sigma 0.3, no miss/false alarm", 0.3, 0.0, 0.0), ("sigma 0.5, no miss/false alarm", 0.5, 0.0, 0.0),
             ("sigma 0.5, miss 10% / false alarm 10% (HEADLINE)", 0.5, 0.10, 0.10), ("sigma 0.8, miss 10% / false alarm 10%", 0.8, 0.10, 0.10)]


def gates(r: dict, rp: dict) -> dict:
    g = {}
    for k, nm in (("turb", "turbidity"), ("dro", "drought")):
        m = r[k]["model"]["metrics"]
        g[f"{nm} recall >= {GATE_RECALL}"] = (m["recall"], m["recall"] >= GATE_RECALL)
        g[f"{nm} precision >= {GATE_PRECISION}"] = (m["precision"], m["precision"] >= GATE_PRECISION)
        wrong = [f for f in r[k]["model"]["features"] if np.sign(r[k]["model"]["weights"][f]) != EXPECTED_SIGN[f]]
        g[f"{nm} all coefficient signs intuitive"] = (wrong or "all ok", not wrong)
    ne = rp["main"]["nonevent_rate"]
    g[f"July replay non-event alarm rate < {GATE_NONEVENT_ALARM}"] = (ne, ne < GATE_NONEVENT_ALARM)
    return g


def sensitivity() -> list[dict]:
    """Informational only: re-train under other forecast-error assumptions (headline stays the declared one)."""
    keep = (syn.FORECAST_LOGNORMAL_SIGMA, syn.FORECAST_MISS_PROB, syn.FORECAST_FALSE_ALARM_PROB); out = []
    try:
        for name, sg, mi, fa in SENS_GRID:
            syn.FORECAST_LOGNORMAL_SIGMA, syn.FORECAST_MISS_PROB, syn.FORECAST_FALSE_ALARM_PROB = sg, mi, fa
            r = train(); m = r["turb"]["model"]
            out.append(dict(name=name, **m["metrics"], slope_w=m["weights"]["turbidity_slope_per_hr"], fc_w=m["weights"]["forecast_rain_48h_mm"]))
    finally:
        syn.FORECAST_LOGNORMAL_SIGMA, syn.FORECAST_MISS_PROB, syn.FORECAST_FALSE_ALARM_PROB = keep
    return out


def _ts(x): return pd.Timestamp(x).strftime("%b %d %H:%M")


def write_reports(r: dict, rp: dict, sens: list[dict]):
    (ML / "reports").mkdir(exist_ok=True)
    G = gates(r, rp); M = rp["main"]
    L = ["# Disruption predictor: training report (v2)", "",
         f"Version {VERSION}, seed {r['seed']}. Regenerate: `ml/.venv/bin/python ml/train_predictor.py` (deterministic).", "",
         "**Training data is synthetic and physics-informed; not real incident history.** Rain is real Open-Meteo hourly "
         "precipitation for Catbalogan (11.7769, 124.8852), 2016-2025; turbidity/reservoir response is simulated "
         "(`ml/synthetic.py`, reusing `ml/simulate_july.py`) around the CWD 2022 WSP thresholds.", "",
         "## v1 -> v2 changes", "",
         "- v1 reached turbidity recall only through a 1.5x positive-class weight boost; precision was 0.53 and it alarmed on ~42% of non-event rows, because the label depends on rain in the next 48 h that no feature could see.",
         "- **Added `forecast_rain_48h_mm`** (forecast rain in (t, t+48h]). In training it is simulated from the real future rain with an assumed forecast-error model (below).",
         "- **Removed `clarifier_utilization`** (v1 sign was negative, counter-intuitive) and **`reservoir_trend_pct_per_day`** (collinear with `reservoir_pct`, v1 sign positive).",
         "- **Removed the recall boost**: `class_weight='balanced'` only. Threshold stays 0.4. New gates: precision >= 0.65 on both models, July non-event alarm rate < 20%, all coefficient signs physically intuitive.", "",
         "## Dataset", "",
         f"- {r['n_traj']} trajectories, each a contiguous real-rain window of {syn.WARMUP_DAYS}+{syn.USABLE_DAYS}+{syn.LOOKAHEAD_DAYS} days "
         f"(warm-up / usable / label look-ahead); {int(syn.DRY_SEASON_START_FRAC*100)}% of windows start Jan 1-Apr 15 so dry spells (drought positives) are well represented.",
         f"- Split 80/20 **by trajectory** (no row leakage), stratified on whether a trajectory contains positives: {r['n_train_traj']} train / {r['n_test_traj']} test trajectories.",
         f"- Random Caramayon power outages in {int(syn.OUTAGE_PROB*100)}% of trajectories (6-72 h); drought labels use a supply-only counterfactual reservoir so outage/turbidity-caused drops are not labelled drought.", "",
         "| model | rows | positive rate (all) | train rows | train pos. rate | test rows | test pos. rate |", "|---|---|---|---|---|---|---|"]
    for k, nm in (("turb", "turbidity (hourly, every 4th h)"), ("dro", "drought (daily)")):
        e, m = r[k]["extra"], r[k]["model"]["metrics"]
        L.append(f"| {nm} | {e['n_total']} | {e['positive_rate_all']:.3f} | {e['n_train']} | {e['train_positive_rate']:.3f} | {m['n_test']} | {m['positive_rate']:.3f} |")
    L += ["", "## Forecast feature in training (ASSUMPTIONS, `ml/wsp_constants.py`)", "",
          f"`forecast_rain_48h_mm` = actual rain in (t, t+{syn.FORECAST_HORIZON_H} h] x lognormal error (sigma {syn.FORECAST_LOGNORMAL_SIGMA}, mean-preserving), redrawn every {syn.FORECAST_BLOCK_H} h; "
          f"in {int(syn.FORECAST_MISS_PROB*100)}% of blocks a miss (only {int(syn.FORECAST_MISS_FACTOR*100)}% of the rain forecast); in {int(syn.FORECAST_FALSE_ALARM_PROB*100)}% of blocks with < {syn.FORECAST_FALSE_ALARM_MAX_ACTUAL_MM:g} mm actual a false alarm (exponential, mean {syn.FORECAST_FALSE_ALARM_MEAN_MM:g} mm).", "",
          "Justification: **all values are ASSUMPTIONS, not fitted to any skill measurement.** The only forecast data we have is Open-Meteo's Historical Forecast archive, which stitches the first hours of each successive model run (not a true 24-48 h-ahead forecast), and for 2026-06/07 it is value-identical to the archive rain (see `docs/predictor.md`), so it cannot measure 2-day skill. Tropical convective rain is hard to forecast at 1-2 day lead, so a deliberately noisy model is used (sigma 0.5 = typical +/-65% error on a 48 h total; 10% misses and false alarms). I did not tune these to pass the gates.", "",
          f"## Held-out metrics at the fixed decision threshold p >= {DECISION} (signal level >= 2): v1 vs v2", "",
          "| model | version | recall | precision | ROC-AUC | C (L2) | confusion [[TN,FP],[FN,TP]] |", "|---|---|---|---|---|---|---|"]
    for k, nm in (("turb", "turbidity"), ("dro", "drought")):
        v, m, e = V1[nm], r[k]["model"]["metrics"], r[k]["extra"]
        L.append(f"| {nm} | v1 (1.5x boost on turbidity) | {v['recall']:.3f} | {v['precision']:.3f} | {v['roc_auc']:.3f} | | |")
        L.append(f"| {nm} | **v2** | {m['recall']:.3f} | {m['precision']:.3f} | {m['roc_auc']:.3f} | {e['C']} | {e['confusion']} |")
    e = r["turb"]["extra"]
    L += ["", f"Turbidity **onset recall** (only rows whose current Kulador turbidity is still below {KULADOR_DEGRADED_NTU:g} NTU, i.e. a genuine early warning, "
          f"{e['onset_n_pos']} positive rows): recall {e['onset_recall']:.3f}, precision {e['onset_precision']:.3f} (v1: 0.809 / 0.438).", "",
          "## Gates", "", "| gate | value | result |", "|---|---|---|"]
    for name, (val, ok) in G.items():
        L.append(f"| {name} | {val if isinstance(val, (str, list)) else f'{val:.3f}'} | {'PASS' if ok else '**FAIL**'} |")
    L += ["", "Gates are evaluated as specified and were not relaxed: no threshold move, no class-weight boost, no label change.", "",
          "## Coefficients (raw units; probability = sigmoid(bias + sum(weight x feature)))", ""]
    for k in ("turb", "dro"):
        m = r[k]["model"]
        L += [f"### {r[k]['name']}  (bias {m['bias']:.6g})", "", "| feature | raw weight | standardized weight | expected sign | sign | meaning |", "|---|---|---|---|---|---|"]
        for f in m["features"]:
            ok = np.sign(m["weights"][f]) == EXPECTED_SIGN[f]
            L.append(f"| `{f}` | {m['weights'][f]:+.6g} | {m['std_weights'][f]:+.3f} | {'+' if EXPECTED_SIGN[f] > 0 else '-'} | {'ok' if ok else '**WRONG**'} | {MEANING[f]} |")
        L.append("")
    L += ["## Forecast-quality sensitivity (informational; headline row is the declared assumption)", "",
          "Turbidity model re-trained under other forecast-error assumptions. Shows how much the gates depend on how good the real forecast is.", "",
          "| forecast-error assumption | recall | precision | ROC-AUC | forecast weight | slope weight |", "|---|---|---|---|---|---|"]
    for x in sens:
        L.append(f"| {x['name']} | {x['recall']:.3f} | {x['precision']:.3f} | {x['roc_auc']:.3f} | {x['fc_w']:+.4f} | {x['slope_w']:+.5f} |")
    L += ["", "## Labels", "",
          f"- **turbidity** = 1 if within the next {syn.TURB_HORIZON_H} h Kulador raw turbidity >= {KULADOR_DEGRADED_NTU:g} NTU (degraded; derived: shut-off {TURBIDITY_SHUTOFF_NTU} NTU x 50% filtration capacity, WSP pp.43, 22) "
          f"OR Caramayon I turbidity >= {TURBIDITY_SHUTOFF_NTU} NTU (temporary source shut-off, WSP p.43).",
          f"- **drought** = 1 if within the next {syn.DROUGHT_HORIZON_D} days the daily-minimum reservoir level falls below {DROUGHT_RESERVOIR_PCT:g}% for supply reasons (spring-yield shortfall). **{DROUGHT_RESERVOIR_PCT:g}% is our ASSUMPTION**; the WSP has no drought hazard.", "",
          "## Assumptions added (none are in the WSP)", "",
          f"- Spring yield recession: slow store with {syn.SPRING_STORE_TAU_H/24:.0f}-day time constant; Masacpasac/Caramayon I/II yield = {syn.SPRING_MIN_YIELD:.2f} + {1-syn.SPRING_MIN_YIELD:.2f} x min(1, store/{syn.SPRING_STORE_REF_MM:g} mm).",
          f"- Antecedent wetness scales runoff turbidity gain by {syn.WET_SOIL_GAIN[0]}-{syn.WET_SOIL_GAIN[1]}; per-trajectory lognormal gain spread sigma {syn.GAIN_SIGMA}; demand spread sigma {syn.DEMAND_SIGMA}.",
          "- Caramayon II normal flow 40 L/s; Kulador degraded at 250 NTU (see `ml/wsp_constants.py`).",
          "- `reservoir_pct` for the drought model is the **daily mean** level. `days_since_rain_over_5mm`: calendar days (Asia/Manila) since the most recent day with >= 5 mm; 0 if today >= 5 mm; if there is none in the available history, the number of days of history available (a lower bound). No other cap.",
          "- Class weights: `balanced` only. Hourly turbidity rows subsampled every 4th hour; C chosen from a fixed grid by grouped 5-fold CV ROC-AUC on the train split only. The 0.4 threshold is never tuned. Output is a risk score from a class-balanced fit, not a calibrated probability.", ""]
    (ML / "reports" / "training_report.md").write_text("\n".join(L))

    ep = M["eps"]; e0 = ep[0]; pre = rp["preroll"]
    S = rp["sens"]; sne = np.array([x["nonevent_rate"] for x in S])
    R = ["# July 2026 replay (v2; simulated intake series, real Open-Meteo rain)", "",
         "Both models run over `ml/simulate_july.py` output (SIMULATED readings; not CWD telemetry) with REAL July rain. Trailing rain windows (24h/72h/14d/30d, days since >=5 mm) use real June 2026 rain as context (`ml/data/openmeteo_2026-06.json`); the Kulador slope uses July readings only (June readings are unknown), so it is 0 for the first hours.", "",
         "**Forecast feature caveat.** `forecast_rain_48h_mm` comes from Open-Meteo's Historical Forecast archive (`ml/data/openmeteo_histforecast_2026-06-07.json`): stitched first hours of successive model runs, not a true 24-48 h-ahead forecast. For this window it is value-identical to the archive rain, so the main replay below is an **oracle-forecast upper bound**. The sensitivity section re-runs it with the training forecast-error model (noisy forecasts), which is the honest expectation for real use.", "",
         "## Result with the archive forecast (oracle)", "",
         f"- First crisis onset in the series (Kulador raw >= {KULADOR_DEGRADED_NTU:g} NTU or Caramayon I >= {TURBIDITY_SHUTOFF_NTU} NTU): **{_ts(rp['onset'])}** (Kulador {rp['first_event_ntu']:.0f} NTU; scenario `crisis_start` {_ts(rp['crisis_start'])}).",
         f"- p >= 0.4 first reached **{_ts(rp['t'][M['first_alert_idx']])}** (series start, Jul 01 00:00). The alarm is **unbroken from the first hour of July through the onset**, so within the seeded July series the lead time is only a **lower bound of {e0['run_lead_h']} h, censored at the series start**, not a measured lead time.",
         f"- Pre-roll diagnostic (June+July simulated as one series with different noise; June readings are not in the seed): p >= 0.4 alarm run containing the onset starts **{_ts(pre['run_start'])}** ({pre['lead_h']} h before onset); last hour with p < 0.4 before it: {'none (alarm already on at June 01)' if pre['last_below'] is None else _ts(pre['last_below'])}; share of June hours alarming: {pre['june_alarm_rate']*100:.0f}%. " +
         ("Only that last-below-0.4 hour supports a genuine lead claim." if pre['last_below'] is not None else "No genuine lead claim can be made from this."),
         f"- Event recall (hours with a turbidity label in the next 48 h): {M['event_recall']:.2f}; precision {M['event_precision']:.2f}.",
         f"- **Non-event alarm rate for the whole month** (p >= 0.4 on hours with no turbidity label in the next 48 h; last {rp['tail_excluded']} h excluded, no look-ahead): **{M['nonevent_rate']*100:.1f}%** ({M['nonevent_alarm_hours']} of {M['n_nonevent']} h) -> gate < 20%: **{'PASS' if M['nonevent_rate'] < GATE_NONEVENT_ALARM else 'FAIL'}**. Excluding also the 48-72 h band before an event (an alarm 2-3 days ahead is early warning, not noise): {M['nonevent_rate_ex72']*100:.1f}% ({M['n_nonevent_ex72']} h).", "",
         "### Episode lead times (event episodes merged when < 48 h apart)", "", "| onset | p at onset | unbroken alarm run starts | lead (h) | note |", "|---|---|---|---|---|"]
    for x in ep:
        note = "censored at series start" if x["censored"] else ("alarm run began after a quiet period" if x["quiet_before"] else "")
        R.append(f"| {_ts(x['onset'])} | {x['onset_p']:.2f} | {_ts(x['run_start'])} | {x['run_lead_h']} | {note} |")
    al = rp["p_series"] >= DECISION; days_arr = np.array([x.date() for x in rp["t"]])
    R += ["", "### Late-July storms (real rain: Jul 23 = 27.0 mm, Jul 28 = 35.9 mm)", "", "| storm day | first turbidity-event hour that day | unbroken alarm run starts | lead (h) | p < 0.4 at some earlier July hour? |", "|---|---|---|---|---|"]
    for dstr in ("2026-07-23", "2026-07-28"):
        idx = np.flatnonzero((days_arr == pd.Timestamp(dstr).date()) & rp["ev"])
        if len(idx):
            i0 = int(idx[0]); rs = _alarm_run_start(al, i0)
            R.append(f"| {dstr} | {_ts(rp['t'][i0])} | {_ts(rp['t'][rs])} | {i0 - rs} | {'yes (before ' + _ts(rp['t'][rs]) + ')' if rs > 0 else 'no'} |")
    R += ["", "Honest reading: Jul 19-31 is one continuous 13-day wet spell (every day >= 3 mm, most >= 8 mm), and turbidity p stays >= 0.4 the whole time. The alarm began Jul 19 19:00, ~51 h before the first event hour of that spell (Jul 21 22:00), which is a real lead for the spell. For the Jul 23 and Jul 28 storms inside it the alarm was already on, so their 'lead' is just the spell's, not an independent warning.", "",
          "On Jul 8-12 the same pattern: one alarm run from Jul 06 05:00 covers the Jul 8 and Jul 11 events (52 h lead for the first).", "",
          "### Jul 1-8 per day", "", "| date | rain mm | Kulador max NTU | turbidity p max | turbidity level (from max p) | hours with p >= 0.4 | drought p (day) | drought level |", "|---|---|---|---|---|---|---|---|"]
    for d in rp["rows"]:
        R.append(f"| {d['date']} | {d['rain']:.1f} | {d['kul_max']:.0f} | {d['p_max']:.2f} | {d['level_max']} | {d['hours_ge2']} | {d['p_drought']:.2f} | {d['drought_level']} |")
    R += ["", "## Sensitivity: noisy forecasts (training error model, 20 seeds)", "",
          f"Non-event alarm rate: median {np.median(sne)*100:.1f}% (range {sne.min()*100:.1f}-{sne.max()*100:.1f}%); event recall median {np.median([x['event_recall'] for x in S]):.2f}; event precision median {np.median([x['event_precision'] for x in S]):.2f}. "
          f"Share of seeds under the 20% gate: {np.mean(sne < GATE_NONEVENT_ALARM)*100:.0f}%.", "",
          "## Drought model on the July crisis", "",
          f"July 2026 is a turbidity + power-outage crisis, not a rain deficit. The simulated outage collapses the reservoir (Jul 5-7), and the drought model, whose inputs cannot see the cause, fires (max drought p {rp['p_drought_max']:.2f}). "
          "Framing: it flags a **supply shortage** (reservoir collapse), which is real and operationally useful, but it is not a drought in the climatological sense. Training labels exclude outage-caused drops; the features cannot tell them apart. The system signal is the max of the two levels.", ""]
    (ML / "reports" / "july_2026_replay.md").write_text("\n".join(R))


def main():
    r = train()
    coefs = coefficient_json(r)
    (ML / "predictor_coefficients.json").write_text(json.dumps(coefs, indent=2) + "\n")
    vec = {"turbidity": make_vectors(r["turb"], syn.TURB_FEATURES, r["seed"]), "drought": make_vectors(r["dro"], syn.DROUGHT_FEATURES, r["seed"] + 1)}
    (ML / "predictor_test_vectors.json").write_text(json.dumps(vec, indent=2) + "\n")
    rp = july_replay(r["turb"]["model"], r["dro"]["model"])
    write_reports(r, rp, sensitivity())
    for k in ("turb", "dro"):
        print(k, r[k]["model"]["metrics"], "C", r[k]["extra"]["C"], r[k]["extra"]["confusion"], {a: b for a, b in r[k]["extra"].items() if a.startswith("onset")})
        print({f: round(w, 5) for f, w in r[k]["model"]["weights"].items()}, "bias", r[k]["model"]["bias"])
    for name, (val, ok) in gates(r, rp).items(): print("PASS" if ok else "FAIL", name, val)


if __name__ == "__main__":
    main()
