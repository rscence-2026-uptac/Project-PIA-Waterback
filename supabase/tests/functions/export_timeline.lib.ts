// Pure helpers for the July 2026 timeline export (see export_timeline.test.ts for the command).
import { predict } from "../../functions/_shared/predict.ts";
import type { RainHourRow, ReadingRow } from "../../functions/_shared/predict.ts";
import { forecastRain48h } from "../../functions/_shared/predict.ts";

const HOUR = 3_600_000;
export const MANILA = "+08:00";
export const fmt = (ms: number): string => new Date(ms + 8 * HOUR).toISOString().replace(/\.\d+Z$/, "").replace(/Z$/, "") + MANILA;
/** Event runs closer than this many hours are one episode (sensor flicker around a threshold). */
export const EPISODE_GAP_H = 6;

export interface TimelineRow {
  as_of: string;
  rain_1h_mm: number | null;
  rain_24h_mm: number;
  forecast_rain_48h_mm: number | null;
  kulador_ntu: number | null;
  caramayon1_ntu: number | null;
  reservoir_pct: number | null;
  plant_status_by_intake: Record<string, string>;
  p_turbidity: number;
  p_drought: number;
  turbidity_level: number;
  drought_level: number;
  signal_level: number;
  fallback_used: boolean;
  top_driver_text: string;
}

const latestAt = (rows: ReadingRow[], intake: string, ms: number): ReadingRow | undefined => {
  let best: ReadingRow | undefined;
  for (const r of rows) if (r.intake_id === intake && Date.parse(r.recorded_at) <= ms && (!best || r.recorded_at > best.recorded_at)) best = r;
  return best;
};

export function buildTimeline(readings: ReadingRow[], rain: RainHourRow[], forecast: RainHourRow[], fromMs: number, toMs: number): TimelineRow[] {
  const intakes = [...new Set(readings.map((r) => r.intake_id))].sort();
  const rainByTs = new Map(rain.map((r) => [Date.parse(r.ts), r.precipitation_mm]));
  const out: TimelineRow[] = [];
  for (let ms = fromMs; ms <= toMs; ms += HOUR) {
    const asOf = new Date(ms);
    const fc = forecastRain48h(forecast, asOf);
    const o = predict({ readings, rainHourly: rain, asOf, forecastRain48hMm: fc, forecastSource: fc == null ? "missing" : "seeded" });
    let rain24 = 0;
    for (let h = 0; h < 24; h++) rain24 += rainByTs.get(ms - h * HOUR) ?? 0;
    const kul = latestAt(readings, "kulador", ms), car = latestAt(readings, "caramayon_1", ms);
    const status: Record<string, string> = {};
    for (const i of intakes) { const r = latestAt(readings, i, ms); if (r) status[i] = r.plant_status; }
    const turbDrives = o.turbidity_level >= o.drought_level;
    out.push({
      as_of: fmt(ms), rain_1h_mm: rainByTs.get(ms) ?? null, rain_24h_mm: round(rain24, 2), forecast_rain_48h_mm: fc == null ? null : round(fc, 2),
      kulador_ntu: kul ? round(kul.turbidity_ntu, 1) : null, caramayon1_ntu: car ? round(car.turbidity_ntu, 1) : null,
      reservoir_pct: kul?.reservoir_pct == null ? null : round(kul.reservoir_pct, 1), plant_status_by_intake: status,
      p_turbidity: round(o.p_turbidity, 4), p_drought: round(o.p_drought, 4),
      turbidity_level: o.turbidity_level, drought_level: o.drought_level, signal_level: o.signal_level, fallback_used: o.fallback_used,
      top_driver_text: (turbDrives ? o.drivers!.turbidity[0] : o.drivers!.drought[0]).text,
    });
  }
  return out;
}
const round = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;

export interface Episode {
  onset: string; // first hour Kulador >= 250 NTU or Caramayon I >= 500 NTU in the run
  run_end: string;
  trigger: "kulador>=250" | "caramayon1>=500" | "both";
  heads_up_start: string | null; // start of the continuous signal>=2 run covering the onset (null = missed)
  heads_up_censored_at_series_start: boolean; // the run begins at the first hour, so lead is a lower bound
  lead_h: number | null; // onset - heads_up_start (>= 0); null if the signal was < 2 at the onset
  independent: boolean; // first onset inside its alarm run (later onsets reuse the same alarm)
  // Same, but only turbidity_level >= 2 counts (the signal can also be raised by the supply-shortage/drought model).
  turbidity_heads_up_start: string | null;
  turbidity_lead_h: number | null;
}
export interface Events {
  heads_up_starts: { at: string; level_at_start: number; censored_at_series_start: boolean }[];
  event_onsets: Episode[];
  caramayon_outage_windows: { start: string; end: string; basis: string }[];
  episode_gap_h: number;
}

export function deriveEvents(tl: TimelineRow[], readings: ReadingRow[]): Events {
  const ms = (r: TimelineRow) => Date.parse(r.as_of);
  // heads-up starts: signal crosses to >= 2 after being < 2 (a run already at >= 2 at the first hour is censored)
  const starts: Events["heads_up_starts"] = [];
  const runStartOf = (key: "signal_level" | "turbidity_level", record?: typeof starts): (number | null)[] => {
    const rs = new Array<number | null>(tl.length).fill(null); // start index of the level>=2 run containing i
    for (let i = 0; i < tl.length; i++) {
      if (tl[i][key] >= 2) {
        if (i === 0 || tl[i - 1][key] < 2) { record?.push({ at: tl[i].as_of, level_at_start: tl[i][key], censored_at_series_start: i === 0 }); rs[i] = i; }
        else rs[i] = rs[i - 1];
      }
    }
    return rs;
  };
  const runStart = runStartOf("signal_level", starts);
  const tRunStart = runStartOf("turbidity_level");
  // event hours -> runs -> episodes (merge runs separated by < EPISODE_GAP_H non-event hours)
  const ev = tl.map((r) => ({ k: (r.kulador_ntu ?? 0) >= 250, c: (r.caramayon1_ntu ?? 0) >= 500 }));
  const episodes: { s: number; e: number; k: boolean; c: boolean }[] = [];
  for (let i = 0; i < tl.length; i++) {
    if (!ev[i].k && !ev[i].c) continue;
    const last = episodes[episodes.length - 1];
    if (last && i - last.e - 1 < EPISODE_GAP_H) { last.e = i; last.k ||= ev[i].k; last.c ||= ev[i].c; }
    else episodes.push({ s: i, e: i, k: ev[i].k, c: ev[i].c });
  }
  const seenRun = new Set<number>();
  const event_onsets: Episode[] = episodes.map((ep) => {
    const rs = runStart[ep.s];
    const independent = rs != null && !seenRun.has(rs);
    if (rs != null) seenRun.add(rs);
    const trs = tRunStart[ep.s];
    return {
      turbidity_heads_up_start: trs == null ? null : tl[trs].as_of, turbidity_lead_h: trs == null ? null : (ms(tl[ep.s]) - ms(tl[trs])) / HOUR,
      onset: tl[ep.s].as_of, run_end: tl[ep.e].as_of, trigger: ep.k && ep.c ? "both" : ep.k ? "kulador>=250" : "caramayon1>=500",
      heads_up_start: rs == null ? null : tl[rs].as_of, heads_up_censored_at_series_start: rs === 0,
      lead_h: rs == null ? null : (ms(tl[ep.s]) - ms(tl[rs])) / HOUR, independent: rs != null && independent,
    };
  });
  // Caramayon outage: contiguous runs where a Caramayon intake is 'shutdown' with turbidity < 500 (a power/non-turbidity shutdown)
  const from = ms(tl[0]), to = ms(tl[tl.length - 1]);
  const hrs = new Set<number>();
  for (const r of readings) {
    const t = Date.parse(r.recorded_at);
    if (r.intake_id.startsWith("caramayon") && r.plant_status === "shutdown" && r.turbidity_ntu < 500 && t >= from && t <= to) hrs.add(t);
  }
  const sorted = [...hrs].sort((a, b) => a - b);
  const windows: Events["caramayon_outage_windows"] = [];
  for (const t of sorted) {
    const w = windows[windows.length - 1];
    if (w && t - Date.parse(w.end) <= HOUR) w.end = fmt(t); else windows.push({ start: fmt(t), end: fmt(t), basis: "Caramayon intake 'shutdown' with turbidity < 500 NTU (power outage, not a turbidity shut-off); end = last shutdown hour" });
  }
  return { heads_up_starts: starts, event_onsets, caramayon_outage_windows: windows, episode_gap_h: EPISODE_GAP_H };
}
