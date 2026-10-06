"""v3 candidate study driver. Run: ml/.venv/bin/python ml/v3_eval.py   (deterministic, ~10 min)

Writes ml/reports/v3_results.json, ml/reports/v3_comparison.md, ml/predictor_v3_candidate.json, ml/predictor_v3_test_vectors.json.
Never writes v2 artefacts (predictor_coefficients.json, predictor_test_vectors.json, reports/training_report.md, july_2026_replay.md).
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss
from sklearn.model_selection import GroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent))
import v3_lib as L
import synthetic as syn
import simulate_july as sj
from wsp_constants import KULADOR_DEGRADED_NTU, TURBIDITY_SHUTOFF_NTU

ML = L.ML
PR_JJ = ML / "data" / "openmeteo_previous_runs_2026-06-07.json"
PR_24 = ML / "data" / "openmeteo_previous_runs_2024-2025.json"
VERSION = "v3-candidate-2026-10-06"
T0 = time.time()


def log(*a): print(f"[{time.time()-T0:6.0f}s]", *a, flush=True)


# ------------------------------------------------------------------------------------------- honest forecast
def _arr(h, k): return np.array([np.nan if v is None else v for v in h[k]], float)


def honest_forecast(d1, d2):
    """forecast_rain_48h at issue hour t using only runs issued <= t: (t,t+24] from previous_day1, (t+24,t+48] from previous_day2.
    previous_dayN for valid hour h = the forecast issued N*24 h before h, so day1 for h<=t+24 and day2 for h<=t+48 exist at t
    (conservative: ignores fresher runs). NaN where the 48 h window runs past the series end."""
    n = len(d1); out = np.full(n, np.nan)
    c1 = np.concatenate([[0], np.cumsum(d1)]); c2 = np.concatenate([[0], np.cumsum(d2)])
    for t in range(n - 48):
        out[t] = (c1[t + 25] - c1[t + 1]) + (c2[t + 49] - c2[t + 25])
    return out


def fit_empirical_forecast_error():
    """Fit the training forecast-error model to 2024-2025 paired (Previous Runs honest 48 h forecast, archive actual) data."""
    h = json.loads(PR_24.read_text())["hourly"]; t = pd.to_datetime(h["time"])
    d1, d2 = _arr(h, "precipitation_previous_day1"), _arr(h, "precipitation_previous_day2")
    ra, ti = syn.load_rain_10y(); a = pd.Series(ra, index=ti).reindex(t).values
    ok = np.isfinite(d1) & np.isfinite(d2)
    fc = honest_forecast(np.where(ok, d1, np.nan).astype(float), np.where(ok, d2, np.nan).astype(float)) if not (~ok).any() else None
    if fc is None:                                  # gaps: compute with NaN-aware windows (slow path, 17k hours)
        N = len(a); fc = np.full(N, np.nan)
        for i in range(N - 48):
            w1, w2 = d1[i + 1:i + 25], d2[i + 25:i + 49]
            if not (np.isnan(w1).any() or np.isnan(w2).any()): fc[i] = w1.sum() + w2.sum()
    act = syn.forward_sum(a, 48); act[-48:] = np.nan
    m = np.isfinite(fc) & np.isfinite(act); f, x = fc[m], act[m]
    big = x >= 5; miss = f[big] < 0.2 * x[big]; ok2 = big & (f >= 0.2 * x)
    lr = np.log(f[ok2] / x[ok2])
    dry = x < 2; fa = f[dry] > 2
    out = dict(n_hours=int(m.sum()), corr=float(np.corrcoef(f, x)[0, 1]), mean_actual_48h=float(x.mean()), mean_forecast_48h=float(f.mean()),
               median_ratio_act_ge10=float(np.median(f[x >= 10] / x[x >= 10])), miss_p=float(miss.mean()),
               mu_log=float(np.median(lr)), sigma=float(lr.std()), fa_p=float(fa.mean()), fa_mean=float(f[dry][fa].mean()),
               period="2024-01-19..2025-12-31 (Previous Runs day1/day2 vs Open-Meteo archive)")
    return out


# ------------------------------------------------------------------------------------------- calibration
def iso_calibrate(model, d, tr):
    """Isotonic map fitted on out-of-fold train predictions (grouped 5-fold, no test leakage)."""
    X, y, g = L.rows(d, tr); oof = np.zeros(len(y))
    if model.kind == "v2json": return None
    for i, j in GroupKFold(n_splits=5).split(X, y, g):
        m = clone(model.pipe).fit(X[i][:, model.cols], y[i]); oof[j] = m.predict_proba(X[j][:, model.cols])[:, 1]
    return IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(oof, y)


# ------------------------------------------------------------------------------------------- July replay
def july_replay(models, rules):
    rain = sj.fetch_rain(); sim = sj.simulate(rain)
    jun = np.asarray(json.loads((ML / "data" / "openmeteo_2026-06.json").read_text())["hourly"]["precipitation"], float)
    ctx = np.concatenate([jun, rain.values]); off, n = len(jun), len(rain)
    h = json.loads(PR_JJ.read_text())["hourly"]; assert len(h["time"]) == len(ctx)
    fc_h = honest_forecast(_arr(h, "precipitation_previous_day1"), _arr(h, "precipitation_previous_day2"))
    hf = np.asarray(json.loads((ML / "data" / "openmeteo_histforecast_2026-06-07.json").read_text())["hourly"]["precipitation"], float)
    fc_o = syn.forward_sum(hf, 48)
    k = sim[sim.intake_id == "kulador"].reset_index(drop=True); c1 = sim[sim.intake_id == "caramayon_1"].reset_index(drop=True)
    ev = (k.turbidity_ntu.values >= KULADOR_DEGRADED_NTU) | (c1.turbidity_ntu.values >= TURBIDITY_SHUTOFF_NTU)
    label = syn._forward_any(ev, 48); valid = np.arange(n) < n - 48
    t = k.recorded_at; days = np.array([x.date() for x in t])
    # combined June+July simulated series (different noise; June readings are not in the seed) for the censoring-free pre-roll
    ridx = pd.date_range("2026-06-01", periods=len(ctx), freq="h", tz=sj.TZ)
    dfp = sj.simulate(pd.Series(ctx, index=ridx, name="precipitation_mm"))
    kp = dfp[dfp.intake_id == "kulador"].reset_index(drop=True); cp = dfp[dfp.intake_id == "caramayon_1"].reset_index(drop=True)
    evp = (kp.turbidity_ntu.values >= KULADOR_DEGRADED_NTU) | (cp.turbidity_ntu.values >= TURBIDITY_SHUTOFF_NTU)

    def feats(kul, c1n, fc, window_off):
        X = syn.turbidity_features(kul, ctx[window_off:] if window_off else ctx, fc[window_off:] if window_off else fc)
        X[:, 2] = syn._trailing_sum(ctx, 24)[window_off:]; X[:, 3] = syn._trailing_sum(ctx, 72)[window_off:]
        return X

    def run_start(al, i):                            # start of the unbroken alarm run that contains hour i (i must alarm)
        if not al[i]: return None
        while i > 0 and al[i - 1]: i -= 1
        return i

    out = {}
    for fcname, fc in (("honest", fc_h), ("oracle", fc_o)):
        fc = np.nan_to_num(fc, nan=0.0)
        Xj = feats(k.turbidity_ntu.values, None, fc, off); Xp = syn.turbidity_features(kp.turbidity_ntu.values, ctx, fc)
        res = {}
        for m in list(models) + list(rules):
            if m.kind == "rule":
                al = m.alarm(Xj, c1.turbidity_ntu.values) if isinstance(m, L.WspRule) else m.alarm(Xj)
                alp = m.alarm(Xp, cp.turbidity_ntu.values) if isinstance(m, L.WspRule) else m.alarm(Xp); p = None
            else:
                p = m.predict(Xj); al = p >= L.DECISION; alp = m.predict(Xp) >= L.DECISION
            ne = valid & ~label
            onset = int(np.argmax(ev)); rs = run_start(al, onset - 1) if onset > 0 else None
            onp = off + int(np.argmax(evp[off:])); rsp = run_start(alp, onp - 1)
            below = np.flatnonzero(~alp[:onp]); lastb = int(below[-1]) if len(below) else None
            late = np.flatnonzero(ev & (days >= pd.Timestamp("2026-07-19").date()))
            l0 = int(late[0]) if len(late) else None
            lrs = run_start(al, l0 - 1) if l0 else None
            eps = L._merge(L._runs(ev), 48); caught = 0; leads = []
            for s0, _ in eps:
                if s0 > 0 and al[max(s0 - 48, 0):s0].any():
                    caught += 1; r0 = run_start(al, int(np.flatnonzero(al[max(s0 - 48, 0):s0])[-1]) + max(s0 - 48, 0)); leads.append(s0 - r0)
            daily = []
            for d in sorted(set(days))[:8]:
                mk = days == d
                daily.append(dict(date=str(d), kul_max=float(k.turbidity_ntu.values[mk].max()), event=bool(ev[mk].any()),
                                  level=(L.level(float(p[mk].max())) if p is not None else (4 if al[mk].any() else 0)), alarm_h=int(al[mk].sum())))
            res[m.name] = dict(
                nonevent_alarm_rate=float(al[ne].mean()), alarm_hours=int(al[valid].sum()),
                onset=str(t[onset]), lead_h_in_series=(onset - rs) if rs is not None else None, censored=(rs == 0) if rs is not None else None,
                caught_at_onset=bool(al[onset - 1]) if onset else None,
                preroll_lead_h=(onp - rsp) if rsp is not None else None, preroll_last_below=str(ridx[lastb]) if lastb is not None else None,
                preroll_quiet_before=lastb is not None,
                late_spell_onset=str(t[l0]) if l0 is not None else None, late_spell_lead_h=(l0 - lrs) if lrs is not None else (0 if l0 else None),
                episodes=len(eps), episodes_caught=caught, episode_median_lead=float(np.median(leads)) if leads else None, daily=daily)
        out[fcname] = res
    out["honest_vs_archive"] = dict(
        fc48_mean_honest=float(np.nanmean(fc_h[off:off + n - 48])), fc48_mean_oracle=float(fc_o[off:off + n - 48].mean()),
        corr=float(np.corrcoef(fc_h[off:off + n - 48], fc_o[off:off + n - 48])[0, 1]),
        july_rain_archive=float(rain.values.sum()), july_rain_forecast_d1=float(np.nansum(_arr(h, "precipitation_previous_day1")[off:])))
    return out


# ------------------------------------------------------------------------------------------- main
def main():
    res = {"version": VERSION}
    emp = fit_empirical_forecast_error(); res["empirical_forecast_error"] = emp; log("empirical fc error", emp)
    emp_kw = dict(mu_log=emp["mu_log"], sigma=emp["sigma"], miss_p=emp["miss_p"], fa_p=emp["fa_p"], fa_mean=emp["fa_mean"])

    d = L.build(); log("base dataset built")
    tr, te = L.split_random(d); Xtr, ytr, gtr = L.rows(d, tr)
    res["n_traj"] = d["n"]; res["split"] = dict(train=len(tr), test=len(te), train_rows=len(ytr), pos_rate=float(ytr.mean()))

    def fit_all(Xtr, ytr, gtr, hp=None):
        hp = hp or {}
        ms = [L.fit_linear("v2 (retrained)", list(range(5)), Xtr, ytr, gtr, C=hp.get("v2")),
              L.fit_linear("v2a", L.V2A_COLS, Xtr, ytr, gtr, C=hp.get("v2a")),
              L.fit_gam("spline-GAM", L.V2A_COLS, Xtr, ytr, gtr, k=hp.get("gam", (None, None))[0], C=hp.get("gam", (None, None))[1]),
              L.fit_gbm("GBM (monotone)", L.V2A_COLS, Xtr, ytr, gtr)]
        return ms
    ms = fit_all(Xtr, ytr, gtr); log("fitted", [(m.name, m.params.get("C"), m.params.get("k")) for m in ms])
    hp = {"v2": ms[0].params["C"], "v2a": ms[1].params["C"], "gam": (ms[2].params["k"], ms[2].params["C"])}
    v2live = L.V2Json(); v2m = ms[0]
    w_re = L.linear_export(v2m); res["v2_retrain_vs_live"] = dict(max_abs_weight_diff=max(abs(w_re["weights"][f] - json.loads((ML / "predictor_coefficients.json").read_text())["turbidity"]["weights"][f]) for f in L.F5),
                                                                   bias_diff=abs(w_re["bias"] - json.loads((ML / "predictor_coefficients.json").read_text())["turbidity"]["bias"]))
    # empirical-forecast-trained variants (extra rows)
    d_emp = L.build(emp=emp_kw); log("emp-forecast world built")
    Xe, ye, ge = L.rows(d_emp, tr)
    v2a_emp = L.fit_linear("v2a (emp-fc trained)", L.V2A_COLS, Xe, ye, ge)
    gam_emp = L.fit_gam("spline-GAM (emp-fc trained)", L.V2A_COLS, Xe, ye, ge)
    log("emp-trained fitted", v2a_emp.params, gam_emp.params.get("k"), gam_emp.params.get("C"))
    rr_f1, rr_r85 = L.fit_rain_rules(Xtr, ytr); rules = [L.WspRule(), L.WspRule(250, "reactive rule (Kulador >= 250 NTU now)"), rr_f1, rr_r85]
    res["rain_rule_thresholds"] = dict(f1=rr_f1.thr, recall85=rr_r85.thr)
    live = L.V2Json(); live.name = "v2 (live json)"
    main_models = [live] + ms[1:]

    # (i)+(ii)+(iv) random split
    res["random_split"] = L.evaluate([live] + ms[1:], rules, d, te); log("random split eval")
    res["random_split_retrained_v2"] = L.evaluate([ms[0]], [], d, te)
    # empirical-forecast world, same test trajectories: base-trained vs emp-trained models
    res["emp_world"] = L.evaluate([live] + ms[1:] + [v2a_emp, gam_emp], rules, d_emp, te); log("emp world eval")

    # (iii) time split
    trT, teT = L.split_time(d); XtT, ytT, gtT = L.rows(d, trT)
    msT = fit_all(XtT, ytT, gtT); ruT = L.fit_rain_rules(XtT, ytT)
    res["time_split"] = dict(n_train=len(trT), n_test=len(teT), hp=[(m.name, m.params.get("C"), m.params.get("k")) for m in msT],
                             rain_thr=[r.thr for r in ruT],
                             v2_live_leaky_note="v2 live json was trained on random-split trajectories that overlap 2023-25 test windows; shown for reference only",
                             results=L.evaluate([live] + msT[1:], [L.WspRule(), L.WspRule(250, "reactive rule (Kulador >= 250 NTU now)"), *ruT], d, teT)); log("time split eval")
    # (iv) calibration (random split): Brier raw/isotonic + reliability for every ML candidate
    Xte, yte, _ = L.rows(d, te); cal = {}
    for m in [live] + ms[1:]:
        p = m.predict(Xte); e = dict(brier_raw=float(brier_score_loss(yte, p)), reliability_raw=L.reliability(p, yte), mean_pred=float(p.mean()), base_rate=float(yte.mean()))
        iso = iso_calibrate(m, d, tr)
        if iso is not None:
            pc = iso.predict(p); e.update(brier_iso=float(brier_score_loss(yte, pc)), reliability_iso=L.reliability(pc, yte),
                                          iso_p_at_raw_0_4=float(iso.predict([0.4])[0]), recall_at_iso_0_4=float(((pc >= 0.4) & (yte == 1)).sum() / yte.sum()),
                                          precision_at_iso_0_4=float(((pc >= 0.4) & (yte == 1)).sum() / max((pc >= 0.4).sum(), 1)),
                                          iso_raw_equiv_of_0_4=float(np.min(p[pc >= 0.4])) if (pc >= 0.4).any() else None)
        cal[m.name] = e
    res["calibration"] = cal; log("calibration")

    # (vi) sensitivity: worlds with sigma 0.3 / 0.8 and turbidity gain +-30% on the SAME test trajectories
    sens = {}
    for name, kw in (("forecast sigma 0.3", dict(sigma=0.3)), ("forecast sigma 0.8", dict(sigma=0.8)), ("turbidity gain x0.7", dict(gain=0.7)), ("turbidity gain x1.3", dict(gain=1.3))):
        dw = L.build(**kw); Xw, yw, gw = L.rows(dw, tr)
        msw = fit_all(Xw, yw, gw, hp)
        sens[name] = dict(base_trained=L.evaluate([live] + ms[1:], [L.WspRule()], dw, te),
                          retrained=L.evaluate([m for m in msw[1:3]], [], dw, te)); log("sens", name)
    res["sensitivity"] = sens

    # shape tables / export decision
    gam_exp = L.gam_export(ms[2]); v2a_exp = L.linear_export(ms[1])
    GRID = {"turbidity_ntu": [0, 5, 10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000],
            "rain_24h_mm": [0, 1, 2, 5, 10, 20, 30, 50, 75, 100], "rain_72h_mm": [0, 5, 10, 20, 40, 60, 80, 120, 160, 200],
            "forecast_rain_48h_mm": [0, 2, 5, 10, 20, 30, 50, 75, 100]}
    res["shape_tables"] = dict(grids=GRID, gam=L.shape_table(gam_exp, GRID), v2a=L.shape_table(v2a_exp, GRID))
    res["v2a_weights"] = dict(bias=v2a_exp["bias"], weights=v2a_exp["weights"])
    res["gam_hp"] = dict(k=ms[2].params["k"], C=ms[2].params["C"], knots=ms[2].params["knots"], gbm=ms[3].params)
    hi = {f: float(np.quantile(Xtr[:, L.F5.index(f)], 0.999)) for f in gam_exp["features"]}
    mono = {}
    for f in gam_exp["features"]:
        t_ = gam_exp["terms"][f]; xs = np.linspace(t_["x_min"], min(hi[f], t_["x_max"]), 600); g = L.gam_eval_term(t_, xs); dg = np.diff(g)
        mono[f] = dict(range=[float(xs[0]), float(xs[-1])], max_decline=float(-dg.min()) if (dg < 0).any() else 0.0, frac_decreasing=float((dg < -1e-9).mean()),
                       total_rise=float(g[-1] - g[0]))
    res["gam_monotonicity"] = mono

    ta = res["time_split"]["results"]
    sel_gam = (ta["spline-GAM"]["roc_auc"] - ta["v2a"]["roc_auc"] >= 0.01) and (res["random_split"]["spline-GAM"]["recall"] >= res["random_split"]["v2a"]["recall"] - 0.02) \
        and all(m["max_decline"] < 0.1 for m in mono.values())
    chosen = ms[2] if sel_gam else ms[1]; exp = gam_exp if sel_gam else v2a_exp
    res["chosen"] = chosen.name
    res["chosen_rule"] = "spline-GAM only if time-split ROC-AUC beats v2a by >= 0.01 AND random-split recall within 0.02 AND no g_f declines by >= 0.1 logit on its realistic range; else v2a (simpler)"

    # export + vectors (test-set rows + extremes + out-of-range)
    rng = np.random.default_rng(L.SEED)
    te_rows = Xte[rng.choice(len(Xte), 20, replace=False)][:, chosen.cols]
    lo, hi_ = Xte[:, chosen.cols].min(0), Xte[:, chosen.cols].max(0)
    pts = list(te_rows) + [lo, hi_, (lo + hi_) / 2, np.median(Xte[:, chosen.cols], 0), np.zeros(len(chosen.cols)), hi_ * 3 + 1]
    pts += [lo + (hi_ - lo) * rng.random(len(chosen.cols)) for _ in range(5)]
    vec = []
    for r in pts:
        f = {k: round(float(v), 4) for k, v in zip(exp["features"], r)}
        x5 = np.zeros((1, 5)); x5[0, chosen.cols] = [f[k] for k in exp["features"]]
        ps = float(chosen.predict(x5)[0]); pe = L.export_predict(exp, f)
        assert abs(ps - pe) < 1e-9, (ps, pe, f)
        vec.append(dict(features=f, p=ps, level=L.level(ps)))
    cand = dict(version=VERSION, status="CANDIDATE (not live). Live v2 files are untouched.", model=chosen.name, decision_threshold=L.DECISION,
                signal_level_thresholds=L.THRESHOLDS, training_data="synthetic, physics-informed; rain = real Open-Meteo 2016-2025; not real incident history",
                seed=L.SEED, hyperparameters=chosen.params | {}, inference="p = sigmoid(bias + sum_f g_f(x_f)); linear: g_f = weight*x. gam_pp: clamp x to [x_min,x_max]; "
                "find piece with x0 <= x (last piece if x == x_max); s=(x-x0)/w; g = c0 + c1 s + c2 s^2 + c3 s^3",
                export=exp, shape_tables=res["shape_tables"]["gam" if sel_gam else "v2a"], shape_grid=GRID,
                metrics_random_split=res["random_split"][chosen.name], metrics_time_split=ta[chosen.name])
    (ML / "predictor_v3_candidate.json").write_text(json.dumps(cand, indent=1) + "\n")
    (ML / "predictor_v3_test_vectors.json").write_text(json.dumps(dict(model=chosen.name, features=exp["features"], vectors=vec), indent=1) + "\n")
    log("exported", chosen.name)

    # (v) July replay with honest forecast
    rep_models = [live, ms[1], ms[2], ms[3], v2a_emp, gam_emp]
    res["july"] = july_replay(rep_models, rules); log("july replay")
    (ML / "reports" / "v3_results.json").write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)) + "\n")
    write_md(res)
    log("done; chosen", chosen.name)


def _f(x, p=3): return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{p}f}"


def write_md(r):
    M = ["# v3 candidate study: raw numbers", "", "Generated by `ml/v3_eval.py` (deterministic). Synthetic plant response, real rain; see docs/predictor_v3.md for interpretation.", ""]
    def table(title, d, order=None):
        M.extend([f"## {title}", "", "| model | recall | precision | ROC-AUC | Brier | events | caught | lead med/p25 (h) | missed | false-alarm episodes /30d |", "|---|---|---|---|---|---|---|---|---|---|"])
        for k in (order or d):
            if k not in d: continue
            x = d[k]; M.append(f"| {k} | {_f(x['recall'])} | {_f(x['precision'])} | {_f(x['roc_auc'])} | {_f(x['brier'])} | {x['ev_n_events']} | {x['ev_caught']} ({x['ev_catch_rate']*100:.0f}%) | {_f(x['ev_lead_median'],0)}/{_f(x['ev_lead_p25'],0)} | {x['ev_missed']} | {_f(x['ev_fa_per_30d'],1)} |")
        M.append("")
    table("Random 80/20 split by trajectory (p >= 0.4)", r["random_split"])
    table("Time split: train 2016-2022 rain windows, test 2023-2025", r["time_split"]["results"])
    table("Empirical-forecast world (training/test forecast error fitted to Previous Runs 2024-25), random split test trajectories", r["emp_world"])
    M += ["## Calibration (random split)", "", "| model | mean p | base rate | Brier raw | Brier isotonic | p_iso at raw 0.4 |", "|---|---|---|---|---|---|"]
    for k, c in r["calibration"].items():
        M.append(f"| {k} | {_f(c['mean_pred'])} | {_f(c['base_rate'])} | {_f(c['brier_raw'])} | {_f(c.get('brier_iso'))} | {_f(c.get('iso_p_at_raw_0_4'))} |")
    for k in ("v2a", "spline-GAM"):
        M += ["", f"### Reliability, {k} (raw p; 10 bins)", "", "| bin | n | mean predicted | observed |", "|---|---|---|---|"]
        for b in r["calibration"][k]["reliability_raw"]: M.append(f"| {b['bin']} | {b['n']} | {_f(b['mean_pred'])} | {_f(b['obs'])} |")
    M += ["", "## Sensitivity", ""]
    for w, v in r["sensitivity"].items():
        M += [f"### {w} (same test trajectories)", "", "| model | trained on | recall | precision | ROC-AUC | event catch | FA/30d |", "|---|---|---|---|---|---|---|"]
        for tag, dd in (("base world", v["base_trained"]), ("this world", v["retrained"])):
            for k, x in dd.items(): M.append(f"| {k} | {tag} | {_f(x['recall'])} | {_f(x['precision'])} | {_f(x['roc_auc'])} | {x['ev_catch_rate']*100:.0f}% | {_f(x['ev_fa_per_30d'],1)} |")
        M.append("")
    M += ["## Shape tables g_f(x) (logit contribution; 0 at the feature minimum)", ""]
    for nm in ("gam", "v2a"):
        for f, g in r["shape_tables"][nm].items():
            xs = r["shape_tables"]["grids"][f]; M.append(f"- {nm} `{f}`: " + ", ".join(f"{x:g}->{v:+.2f}" for x, v in zip(xs, g)))
        M.append("")
    M += ["GAM monotonicity over realistic range: " + "; ".join(f"`{f}` max decline {m['max_decline']:.3f}, rise {m['total_rise']:.2f}" for f, m in r["gam_monotonicity"].items()), ""]
    for fc in ("honest", "oracle"):
        M += [f"## July 2026 replay, {fc} forecast", "", "| model | non-event alarm rate | first onset lead in series (h) | pre-roll lead (h) | quiet before? | late-July spell lead (h) | episodes caught/total | Jul 1-8 daily max level |", "|---|---|---|---|---|---|---|---|"]
        for k, x in r["july"][fc].items():
            M.append(f"| {k} | {x['nonevent_alarm_rate']*100:.1f}% | {x['lead_h_in_series']}{' (censored)' if x['censored'] else ''} | {x['preroll_lead_h']} | {x['preroll_quiet_before']} | {x['late_spell_lead_h']} | {x['episodes_caught']}/{x['episodes']} | {' '.join(str(q['level']) for q in x['daily'])} |")
        M.append("")
    M += ["Truth (Kulador >= 250 NTU in day?): " + " ".join(('E' if q['event'] else '-') for q in next(iter(r["july"]["honest"].values()))["daily"]), "",
          f"Honest vs archive forecast, Jun-Jul 2026: {json.dumps(r['july']['honest_vs_archive'])}", "", f"Empirical forecast error: {json.dumps(r['empirical_forecast_error'])}", ""]
    (ML / "reports" / "v3_comparison.md").write_text("\n".join(M))


if __name__ == "__main__":
    main()
