// Pure builder for the `seed-now` demo command: the web app's sample outage (apps/web/src/data/mock.ts OPERATOR /
// OPERATOR_PREDICTION), anchored at the current hour so the live predictor sees it. No I/O, no clock reads.
// Tables written (the only three the predictor reads): readings, rainfall_hourly, rain_forecast_hourly.
// Everything is tagged so unseed-now can remove exactly it: rain/forecast source = DEMO_NOW_SOURCE, readings
// is_simulated = true + client_local_id starting with DEMO_NOW_PREFIX.

export const DEMO_NOW_SOURCE = "demo-now";
export const DEMO_NOW_PREFIX = "demo-now:";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// --- the sample outage, copied from apps/web/src/data/mock.ts (OPERATOR); keep in sync ---
export const SERIES = {
  kulador: [18, 17, 19, 18, 20, 19, 18, 17, 19, 20, 22, 21, 24, 30, 45, 95, 180, 330, 470, 590, 640, 655, 650, 635, 620],
  masacpasac: [4, 4, 5, 4, 4, 5, 4, 4, 5, 5, 6, 6, 7, 8, 10, 12, 14, 15, 16, 16, 15, 15, 14, 14, 14],
  caramayon_1: [12, 11, 12, 13, 12, 12, 11, 12, 13, 14, 15, 16, 20, 28, 60, 140, 260, 410, 520, 560, 575, 570, 560, 550, 540],
  caramayon_2: [6, 6, 7, 6, 6, 7, 6, 6, 7, 8, 9, 10, 12, 15, 20, 26, 32, 36, 40, 42, 41, 40, 39, 38, 38],
};
export const RAIN_SERIES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 12, 10, 8, 4, 1, 0, 0, 0, 0]; // sums to 43
// Steady river before the storm (cycled): Kulador 16-18 NTU as specified; the others use the first hours of their series.
const STEADY = {
  kulador: [17, 16, 18, 17, 16, 17, 18, 17],
  masacpasac: SERIES.masacpasac.slice(0, 8),
  caramayon_1: SERIES.caramayon_1.slice(0, 8),
  caramayon_2: SERIES.caramayon_2.slice(0, 8),
};
const EARLY_RAIN = [[-51, 3], [-50, 6], [-49, 3]]; // 12 mm at ~H-50 h: [hours from H, mm]
const FORECAST_AHEAD = [2, 2, 1.5, 1.5, 1.5, 1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5]; // H+1.. : sums to 14 mm
const PAST_FORECAST_FACTOR = 0.1; // past hours: a forecast that badly under-called the storm (0.5 left the trend flat at the top: the 48 h forecast window alone held 21 mm)
const TARGET = { rain14: 160, rain30: 310 };
export const INTAKES = ["kulador", "masacpasac", "caramayon_1", "caramayon_2"];

export const floorHour = (d) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);
export function parseHold(s) {
  const m = /^(\d+)\s*h?$/i.exec(String(s).trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 48) throw new Error(`bad --hold "${s}" (use e.g. 12h, 1-48 h)`);
  return Number(m[1]);
}
const r1 = (x) => Math.round(x * 10) / 10;

// small deterministic PRNG so the scenario is the same every run for a given anchor
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Showers over hour offsets [lo, hi] (hours before H) with an exact total; returns Map(offset -> mm). */
function showers(total, lo, hi, seed) {
  const rnd = lcg(seed);
  const raw = new Map();
  const events = 9;
  for (let e = 0; e < events; e++) {
    const start = lo + Math.floor(rnd() * (hi - lo - 5));
    const len = 2 + Math.floor(rnd() * 4);
    const peak = 1 + rnd() * 5;
    for (let k = 0; k < len; k++) {
      const shape = 1 - Math.abs(k - (len - 1) / 2) / (len + 1);
      raw.set(start + k, (raw.get(start + k) ?? 0) + peak * shape);
    }
  }
  const sum = [...raw.values()].reduce((a, b) => a + b, 0);
  const out = new Map([...raw].map(([k, v]) => [k, r1((v * total) / sum)]));
  const got = [...out.values()].reduce((a, b) => a + b, 0);
  const big = [...out].sort((a, b) => b[1] - a[1])[0][0];
  out.set(big, r1(out.get(big) + (total - got)));
  return out;
}

/** Hourly rain as Map(ms -> mm) for H-30d < ts <= H + holdHours. */
function rainMap(H, holdHours) {
  const m = new Map();
  const put = (off, mm) => m.set(H + off * HOUR, r1((m.get(H + off * HOUR) ?? 0) + mm));
  for (let off = -719; off <= holdHours; off++) m.set(H + off * HOUR, 0);
  RAIN_SERIES.forEach((mm, i) => put(i - 24, mm)); // H-24h .. H
  for (const [off, mm] of EARLY_RAIN) put(off, mm);
  // 14d window (H-14d, H] needs 160 mm total: 43 + 12 recent, so 105 mm in H-330h .. H-73h
  for (const [off, mm] of showers(TARGET.rain14 - 55, 73, 330, 7)) put(-off, mm);
  // 14d-30d ring: 150 mm in H-716h .. H-340h
  for (const [off, mm] of showers(TARGET.rain30 - TARGET.rain14, 340, 716, 11)) put(-off, mm);
  return m;
}

/**
 * @param {Date} anchor floored to the hour (H = "now")
 * @returns {{ H: Date, readings: object[], rainfall: object[], forecast: object[] }}
 */
export function buildScenario(anchor, { holdHours = 12 } = {}) {
  const H = floorHour(anchor).getTime();
  const iso = (ms) => new Date(ms).toISOString();
  const rain = rainMap(H, holdHours);

  const rainfall = [...rain].sort((a, b) => a[0] - b[0]).map(([ms, mm]) => ({ ts: iso(ms), precipitation_mm: mm, source: DEMO_NOW_SOURCE }));

  // forecast rows for ts in (H-48h, H+hold+48h]
  const forecast = [];
  for (let off = -47; off <= holdHours + 48; off++) {
    const ms = H + off * HOUR;
    const mm = off <= 0 ? (rain.get(ms) ?? 0) * PAST_FORECAST_FACTOR : (FORECAST_AHEAD[off - 1] ?? 0);
    forecast.push({ ts: iso(ms), precipitation_mm: r1(mm), source: DEMO_NOW_SOURCE });
  }

  // readings: hourly for H-48h .. H+hold
  const readings = [];
  const wasShutdown = {};
  for (let off = -48; off <= holdHours; off++) {
    const ms = H + off * HOUR;
    const i = Math.min(off, 0) + 24; // index into the 25-point series (>=0 from H-24h); held at the last point after H
    for (const id of INTAKES) {
      const turb = i >= 0 ? SERIES[id][i] : STEADY[id][(off + 48) % 8];
      const row = {
        recorded_at: iso(ms), intake_id: id, turbidity_ntu: turb, plant_status: "normal",
        reservoir_pct: null, clarifier_inflow_lps: null, source: "sensor", is_simulated: true,
        treated_turbidity_ntu: null, client_local_id: `${DEMO_NOW_PREFIX}${id}:${ms / 1000}`,
      };
      if (id === "caramayon_1") {
        if (turb >= 500) wasShutdown[id] = true;
        if (wasShutdown[id]) row.plant_status = "shutdown"; // shut-off from the first reading at >= 500 NTU, stays shut
      }
      if (id === "kulador") {
        if (turb >= 250) row.plant_status = "degraded";
        const k = Math.max(0, -off); // hours before H; the sample reservoir falls ~4 points an hour to 58 at H
        row.reservoir_pct = Math.min(80, 58 + 4 * k);
        const k0 = Math.min(off, 0) + 24; // clarifier inflow 46.3 L/s until the spike, easing to 31 at H
        row.clarifier_inflow_lps = off >= 0 ? 31 : k0 < 15 ? 46.3 : r1(46.3 - (15.3 * (k0 - 14)) / 10);
        row.treated_turbidity_ntu = turb < 100 ? 0.8 : r1(0.8 + ((turb - 100) / 520) * 3.0); // 620 NTU raw -> 3.8 treated
      }
      readings.push(row);
    }
  }
  return { H: new Date(H), readings, rainfall, forecast };
}

/** The model inputs the predictor will see at `asOf` (a Date), computed straight from the rows; for the dry-run summary. */
export function expectedFeatures({ readings, rainfall, forecast }, asOf) {
  const a = asOf.getTime();
  const sum = (rows, lo, hi) => r1(rows.filter((r) => Date.parse(r.ts) > lo && Date.parse(r.ts) <= hi).reduce((s, r) => s + r.precipitation_mm, 0));
  const kul = readings.filter((r) => r.intake_id === "kulador" && Date.parse(r.recorded_at) <= a).pop();
  const manilaDay = (ms) => Math.floor((ms + 8 * HOUR) / DAY);
  const todayRain = rainfall.filter((r) => manilaDay(Date.parse(r.ts)) === manilaDay(a) && Date.parse(r.ts) <= a).reduce((s, r) => s + r.precipitation_mm, 0);
  return {
    turbidity_ntu: kul.turbidity_ntu, reservoir_pct: kul.reservoir_pct,
    rain_24h_mm: sum(rainfall, a - DAY, a), rain_72h_mm: sum(rainfall, a - 3 * DAY, a),
    forecast_rain_48h_mm: sum(forecast, a, a + 48 * HOUR),
    rain_14d_mm: sum(rainfall, a - 14 * DAY, a), rain_30d_mm: sum(rainfall, a - 30 * DAY, a),
    days_since_rain_over_5mm: todayRain >= 5 ? 0 : "1+ (anchor is early in the Manila day, before 5 mm of the storm has fallen today)",
  };
}
