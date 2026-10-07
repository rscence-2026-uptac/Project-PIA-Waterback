import test from "node:test";
import assert from "node:assert/strict";
import { buildScenario, expectedFeatures, parseHold, floorHour, DEMO_NOW_SOURCE, DEMO_NOW_PREFIX } from "../seed_now_lib.mjs";

const anchor = new Date("2026-10-08T04:37:12Z");
const sc = buildScenario(anchor);

test("anchor floors to the hour; deterministic", () => {
  assert.equal(floorHour(anchor).toISOString(), "2026-10-08T04:00:00.000Z");
  assert.equal(sc.H.toISOString(), "2026-10-08T04:00:00.000Z");
  assert.deepEqual(buildScenario(anchor), sc);
});
test("row counts follow the hold", () => {
  assert.equal(sc.readings.length, 4 * 61);
  assert.equal(buildScenario(anchor, { holdHours: 6 }).readings.length, 4 * 55);
  assert.equal(sc.forecast.length, 47 + 12 + 48 + 1);
});
test("expected features at H", () => {
  const f = expectedFeatures(sc, sc.H);
  assert.equal(f.turbidity_ntu, 620);
  assert.equal(f.reservoir_pct, 58);
  assert.ok(Math.abs(f.rain_24h_mm - 43) < 1e-6 && Math.abs(f.rain_72h_mm - 55) < 1e-6 && Math.abs(f.forecast_rain_48h_mm - 14) < 1e-6);
  assert.ok(Math.abs(f.rain_14d_mm - 160) < 1e-6 && Math.abs(f.rain_30d_mm - 310) < 1e-6);
  assert.equal(f.days_since_rain_over_5mm, 0);
});
test("tags, uniqueness, nulls only on Kulador-specific columns", () => {
  assert.ok(sc.rainfall.every((r) => r.source === DEMO_NOW_SOURCE) && sc.forecast.every((r) => r.source === DEMO_NOW_SOURCE));
  assert.ok(sc.readings.every((r) => r.is_simulated && r.source === "sensor" && r.client_local_id.startsWith(DEMO_NOW_PREFIX)));
  assert.equal(new Set(sc.readings.map((r) => r.client_local_id)).size, sc.readings.length);
  assert.ok(sc.readings.filter((r) => r.intake_id !== "kulador").every((r) => r.reservoir_pct === null));
  assert.ok(sc.rainfall.every((r) => r.precipitation_mm >= 0) && sc.forecast.every((r) => r.precipitation_mm >= 0));
});
test("hold: rain zero and latest values steady after H", () => {
  const after = sc.readings.filter((r) => Date.parse(r.recorded_at) > sc.H.getTime() && r.intake_id === "kulador");
  assert.equal(after.length, 12);
  assert.ok(after.every((r) => r.turbidity_ntu === 620 && r.reservoir_pct === 58));
  assert.ok(sc.rainfall.filter((r) => Date.parse(r.ts) > sc.H.getTime()).every((r) => r.precipitation_mm === 0));
});
test("past forecast under-calls the storm", () => {
  const rain = new Map(sc.rainfall.map((r) => [r.ts, r.precipitation_mm]));
  for (const f of sc.forecast.filter((r) => Date.parse(r.ts) <= sc.H.getTime())) assert.ok(f.precipitation_mm <= (rain.get(f.ts) ?? 0) * 0.5 + 1e-9);
});
test("parseHold", () => {
  assert.equal(parseHold("12h"), 12);
  assert.equal(parseHold("6"), 6);
  assert.throws(() => parseHold("x"));
  assert.throws(() => parseHold("99h"));
});
