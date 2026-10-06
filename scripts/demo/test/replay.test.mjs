import test from "node:test";
import assert from "node:assert/strict";
import { parseEvery, ticks, clock, signalBar, residentLabel, sumRain, buildTick, formatTick, firstEvents, eventsInWindow, formatHeadsUp, formatSummary, SCENARIOS } from "../replay_lib.mjs";

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));
import { readFileSync } from "node:fs";

test("parseEvery / ticks", () => {
  assert.equal(parseEvery("3h"), 3 * 3600_000);
  assert.equal(parseEvery("90m"), 5400_000);
  assert.throws(() => parseEvery("x"));
  const t = ticks(SCENARIOS["late-july"].from, SCENARIOS["late-july"].to, parseEvery("3h"));
  assert.equal(t.length, 3 * 8 + 3); // 78 h / 3 h + 1 = 27
  assert.equal(ticks(SCENARIOS.crisis.from, SCENARIOS.crisis.to, parseEvery("6h")).length, 33);
});
test("clock is Asia/Manila", () => {
  assert.equal(clock(new Date("2026-07-19T11:00:00Z")), "Sun 19 Jul 19:00");
});
test("signal bar + resident label", () => {
  assert.equal(signalBar(3), "▮▮▮▯ 3");
  assert.equal(signalBar(0), "▯▯▯▯ 0");
  assert.deepEqual([0, 1, 2, 3, 4].map(residentLabel), ["Flowing", "Heads-up", "Heads-up", "Interrupted", "Interrupted"]);
});
test("tick line, REST rain fallback (no drivers)", () => {
  const f = fx("predictor_no_drivers");
  const asOf = new Date(f.asOf);
  assert.equal(sumRain(f.rain, asOf, "back"), 7.5);
  const t = buildTick(asOf, f.pred, f.rain, f.forecast);
  const line = formatTick(t);
  assert.match(line, /Sun 19 Jul 19:00/);
  assert.match(line, /rain 24h\s+7\.5mm/);
  assert.match(line, /fcst 48h\s+30\.0mm/);
  assert.match(line, /p_turb 0\.45/);
  assert.match(line, /▮▮▯▯ 2/);
  assert.match(line, /Heads-up/);
  assert.doesNotMatch(line, /why:/);
});
test("tick line, drivers present (array and object forms)", () => {
  const f = fx("predictor_with_drivers");
  const t = buildTick(new Date(f.asOf), f.pred, [], []);
  assert.equal(t.rain24, 14.2);
  assert.equal(t.fc48, 41.5);
  const line = formatTick(t);
  assert.match(line, /Interrupted/);
  assert.match(line, /why: 41\.5 mm of rain forecast/);
  const t2 = buildTick(new Date(f.asOf), { ...f.pred, drivers: { rain_24h_mm: 3, forecast_rain_48h_mm: 9, top: "forecast rain" } }, [], []);
  assert.equal(t2.rain24, 3); assert.equal(t2.top, "forecast rain");
});
test("plant events from readings", () => {
  const f = fx("readings");
  const first = firstEvents(f);
  assert.equal(first.kulador, "2026-07-21T14:00:00+00:00");
  assert.equal(first.shutoff, "2026-07-22T02:00:00+00:00");
  assert.equal(first.outage, "2026-07-21T20:00:00+00:00");
  const w = eventsInWindow(first, new Date("2026-07-21T12:00:00Z"), new Date("2026-07-21T21:00:00Z"));
  assert.deepEqual(w.map((e) => e.key), ["kulador", "outage"]);
  assert.match(w[0].label, /Kulador ≥ 250 NTU/);
});
test("heads-up block with and without new fields", () => {
  const f = fx("monitor_created");
  const full = formatHeadsUp({ monitor: f.monitor, areas: f.areas });
  assert.match(full, /⚠ HEADS-UP SENT/);
  assert.match(full, /sms_planned=12/);
  assert.match(full, /Store water/);
  assert.match(full, /1\. lagundi/);
  assert.equal((full.match(/^\s+\d\. /gm) || []).length, 3);
  const bare = formatHeadsUp({ monitor: { action: "created", disruption: { signal_level: 2, cause: "turbidity" } }, areas: [] });
  assert.match(bare, /not reported by this monitor version/);
  assert.doesNotMatch(bare, /operator actions/);
});
test("summary lead time", () => {
  const f = fx("predictor_with_drivers");
  const hist = [buildTick(new Date("2026-07-19T19:00:00+08:00"), { ...f.pred, signal_level: 2, p_turbidity: 0.45 }, [], []), buildTick(new Date("2026-07-21T22:00:00+08:00"), f.pred, [], [])];
  const s = formatSummary({ history: hist, headsUpAt: hist[0].asOf, firstEvent: { key: "kulador", at: "2026-07-21T22:00:00+08:00", label: "Kulador ≥ 250 NTU" }, dry: false, sms: { planned: 12, skipped: 0 } });
  assert.match(s, /Heads-up sent:\s+Sun 19 Jul 19:00/);
  assert.match(s, /Lead time:\s+51 h/);
  assert.match(s, /Interrupted/);
  const none = formatSummary({ history: hist, headsUpAt: null, firstEvent: null, dry: true });
  assert.match(none, /never in this window/);
});
