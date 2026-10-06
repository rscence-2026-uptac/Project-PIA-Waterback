// Pure helpers for `demo.mjs replay` (no network, no process state) so they can be unit-tested offline.
const H = 3_600_000;
const pad = (n) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SCENARIOS = {
  "late-july": { from: "2026-07-19T00:00:00+08:00", to: "2026-07-22T06:00:00+08:00", every: "3h" },
  crisis: { from: "2026-06-30T00:00:00+08:00", to: "2026-07-08T00:00:00+08:00", every: "6h" },
};

export function parseEvery(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/.exec(String(s).trim());
  if (!m || Number(m[1]) <= 0) throw new Error(`bad --every "${s}" (use e.g. 90m, 3h, 1d)`);
  return Number(m[1]) * { m: 60_000, h: H, d: 24 * H }[m[2]];
}
export function ticks(from, to, everyMs) {
  const a = Date.parse(from), b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error("bad --from/--to (ISO 8601 with offset, e.g. 2026-07-19T00:00:00+08:00)");
  if (b < a) throw new Error("--to is before --from");
  const out = [];
  for (let t = a; t <= b; t += everyMs) out.push(new Date(t));
  return out;
}
export function manilaIso(d) {
  const m = new Date(d.getTime() + 8 * H);
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}:00+08:00`;
}
/** "Sun 19 Jul 19:00" in Asia/Manila (UTC+8, no DST). */
export function clock(d) {
  const m = new Date(new Date(d).getTime() + 8 * H);
  return `${DOW[m.getUTCDay()]} ${pad(m.getUTCDate())} ${MON[m.getUTCMonth()]} ${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}`;
}

const C = { 0: "32", 1: "33", 2: "33;1", 3: "31", 4: "31;1" };
export const paint = (s, code, color) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
export function signalBar(level, color = false) {
  const l = Math.max(0, Math.min(4, Math.round(Number(level) || 0)));
  return paint(`${"▮".repeat(l)}${"▯".repeat(4 - l)} ${l}`, C[l], color);
}
/** Accepted resident mapping (packages/shared-types resident-state.ts) for a served barangay: 0 flowing, 1-2 heads-up, 3-4 interrupted. */
export function residentLabel(level) {
  const l = Number(level) || 0;
  return l <= 0 ? "Flowing" : l <= 2 ? "Heads-up" : "Interrupted";
}

// ---- rain ----
const ms = (ts) => Date.parse(ts);
/** rows: [{ts, precipitation_mm}]. Last 24 h = (asOf-24h, asOf]; forecast 48 h = (asOf, asOf+48h]. */
export function sumRain(rows, asOf, dir) {
  const t = asOf.getTime();
  const [lo, hi] = dir === "back" ? [t - 24 * H, t] : [t, t + 48 * H];
  let s = 0, n = 0;
  for (const r of rows ?? []) { const x = ms(r.ts); if (x > lo && x <= hi) { s += Number(r.precipitation_mm) || 0; n++; } }
  return n ? Math.round(s * 10) / 10 : null;
}
function pick(drivers, names) {
  if (!drivers) return null;
  if (Array.isArray(drivers)) {
    for (const d of drivers) {
      const key = d?.feature ?? d?.name ?? d?.key;
      if (names.includes(key)) { const v = Number(d.value ?? d.raw ?? d.x); if (Number.isFinite(v)) return v; }
    }
    return null;
  }
  if (typeof drivers === "object") {
    for (const n of names) {
      const v = drivers[n];
      if (typeof v === "number") return v;
      if (v && typeof v === "object" && Number.isFinite(Number(v.value))) return Number(v.value);
    }
  }
  return null;
}
const text = (x) => (typeof x === "string" ? x : x && typeof x === "object" ? x.text ?? x.message ?? x.label ?? x.description ?? x.action ?? null : null);
export function topDriverText(drivers) {
  if (!drivers) return null;
  if (Array.isArray(drivers)) {
    const d = drivers[0];
    if (!d) return null;
    return text(d) ?? (d.feature ? `${d.feature}${d.value != null ? ` = ${d.value}` : ""}` : null);
  }
  if (typeof drivers === "object") return text(drivers.top) ?? text(drivers.summary) ?? text(Array.isArray(drivers.items) ? drivers.items[0] : null) ?? text(Array.isArray(drivers.top_drivers) ? drivers.top_drivers[0] : null);
  return typeof drivers === "string" ? drivers : null;
}
export function actionTexts(actions) {
  if (!actions) return [];
  const arr = Array.isArray(actions) ? actions : [actions];
  return arr.map((a) => text(a) ?? JSON.stringify(a));
}

/** One tick record from the predictor output (+ REST rain rows as fallback for rain figures). */
export function buildTick(asOf, pred, rainRows, fcRows) {
  const d = pred?.drivers;
  const rain24 = pick(d, ["rain_24h_mm", "rain_24h"]) ?? sumRain(rainRows, asOf, "back");
  const fc48 = pick(d, ["forecast_rain_48h_mm", "forecast_rain_48h"]) ?? sumRain(fcRows, asOf, "fwd");
  return {
    asOf, rain24, fc48,
    p: pred?.p_turbidity ?? null, signal: pred?.signal_level ?? 0,
    cause: pred?.turbidity_level >= (pred?.drought_level ?? 0) ? "turbidity" : "drought",
    fallback: !!pred?.fallback_used, top: topDriverText(d), actions: actionTexts(pred?.operator_actions),
  };
}
const mm = (v) => (v == null ? "  n/a" : `${v.toFixed(1)}mm`.padStart(7));
export function formatTick(t, { color = false } = {}) {
  const label = residentLabel(t.signal);
  const lc = t.signal >= 3 ? "31;1" : t.signal >= 1 ? "33;1" : "32";
  const base = `${clock(t.asOf)} | rain 24h ${mm(t.rain24)}  fcst 48h ${mm(t.fc48)} | p_turb ${t.p == null ? "n/a " : Number(t.p).toFixed(2)} | ${signalBar(t.signal, color)} | ${paint(label.padEnd(11), lc, color)}`;
  return base + (t.fallback ? " (WSP fallback)" : "") + (t.top ? `\n      why: ${t.top}` : "");
}

// ---- plant events (from readings: barangay_id in kulador / caramayon_1 / caramayon_2) ----
export const EVENT_LABEL = {
  kulador: "Kulador ≥ 250 NTU",
  shutoff: "Caramayon I shut-off",
  outage: "Caramayon power outage",
};
/** Earliest reading time at which each event condition is true (null if never). Outage = Caramayon I shutdown below 500 NTU with Caramayon II also shutdown. Rows use intake_id. */
const iid = (r) => r.intake_id ?? r.barangay_id;
export function firstEvents(readings) {
  const by = new Map();
  for (const r of readings ?? []) {
    const k = `${iid(r)}@${r.recorded_at}`; by.set(k, r);
  }
  const rows = [...by.values()].sort((a, b) => ms(a.recorded_at) - ms(b.recorded_at));
  const at = (bid, t) => by.get(`${bid}@${t}`);
  const ev = { kulador: null, shutoff: null, outage: null };
  for (const r of rows) {
    if (iid(r) === "kulador" && !ev.kulador && Number(r.turbidity_ntu) >= 250) ev.kulador = r.recorded_at;
    if (iid(r) === "caramayon_1" && r.plant_status === "shutdown") {
      const nt = Number(r.turbidity_ntu);
      if (nt >= 500) { if (!ev.shutoff) ev.shutoff = r.recorded_at; }
      else if (!ev.outage && at("caramayon_2", r.recorded_at)?.plant_status === "shutdown") ev.outage = r.recorded_at;
    }
  }
  return ev;
}
/** Events whose start time lies in (prev, asOf]. */
export function eventsInWindow(first, prev, asOf) {
  const out = [];
  for (const [k, t] of Object.entries(first)) if (t && ms(t) > prev.getTime() && ms(t) <= asOf.getTime()) out.push({ key: k, at: t, label: EVENT_LABEL[k] });
  return out.sort((a, b) => ms(a.at) - ms(b.at));
}
export const formatEvent = (e, { color = false } = {}) => paint(`  ● EVENT: ${e.label}  (since ${clock(new Date(e.at))})`, "35;1", color);

// ---- heads-up block ----
export function formatHeadsUp({ monitor, areas, color = false }) {
  const L = [];
  const bar = "═".repeat(66);
  L.push(paint(bar, "33;1", color));
  L.push(paint(`  ⚠ HEADS-UP SENT   (${monitor?.action ?? "?"}, signal ${monitor?.disruption?.signal_level ?? "?"}, cause ${monitor?.disruption?.cause ?? "?"})`, "33;1", color));
  const h = monitor?.heads_up;
  if (h) {
    const names = Array.isArray(h.barangays) ? h.barangays : [];
    L.push(`  heads_up: mode=${h.mode ?? "?"}  barangays=${names.length}${names.length ? ` (${names.slice(0, 6).join(", ")}${names.length > 6 ? ", …" : ""})` : ""}  sms_planned=${h.sms_planned ?? "?"}  sms_skipped_demo=${h.sms_skipped_demo ?? "?"}`);
  } else L.push("  heads_up: (not reported by this monitor version)");
  const acts = actionTexts(monitor?.prediction?.operator_actions);
  if (acts.length) { L.push("  operator actions:"); acts.forEach((a) => L.push(`    - ${a}`)); }
  const top = (areas ?? []).slice(0, 3);
  if (top.length) {
    L.push("  first barangays to act on:");
    top.forEach((a, i) => {
      const t = a.top_source;
      L.push(`    ${i + 1}. ${a.barangay_id}  L${a.signal_level}${a.service_level ? " " + a.service_level : ""}${a.vulnerable_flag ? " vulnerable" : ""}  -> ${t ? `${t.name} [${t.type}]${t.is_simulated ? " (simulated)" : ""}` : "no top source"}`);
    });
  }
  L.push(paint(bar, "33;1", color));
  return L.join("\n");
}

// ---- summary ----
const hrs = (a, b) => Math.round(((ms(b) - ms(a)) / H) * 10) / 10;
/**
 * history: tick records; headsUpAt: ISO|Date|null (monitor-created time, else first signal>=2 tick); firstEvent: {key, at}|null.
 * Returns printable text.
 */
export function formatSummary({ history, headsUpAt, firstEvent, dry, sms }) {
  const L = ["", "SUMMARY", "-------"];
  const hu = headsUpAt ? new Date(headsUpAt) : null;
  L.push(`${dry ? "First alarm (signal ≥ 2, predictor only)" : "Heads-up sent"}:  ${hu ? clock(hu) : "never in this window"}`);
  L.push(`First plant event:  ${firstEvent ? `${clock(new Date(firstEvent.at))}  (${firstEvent.label})` : "none in this window"}`);
  if (hu && firstEvent) {
    const lead = hrs(hu.toISOString(), firstEvent.at);
    L.push(`Lead time:          ${lead >= 0 ? `${lead} h of warning before the first event` : `${-lead} h AFTER the first event (no lead in this window)`}`);
  }
  if (hu && history.length) {
    const i = history.findIndex((t) => t.asOf.getTime() === hu.getTime());
    if (i > 0 && history[i - 1].fallback && !history[i].fallback) L.push("Note:               the ticks before this one used the WSP fallback (no seeded readings yet), so this lead is censored at the series start, not a measured lead.");
  }
  if (sms) L.push(`SMS (dry-run) planned during replay: ${sms.planned}${sms.skipped ? `, skipped (demo): ${sms.skipped}` : ""}`);
  const at = firstEvent ? new Date(firstEvent.at).getTime() : history.length ? history[history.length - 1].asOf.getTime() : 0;
  const last = [...history].reverse().find((t) => t.asOf.getTime() <= at) ?? history[0];
  if (last) {
    L.push(`What each user had been told by ${clock(new Date(at))}:`);
    L.push(`  Residents on the network (26 barangays): ${residentLabel(last.signal)}${last.signal >= 1 ? ` (signal ${last.signal}${last.signal <= 2 ? ": store water tonight" : ": supply interrupted"})` : ""}`);
    L.push(`  Residents off the network (31 barangays): ${last.signal >= 2 ? "heads-up: backup sources will get busier" : "nothing"}`);
    L.push(`  LGU operators: ${last.signal >= 2 ? `alarm on, signal ${last.signal}${last.actions.length ? `, ${last.actions.length} suggested action(s)` : ""}` : "no alarm"}${last.top ? `; top driver: ${last.top}` : ""}`);
  }
  return L.join("\n");
}
