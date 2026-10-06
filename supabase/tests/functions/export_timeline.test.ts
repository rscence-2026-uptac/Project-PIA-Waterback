// July 2026 timeline export for the pitch chart and the replay demo.
//   EXPORT_TIMELINE=1 PGDATABASE=pia_dev_a npx vitest run export_timeline      (from supabase/tests/functions)
// Runs the REAL TS predict() hourly over the local seed (2026-07-01T00:00+08:00 .. 2026-07-29T23:00+08:00) and writes
// ml/reports/july_2026_timeline.json. Without EXPORT_TIMELINE=1 only the pure event-derivation tests run.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { modelMeta } from "../../functions/_shared/model.generated.ts";
import type { RainHourRow, ReadingRow } from "../../functions/_shared/predict.ts";
import { buildTimeline, deriveEvents, fmt } from "./export_timeline.lib.ts";
import type { TimelineRow } from "./export_timeline.lib.ts";

const HOUR = 3_600_000;
const OUT = resolve(import.meta.dirname, "../../../ml/reports/july_2026_timeline.json");
const FROM = Date.parse("2026-07-01T00:00:00+08:00"), TO = Date.parse("2026-07-29T23:00:00+08:00");

const row = (h: number, sig: number, kul: number, car = 0): TimelineRow => ({
  as_of: fmt(FROM + h * HOUR), rain_1h_mm: 0, rain_24h_mm: 0, forecast_rain_48h_mm: 0, kulador_ntu: kul, caramayon1_ntu: car, reservoir_pct: 80,
  plant_status_by_intake: {}, p_turbidity: 0, p_drought: 0, turbidity_level: sig, drought_level: 0, signal_level: sig, fallback_used: false, top_driver_text: "",
});

describe("deriveEvents (pure)", () => {
  it("lead time = onset - start of the covering signal>=2 run; flicker merged; censored start flagged", () => {
    const sig = [0, 0, 1, 2, 3, 3, 3, 4, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const kul = sig.map((_, h) => (h === 7 ? 300 : h === 8 ? 100 : h === 10 ? 260 : 5)); // 10 is within 6 h of 7..8 run end? 8->10 = 1 non-event hour -> merged
    const tl = sig.map((s, h) => row(h, s, kul[h]));
    const ev = deriveEvents(tl, []);
    expect(ev.heads_up_starts.map((s) => s.at)).toEqual([fmt(FROM + 3 * HOUR)]);
    expect(ev.event_onsets).toHaveLength(1);
    expect(ev.event_onsets[0].lead_h).toBe(4);
    expect(ev.event_onsets[0].independent).toBe(true);
    expect(ev.event_onsets[0].heads_up_censored_at_series_start).toBe(false);
  });
  it("missed event -> lead null; start-of-series alarm -> censored; second onset in the same alarm is not independent", () => {
    const sig = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const kul = sig.map((_, h) => (h === 4 || h === 15 || h === 28 ? 400 : 5));
    const ev = deriveEvents(sig.map((s, h) => row(h, s, kul[h])), []);
    expect(ev.event_onsets).toHaveLength(3);
    expect(ev.event_onsets[0]).toMatchObject({ lead_h: 4, independent: true, heads_up_censored_at_series_start: true });
    expect(ev.event_onsets[1]).toMatchObject({ lead_h: 15, independent: false });
    expect(ev.event_onsets[2]).toMatchObject({ lead_h: null, heads_up_start: null, independent: false });
  });
  it("Caramayon I >= 500 is an onset trigger; outage window from non-turbidity shutdown", () => {
    const tl = Array.from({ length: 30 }, (_, h) => row(h, h >= 5 ? 2 : 0, 5, h === 12 ? 600 : 5));
    const mk = (h: number, ntu: number): ReadingRow => ({ recorded_at: new Date(FROM + h * HOUR).toISOString(), intake_id: "caramayon_2", turbidity_ntu: ntu, plant_status: "shutdown", reservoir_pct: null, clarifier_inflow_lps: null });
    const ev = deriveEvents(tl, [mk(3, 5), mk(4, 5), mk(5, 5), mk(9, 5), mk(10, 900)]);
    expect(ev.event_onsets[0]).toMatchObject({ trigger: "caramayon1>=500", lead_h: 7 });
    expect(ev.caramayon_outage_windows.map((w) => [w.start, w.end])).toEqual([[fmt(FROM + 3 * HOUR), fmt(FROM + 5 * HOUR)], [fmt(FROM + 9 * HOUR), fmt(FROM + 9 * HOUR)]]);
  });
});

describe.skipIf(!process.env.EXPORT_TIMELINE)("export timeline over the local seed", () => {
  it("writes ml/reports/july_2026_timeline.json", async () => {
    const db = process.env.PGDATABASE ?? "pia_dev_a";
    const client = new pg.Client({ host: process.env.PGHOST ?? "localhost", port: Number(process.env.PGPORT ?? 5432), database: db, user: process.env.PGUSER });
    await client.connect();
    try {
      const readings: ReadingRow[] = (await client.query(`select recorded_at, intake_id, turbidity_ntu::float8 turbidity_ntu, plant_status, reservoir_pct::float8 reservoir_pct, clarifier_inflow_lps::float8 clarifier_inflow_lps from readings order by recorded_at`))
        .rows.map((r) => ({ ...r, recorded_at: r.recorded_at.toISOString() }));
      const rain: RainHourRow[] = (await client.query(`select ts, precipitation_mm::float8 precipitation_mm from rainfall_hourly order by ts`)).rows.map((r) => ({ ts: r.ts.toISOString(), precipitation_mm: r.precipitation_mm }));
      const fc: RainHourRow[] = (await client.query(`select ts, precipitation_mm::float8 precipitation_mm from rain_forecast_hourly order by ts`)).rows.map((r) => ({ ts: r.ts.toISOString(), precipitation_mm: r.precipitation_mm }));
      const timeline = buildTimeline(readings, rain, fc, FROM, TO);
      expect(timeline).toHaveLength(29 * 24);
      const events = deriveEvents(timeline, readings);
      const meta = {
        model_version: modelMeta.version, as_of_range: [fmt(FROM), fmt(TO)], step: "1h", source_db: db, predictor: "supabase/functions/_shared/predict.ts (real TS predict())",
        data_provenance: {
          rain: "REAL: Open-Meteo hourly archive, Catbalogan, June-July 2026 (rainfall_hourly)",
          forecast: "SEEDED: Open-Meteo Historical Forecast archive (rain_forecast_hourly). Value-identical to the archive rain here, so it acts as a perfect forecast (upper bound); not a true 24-48 h-ahead forecast",
          plant_readings: "SIMULATED (ml/simulate_july.py; readings.is_simulated = true). Caramayon outage 2026-07-04T18:00 to 2026-07-07T18:00 is an ASSUMPTION",
        },
        event_definition: "onset = first hour with Kulador raw >= 250 NTU or Caramayon I raw >= 500 NTU in an episode (runs less than 6 h apart merged); heads-up = signal_level >= 2 (p >= 0.4)",
      };
      writeFileSync(OUT, JSON.stringify({ meta, events, timeline }, null, 1) + "\n");
      console.log("\nEpisodes (lead = onset - start of the continuous signal>=2 run):");
      console.table(events.event_onsets.map((e) => ({ onset: e.onset, trigger: e.trigger, heads_up_start: e.heads_up_start, lead_h: e.lead_h, turb_heads_up: e.turbidity_heads_up_start, turb_lead_h: e.turbidity_lead_h, independent: e.independent, censored: e.heads_up_censored_at_series_start })));
      console.log("heads-up starts:", events.heads_up_starts.map((s) => s.at + (s.censored_at_series_start ? " (censored)" : "")).join(", "));
      console.log("Caramayon outage:", JSON.stringify(events.caramayon_outage_windows.map((w) => [w.start, w.end])));
    } finally { await client.end(); }
  }, 120000);
});
