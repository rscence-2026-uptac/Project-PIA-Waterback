import { describe, expect, it } from "vitest";
import { buildDroughtFeatures, buildTurbidityFeatures, daysSinceRain, forecastRain48h, liveForecastAllowed, manilaDay } from "../../functions/_shared/predict.ts";
import { HOUR, forecastSeries, iso, kuladorSeries, rainSeries } from "./helpers.ts";

const ASOF = Date.parse("2026-07-10T12:00:00+08:00");
const asOf = new Date(ASOF);

describe("forecastRain48h", () => {
  it("sums (asOf, asOf+48h] on a full 48 h series", () => {
    expect(forecastRain48h(forecastSeries(ASOF, 0.25), asOf)).toBeCloseTo(12, 9);
  });
  it("excludes rows at/before asOf and after asOf+48h", () => {
    const rows = [...forecastSeries(ASOF, 1), { ts: iso(ASOF), precipitation_mm: 100 }, { ts: iso(ASOF + 49 * HOUR), precipitation_mm: 100 }];
    expect(forecastRain48h(rows, asOf)).toBe(48);
  });
  it("requires complete coverage (47 of 48 -> null; empty -> null)", () => {
    expect(forecastRain48h(forecastSeries(ASOF, 1, 47), asOf)).toBeNull();
    expect(forecastRain48h(forecastSeries(ASOF, 1).filter((r) => r.ts !== iso(ASOF + 10 * HOUR)), asOf)).toBeNull();
    expect(forecastRain48h([], asOf)).toBeNull();
  });
  it("non-hour-aligned as_of still needs the 48 hour stamps after it", () => {
    const off = new Date(ASOF + 30 * 60_000);
    expect(forecastRain48h(forecastSeries(ASOF, 1), off)).toBe(48); // stamps ASOF+1h .. ASOF+48h
  });
});

describe("liveForecastAllowed", () => {
  const now = new Date(ASOF);
  it("as_of within the last 3 h of now only", () => {
    expect(liveForecastAllowed(now, now)).toBe(true);
    expect(liveForecastAllowed(new Date(ASOF - 3 * HOUR), now)).toBe(true);
    expect(liveForecastAllowed(new Date(ASOF - 3 * HOUR - 1000), now)).toBe(false);
    expect(liveForecastAllowed(new Date(ASOF + HOUR), now)).toBe(false);
  });
});

describe("buildTurbidityFeatures (v3: no slope)", () => {
  const rain = rainSeries(ASOF, 100, (h) => (h < 24 ? 1 : h < 72 ? 0.5 : 0));
  it("latest turbidity, rain windows, forecast; exactly the v3 feature set", () => {
    const r = kuladorSeries(ASOF, 40, (h) => ({ turbidity_ntu: 4 + (5 - Math.min(h, 5)) * 10 + (h > 5 ? -100 : 0) }));
    const f = buildTurbidityFeatures(r, rain, 12.5, asOf)!;
    expect(f.turbidity_ntu).toBe(54);
    expect(f.rain_24h_mm).toBeCloseTo(24, 9); // 24 rows with ts in (asOf-24h, asOf]
    expect(f.rain_72h_mm).toBeCloseTo(24 + 48 * 0.5, 9);
    expect(f.forecast_rain_48h_mm).toBe(12.5);
    expect(Object.keys(f)).toEqual(["turbidity_ntu", "rain_24h_mm", "rain_72h_mm", "forecast_rain_48h_mm"]);
  });
  it("a single reading is enough (no 6-reading window)", () => {
    const f = buildTurbidityFeatures(kuladorSeries(ASOF, 1, () => ({ turbidity_ntu: 77 })), rain, 3, asOf)!;
    expect(f.turbidity_ntu).toBe(77);
  });
  it("a gap inside the last 6 h does not matter, only the newest reading does", () => {
    const r = kuladorSeries(ASOF, 10).filter((x) => x.recorded_at !== iso(ASOF - 2 * HOUR));
    expect(buildTurbidityFeatures(r, rain, 0, asOf)).not.toBeNull();
  });
  it("clarifier inflow is no longer a model input (missing inflow still builds features)", () => {
    const r = kuladorSeries(ASOF, 10, () => ({ clarifier_inflow_lps: null }));
    expect(buildTurbidityFeatures(r, rain, 0, asOf)).not.toBeNull();
  });
  it("ignores other intakes and future readings", () => {
    const r = [...kuladorSeries(ASOF, 10), ...kuladorSeries(ASOF + 5 * HOUR, 5, () => ({ turbidity_ntu: 999 })).filter((x) => Date.parse(x.recorded_at) > ASOF),
      ...kuladorSeries(ASOF, 10, () => ({ intake_id: "caramayon_1", turbidity_ntu: 700 }))];
    expect(buildTurbidityFeatures(r, rain, 0, asOf)!.turbidity_ntu).toBe(4);
  });
  it("null when no Kulador reading, or the newest is older than 6 h", () => {
    expect(buildTurbidityFeatures([], rain, 0, asOf)).toBeNull();
    expect(buildTurbidityFeatures(kuladorSeries(ASOF - 7 * HOUR, 10), rain, 0, asOf)).toBeNull();
    expect(buildTurbidityFeatures(kuladorSeries(ASOF - 6 * HOUR, 10), rain, 0, asOf)).not.toBeNull();
    expect(buildTurbidityFeatures(kuladorSeries(ASOF, 10, () => ({ intake_id: "caramayon_1" })), rain, 0, asOf)).toBeNull();
  });
  it("null when forecast missing", () => {
    expect(buildTurbidityFeatures(kuladorSeries(ASOF, 10), rain, null, asOf)).toBeNull();
  });
  it("null when rainfall missing or stale", () => {
    const r = kuladorSeries(ASOF, 10);
    expect(buildTurbidityFeatures(r, [], 0, asOf)).toBeNull();
    expect(buildTurbidityFeatures(r, rainSeries(ASOF - 10 * HOUR, 100, () => 1), 0, asOf)).toBeNull();
  });
});

describe("manilaDay", () => {
  it("boundary at 00:00+08 = 16:00Z", () => {
    expect(manilaDay(Date.parse("2026-07-10T15:59:59Z"))).toBe(manilaDay(Date.parse("2026-07-10T00:00:00+08:00")));
    expect(manilaDay(Date.parse("2026-07-10T16:00:00Z"))).toBe(manilaDay(Date.parse("2026-07-10T00:00:00+08:00")) + 1);
  });
});

describe("daysSinceRain", () => {
  const T0 = Date.parse("2026-07-10T12:00:00+08:00");
  const withWet = (days: number, wetAt: string | null, mm = 6) =>
    rainSeries(T0, days * 24, () => 0).map((x) => (wetAt && x.ts === iso(Date.parse(wetAt)) ? { ...x, precipitation_mm: mm } : x));
  it("3 days after a wet day; 0 if today wet; 1 for yesterday 23:00", () => {
    expect(daysSinceRain(withWet(40, "2026-07-07T23:00:00+08:00"), T0)).toBe(3);
    expect(daysSinceRain(withWet(40, "2026-07-10T00:00:00+08:00"), T0)).toBe(0);
    expect(daysSinceRain(withWet(40, "2026-07-09T23:00:00+08:00"), T0)).toBe(1);
  });
  it("not capped at 30: wet day 45 days back -> 45", () => {
    expect(daysSinceRain(withWet(90, "2026-05-26T10:00:00+08:00"), T0)).toBe(45);
  });
  it("exactly 5 mm counts, 4.9 does not", () => {
    expect(daysSinceRain(withWet(40, "2026-07-08T10:00:00+08:00", 5), T0)).toBe(2);
    expect(daysSinceRain(withWet(40, "2026-07-08T10:00:00+08:00", 4.9), T0)).toBeGreaterThan(30);
  });
  it("no wet day in history -> number of days of history (lower bound)", () => {
    // series starts 2026-06-10 12:00 (partial first day) -> full days 06-11..07-10 = 30
    const r = rainSeries(T0, 30 * 24 + 1, () => 0);
    expect(daysSinceRain(r, T0)).toBe(30);
    // 90 days of dry history from an aligned midnight start: 2026-04-12 00:00 .. 07-10 12:00 -> 90 calendar days incl. today
    const aligned = rainSeries(T0, 89 * 24 + 13, () => 0);
    expect(manilaDay(Date.parse(aligned[0].ts))).toBe(manilaDay(T0) - 89);
    expect(daysSinceRain(aligned, T0)).toBe(90);
    expect(daysSinceRain([], T0)).toBe(0);
  });
  it("sub-5mm days (4.8 mm/day) never count", () => {
    expect(daysSinceRain(rainSeries(T0, 40 * 24, () => 0.2), T0)).toBeGreaterThanOrEqual(39);
  });
  it("ignores rain after as_of", () => {
    const r = [...withWet(40, null), { ts: iso(T0 + HOUR), precipitation_mm: 50 }];
    expect(daysSinceRain(r, T0)).toBeGreaterThan(30);
  });
});

describe("buildDroughtFeatures (v2)", () => {
  const N = 10 * 24;
  const readings = kuladorSeries(ASOF, N, (h) => ({ reservoir_pct: 80 - ((N - 1 - h) * 2) / 24 }));
  const rain = rainSeries(ASOF, 90 * 24, () => 0);
  it("has exactly the v2 feature set; reservoir = latest reading; no trend", () => {
    const f = buildDroughtFeatures(readings, rain, asOf)!;
    expect(Object.keys(f)).toEqual(["reservoir_pct", "rain_14d_mm", "rain_30d_mm", "days_since_rain_over_5mm"]);
    expect(f.reservoir_pct).toBeCloseTo(80 - ((N - 1) * 2) / 24, 9);
  });
  it("works with a single reading (no multi-day reservoir history needed)", () => {
    expect(buildDroughtFeatures(kuladorSeries(ASOF, 3), rain, asOf)).not.toBeNull();
  });
  it("rain windows over 14 d / 30 d and days_since", () => {
    const r = rainSeries(ASOF, 90 * 24, () => 0).map((x) => (x.ts === iso(Date.parse("2026-07-07T23:00:00+08:00")) ? { ...x, precipitation_mm: 6 } : x));
    const f = buildDroughtFeatures(readings, r, asOf)!;
    expect(f.days_since_rain_over_5mm).toBe(3);
    expect(f.rain_14d_mm).toBe(6);
    expect(f.rain_30d_mm).toBe(6);
  });
  it("null when reservoir missing/stale or rain missing", () => {
    expect(buildDroughtFeatures(kuladorSeries(ASOF, N, () => ({ reservoir_pct: null })), rain, asOf)).toBeNull();
    expect(buildDroughtFeatures(kuladorSeries(ASOF - 30 * HOUR, N), rain, asOf)).toBeNull();
    expect(buildDroughtFeatures(readings, [], asOf)).toBeNull();
  });
});
