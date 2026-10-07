import { describe, expect, it } from "vitest";
import { handleRequest } from "../../functions/_shared/handler.ts";
import type { FetchOpts } from "../../functions/_shared/handler.ts";
import { forecastSeries, HOUR, kuladorSeries, rainSeries } from "./helpers.ts";
import type { RainHourRow } from "../../functions/_shared/predict.ts";

const AS = "2026-07-02T06:00:00Z";
const ASMS = Date.parse(AS);
const NOW = new Date("2026-07-10T04:00:00Z");
let fetches = 0;
let lastOpts: FetchOpts | undefined;
let stale = false; // no readings at all -> both models fall back
let seededOnly = true;
const fetchData = async (_from: Date, to: Date, opts?: FetchOpts) => {
  fetches++; lastOpts = opts;
  const startMs = opts?.forecastFrom?.getTime() ?? to.getTime();
  return {
    readings: stale ? [] : kuladorSeries(to.getTime(), 240, (h) => ({ turbidity_ntu: 4 + (h % 7) })),
    rainHourly: rainSeries(to.getTime(), 90 * 24 + 100, (h) => (h % 5 === 0 ? 1.5 : 0.1)),
    // seeded rows from the first history point through as_of + 48 h
    forecastHourly: seededOnly ? forecastSeries(startMs, 0.25, Math.round((to.getTime() - startMs) / HOUR) + 48) : [],
  };
};
let liveCalls = 0;
const fetchLive = async (): Promise<RainHourRow[]> => { liveCalls++; throw new Error("no network"); };
const call = (qs: string) => handleRequest(new Request(`http://x/f?${qs}`), fetchData, () => NOW, fetchLive);

describe("history mode", () => {
  it("returns N+1 hourly points, oldest first, from one fetch", async () => {
    fetches = 0; stale = false; seededOnly = true;
    const r = await call(`as_of=${AS}&history_hours=48`);
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.as_of).toBe(AS.replace("Z", ".000Z"));
    expect(b.history_hours).toBe(48);
    expect(b.hours).toHaveLength(49);
    b.hours.forEach((h: { as_of: string }, i: number) => expect(Date.parse(h.as_of)).toBe(ASMS - (48 - i) * HOUR));
    expect(fetches).toBe(1);
    expect(lastOpts!.readingsFrom!.getTime()).toBe(ASMS - 48 * HOUR - 2 * 24 * HOUR);
    expect(Object.keys(b.hours[0]).sort()).toEqual(["as_of", "drought_level", "fallback_used", "forecast_source", "score_drought", "score_turbidity", "signal_level", "turbidity_level"]);
  });
  it("last point equals a single-mode call; scores match 50+10*(baseline+sum)", async () => {
    stale = false; seededOnly = true;
    const b = await (await call(`as_of=${AS}&history_hours=6`)).json();
    const s = await (await call(`as_of=${AS}`)).json();
    const last = b.hours[6];
    for (const k of ["signal_level", "turbidity_level", "drought_level", "fallback_used", "forecast_source"]) expect(last[k]).toBe(s[k]);
    for (const m of ["turbidity", "drought"] as const) {
      const z = s.drivers.baseline[m] + s.drivers[m].reduce((a: number, d: { contribution: number }) => a + d.contribution, 0);
      expect(last[`score_${m}`]).toBe(Math.round(50 + 10 * z));
    }
  });
  it("model fallback gives null score", async () => {
    stale = true; seededOnly = true;
    const b = await (await call(`as_of=${AS}&history_hours=3`)).json();
    for (const h of b.hours) { expect(h.fallback_used).toBe(true); expect(h.score_turbidity).toBeNull(); expect(h.score_drought).toBeNull(); }
    stale = false;
  });
  it("past points never call live; at most one live call per request", async () => {
    stale = false; seededOnly = false; liveCalls = 0;
    const r = await handleRequest(new Request(`http://x/f?as_of=${NOW.toISOString()}&history_hours=12`), fetchData, () => NOW, fetchLive);
    const b = await r.json();
    expect(liveCalls).toBe(1);
    expect(b.hours.every((h: { forecast_source: string }) => h.forecast_source === "missing")).toBe(true);
    seededOnly = true;
  });
  for (const bad of ["0", "73", "abc", "1.5", "-2", ""]) {
    it(`history_hours=${JSON.stringify(bad)} -> 400`, async () => {
      const r = await call(`as_of=${AS}&history_hours=${bad}`);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/history_hours/);
    });
  }
  it("no history param -> unchanged single shape and default windows", async () => {
    lastOpts = { readingsFrom: new Date(0) };
    const b = await (await call(`as_of=${AS}`)).json();
    expect(lastOpts).toBeUndefined();
    expect(b.hours).toBeUndefined();
    expect(b.computed_at).toBeDefined();
    expect(b.scope).toBe("system");
  });
});
