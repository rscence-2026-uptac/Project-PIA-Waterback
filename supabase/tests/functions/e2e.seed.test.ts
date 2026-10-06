// End-to-end predict() over the real seed data in local Postgres (pia_dev, loaded by supabase/tests/run_local.sh).
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PredictorOutput } from "../../../packages/shared-types/src/index.ts";
import { modelMeta } from "../../functions/_shared/model.generated.ts";
import { forecastRain48h, predict } from "../../functions/_shared/predict.ts";
import type { RainHourRow, ReadingRow } from "../../functions/_shared/predict.ts";

const client = new pg.Client({ host: process.env.PGHOST ?? "localhost", port: Number(process.env.PGPORT ?? 5432), database: "pia_dev", user: process.env.PGUSER });
let readings: ReadingRow[] = [];
let rainHourly: RainHourRow[] = [];
let forecastHourly: RainHourRow[] = [];
let connected = false;
const table: Record<string, unknown>[] = [];

beforeAll(async () => {
  try {
    await client.connect(); connected = true;
    readings = (await client.query(`select recorded_at, intake_id, turbidity_ntu::float8 turbidity_ntu, plant_status, reservoir_pct::float8 reservoir_pct, clarifier_inflow_lps::float8 clarifier_inflow_lps from readings order by recorded_at`))
      .rows.map((r) => ({ ...r, recorded_at: r.recorded_at.toISOString() }));
    rainHourly = (await client.query(`select ts, precipitation_mm::float8 precipitation_mm from rainfall_hourly order by ts`))
      .rows.map((r) => ({ ts: r.ts.toISOString(), precipitation_mm: r.precipitation_mm }));
    forecastHourly = (await client.query(`select ts, precipitation_mm::float8 precipitation_mm from rain_forecast_hourly order by ts`))
      .rows.map((r) => ({ ts: r.ts.toISOString(), precipitation_mm: r.precipitation_mm }));
  } catch (e) { console.warn("pia_dev not reachable, e2e skipped:", (e as Error).message); }
});
afterAll(async () => { if (connected) { await client.end(); console.table(table); } });

// Jul 1 00:00: only one reading exists yet (turbidity slope impossible -> WSP fallback), but rain windows are complete thanks to the June context seed.
// Jul 31 12:00: the forecast seed ends 2026-07-31 23:00, so (as_of, as_of+48h] is incomplete -> forecast missing -> turbidity fallback.
const CASES: [string, "seeded" | "missing"][] = [
  ["2026-07-01T00:00:00+08:00", "seeded"], ["2026-07-02T06:00:00+08:00", "seeded"], ["2026-07-15T12:00:00+08:00", "seeded"],
  ["2026-07-22T12:00:00+08:00", "seeded"], ["2026-07-31T12:00:00+08:00", "missing"],
];
describe(`e2e over seed (model ${modelMeta.version})`, () => {
  it.each(CASES)("as_of %s", (as, src) => {
    if (!connected) return;
    expect(readings.length).toBe(2976);
    expect(rainHourly.length).toBe(1464);
    expect(forecastHourly.length).toBe(1464);
    const asOf = new Date(as);
    const fc = forecastRain48h(forecastHourly, asOf);
    const o = predict({ readings, rainHourly, asOf, forecastRain48hMm: fc, forecastSource: fc == null ? "missing" : "seeded" });
    table.push({ as_of: as, forecast_48h_mm: fc == null ? null : +fc.toFixed(1), p_turb: +o.p_turbidity.toFixed(3), p_drought: +o.p_drought.toFixed(3), turb_lvl: o.turbidity_level, drought_lvl: o.drought_level, signal: o.signal_level, fallback: o.fallback_used, forecast_source: o.forecast_source });
    expect(PredictorOutput.parse(o)).toEqual(o);
    expect(o.forecast_source).toBe(src);
    expect(o.signal_level).toBe(Math.max(o.turbidity_level, o.drought_level));
  });
});
