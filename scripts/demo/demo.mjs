#!/usr/bin/env node
// PIA Waterback demo driver. Calls ONLY Edge Functions with the anon key (like the app), plus service-role reset.
// Usage: node scripts/demo/demo.mjs <status|reset|run|listen|verify-realtime|sms|reply> [flags]  (see README.md)
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REF = "vxlaitnrhlucsmqkjofp";
const DEFAULT_AS_OF = "2026-07-02T06:00:00+08:00";
const OFFICER = "mock-officer-1";

// ---------- args ----------
const argv = process.argv.slice(2);
const command = argv[0];
const flags = {};
for (let i = 1; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const k = argv[i].slice(2);
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith("--")) { flags[k] = next; i++; } else flags[k] = true;
}

// ---------- output ----------
const out = (s = "") => console.log(s);
const ok = (s) => out(`  ✓ ${s}`);
const bad = (s) => out(`  ✗ ${s}`);
const info = (s) => out(`    ${s}`);
const die = (msg, code = 1) => { console.error(`\n✗ ${msg}`); process.exit(code); };

// ---------- config ----------
function readDotEnv() {
  const p = resolve(ROOT, ".env");
  const env = {};
  if (!existsSync(p)) return env;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}
function projectRef() {
  const t = resolve(ROOT, "supabase/.temp/project-ref");
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  return existsSync(t) ? readFileSync(t, "utf8").trim() : DEFAULT_REF;
}
let _cfg;
function config({ needService = false } = {}) {
  if (!_cfg) {
    const file = readDotEnv();
    const get = (k) => process.env[k] || file[k];
    _cfg = { url: get("SUPABASE_URL"), anon: get("SUPABASE_ANON_KEY"), service: get("SUPABASE_SERVICE_ROLE_KEY") };
    if (flags["from-cli"]) {
      const ref = projectRef();
      let keys;
      try {
        keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", ref, "-o", "json"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      } catch (e) { die(`--from-cli: could not fetch keys with the supabase CLI (logged in? linked?): ${String(e.stderr || e.message).split("\n")[0]}`); }
      const find = (n) => keys.find((k) => k.name === n)?.api_key;
      _cfg = { url: `https://${ref}.supabase.co`, anon: find("anon"), service: find("service_role") };
    }
  }
  const miss = [];
  if (!_cfg.url) miss.push("SUPABASE_URL");
  if (!_cfg.anon) miss.push("SUPABASE_ANON_KEY");
  if (needService && !_cfg.service) miss.push("SUPABASE_SERVICE_ROLE_KEY");
  if (miss.length) die(`Missing config: ${miss.join(", ")}. Set them in the environment or a gitignored .env at the repo root, or pass --from-cli (needs a logged-in supabase CLI).`);
  return _cfg;
}
const anonClient = () => createClient(config().url, config().anon, { auth: { persistSession: false } });
const serviceClient = () => createClient(config({ needService: true }).url, config().service, { auth: { persistSession: false } });

// ---------- time ----------
let serverSkewMs = 0; // max observed (server Date header - local now); keeps client timestamps >= server-side times
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function manila(d) { // ISO with +08:00
  const m = new Date(d.getTime() + 8 * 3600_000);
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}:${pad(m.getUTCSeconds())}.${pad(m.getUTCMilliseconds(), 3)}+08:00`;
}
const nowIso = () => manila(new Date(Date.now() + Math.max(0, serverSkewMs))); // server caps client times at its own now

// ---------- Edge Function calls (anon key, like the app) ----------
async function fn(name, { method = "POST", body, query } = {}) {
  const { url, anon } = config();
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const t0 = performance.now();
  const res = await fetch(`${url}/functions/v1/${name}${qs}`, {
    method,
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = performance.now() - t0;
  const date = res.headers.get("date");
  if (date) serverSkewMs = Math.max(serverSkewMs, new Date(date).getTime() - Date.now());
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const e = new Error(`${name} -> HTTP ${res.status} ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 500)}`);
    e.status = res.status; throw e;
  }
  return { data, ms };
}

// ---------- DB state ----------
async function counts(sb) {
  const c = async (q) => { const { count, error } = await q; if (error) throw new Error(error.message); return count ?? 0; };
  const head = { count: "exact", head: true };
  const [disruptions, event_log, allocations, continuity_chains, readings_nonsim] = await Promise.all([
    c(sb.from("disruptions").select("*", head)),
    c(sb.from("event_log").select("*", head)),
    c(sb.from("allocations").select("*", head)),
    c(sb.from("continuity_chains").select("*", head)),
    c(sb.from("readings").select("*", head).eq("is_simulated", false)),
  ]);
  return { disruptions, event_log, allocations, continuity_chains, readings_nonsim };
}
const isClean = (c) => Object.values(c).every((n) => n === 0);

async function cmdStatus() {
  const sb = config().service ? serviceClient() : anonClient();
  const c = await counts(sb);
  const { data: open, error } = await sb.from("disruptions").select("*").neq("status", "resolved").order("started_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  out("PIA Waterback demo status");
  out("-------------------------");
  if (open?.[0]) {
    const d = open[0];
    out(`Open disruption: ${d.id}`);
    info(`status=${d.status} cause=${d.cause} signal=${d.signal_level} started=${d.started_at}`);
  } else out("Open disruption: none");
  out(`disruptions            ${c.disruptions}`);
  out(`event_log              ${c.event_log}`);
  out(`allocations            ${c.allocations}`);
  out(`continuity_chains      ${c.continuity_chains}`);
  out(`readings (non-sim)     ${c.readings_nonsim}`);
  out(isClean(c) ? "\n✓ CLEAN BASELINE (ready for the stage run)" : "\n✗ NOT a clean baseline (run `reset --yes` to clear demo rows)");
  return c;
}

async function doReset(sb = serviceClient()) {
  const del = async (table, apply) => {
    const { count, error } = await apply(sb.from(table).delete({ count: "exact" }));
    if (error) throw new Error(`reset ${table}: ${error.message}`);
    out(`  deleted ${String(count ?? 0).padStart(5)} from ${table}`);
  };
  // FK order: children first
  await del("event_log", (q) => q.not("id", "is", null));
  await del("allocations", (q) => q.not("id", "is", null));
  await del("continuity_chains", (q) => q.not("id", "is", null));
  await del("disruptions", (q) => q.not("id", "is", null));
  await del("readings", (q) => q.eq("is_simulated", false));
  await del("sms_outbox", (q) => q.not("id", "is", null)); // simulated-handset log; residents are never touched
  out("  seed tables, sources, simulated readings untouched");
}
async function cmdReset() {
  if (!flags.yes) die("reset deletes ALL event_log, allocations, continuity_chains, disruptions rows and non-simulated readings. Re-run with --yes.");
  config({ needService: true });
  out("Reset");
  await doReset();
  const c = await counts(serviceClient());
  out(isClean(c) ? "✓ clean baseline" : `✗ still not clean: ${JSON.stringify(c)}`);
  if (!isClean(c)) process.exit(1);
}

// ---------- run scenario ----------
async function pause(label) {
  if (!flags.step) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question(`\n  [Enter] to continue: ${label} `, () => { rl.close(); r(); }));
}
const fmtMs = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

async function runScenario({ log = true } = {}) {
  const asOf = typeof flags["as-of"] === "string" ? flags["as-of"] : DEFAULT_AS_OF;
  const topN = Number(flags.top ?? 3);
  const withReopen = !!flags["with-reopen"];
  const timings = [];
  const S = {};
  const t0 = performance.now();
  let n = 0;
  const step = async (title, f) => {
    n++;
    await pause(`step ${n}: ${title}`);
    out(`\n[${n}/11] ${title}`);
    const s = performance.now();
    try { await f(); }
    catch (e) { bad(e.message); timings.push({ n, title, ms: performance.now() - s, ok: false }); const err = new Error(`step ${n} (${title}) failed`); err.timings = timings; throw err; }
    timings.push({ n, title, ms: performance.now() - s, ok: true });
  };

  await step("Predict (disruption-predictor)", async () => {
    const { data, ms } = await fn("disruption-predictor", { method: "GET", query: { as_of: asOf } });
    S.pred = data;
    ok(`as_of ${asOf}  (${fmtMs(ms)})`);
    info(`p_turbidity=${data.p_turbidity}  p_drought=${data.p_drought}`);
    info(`levels: turbidity=${data.turbidity_level} drought=${data.drought_level}  signal=${data.signal_level}`);
    info(`forecast_source=${data.forecast_source}  fallback_used=${data.fallback_used}`);
  });

  await step("Create disruption (disruption-monitor)", async () => {
    const { data, ms } = await fn("disruption-monitor", { body: { as_of: asOf } });
    if (data.action !== "created") throw new Error(`expected action "created", got "${data.action}" (is another disruption open? run reset --yes first, or signal < 2)`);
    S.disruption = data.disruption;
    ok(`created ${data.disruption.id}  (${fmtMs(ms)})`);
    info(`cause=${data.disruption.cause} signal=${data.disruption.signal_level} status=${data.disruption.status}`);
  });
  const did = () => S.disruption.id;

  await step("Confirm disruption (operator)", async () => {
    const { data, ms } = await fn("disruption-monitor", { body: { action: "confirm", disruption_id: did(), actor: "demo-operator" } });
    if (data.action !== "confirmed") throw new Error(`expected "confirmed", got "${data.action}"`);
    ok(`status=${data.disruption.status}  (${fmtMs(ms)})`);
  });

  await step("Rank backup sources (rank-chain, all barangays)", async () => {
    const { data, ms } = await fn("rank-chain", { body: { disruption_id: did() } });
    S.chains = new Map(data.chains.map((c) => [c.barangay_id, c]));
    const empty = data.chains.filter((c) => !c.ranked_sources.length).length;
    ok(`${data.chains.length} chains ranked, ${empty} with no eligible source  (${fmtMs(ms)})`);
  });

  await step(`Affected areas (min_signal=2), top ${topN}`, async () => {
    const { data, ms } = await fn("affected-areas", { method: "GET", query: { as_of: asOf, disruption_id: did(), min_signal: "2" } });
    if (!Array.isArray(data) || !data.length) throw new Error("affected-areas returned no rows");
    const served = data.filter((a) => a.resident_state !== "not_on_network");
    served.sort((a, b) => (a.suggested_rank ?? 1e9) - (b.suggested_rank ?? 1e9));
    S.top = served.slice(0, topN);
    ok(`${data.length} affected (${served.length} on network)  (${fmtMs(ms)})`);
    S.top.forEach((a) => {
      const t = a.top_source;
      const src = t ? `${t.name} [${t.type}]${t.is_simulated ? " (simulated)" : ""}${t.exceeds_jmp_benchmark ? " (far, >30 min)" : ""}` : "no top source";
      info(`#${a.suggested_rank} ${a.barangay_id}  L${a.signal_level} ${a.service_level}${a.vulnerable_flag ? " vulnerable" : ""}`);
      info(`     backup: ${src}`);
    });
    if (S.top.length < topN) throw new Error(`only ${S.top.length} served barangays available`);
  });

  await step(`Confirm allocation (officer ${OFFICER})`, async () => {
    const body = S.top.map((a, i) => ({
      disruption_id: did(), barangay_id: a.barangay_id, priority_rank: i + 1, officer_id: OFFICER,
      overridden_from_suggested_rank: null, note: "demo: accepted as suggested",
    }));
    const { data, ms } = await fn("confirm-allocation", { body });
    ok(`status=${data.status} allocations=${data.allocations} events=${data.events_written}  (${fmtMs(ms)})`);
  });

  await step("Deploy response (chain #1 source per barangay)", async () => {
    for (const a of S.top) {
      const first = S.chains.get(a.barangay_id)?.ranked_sources?.[0];
      if (!first) throw new Error(`no ranked source for ${a.barangay_id}`);
      const { data, ms } = await fn("deploy-response", { body: {
        disruption_id: did(), barangay_id: a.barangay_id, source_id: first.source_id, deployed_by: OFFICER, deployed_at: nowIso(),
      } });
      ok(`${a.barangay_id} -> ${data.source_name}  (${fmtMs(ms)})`);
    }
  });

  await step("Notify residents (PWA + SMS dry-run)", async () => {
    const body = [];
    for (const a of S.top) {
      const src = S.chains.get(a.barangay_id).ranked_sources[0].name;
      for (const channel of ["pwa_push", "sms"]) {
        body.push({ disruption_id: did(), barangay_id: a.barangay_id, channel, status: "water_interrupted", cause: S.disruption.cause,
          expected_duration_hint: "Likely back within the day; not a guaranteed time", store_water_advice: true,
          nearest_source_name: src, sent_at: nowIso() });
      }
    }
    const { data, ms } = await fn("notify-residents", { body });
    S.notify = data;
    const within = ms <= 10_000;
    (within ? ok : bad)(`elapsed ${fmtMs(ms)} vs 10 s limit`);
    info(`status=${data.status}  barangays notified=${data.notified.length}`);
    info(`sms mode=${data.sms.mode} planned=${data.sms.planned} sent=${data.sms.sent} failed=${data.sms.failed}`);
    try {
      const { count, error } = await anonClient().from("sms_outbox").select("*", { count: "exact", head: true }).eq("disruption_id", did()).eq("direction", "outbound");
      if (error) throw new Error(error.message);
      info(`sms_outbox: ${count} SMS went to the simulated handset (run \`sms\` in another terminal to see them)`);
    } catch (e) { info(`sms_outbox: could not count (${e.message}; migration 000009 applied?)`); }
    if (data.sms.mode !== "dry_run") throw new Error(`SMS mode is "${data.sms.mode}", expected dry_run. Refusing to continue.`);
    if (!within) throw new Error("notify exceeded 10 s");
  });

  const snapshot = async (label) => {
    const { data, ms } = await fn("dashboard-snapshot", { method: "GET" });
    const by = {};
    for (const b of data.barangays) by[b.status] = (by[b.status] ?? 0) + 1;
    ok(`${label}: disruption ${data.disruption ? data.disruption.status : "none"}  (${fmtMs(ms)})`);
    info(`cards by status: ${Object.entries(by).map(([k, v]) => `${k}=${v}`).join("  ")}`);
    return data;
  };
  await step("Dashboard snapshot", () => snapshot("snapshot"));

  await step("Resident confirmation -> resolved", async () => {
    const confirm = async (barangay_id, restored) => {
      const { data, ms } = await fn("resident-confirmation", { body: {
        disruption_id: did(), barangay_id, confirmed_by: "resident", channel: "pwa", restored, confirmed_at: nowIso(),
      } });
      ok(`${barangay_id} restored=${restored} -> ${data.disruption_status}${data.resolved ? " (RESOLVED)" : ""}  (${fmtMs(ms)})`);
      return data;
    };
    if (withReopen) {
      const d = await confirm(S.top[0].barangay_id, false);
      if (d.resolved || d.disruption_status !== "deployed") throw new Error(`reopen should put disruption back to deployed, got ${d.disruption_status}`);
      info("not restored -> back on the allocation list, not resolved");
    }
    let last;
    for (const a of S.top) last = await confirm(a.barangay_id, true);
    if (!last.resolved) throw new Error(`disruption not resolved after all confirmations (status ${last.disruption_status})`);
  });

  await step("Final snapshot", async () => {
    const d = await snapshot("final");
    if (d.disruption && d.disruption.status !== "resolved") throw new Error(`open disruption still ${d.disruption.status}`);
  });

  out(`\n✓ Scenario complete in ${fmtMs(performance.now() - t0)}`);
  return { disruption_id: did(), timings, total_ms: performance.now() - t0 };
}

async function cmdRun() {
  config();
  out(`PIA Waterback stage scenario${flags.step ? " (step mode)" : ""}`);
  try {
    const r = await runScenario();
    out("\nTimings");
    r.timings.forEach((t) => out(`  ${String(t.n).padStart(2)}. ${fmtMs(t.ms).padStart(8)}  ${t.title}`));
  } catch (e) { die(e.message); }
}

// ---------- realtime ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startListener({ print = true } = {}) {
  const sb = anonClient();
  const events = [];
  const channel = sb.channel(`demo-listen-${Date.now()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_log" }, (p) => {
      const recv = Date.now();
      const r = p.new;
      const commit = p.commit_timestamp ? Date.parse(p.commit_timestamp) : NaN;
      const ev = { table: "event_log", id: r.id, disruption_id: r.disruption_id, type: r.event_type, barangay_id: r.barangay_id,
        step: r.payload_json?.step, occurred_at: r.occurred_at, recv, latency_ms: Number.isNaN(commit) ? null : recv - commit };
      events.push(ev);
      if (print) out(`  event_log INSERT  ${ev.type.padEnd(18)} ${(ev.barangay_id ?? "ALL (system-wide)").padEnd(18)} occurred_at=${ev.occurred_at}  latency=${ev.latency_ms == null ? "?" : ev.latency_ms + " ms"}`);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "disruptions" }, (p) => {
      const r = p.new;
      const commit = p.commit_timestamp ? Date.parse(p.commit_timestamp) : NaN;
      if (print) out(`  disruptions UPDATE ${String(r.status).padEnd(17)} signal=${r.signal_level} id=${String(r.id).slice(0, 8)}  latency=${Number.isNaN(commit) ? "?" : Date.now() - commit + " ms"}`);
    });
  const ready = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("Realtime subscribe timed out after 15 s")), 15_000);
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); res(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { clearTimeout(timer); rej(new Error(`Realtime ${status}${err ? ": " + err.message : ""}`)); }
    });
  });
  return { events, ready, stop: () => sb.removeChannel(channel).then(() => sb.realtime.disconnect()) };
}

async function cmdListen() {
  config();
  const secs = Number(flags.seconds ?? 0);
  out(`Listening to Realtime (anon key) on event_log INSERT + disruptions UPDATE${secs ? ` for ${secs} s` : " (Ctrl+C to stop)"}`);
  const l = startListener();
  try { await l.ready; } catch (e) { die(e.message); }
  ok("subscribed");
  if (secs) { await sleep(secs * 1000); await l.stop(); out(`\n${l.events.length} event_log events received`); process.exit(0); }
  await new Promise(() => {});
}

const RANK = (e) => ({ predicted: 0, confirmed: 1, deployed: e.step === "source" ? 3 : 2, notified: 4, resident_confirmed: 5, resolved: 6 }[e.type] ?? 9);

async function cmdVerify() {
  config();
  const svc = serviceClient();
  out("Verify Realtime end to end");
  let c = await counts(svc);
  if (!isClean(c)) {
    if (!flags.reset) die(`Baseline is not clean (${JSON.stringify(c)}). Re-run with --reset to clear demo rows first.`);
    out("Resetting first (--reset)");
    await doReset(svc);
  }
  const l = startListener();
  try { await l.ready; } catch (e) { die(e.message); }
  ok("listener subscribed");
  let result, failed = false, report = [];
  try {
    result = await runScenario();
  } catch (e) { failed = true; bad(e.message); }
  if (!failed) {
    out("\n[verify] waiting for stragglers (max 10 s)");
    const { data: rows, error } = await svc.from("event_log").select("id,event_type,barangay_id,payload_json,occurred_at").eq("disruption_id", result.disruption_id);
    if (error) die(error.message);
    const expected = new Set(rows.map((r) => r.id));
    const got = () => l.events.filter((e) => e.disruption_id === result.disruption_id);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && new Set(got().map((e) => e.id)).size < expected.size) await sleep(200);
    const ev = got();
    const ids = new Set(ev.map((e) => e.id));
    const missing = rows.filter((r) => !ids.has(r.id));
    out(`  expected ${expected.size} event_log rows, received ${ids.size}`);
    if (missing.length) { failed = true; bad(`missing: ${missing.map((m) => `${m.event_type}/${m.barangay_id ?? "ALL"}`).join(", ")}`); }
    else ok("every event_log row was received via Realtime");
    if (ev.length !== ids.size) info(`note: ${ev.length - ids.size} duplicate deliveries`);
    // order: received sequence must follow the lifecycle (unless reopen loops make it non-monotone)
    if (!flags["with-reopen"]) {
      const seq = ev.map(RANK);
      const monotone = seq.every((v, i) => i === 0 || v >= seq[i - 1]);
      (monotone ? ok : bad)(`received in insertion (lifecycle) order: ${ev.map((e) => e.type + (e.step ? ":" + e.step : "")).join(" > ").slice(0, 400)}`);
      if (!monotone) failed = true;
    } else info("order check skipped (--with-reopen loops the lifecycle)");
    const lat = ev.map((e) => e.latency_ms).filter((x) => x != null).sort((a, b) => a - b);
    if (lat.length) {
      const med = lat[Math.floor(lat.length / 2)];
      out(`  latency (receive - commit_timestamp; includes local clock skew): median ${med} ms, max ${lat[lat.length - 1]} ms, min ${lat[0]} ms`);
    }
    report = { expected: expected.size, received: ids.size };
  }
  await l.stop();
  if (!flags.keep) {
    out("\n[verify] resetting demo rows (use --keep to skip)");
    await doReset(svc);
    c = await counts(svc);
    (isClean(c) ? ok : bad)(isClean(c) ? "clean baseline" : `not clean: ${JSON.stringify(c)}`);
    if (!isClean(c)) failed = true;
  }
  out(failed ? "\n✗ VERIFY FAILED" : `\n✓ VERIFY PASSED (${report.received}/${report.expected} events via Realtime)`);
  process.exit(failed ? 1 : 0);
}

// ---------- simulated handset ----------
// Seeded demo residents (supabase/seed/demo_residents.sql): fake +63900000000X block, never a real subscriber.
const DEMO_PHONES = { lagundi: "+639000000001", payao: "+639000000002", "darahuway-dako": "+639000000003", "darahuway-guti": "+639000000004" };
const hhmm = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
function printSms(r) {
  const inbound = r.direction === "inbound";
  const who = `${inbound ? "from" : "to  "} ${r.to_masked}`;
  const bar = "-".repeat(64);
  out(bar);
  out(`  ${inbound ? "<<" : ">>"} ${(r.barangay_id ?? "unknown barangay").padEnd(16)} ${who}  [${r.language ?? "?"}]  ${hhmm(r.created_at)}${r.mode === "dry_run" ? "  (simulated)" : "  (LIVE)"}`);
  const words = String(r.body).split(" ");
  let line = "    ";
  for (const w of words) { if ((line + w).length > 66) { out(line.trimEnd()); line = "    "; } line += w + " "; }
  out(line.trimEnd());
}
async function cmdSms() {
  config();
  const secs = Number(flags.seconds ?? 0);
  out(`Simulated handset: tailing sms_outbox via Realtime (anon key)${secs ? ` for ${secs} s` : " (Ctrl+C to stop)"}`);
  const sb = anonClient();
  let n = 0;
  const channel = sb.channel(`demo-sms-${Date.now()}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "sms_outbox" }, (p) => { n++; printSms(p.new); });
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("Realtime subscribe timed out after 15 s")), 15_000);
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); res(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { clearTimeout(timer); rej(new Error(`Realtime ${status}${err ? ": " + err.message : ""}`)); }
    });
  }).catch((e) => die(e.message));
  ok("subscribed; waiting for messages");
  if (flags.history) {
    const { data } = await sb.from("sms_outbox").select("*").order("created_at", { ascending: false }).limit(Number(flags.history) || 10);
    (data ?? []).reverse().forEach(printSms);
  }
  if (secs) { await sleep(secs * 1000); await sb.removeChannel(channel); out(`\n${n} messages received`); process.exit(0); }
  await new Promise(() => {});
}
async function cmdReply() {
  const [who, ...kw] = argv.slice(1).filter((a) => !a.startsWith("--"));
  const message = kw.join(" ").trim();
  if (!who || !message) die("Usage: reply <barangay_id|+63900000000X> <KEYWORD>   e.g. reply lagundi THANKS  (demo barangays: " + Object.keys(DEMO_PHONES).join(", ") + ")");
  const from = DEMO_PHONES[who] ?? who;
  if (!/^\+63900000000\d$/.test(from)) die(`"${who}" is not a demo resident (fake block +63900000000X). Demo barangays: ${Object.keys(DEMO_PHONES).join(", ")}`);
  const { url, anon } = config();
  const res = await fetch(`${url}/functions/v1/sms-webhook?demo=1`, {
    method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, message }),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) die(`sms-webhook -> HTTP ${res.status} ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 500)}`);
  out(`>> ${who} (${from.slice(0, 6)}•••${from.slice(-4)}) sent: ${message}`);
  out(`<< reply (${data.sms?.mode}): ${data.reply}`);
}

// ---------- main ----------
const commands = { status: cmdStatus, reset: cmdReset, run: cmdRun, listen: cmdListen, "verify-realtime": cmdVerify, sms: cmdSms, reply: cmdReply };
if (!commands[command]) {
  out("Usage: node scripts/demo/demo.mjs <command> [flags]\n");
  out("  status\n  reset --yes\n  run [--as-of ISO] [--step] [--top N] [--with-reopen]\n  listen [--seconds S]\n  verify-realtime [--reset] [--keep] [--with-reopen]\n  sms [--seconds S] [--history N]        simulated handset: tail sms_outbox\n  reply <barangay_id|+63900000000X> <KEYWORD>   e.g. reply lagundi THANKS\n\nGlobal: --from-cli (fetch keys via supabase CLI)");
  process.exit(command ? 2 : 0);
}
try { await commands[command](); process.exit(process.exitCode ?? 0); }
catch (e) { die(e.message); }
