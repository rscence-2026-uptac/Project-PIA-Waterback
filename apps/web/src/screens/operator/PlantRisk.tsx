// Turbidity and drought predictions for the operator (spec 02 drivers + operator_actions).
// RiskSummary is the short card on Monitor; ModelScorecard and ActionList make up the Predictions tab.
// The "why" is a scorecard (lib/scorecard.ts): each input's exact points on one scale, so the explanation adds
// up to the level shown. WSP rules (measured, deterministic) are listed apart from the model.
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OperatorAction, PredictorOutput } from "../../contracts/predictor";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import type { DriverModel } from "../../lib/drivers";
import { LEVEL_CUTOFFS, scorecard, type ScoreRow } from "../../lib/scorecard";
import { LEVEL_TINT, band, hoursAtLevel, trendOf, type Trend } from "./plantRiskState";
import { levelOfScore } from "../../lib/scorecard";
import { Pill, SampleChip } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";

type T = ReturnType<typeof useCopy>["t"];

const RISK_LABEL: Record<DriverModel, CopyKeyName> = { turbidity: "why.p_turbidity", drought: "why.p_drought" };
const HORIZON: Record<DriverModel, CopyKeyName> = { turbidity: "why.horizon_turbidity", drought: "why.horizon_drought" };
const START: Record<DriverModel, CopyKeyName> = { turbidity: "why.start_turbidity", drought: "why.start_drought" };
const RAIN_FEATURES = new Set(["rain_24h_mm", "rain_72h_mm", "rain_14d_mm", "rain_30d_mm", "days_since_rain_over_5mm"]);
const SUMMARY_ACTIONS = 2;

const levelOf = (p: PredictorOutput, m: DriverModel) => (m === "turbidity" ? p.turbidity_level : p.drought_level);
const rulesOf = (p: PredictorOutput, m: DriverModel) => [...new Set((p.drivers?.[m] ?? []).filter((d) => d.feature === "wsp_rule").map((d) => d.text))];

export function SignalPill({ level }: { level: number }) {
  const { t } = useCopy();
  return (
    <Pill className={level >= 3 ? "bg-coral text-ink" : "bg-ink-raised text-foam"}>
      <Icon name={level >= 1 ? "alert" : "check"} size={14} />
      {t("why.signal", { level })}
    </Pill>
  );
}

/** For a calm risk: the input doing the most to keep it low (reassurance, not an alarm). */
function keptLowBy(t: T, p: PredictorOutput, m: DriverModel): string | null {
  const top = scorecard(p, m)?.rows.filter((row) => row.points < 0).sort((a, b) => a.points - b.points)[0];
  return top ? t("why.kept_low", { input: `${featureLabel(t, top.feature, top.text)} ${formatValue(top.value, top.unit)}`.trim() }) : null;
}

/** One plain line on what pushes this model the most: the biggest risk-raising input, else a fired WSP rule. */
function topReason(t: T, p: PredictorOutput, m: DriverModel): string | null {
  const top = scorecard(p, m)?.rows.find((row) => row.points > 0);
  if (top) return t("why.top_input", { input: `${featureLabel(t, top.feature, top.text)} ${formatValue(top.value, top.unit)}`.trim() });
  return rulesOf(p, m).length > 0 ? t("why.top_rule") : null;
}

/** Monitor page: both levels, the main reason for each, the first actions, and a link to the Predictions tab. */
export function RiskSummary({ prediction, sample }: { prediction: PredictorOutput; sample: boolean }) {
  const { t } = useCopy();
  const actions = prediction.operator_actions ?? [];
  const more = actions.length - SUMMARY_ACTIONS;
  return (
    <section className="rounded-xl bg-ink p-6 text-foam" aria-labelledby="risk-summary-title" data-testid="risk-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="risk-summary-title" className="text-[22px] leading-tight">{t("why.title")}</h2>
        <span className="flex items-center gap-2">
          {sample && <SampleChip always className="bg-foam" />}
          <SignalPill level={prediction.signal_level} />
        </span>
      </div>
      <p className="mt-1 text-[13px] text-sky">{t("why.scope_note")}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(["turbidity", "drought"] as const).map((m) => (
          <div key={m} className={`rounded-lg p-3 ${levelOf(prediction, m) >= 2 ? "bg-ink-raised" : "bg-ink-raised/50"}`}>
            <p className="text-[13px] text-sky">{t(RISK_LABEL[m])}</p>
            <p className="numeral mt-1 text-[24px] leading-tight">{band(t, levelOf(prediction, m))}</p>
            <p className="mt-1 text-[13px] text-sky">{t(HORIZON[m])}</p>
            {levelOf(prediction, m) >= 1 && <p className="mt-2 text-[13px]">{topReason(t, prediction, m)}</p>}
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <>
          <h3 className="mt-5 text-[15px] font-bold">{t("why.actions_title")}</h3>
          <ActionList actions={actions.slice(0, SUMMARY_ACTIONS)} />
        </>
      )}
      <Link
        to="/operator/risk"
        className="press mt-4 flex min-h-[52px] items-center justify-center gap-2 rounded-md bg-sky px-[18px] text-[15px] font-bold text-ink"
      >
        {more > 0 ? t("why.details_more", { n: more }) : t("why.details")}
        <Icon name="chevronRight" size={16} />
      </Link>
    </section>
  );
}

const TREND_ICON: Record<Trend, "chevronUp" | "chevronDown" | "minus"> = { rising: "chevronUp", easing: "chevronDown", steady: "minus" };

/**
 * Predictions tab, first thing on the page: one tile per risk in the system's own status styles (DESIGN.md):
 * High or Very high is an alert card (Coral Wash, a Soft Coral icon tile); Elevated a sky metric tile with the ink
 * heads-up icon; Low or Guarded a calm sky tile with a check. The level is the numeral; trend and reason follow.
 */
export function RiskHero({ prediction, history }: { prediction: PredictorOutput; history: { turbidity: number[]; drought: number[] } | null }) {
  const { t } = useCopy();
  const lead: DriverModel = prediction.drought_level > prediction.turbidity_level ? "drought" : "turbidity";
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {(["turbidity", "drought"] as const).map((m) => {
        const level = levelOf(prediction, m);
        const alert = level >= 3;
        const series = history?.[m];
        const trend = series ? trendOf(series) : null;
        const since = series ? hoursAtLevel(series, levelOfScore) : null;
        const reason = level >= 2 ? topReason(t, prediction, m) : keptLowBy(t, prediction, m) ?? topReason(t, prediction, m);
        return (
          <section key={m} className={`rounded-xl p-6 ${alert ? "bg-coral-wash" : "bg-sky"}`} aria-labelledby={`hero-${m}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid size-11 place-items-center rounded-md ${alert ? "bg-coral text-ink" : level >= 2 ? "bg-ink text-foam" : "bg-foam text-tide"}`} aria-hidden="true">
                  <Icon name={level >= 2 ? "alert" : "check"} size={22} />
                </span>
                <span>
                  <span id={`hero-${m}`} className="block text-[15px] font-bold">{t(RISK_LABEL[m])}</span>
                  <span className="block text-[14px] text-ink-soft">{t(HORIZON[m])}</span>
                </span>
              </div>
              {m === lead && prediction.signal_level > 0 && (
                <span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-bold text-foam">{t("risk.sets_signal")}</span>
              )}
            </div>
            <p className="numeral mt-5 text-[52px]">{band(t, level)}</p>
            {trend && (
              <p className={`mt-3 flex items-center gap-1.5 text-[15px] ${level >= 2 ? "font-bold" : "text-ink-soft"}`}>
                <Icon name={TREND_ICON[trend]} size={18} />
                {t(`trend.${trend}` as CopyKeyName)}
                {since !== null && <span className="font-normal text-ink-soft">· {t("trend.at_level_for", { band: band(t, level), n: since })}</span>}
                {since === null && level <= 1 && <span className="text-ink-soft">· {t("trend.all_window", { band: band(t, level) })}</span>}
              </p>
            )}
            {reason && <p className="mt-1 text-[15px] text-ink-soft">{reason}</p>}
          </section>
        );
      })}
    </div>
  );
}

export function ActionList({ actions }: { actions: OperatorAction[] }) {
  const { t } = useCopy();
  if (actions.length === 0) return <p className="mt-2 text-[14px] text-sky">{t("why.no_actions")}</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {actions.map((action) => (
        <li key={`${action.source}-${action.action}`} className="rounded-lg bg-ink-raised p-3 text-[14px]">
          <p>{action.action}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[13px] font-bold ${action.source.startsWith("WSP") ? "bg-sky text-ink" : "bg-mist text-ink"}`}>
            {action.source}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Predictions tab: one model's level, its WSP rules, the scorecard and what would change it. */
export function ModelScorecard({ prediction, model }: { prediction: PredictorOutput; model: DriverModel }) {
  const { t } = useCopy();
  const card = scorecard(prediction, model);
  const rules = rulesOf(prediction, model);
  const level = levelOf(prediction, model);
  return (
    <section className="rounded-xl bg-mist p-6" aria-labelledby={`model-${model}`} data-testid={`scorecard-${model}`}>
      <h2 id={`model-${model}`} className="text-[20px] leading-tight">
        {t("why.score_title_model", { risk: t(RISK_LABEL[model]).toLowerCase(), band: band(t, level) })}
      </h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t("why.score_sub")}</p>
      {rules.length > 0 && (
        <div className="mt-2 rounded-lg bg-foam p-3 text-[14px]">
          <strong className="block">{t("why.fallback")}</strong>
          <ul className="mt-1 flex flex-col gap-1">
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      )}
      {card && (
        <>
          <ScoreWaterfall rows={card.rows} start={card.start} total={card.total} level={card.level} startLabel={t(START[model])} prediction={prediction} />
          {level > card.level && (
            <p className="mt-2 text-[13px]">{t("why.rule_raised", { band: band(t, level), model_band: band(t, card.level) })}</p>
          )}

          {/* Already at the lowest level: there is nothing lower to explain. */}
          {card.level > 0 && (
            <>
              <h3 className="mt-5 text-[15px] font-bold">{t("why.without_title")}</h3>
              {card.without.length === 0 ? (
                <p className="mt-1 text-[14px] text-ink-soft">{t("why.without_none")}</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1 text-[14px]">
                  {card.without.map((w) => (
                    <li key={w.feature}>{t("why.without_row", { input: featureLabel(t, w.feature, w.text).toLowerCase(), band: band(t, w.level) })}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function featureLabel(t: T, feature: string, fallback: string): string {
  const key = `why.f_${feature}` as CopyKeyName;
  const label = t(key);
  return label === key ? fallback : label;
}

function sourceLabel(t: T, feature: string, prediction: PredictorOutput): string {
  if (feature === "forecast_rain_48h_mm") return t(`why.src_forecast_${prediction.forecast_source ?? "live"}` as CopyKeyName);
  return t(RAIN_FEATURES.has(feature) ? "why.src_rain" : "why.src_logged");
}

const formatValue = (value: number | undefined, unit: string | undefined) => {
  if (value === undefined) return "";
  const n = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return unit === "%" ? `${n}%` : `${n}${unit ? ` ${unit}` : ""}`;
};
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

// Waterfall on the score axis: the start dot, one bar per input from the running total before it to the one after
// (Ember raises, tide lowers), then the total dot. Background bands are the signal levels, so the cut-offs are
// visible. The axis grows past 0-100 when the data does, so no bar is ever clipped. Exact points sit in the right column.

const MIN_LABELLED_BAND = 0.1; // in a half-width card, a band narrower than this share of the axis gets no name (the legend line has them all)

type Scale = { x: (v: number) => string; bands: { from: number; to: number; i: number }[]; ticks: number[]; named: { from: number; to: number; i: number }[] };

/** Score axis covering 0-100 and every value given (rounded out to tens), with the level bands and cut-off ticks. */
function makeScale(values: number[], minNamedShare = MIN_LABELLED_BAND): Scale {
  const lo = Math.min(0, Math.floor(Math.min(...values) / 10) * 10);
  const hi = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const edges = [lo, ...LEVEL_CUTOFFS, hi];
  const bands = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1], i }));
  return { x, bands, ticks: edges, named: bands.filter((b) => (b.to - b.from) / (hi - lo) >= minNamedShare) };
}

/** Level names over the bands wide enough to hold them. */
function BandNames({ scale }: { scale: Scale }) {
  const { t } = useCopy();
  return (
    <div className="relative h-5 text-[13px] leading-5 text-ink-soft" aria-hidden="true">
      {scale.named.map((b) => (
        <span key={b.i} className="absolute truncate px-1" style={{ left: scale.x(b.from), width: `calc(${scale.x(b.to)} - ${scale.x(b.from)})` }}>
          {band(t, b.i)}
        </span>
      ))}
    </div>
  );
}

/** Cut-off scores under the plot. */
function Ticks({ scale }: { scale: Scale }) {
  const last = scale.ticks.length - 1;
  return (
    <div className="relative mt-0.5 h-5 text-[13px] leading-5 tabular-nums text-ink-soft" aria-hidden="true">
      {scale.ticks.map((v, i) => (
        <span key={v} className={`absolute ${i === 0 ? "" : i === last ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: scale.x(v) }}>{v}</span>
      ))}
    </div>
  );
}

/** One row's plot cell: the level bands behind, the row's mark on top; the title is the hover tooltip. */
/** `strong`: full level tints (the Total row, where the level is decided); other rows get a faint echo of them. */
function Plot({ scale, label, strong = false, children }: { scale: Scale; label: string; strong?: boolean; children?: ReactNode }) {
  return (
    <div className="relative mt-1.5 h-5 overflow-hidden rounded-sm bg-foam" title={label}>
      {scale.bands.map((b) => (
        <div key={b.i} aria-hidden="true" className="absolute inset-y-0" style={{ left: scale.x(b.from), width: `calc(${scale.x(b.to)} - ${scale.x(b.from)})`, background: LEVEL_TINT[b.i], opacity: strong ? 1 : 0.4 }} />
      ))}
      {children}
    </div>
  );
}

function Dot({ scale, at }: { scale: Scale; at: number }) {
  return <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-foam" style={{ left: scale.x(at) }} />;
}

function ScoreWaterfall({ rows, start, total, level, startLabel, prediction }: { rows: ScoreRow[]; start: number; total: number; level: number; startLabel: string; prediction: PredictorOutput }) {
  const { t } = useCopy();
  const shown = rows.filter((row) => row.points !== 0);
  const steps = shown.reduce<{ row: ScoreRow; from: number; to: number }[]>((acc, row) => {
    const from = acc.length ? acc[acc.length - 1].to : start;
    return [...acc, { row, from, to: from + row.points }];
  }, []);
  const scale = makeScale([start, total, ...steps.map((s) => s.to)]);
  const { x } = scale;
  const head = (left: ReactNode, right: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">{left}</span>
      <span className="shrink-0 text-right tabular-nums">{right}</span>
    </div>
  );

  return (
    <figure className="mt-3 text-[14px]" aria-label={t("why.chart_label", { start, total, band: band(t, level) })}>
      <BandNames scale={scale} />

      <div className="py-1.5 text-ink-soft">
        {head(startLabel, start)}
        <Plot scale={scale} label={`${startLabel}: ${start}`}><Dot scale={scale} at={start} /></Plot>
      </div>
      {steps.map(({ row, from, to }) => {
        const up = row.points > 0;
        const name = `${featureLabel(t, row.feature, row.text)} ${formatValue(row.value, row.unit)}`.trim();
        return (
          <div key={row.feature} className="py-1.5">
            {head(
              <>
                <span className="font-bold">{name}</span>
                <span className="text-[13px] text-ink-soft"> · {sourceLabel(t, row.feature, prediction)}</span>
              </>,
              <span className="font-bold">{signed(row.points)}</span>,
            )}
            <Plot scale={scale} label={t("why.bar_tooltip", { input: name, points: signed(row.points), from, to })}>
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 ${up ? "rounded-r-sm bg-coral-deep" : "rounded-l-sm bg-tide"}`}
                style={{ left: x(Math.min(from, to)), width: `max(3px, calc(${x(Math.max(from, to))} - ${x(Math.min(from, to))}))` }}
              />
            </Plot>
          </div>
        );
      })}
      <div className="mt-3">
        {head(<span className="font-bold">{t("why.total")} · {band(t, level)}</span>, <span className="font-bold">{total}</span>)}
        <Plot scale={scale} strong label={`${t("why.total")}: ${total}`}><Dot scale={scale} at={total} /></Plot>
      </div>

      <Ticks scale={scale} />
      <figcaption className="mt-1 text-[13px] text-ink-soft">
        {t("why.cutoffs", { l1: LEVEL_CUTOFFS[0], l2: LEVEL_CUTOFFS[1], l3: LEVEL_CUTOFFS[2], l4: LEVEL_CUTOFFS[3] })} {t("why.chart_caption")}
      </figcaption>
    </figure>
  );
}

