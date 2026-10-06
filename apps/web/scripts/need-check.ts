// SPEC: 10 — quick sanity check for lib/need.ts on synthetic data. Not a test framework.
// Run: node --experimental-strip-types apps/web/scripts/need-check.ts  (from the repo root, Node 24)
import assert from "node:assert/strict";
import { LITRES_PER_PERSON_DAY, TRUCK_WALK_RADIUS_M, type Cluster } from "../src/contracts/spec10.ts";
import { metresBetween, roundTripMinutes } from "../src/lib/geo.ts";
import { accessGapSites, earlyWarningTiers, pickDropPoints, scoreClusters } from "../src/lib/need.ts";

const cl = (id: string, b: string, lat: number, lng: number, people: number): Cluster =>
  ({ cluster_id: id, barangay_id: b, label: id, lat, lng, people, people_source: "psa2020_x_worldpop2020" });
const LAT = 11.77, LNG = 124.88;
const clusters = [
  cl("b1-c1", "b1", LAT, LNG, 1000),          // at the safe source, biggest in b1 (gets the facility)
  cl("b1-c2", "b1", LAT + 0.003, LNG, 500),   // ~330 m from A
  cl("b2-c1", "b2", LAT + 0.05, LNG, 800),    // ~5.5 km away: no safe access
  cl("b3-c1", "b3", LAT + 0.07, LNG, 300),    // ~2.2 km from C, level I
  cl("b4-c1", "b4", LAT + 0.001, LNG, 100),   // next to A, no vulnerable
];
const barangays = ["b1", "b2", "b3", "b4"].map((id) => ({
  barangay_id: id, name: id, served: true, service_level: (id === "b3" ? "level_i" : "level_iii") as "level_iii" | "level_i",
  psa_2020: null, grid_people: 0, cells: 0, clusters: 1,
}));
const sources = [
  { name: "safe", active: true, safety_score: 0.9, lat: LAT, lng: LNG },
  { name: "safe", active: true, safety_score: 0.9, lat: LAT, lng: LNG }, // duplicate row, as in the seed
  { name: "unsafe", active: true, safety_score: 0.5, lat: LAT + 0.05, lng: LNG },
  { name: "no coords", active: true, safety_score: 0.9, lat: null, lng: null },
];
const now = new Date("2026-10-07T12:00:00Z");
const startedAt = new Date("2026-10-07T00:00:00Z"); // 12 h -> time factor 1.5
const rows = scoreClusters({
  clusters, barangays, sources, startedAt, now,
  vulnerableByBarangay: { b1: 30 }, facilitiesByBarangay: { b1: ["health_station"] },
});

assert.ok(Math.abs(roundTripMinutes(1000) - 39) < 1e-9);
const by = Object.fromEntries(rows.map((r) => [r.cluster_id, r]));
// formula
assert.equal(Math.round(by["b1-c1"].need_points), 1965); // (1000 + 3*20 + 250) * 1.5
assert.equal(Math.round(by["b1-c2"].need_points), 795);  // (500 + 3*10) * 1.5
assert.equal(Math.round(by["b2-c1"].need_points), 2400); // 800 * 2 * 1.5
assert.equal(Math.round(by["b3-c1"].need_points), 900);  // level I counts as no access
assert.equal(by["b1-c1"].has_critical_facility, true);
assert.equal(by["b1-c2"].has_critical_facility, false);
assert.equal(by["b2-c1"].no_safe_access, true);
assert.equal(by["b1-c2"].no_safe_access, false);
assert.deepEqual(rows.map((r) => r.cluster_id), ["b2-c1", "b1-c1", "b3-c1", "b1-c2", "b4-c1"]);
assert.deepEqual(rows.map((r) => r.suggested_rank), [1, 2, 3, 4, 5]);
assert.deepEqual(by["b1-c1"].reasons, ["1,000 people", "safe water ~0 min round trip", "~20 elderly or PWD (estimate)", "health station", "12 h without water"]);
assert.ok(by["b2-c1"].reasons.includes("no safe water within 30 min"));

// tie order: equal need and people -> cluster_id
const tie = scoreClusters({
  clusters: [cl("t-c2", "t", LAT, LNG, 50), cl("t-c1", "t", LAT, LNG, 50)], barangays: [], sources, startedAt: null,
  now, vulnerableByBarangay: {}, facilitiesByBarangay: {},
});
assert.deepEqual(tie.map((r) => r.cluster_id), ["t-c1", "t-c2"]);
assert.equal(tie[0].hours_dry, 0);

// drop points: each stop gets one trip's share (capacity ÷ count); never more, total never over capacity
assert.ok(metresBetween(clusters[0], clusters[1]) < TRUCK_WALK_RADIUS_M);
const plan = pickDropPoints(rows, clusters, 3, 30000);
assert.equal(plan.per_trip_litres, 10000);
assert.ok(plan.stops.length >= 1 && plan.stops.length <= 3);
assert.equal(plan.stops[0].order, 1);
for (const st of plan.stops) {
  assert.ok(st.litres <= plan.per_trip_litres);
  assert.equal(st.people_served, Math.floor(st.litres / LITRES_PER_PERSON_DAY));
  assert.equal(st.capped === true, st.people * LITRES_PER_PERSON_DAY > plan.per_trip_litres);
}
assert.ok(plan.total_litres <= 30000);
assert.equal(plan.total_people, plan.stops.reduce((n, st) => n + st.people_served, 0));
assert.ok(plan.unmet_people <= plan.no_access_people);
// the first pick (most need) is the 1,600-person group around b1-c1, capped to one trip's load
const big = plan.stops.find((st) => st.covered_cluster_ids.includes("b1-c1"))!;
assert.equal(big.people, 1600);
assert.equal(big.litres, 10000);
assert.equal(big.capped, true);

// tiers
const t = earlyWarningTiers(rows);
assert.deepEqual(t.tier2.map((r) => r.cluster_id), ["b4-c1"]);
assert.equal(t.tier1.length, 4);
assert.deepEqual(t.tier2Barangays, ["b4"]);
assert.ok(t.tier1Barangays.includes("b1") && !t.tier1Barangays.includes("b4"));

// access gap: two no-access clusters, each its own site, biggest first
const gap = accessGapSites(rows, clusters, 3);
assert.equal(gap.total_gap_people, 1100);
assert.deepEqual(gap.sites.map((s) => [s.cluster_id, s.gained_people]), [["b2-c1", 800], ["b3-c1", 300]]);

console.log("need-check: all assertions passed");
