// Automatic heads-up (predictor -> prevention): disruption-monitor sends "store water" to residents BEFORE any allocation.
// All offline: FakeSupabase + a fetch spy that must never be called (SMS is dry-run, demo numbers are never live).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BarangayRow } from "../../functions/_shared/affected.ts";
import { buildSnapshot } from "../../functions/_shared/dashboard_snapshot.ts";
import { handleMonitor } from "../../functions/_shared/disruption_monitor.ts";
import { buildHeadsUpSms } from "../../functions/_shared/heads_up.ts";
import { SMS_MAX, SMS_STORE_LITRES, fmtWhen, isGsm7 } from "../../functions/_shared/sms_templates.ts";
import type { Lang } from "../../functions/_shared/sms_templates.ts";
import { fetchEvents, makeDisruptionStore, makeHeadsUpStore } from "../../functions/_shared/supabase_data.ts";
import { FakeSupabase } from "./fakeSupabase.ts";
import { forecastSeries, kuladorSeries, rainSeries } from "./helpers.ts";

const BARANGAYS: BarangayRow[] = JSON.parse(readFileSync(resolve(import.meta.dirname, "fixtures/barangays_pia_dev.json"), "utf8"));
const SERVED = BARANGAYS.filter((b) => b.service_level !== "unserved");
const UNSERVED = BARANGAYS.filter((b) => b.service_level === "unserved");
const NOW = new Date("2026-07-10T04:00:00Z");
const AS = "2026-07-10T04:00:00Z";
const stormData = async (_f: Date, to: Date) => ({
  readings: kuladorSeries(to.getTime(), 240, (h) => ({ turbidity_ntu: h < 8 ? 650 - h * 70 : 4, plant_status: "degraded" as const })),
  rainHourly: rainSeries(to.getTime(), 90 * 24, (h) => (h < 24 ? 12 : 0.1)), forecastHourly: forecastSeries(to.getTime(), 4),
});
const calmData = async (_f: Date, to: Date) => ({
  readings: kuladorSeries(to.getTime(), 240), rainHourly: rainSeries(to.getTime(), 90 * 24, (h) => (h >= 96 && h < 120 ? 10 : 0.2)), forecastHourly: forecastSeries(to.getTime(), 0.05),
});
const noLive = async () => { throw new Error("no network"); };
const langs: Lang[] = ["waray", "filipino", "english"];

const barangayRows = () => BARANGAYS.map((b) => ({ barangay_id: b.barangay_id, name: b.barangay_id.replace(/-/g, " "), wsp_name: null, service_level: b.service_level }));
/** One SMS resident per served barangay (fake demo number), plus one PWA-only resident in the first. */
const residentRows = (extra: any[] = []) => [
  ...SERVED.map((b, i) => ({ id: `r-${i}`, barangay_id: b.barangay_id, phone: `+63900000000${i % 10}`, preferred_language: langs[i % 3], channel: "sms" })),
  { id: "r-pwa", barangay_id: SERVED[0].barangay_id, phone: null, preferred_language: "english", channel: "pwa" },
  ...extra,
];

function setup(opts: { residents?: any[]; live?: boolean; data?: typeof stormData } = {}) {
  const db = new FakeSupabase({ disruptions: [], event_log: [], barangays: barangayRows(), residents: opts.residents ?? residentRows(), sms_outbox: [] });
  const fetchSpy = vi.fn();
  const deps = {
    fetchData: opts.data ?? stormData, store: makeDisruptionStore(db), now: () => NOW, fetchLive: noLive,
    headsUp: { store: makeHeadsUpStore(db), sms: { live: opts.live ?? false, apiKey: "k" }, fetch: fetchSpy as any },
  };
  const post = async (body: unknown) => (await handleMonitor(new Request("http://x/f", { method: "POST", body: JSON.stringify(body) }), deps)).json();
  const headsUps = () => db.rows("event_log").filter((e) => e.event_type === "predicted" && e.barangay_id != null);
  return { db, post, fetchSpy, headsUps };
}

describe("automatic heads-up from the monitor", () => {
  it("create -> heads-up event for all 26 served barangays + dry-run SMS rows, no fetch", async () => {
    const { db, post, fetchSpy, headsUps } = setup();
    const b = await post({ as_of: AS });
    expect(b.action).toBe("created");
    expect(b.heads_up).toMatchObject({ barangays: 26, sms_planned: 26, sms_skipped_demo: 0, mode: "dry_run", level: b.disruption.signal_level });
    expect(fetchSpy).not.toHaveBeenCalled();
    const ev = headsUps();
    expect(new Set(ev.map((e) => e.barangay_id))).toEqual(new Set(SERVED.map((x) => x.barangay_id)));
    expect(ev[0]).toMatchObject({ event_type: "predicted", actor: "system", disruption_id: b.disruption.id });
    expect(ev[0].payload_json).toMatchObject({ kind: "heads_up", level: b.disruption.signal_level, likely_at: b.disruption.likely_at, store_litres: SMS_STORE_LITRES });
    const out = db.rows("sms_outbox");
    expect(out).toHaveLength(26);
    for (const o of out) {
      expect(o).toMatchObject({ direction: "outbound", mode: "dry_run", template: "sms.heads_up_store_water", disruption_id: b.disruption.id });
      expect(o.to_masked).toMatch(/^\+63900•••000\d$/);
      expect(o.body.length).toBeLessThanOrEqual(SMS_MAX);
      expect(isGsm7(o.body)).toBe(true);
      expect(o.body).toContain("60L");
    }
    expect(new Set(out.map((o) => o.language))).toEqual(new Set(langs));
    // the PWA-only resident gets no SMS but their barangay still gets the event
    expect(out.some((o) => o.resident_id === "r-pwa")).toBe(false);
    // the system-wide lifecycle event is still there, exactly once
    expect(db.rows("event_log").filter((e) => e.barangay_id == null)).toHaveLength(1);
  });

  it("idempotent: same as_of twice, and a later tick with the same signal, send nothing new", async () => {
    const { db, post, headsUps } = setup();
    await post({ as_of: AS });
    const again = await post({ as_of: AS });
    expect(again.heads_up).toMatchObject({ barangays: 0, sms_planned: 0 });
    const later = await post({ as_of: "2026-07-10T06:00:00Z" });
    expect(later.heads_up.barangays).toBe(0);
    expect(headsUps()).toHaveLength(26);
    expect(db.rows("sms_outbox")).toHaveLength(26);
    // manual resend is idempotent too
    const manual = await post({ action: "heads_up", disruption_id: db.rows("disruptions")[0].id });
    expect(manual.heads_up.barangays).toBe(0);
    expect(db.rows("sms_outbox")).toHaveLength(26);
  });

  it("escalation to a new level sends exactly one more band; going back does not repeat", async () => {
    const { db, post, headsUps } = setup();
    const first = await post({ as_of: AS });
    const id = first.disruption.id, s0 = first.disruption.signal_level;
    const s1 = s0 === 4 ? 3 : 4;
    db.rows("disruptions")[0].signal_level = s1; // the predictor raised the signal
    const up = await post({ action: "heads_up", disruption_id: id });
    expect(up.heads_up).toMatchObject({ level: s1, barangays: 26, sms_planned: 26 });
    expect(headsUps()).toHaveLength(52);
    expect(new Set(headsUps().map((e) => e.payload_json.level))).toEqual(new Set([s0, s1]));
    db.rows("disruptions")[0].signal_level = s0;
    expect((await post({ action: "heads_up", disruption_id: id })).heads_up.barangays).toBe(0);
    expect(db.rows("sms_outbox")).toHaveLength(52);
  });

  it("unserved barangays: variant only where residents exist", async () => {
    const none = setup();
    await none.post({ as_of: AS });
    expect(none.headsUps().some((e) => UNSERVED.some((u) => u.barangay_id === e.barangay_id))).toBe(false);

    const u = UNSERVED[0].barangay_id;
    const some = setup({ residents: residentRows([{ id: "r-un", barangay_id: u, phone: "+639000000009", preferred_language: "english", channel: "sms" }]) });
    const b = await some.post({ as_of: AS });
    expect(b.heads_up).toMatchObject({ barangays: 27, sms_planned: 27 });
    const row = some.db.rows("sms_outbox").find((o) => o.barangay_id === u)!;
    expect(row.template).toBe("sms.heads_up_unserved");
    expect(row.body).toContain("CWD outage expected");
    expect(row.body).toContain("refill stations".replace("r", "R")); // "Refill stations ... may be busy"
    expect(some.headsUps().find((e) => e.barangay_id === u)!.payload_json.served).toBe(false);
  });

  it("live mode: demo numbers are never sent and are logged dry_run; fetch not called", async () => {
    const { db, post, fetchSpy } = setup({ live: true });
    const b = await post({ as_of: AS });
    expect(b.heads_up).toMatchObject({ mode: "live", sms_planned: 26, sms_skipped_demo: 26 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.rows("sms_outbox").every((o) => o.mode === "dry_run")).toBe(true);
  });

  it("no heads-up below signal 2, after confirm, or without headsUp deps", async () => {
    const calm = setup({ data: calmData });
    expect((await calm.post({ as_of: AS })).heads_up).toMatchObject({ barangays: 0, skipped: "no open disruption" });
    expect(calm.db.rows("event_log")).toHaveLength(0);

    const s = setup();
    const id = (await s.post({ as_of: AS })).disruption.id;
    s.db.rows("disruptions")[0].signal_level = 4;
    await s.post({ action: "confirm", disruption_id: id });
    const r = await s.post({ action: "heads_up", disruption_id: id });
    expect(r.heads_up.barangays).toBe(0);
    expect(r.heads_up.skipped).toMatch(/heads-up only while predicted/);
    expect(s.db.rows("event_log").filter((e) => e.barangay_id != null)).toHaveLength(26); // nothing added after confirm

    const db = new FakeSupabase({ disruptions: [], event_log: [] });
    const bare = await (await handleMonitor(new Request("http://x/f", { method: "POST", body: JSON.stringify({ as_of: AS }) }),
      { fetchData: stormData, store: makeDisruptionStore(db), now: () => NOW, fetchLive: noLive })).json();
    expect(bare.heads_up).toBeNull();
  });

  it("manual action validation", async () => {
    const { db, post } = setup();
    const res = (body: unknown) => handleMonitor(new Request("http://x/f", { method: "POST", body: JSON.stringify(body) }),
      { fetchData: stormData, store: makeDisruptionStore(db), now: () => NOW, headsUp: { store: makeHeadsUpStore(db), sms: { live: false } } });
    expect((await res({ action: "heads_up" })).status).toBe(400);
    expect((await res({ action: "heads_up", disruption_id: "3f1c2a40-9b7e-4c1a-8d2e-5a6b7c8d9e01" })).status).toBe(404);
    const id = (await post({ as_of: AS })).disruption.id;
    db.rows("disruptions")[0].status = "resolved";
    expect((await res({ action: "heads_up", disruption_id: id })).status).toBe(409);
  });
});

describe("heads-up and the dashboard snapshot", () => {
  it("heads-up events bump last_event_at but never move or regress a card status", async () => {
    const { db, post } = setup();
    const first = await post({ as_of: AS });
    const id = first.disruption.id;
    const served = SERVED.map((b) => ({ barangay_id: b.barangay_id, service_level: b.service_level as "level_iii" | "level_i" }));
    const events = () => fetchEvents(db as any, id);
    let snap = buildSnapshot(served, db.rows("disruptions")[0], await events(), NOW);
    expect(snap.barangays.every((r) => r.status === "predicted" && r.last_event_at === new Date(AS).toISOString())).toBe(true);

    // later lifecycle: deployed for one barangay, then a LATER heads-up (e.g. a manual resend at a new level) for the same barangay
    const b0 = SERVED[0].barangay_id;
    db.rows("event_log").push({ id: "z1", disruption_id: id, event_type: "deployed", actor: "x", occurred_at: "2026-07-10T04:30:00.000Z", barangay_id: b0, payload_json: { step: "allocation" } });
    db.rows("event_log").push({ id: "z2", disruption_id: id, event_type: "predicted", actor: "system", occurred_at: "2026-07-10T05:00:00.000Z", barangay_id: b0, payload_json: { kind: "heads_up", level: 4 } });
    db.rows("disruptions")[0].status = "deployed";
    snap = buildSnapshot(served, db.rows("disruptions")[0], await events(), NOW);
    const row = snap.barangays.find((r) => r.barangay_id === b0)!;
    expect(row.status).toBe("deployed");
    expect(row.last_event_at).toBe("2026-07-10T05:00:00.000Z");
    // resident state v2: status deployed = water really stopped -> interrupted for signal >= 3; signal <= 2 stays heads_up
    expect(row.resident_state).toBe(row.signal_level <= 2 ? "heads_up" : "interrupted");
  });
});

describe("heads-up SMS copy", () => {
  const d = { cause: "turbidity" as const, likely_at: "2026-07-10T18:00:00Z", heads_up_from: AS, started_at: AS };
  it("every language / cause / service level fits 160 chars and GSM-7 with the longest served name", () => {
    for (const lang of langs) for (const cause of ["turbidity", "drought", "repair"] as const) for (const level of ["level_iii", "unserved"] as const) {
      const { body } = buildHeadsUpSms({ ...d, cause }, { name: "Guinsorongan", wsp_name: null, service_level: level }, lang, AS);
      expect(body.length, body).toBeLessThanOrEqual(SMS_MAX);
      expect(isGsm7(body)).toBe(true);
      expect(body.startsWith("PIA WATERBACK:")).toBe(true);
    }
  });
  it("likely start time is formatted in Asia/Manila relative to as_of", () => {
    expect(fmtWhen("2026-07-10T18:00:00Z", AS)).toBe("tomorrow 2AM"); // 02:00 Manila next day
    expect(fmtWhen("2026-07-10T07:00:00Z", AS)).toBe("today 3PM");
    expect(fmtWhen("2026-07-13T01:00:00Z", AS)).toBe("Mon 9AM");
    expect(fmtWhen("2026-07-30T01:00:00Z", AS)).toBe("soon");
    expect(fmtWhen(null, AS)).toBe("soon");
    const en = buildHeadsUpSms(d, { name: "Payao", wsp_name: null, service_level: "level_iii" }, "english", AS).body;
    expect(en).toBe("PIA WATERBACK: Water may stop in Payao from tomorrow 2AM. River too muddy to treat. Store 60L per home (4 people x 15L). Reply SRC for backup water.");
  });
});
