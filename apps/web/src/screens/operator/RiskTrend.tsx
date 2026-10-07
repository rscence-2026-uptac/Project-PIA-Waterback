// Predictions tab: how both risks moved, hourly over the last 48 h: live from the predictor's history mode,
// or the sample OPERATOR_RISK_HISTORY when not live.
// The vertical axis is the five signal levels, each given equal height (scores map linearly inside their level), so
// "which level, and when did it get there" reads at a glance; exact scores are in the hover and the table.
// Colour follows DESIGN.md: the level bands run cool (Clear Sky) to warm (Soft Coral); the series that sets the
// signal is the one bold Deep Tide line with a soft wash under it; the other is a quiet Slate Current line.
import { useState, type PointerEvent } from "react";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { LEVEL_CUTOFFS, levelOfScore } from "../../lib/scorecard";
import { SampleChip } from "../../ui/Chip";
import { LEVEL_TINT, band, hoursAtLevel, type RiskHistory } from "./plantRiskState";

const X_TICKS_EVERY = 12; // hours
const LEVELS = 5;
const TIDE = "#1a6e9c";
const SLATE = "#34505f";
const PLOT_H = 300;

type Key = "turbidity" | "drought";
const LABEL: Record<Key, CopyKeyName> = { turbidity: "why.p_turbidity", drought: "why.p_drought" };


export function RiskTrend({ history, sample }: { history: RiskHistory; sample: boolean }) {
  const { t } = useCopy();
  const [hover, setHover] = useState<number | null>(null);
  const last = history.turbidity.length - 1;
  const top = Math.max(100, ...history.turbidity, ...history.drought);
  const edges = [0, ...LEVEL_CUTOFFS, top];
  /** Score -> % from the top: each level is 1/5 of the height, linear inside it. */
  const y = (score: number) => {
    const s = Math.max(0, Math.min(top, score));
    const i = Math.min(LEVELS - 1, levelOfScore(s));
    const within = (s - edges[i]) / (edges[i + 1] - edges[i]);
    return 100 - ((i + within) / LEVELS) * 100;
  };
  const x = (i: number) => (i / last) * 100;
  const hoursAgo = (i: number) => last - i;

  // The series that sets the signal is the focus; turbidity on a tie.
  const lead: Key = levelOfScore(history.drought[last]) > levelOfScore(history.turbidity[last]) ? "drought" : "turbidity";
  const quiet: Key = lead === "turbidity" ? "drought" : "turbidity";
  const leadLevel = levelOfScore(history[lead][last]);
  const since = hoursAtLevel(history[lead], levelOfScore);
  const sinceIndex = since === null ? null : last - since;
  const path = (k: Key) => history[k].map((v, i) => `${x(i)},${y(v)}`).join(" ");

  function onMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(Math.round(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * last));
  }

  const when = (i: number) => (i === last ? t("trend.now") : t("trend.hours_ago", { n: hoursAgo(i) }));

  return (
    <section className="rounded-xl bg-mist p-6" aria-labelledby="risk-trend">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="risk-trend" className="text-[22px] leading-tight">{t("trend.title")}</h2>
          <p className="mt-1 text-[14px] text-ink-soft">{t("trend.subtitle")}</p>
        </div>
        {sample && <SampleChip always />}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        <li className="flex items-center gap-2 font-bold">
          <span aria-hidden="true" className="h-1 w-6 rounded-full" style={{ background: TIDE }} />
          {t(LABEL[lead])}
        </li>
        <li className="flex items-center gap-2 text-ink-soft">
          <span aria-hidden="true" className="h-0.5 w-6 rounded-full" style={{ background: SLATE }} />
          {t(LABEL[quiet])}
        </li>
      </ul>

      <div className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
        {/* Level names, one per band, centred: the axis IS the levels. */}
        <div className="relative" style={{ height: PLOT_H }} aria-hidden="true">
          {Array.from({ length: LEVELS }, (_, i) => (
            <span
              key={i}
              className={`absolute right-0 -translate-y-1/2 text-right text-[13px] leading-tight ${i === leadLevel ? "font-bold text-ink" : "text-ink-soft"}`}
              style={{ top: `${100 - ((i + 0.5) / LEVELS) * 100}%` }}
            >
              {band(t, i)}
            </span>
          ))}
        </div>

        <div
          className="relative touch-none overflow-visible rounded-lg bg-foam"
          style={{ height: PLOT_H }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          aria-hidden="true"
        >
          <svg className="absolute inset-0 size-full overflow-hidden rounded-lg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trend-wash" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={TIDE} stopOpacity="0.1" />
                <stop offset="0.7" stopColor={TIDE} stopOpacity="0" />
              </linearGradient>
            </defs>
            {LEVEL_TINT.map((fill, i) => (
              <rect key={i} x="0" width="100" y={100 - ((i + 1) / LEVELS) * 100} height={100 / LEVELS} fill={fill} />
            ))}
            <polygon points={`0,100 ${path(lead)} 100,100`} fill="url(#trend-wash)" />
            <polyline fill="none" stroke={SLATE} strokeOpacity="0.75" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={path(quiet)} />
            <polyline fill="none" stroke={TIDE} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={path(lead)} />
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke={SLATE} strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>

          {/* The moment worth noticing: when the focus series reached its current level. */}
          {sinceIndex !== null && leadLevel > 0 && (
            <div
              className={`pointer-events-none absolute flex flex-col items-center ${x(sinceIndex) < 12 ? "translate-x-0 items-start" : x(sinceIndex) > 88 ? "-translate-x-full items-end" : "-translate-x-1/2"}`}
              style={{ left: `${x(sinceIndex)}%`, bottom: `${100 - y(history[lead][sinceIndex])}%` }}
            >
              <span className="mb-2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-[13px] font-bold text-foam">
                {t("trend.reached", { band: band(t, leadLevel), n: since! })}
              </span>
              <span className="h-3 w-0.5 rounded-full bg-ink" />
            </div>
          )}
          {sinceIndex !== null && leadLevel > 0 && (
            <span
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-foam"
              style={{ left: `${x(sinceIndex)}%`, top: `${y(history[lead][sinceIndex])}%` }}
            />
          )}

          {/* Now: the focus series ends in a large dot; the quiet one in a small one. */}
          <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-foam" style={{ left: "100%", top: `${y(history[lead][last])}%`, background: TIDE }} />
          <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-foam" style={{ left: "100%", top: `${y(history[quiet][last])}%`, background: SLATE }} />

          {hover !== null && (
            <>
              {(["turbidity", "drought"] as const).map((k) => (
                <span
                  key={k}
                  className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-foam"
                  style={{ left: `${x(hover)}%`, top: `${y(history[k][hover])}%`, background: k === lead ? TIDE : SLATE }}
                />
              ))}
              <div
                className={`pointer-events-none absolute top-3 z-10 w-max rounded-md bg-ink px-3 py-2 text-[14px] text-foam shadow-[0_12px_28px_-10px_rgba(13,46,66,0.5)] ${hover > last / 2 ? "-translate-x-[calc(100%+14px)]" : "translate-x-3.5"}`}
                style={{ left: `${x(hover)}%` }}
              >
                <p className="font-bold">{when(hover)}</p>
                {([lead, quiet] as const).map((k) => (
                  <p key={k} className="mt-1 flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: k === lead ? TIDE : "#a3d0e8" }} />
                    {t(LABEL[k])}: <strong>{band(t, levelOfScore(history[k][hover]))}</strong>
                    <span className="tabular-nums text-sky">{history[k][hover]}</span>
                  </p>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Time: hours ago, ending at now. */}
        <span />
        <div className="relative mt-2 h-5 text-[13px] text-ink-soft" aria-hidden="true">
          {Array.from({ length: last + 1 }, (_, i) => i).filter((i) => hoursAgo(i) % X_TICKS_EVERY === 0).map((i) => (
            <span
              key={i}
              className={`absolute ${i === 0 ? "" : i === last ? "-translate-x-full font-bold text-ink" : "-translate-x-1/2"}`}
              style={{ left: `${x(i)}%` }}
            >
              {when(i)}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[13px] text-ink-soft">{t("trend.caption")}{sample && ` ${t("trend.sample_note")}`}</p>

      <table className="sr-only">
        <caption>{t("trend.title")}</caption>
        <thead>
          <tr><th>{t("trend.time")}</th><th>{t(LABEL.turbidity)}</th><th>{t(LABEL.drought)}</th></tr>
        </thead>
        <tbody>
          {history.turbidity.map((_, i) => (
            <tr key={i}>
              <td>{when(i)}</td>
              {(["turbidity", "drought"] as const).map((k) => <td key={k}>{band(t, levelOfScore(history[k][i]))}, {history[k][i]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
