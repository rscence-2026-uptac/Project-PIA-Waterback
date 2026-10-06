// Hourly charts for the operator dashboard. Static on load: operators read them every hour,
// so they don't animate (wireframe p.12, "Where it doesn't").
import { useCopy } from "../../copy/i18n";
import { formatShortTime } from "../../lib/time";

const W = 640;
const PAD_L = 40;
const PAD_R = 56;
const PLOT_W = W - PAD_L - PAD_R;

function xAt(i: number, count: number) {
  return PAD_L + (i / (count - 1)) * PLOT_W;
}

function hourLabels(end: string, count: number) {
  const last = new Date(end).getTime();
  return [0, 6, 12, 18, 24]
    .filter((i) => i < count)
    .map((i) => ({ i, label: formatShortTime(new Date(last - (count - 1 - i) * 3600_000)) }));
}

export function TurbidityChart({ series, end, limit }: { series: number[]; end: string; limit: number }) {
  const { t } = useCopy();
  const H = 190;
  const PAD_T = 14;
  const PAD_B = 26;
  const plotH = H - PAD_T - PAD_B;
  const max = 800;
  const y = (v: number) => PAD_T + plotH - (Math.min(v, max) / max) * plotH;
  const points = series.map((v, i) => `${xAt(i, series.length)},${y(v)}`).join(" ");
  const lastX = xAt(series.length - 1, series.length);
  const lastV = series[series.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("operator.chart_turbidity")}>
      {[0, 200, 400, 600, 800].map((tick) => (
        <g key={tick}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(tick)} y2={y(tick)} stroke="var(--color-mist)" strokeWidth="1.5" />
          <text x={PAD_L - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">{tick}</text>
        </g>
      ))}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(limit)} y2={y(limit)} stroke="var(--color-coral-deep)" strokeWidth="1.5" strokeDasharray="6 5" />
      <text x={PAD_L + 6} y={y(limit) - 6} fontSize="11" fontWeight="700" fill="var(--color-coral-deep)">
        {t("operator.plant_limit", { limit })}
      </text>
      <polyline points={points} fill="none" stroke="var(--color-water)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={lastX} cy={y(lastV)} r="4.5" fill="var(--color-water)" />
      <text x={lastX} y={y(lastV) - 12} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--color-ink)">
        {t("operator.now_value", { value: lastV })}
      </text>
      {hourLabels(end, series.length).map(({ i, label }) => (
        <text key={i} x={xAt(i, series.length)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-ink-soft)">{label}</text>
      ))}
    </svg>
  );
}

export function RainChart({ series, end }: { series: number[]; end: string }) {
  const { t } = useCopy();
  const H = 120;
  const PAD_T = 8;
  const PAD_B = 26;
  const plotH = H - PAD_T - PAD_B;
  const max = 12;
  const barW = (PLOT_W / series.length) * 0.6;
  const y = (v: number) => PAD_T + plotH - (Math.min(v, max) / max) * plotH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("operator.chart_rain")}>
      {[0, max].map((tick) => (
        <text key={tick} x={PAD_L - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-soft)">{tick}</text>
      ))}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} stroke="var(--color-mist)" strokeWidth="1.5" />
      {series.map((v, i) =>
        v > 0 ? (
          <rect key={i} x={xAt(i, series.length) - barW / 2} y={y(v)} width={barW} height={y(0) - y(v)} rx="2" fill="var(--color-tide)" />
        ) : null,
      )}
      {hourLabels(end, series.length).map(({ i, label }) => (
        <text key={i} x={xAt(i, series.length)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-ink-soft)">{label}</text>
      ))}
    </svg>
  );
}
