// Operator charts + latest readings from the REST tables (anon select): `readings` and `rainfall_hourly`,
// windowed on the demo clock (as_of - 24 h .. as_of). Not live: the screen keeps its MOCK series.
import type { IntakeId, IntakeReading } from "../data/mock";
import { useAsOf } from "../demo/clockState";
import { isLive } from "./client";
import { fetchLatestReading, fetchRain, fetchReadings, type ReadingRow } from "./rest";
import { useResource } from "./useResource";

const HOUR = 3_600_000;
const POINTS = 25; // as_of - 24 h .. as_of, hourly, like the sample series

export interface OperatorSeries {
  turbidity_series: number[]; // empty = no readings in the window
  rain_series: number[];
  series_end: string;
  rain_total_mm: number;
  rain_since: string | null; // first rainy hour in the window
  dry_spell_days: number; // Manila days since a day with >= 5 mm, within the 7 days read (lower bound)
  simulated: boolean; // some of the readings are seed data (readings.is_simulated)
}

/** Last reading at or before each hourly tick, carried forward; leading gaps take the first reading. */
function bucketReadings(rows: ReadingRow[], end: number): number[] {
  if (rows.length === 0) return [];
  const out: number[] = [];
  let i = 0;
  let last: number | null = null;
  for (let p = 0; p < POINTS; p++) {
    const tick = end - (POINTS - 1 - p) * HOUR;
    while (i < rows.length && new Date(rows[i].recorded_at).getTime() <= tick) last = rows[i++].turbidity_ntu;
    out.push(last ?? rows[0].turbidity_ntu);
  }
  return out;
}

function bucketRain(rows: { ts: string; precipitation_mm: number }[], end: number): number[] {
  const out = new Array<number>(POINTS).fill(0);
  for (const row of rows) {
    const age = end - new Date(row.ts).getTime();
    if (age < 0 || age >= POINTS * HOUR) continue;
    out[POINTS - 1 - Math.floor(age / HOUR)] += row.precipitation_mm;
  }
  return out.map((v) => Math.round(v * 10) / 10);
}

const manilaDay = (ms: number) => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);

export async function loadOperatorSeries(intake: IntakeId, asOf: Date): Promise<OperatorSeries> {
  const end = asOf.getTime();
  const [readings, rain7d] = await Promise.all([
    fetchReadings(intake, new Date(end - 24 * HOUR), asOf),
    fetchRain(new Date(end - 7 * 24 * HOUR), asOf).catch(() => []),
  ]);
  const rain_series = bucketRain(rain7d, end);
  const dailyTotals = new Map<string, number>();
  for (const r of rain7d) dailyTotals.set(manilaDay(new Date(r.ts).getTime()), (dailyTotals.get(manilaDay(new Date(r.ts).getTime())) ?? 0) + r.precipitation_mm);
  let dry = 7;
  for (let d = 0; d < 7; d++) {
    if ((dailyTotals.get(manilaDay(end - d * 24 * HOUR)) ?? 0) >= 5) { dry = d; break; }
  }
  const firstRain = rain_series.findIndex((v) => v > 0);
  return {
    turbidity_series: bucketReadings(readings, end),
    rain_series,
    series_end: asOf.toISOString(),
    rain_total_mm: Math.round(rain_series.reduce((a, b) => a + b, 0)),
    rain_since: firstRain >= 0 ? new Date(end - (POINTS - 1 - firstRain) * HOUR).toISOString() : null,
    dry_spell_days: dry,
    simulated: readings.some((r) => r.is_simulated),
  };
}

export function useOperatorSeries(intake: IntakeId) {
  const { asOf, asOfKey } = useAsOf();
  return useResource(() => loadOperatorSeries(intake, asOf), [intake, asOfKey], isLive());
}

/** The newest reading of an intake at the demo time, shaped like the screen's sample reading. */
export function useLiveLatest(intake: IntakeId): (IntakeReading & { logged_at: string; simulated: boolean }) | null {
  const { asOf, asOfKey } = useAsOf();
  const res = useResource(() => fetchLatestReading(intake, asOf), [intake, asOfKey], isLive());
  const r = res.data;
  if (!r) return null;
  return {
    turbidity_ntu: r.turbidity_ntu,
    plant_status: r.plant_status,
    treated_ntu: r.treated_turbidity_ntu ?? null,
    clarifier_inflow_lps: r.clarifier_inflow_lps,
    reservoir_pct: r.reservoir_pct,
    logged_at: r.recorded_at,
    simulated: r.is_simulated === true,
  };
}
