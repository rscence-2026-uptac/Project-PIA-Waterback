import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { confirmAllocation, deployResponse } from "../../functions/_shared/allocation.ts";
import { notifyResidents, buildNotifySms } from "../../functions/_shared/notify.ts";
import { barangayStates, recordConfirmation } from "../../functions/_shared/confirmation.ts";
import { syncQueue } from "../../functions/_shared/sync.ts";
import { checkWebhookSecret, extractInbound, handleInbound, readInbound } from "../../functions/_shared/sms_inbound.ts";
import { normalizePhone, sendSms, smsConfigFromEnv } from "../../functions/_shared/sms_send.ts";
import {
  CAUSE_TEXT, SMS_MAX, SMS_ROWS, WORST_CASE, fillSms, fmtClock, fmtWindow, isGsm7, smsBarangayName, toGsm7,
} from "../../functions/_shared/sms_templates.ts";
import type { Lang, SmsKey } from "../../functions/_shared/sms_templates.ts";
import { HttpError, serve } from "../../functions/_shared/spec06_http.ts";
import { D1, FakeStore, SRC1, resident } from "./fakeStore06.ts";

const NOW = new Date("2026-10-06T05:00:00Z");
const T = (min: number) => new Date(NOW.getTime() + min * 60_000);
const iso = (d: Date) => d.toISOString();
const dec = (b: string, rank: number, over: number | null = null) => ({
  disruption_id: D1, barangay_id: b, priority_rank: rank, officer_id: "mock-officer-1", overridden_from_suggested_rank: over,
});
const note = (b: string, ch: "pwa_push" | "sms" = "pwa_push", extra: object = {}) => ({
  disruption_id: D1, barangay_id: b, channel: ch, status: "interrupted", cause: "turbidity" as const,
  store_water_advice: true, nearest_source_name: "Bayani Refilling", sent_at: iso(NOW), ...extra,
});
const conf = (b: string, restored: boolean, extra: object = {}) => ({
  disruption_id: D1, barangay_id: b, confirmed_by: "resident", channel: "pwa", restored, confirmed_at: iso(NOW), ...extra,
});
const code = async (p: Promise<unknown>) => p.then(() => null, (e: HttpError) => ({ status: e.status, code: e.code }));
const DRY = { live: false };
let s: FakeStore;
beforeEach(() => { s = new FakeStore(); });

async function toNotified(...bs: string[]) {
  await confirmAllocation(s, bs.map((b, i) => dec(b, i + 1)), NOW);
  await notifyResidents({ store: s, sms: DRY, now: NOW }, bs.map((b) => note(b)));
}

describe("confirm-allocation", () => {
  it("writes allocations + one deployed event per barangay and moves status to deployed", async () => {
    const r = await confirmAllocation(s, [dec("payao", 1), dec("maulong", 2, 1)], NOW);
    expect(r).toMatchObject({ status: "deployed", allocations: 2, events_written: 2 });
    expect(s.allocations).toHaveLength(2);
    expect(s.allocations[0]).toMatchObject({ officer_id: "mock-officer-1", decided_at: iso(NOW) });
    expect(s.evs("deployed").map((e) => e.barangay_id)).toEqual(["payao", "maulong"]);
    expect(s.evs("deployed", "maulong")[0].payload_json).toMatchObject({ step: "allocation", overridden: true, overridden_from_suggested_rank: 1 });
    expect(s.evs("deployed", "payao")[0].payload_json).toMatchObject({ overridden: false, overridden_from_suggested_rank: null });
    expect(s.evs("notified")).toHaveLength(0); // notify is a separate step (spec 06 order)
    expect(s.status).toBe("deployed");
  });
  it("400 on schema errors, duplicates, mixed disruptions", async () => {
    expect(await code(confirmAllocation(s, [], NOW))).toMatchObject({ status: 400 });
    expect(await code(confirmAllocation(s, "x", NOW))).toMatchObject({ status: 400, code: "invalid_request" });
    expect(await code(confirmAllocation(s, [{ ...dec("payao", 1), disruption_id: "nope" }], NOW))).toMatchObject({ status: 400 });
    expect(await code(confirmAllocation(s, [{ ...dec("payao", 0) }], NOW))).toMatchObject({ status: 400 });
    expect(await code(confirmAllocation(s, [dec("payao", 1), dec("payao", 2)], NOW))).toMatchObject({ status: 400 });
    expect(await code(confirmAllocation(s, [dec("payao", 1), dec("maulong", 1)], NOW))).toMatchObject({ status: 400 });
    expect(await code(confirmAllocation(s, [dec("payao", 1), { ...dec("maulong", 2), disruption_id: "9a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41" }], NOW))).toMatchObject({ status: 400 });
    expect(s.allocations).toHaveLength(0);
  });
  it("404 unknown disruption, 409 not confirmed / resolved, 422 unknown barangay", async () => {
    expect(await code(confirmAllocation(s, [{ ...dec("payao", 1), disruption_id: "9a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41" }], NOW))).toMatchObject({ status: 404 });
    expect(await code(confirmAllocation(s, [dec("nowhere", 1)], NOW))).toMatchObject({ status: 422, code: "unknown_barangay" });
    s.disruptions.get(D1)!.status = "predicted";
    expect(await code(confirmAllocation(s, [dec("payao", 1)], NOW))).toMatchObject({ status: 409 });
    s.disruptions.get(D1)!.status = "resolved";
    expect(await code(confirmAllocation(s, [dec("payao", 1)], NOW))).toMatchObject({ status: 409 });
    expect(s.events).toHaveLength(0);
  });
});

describe("deploy-response", () => {
  const body = (extra: object = {}) => ({ disruption_id: D1, barangay_id: "payao", source_id: SRC1, deployed_by: "mock-officer-1", deployed_at: iso(NOW), ...extra });
  it("needs a confirmed allocation, then records the source as a deployed event", async () => {
    expect(await code(deployResponse(s, body(), NOW))).toMatchObject({ status: 409, code: "allocation_not_confirmed" });
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    s.chains.set(`${D1}/payao`, [SRC1]);
    const r = await deployResponse(s, body(), NOW);
    expect(r).toMatchObject({ recorded: true, source_name: "Bayani Refilling" });
    const e = s.evs("deployed", "payao")[1];
    expect(e.payload_json).toMatchObject({ step: "source", source_id: SRC1, in_ranked_chain: true });
    expect(e.actor).toBe("mock-officer-1");
  });
  it("errors: 400 shape, 409 barangay not allocated, 404 unknown source; client time capped at now", async () => {
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    expect(await code(deployResponse(s, body({ source_id: "x" }), NOW))).toMatchObject({ status: 400 });
    expect(await code(deployResponse(s, body({ barangay_id: "maulong" }), NOW))).toMatchObject({ status: 409, code: "barangay_not_allocated" });
    expect(await code(deployResponse(s, body({ source_id: "9a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41" }), NOW))).toMatchObject({ status: 404 });
    await deployResponse(s, body({ deployed_at: iso(T(600)) }), NOW);
    expect(s.evs("deployed", "payao")[1].occurred_at).toBe(iso(NOW));
    expect(s.evs("deployed", "payao")[1].payload_json).toMatchObject({ in_ranked_chain: null });
  });
});

describe("notify-residents", () => {
  it("event order: deployed -> notified; writes notified per barangay, status notified", async () => {
    expect(await code(notifyResidents({ store: s, sms: DRY, now: NOW }, [note("payao")]))).toMatchObject({ status: 409 });
    await confirmAllocation(s, [dec("payao", 1), dec("maulong", 2)], NOW);
    const r = await notifyResidents({ store: s, sms: DRY, now: T(1) }, [note("payao", "pwa_push"), note("payao", "sms"), note("maulong")]);
    expect(s.events.map((e) => e.event_type)).toEqual(["deployed", "deployed", "notified", "notified"]);
    expect(s.evs("notified")).toHaveLength(2); // one per barangay even with two channels
    expect(s.evs("notified", "payao")[0].payload_json).toMatchObject({ channels: ["pwa_push", "sms"], cause: "turbidity" });
    expect(s.status).toBe("notified");
    expect(r.notified).toHaveLength(2);
  });
  it("rejects barangays without allocation (409), unknown (422), bad shape (400), mixed disruptions", async () => {
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const deps = { store: s, sms: DRY, now: NOW };
    expect(await code(notifyResidents(deps, [note("maulong")]))).toMatchObject({ status: 409, code: "barangay_not_allocated" });
    expect(await code(notifyResidents(deps, [note("nowhere")]))).toMatchObject({ status: 422, code: "unknown_barangay" });
  });
  it("400s", async () => {
    const deps = { store: s, sms: DRY, now: NOW };
    expect(await code(notifyResidents(deps, []))).toMatchObject({ status: 400 });
    expect(await code(notifyResidents(deps, [note("payao", "sms", { channel: "email" })]))).toMatchObject({ status: 400 });
    expect(await code(notifyResidents(deps, [note("payao", "sms", { sent_at: "yesterday" })]))).toMatchObject({ status: 400 });
    expect(await code(notifyResidents(deps, [note("payao"), note("payao", "sms", { disruption_id: "9a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41" })]))).toMatchObject({ status: 400 });
  });
  it("DRY-RUN: never calls fetch, returns masked would_send; residents of other channels/barangays skipped", async () => {
    s.residents = [resident(1, "payao", "english"), resident(2, "payao", "waray"), resident(3, "payao", "english", "pwa"), resident(4, "maulong")];
    const f = vi.fn();
    await confirmAllocation(s, [dec("payao", 1), dec("maulong", 2)], NOW);
    const r = await notifyResidents({ store: s, sms: smsConfigFromEnv(() => undefined), fetch: f, now: NOW }, [note("payao", "sms"), note("maulong", "pwa_push")]);
    expect(f).not.toHaveBeenCalled();
    expect(r.sms.mode).toBe("dry_run");
    expect(r.sms.planned).toBe(2); // payao sms residents only
    expect(r.sms.would_send!.every((m) => /^\+\*+\d{3}$/.test(m.to))).toBe(true);
    expect(JSON.stringify(r)).not.toContain("9171000001");
    expect(r.sms.would_send![0].message).toContain("PIA WATERBACK: Water OFF in Payao");
    expect(r.sms.would_send![1].message).toContain("Waray tubig ha Payao");
    expect(r.notified.find((n) => n.barangay_id === "payao")!.sms_recipients).toBe(2);
  });
  it("SMS_LIVE=true: one Semaphore request per distinct text, form-encoded, key never echoed", async () => {
    s.residents = [resident(1, "payao"), resident(2, "payao"), resident(3, "payao", "waray")];
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const f = vi.fn(async () => new Response("[]", { status: 200 }));
    const r = await notifyResidents({ store: s, sms: { live: true, apiKey: "SECRETKEY", senderName: "PIA" }, fetch: f, now: NOW }, [note("payao", "sms")]);
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.semaphore.co/api/v4/messages");
    const body = init.body as URLSearchParams;
    expect(body.get("apikey")).toBe("SECRETKEY");
    expect(body.get("sendername")).toBe("PIA");
    expect(body.get("number")).toBe("639171000001,639171000002");
    expect(r.sms).toMatchObject({ mode: "live", sent: 3, failed: 0 });
    expect(JSON.stringify(r)).not.toContain("SECRETKEY");
  });
  it("live without key or with HTTP failure: reported, events still written, no throw", async () => {
    s.residents = [resident(1, "payao")];
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const r1 = await notifyResidents({ store: s, sms: { live: true }, now: NOW }, [note("payao", "sms")]);
    expect(r1.sms).toMatchObject({ failed: 1 });
    const f = vi.fn(async () => new Response("no", { status: 500 }));
    const r2 = await notifyResidents({ store: s, sms: { live: true, apiKey: "k" }, fetch: f, now: NOW }, [note("payao", "sms")]);
    expect(r2.sms).toMatchObject({ sent: 0, failed: 1 });
    expect(s.evs("notified")).toHaveLength(2);
  });
  it("latency: seed-scale run (26 barangays, 500 sms residents) with a 150 ms mocked Semaphore is far under 10 s", async () => {
    const ids = Array.from({ length: 26 }, (_, i) => `b${i}`);
    for (const id of ids) s.barangays.push({ barangay_id: id, name: id, wsp_name: null, service_level: "level_iii" });
    s.residents = ids.flatMap((id, i) => Array.from({ length: 20 }, (_, j) => resident(i * 20 + j + 1, id, (["english", "filipino", "waray"] as const)[j % 3])));
    await confirmAllocation(s, ids.map((id, i) => dec(id, i + 1)), NOW);
    const f = vi.fn(async () => { await new Promise((r) => setTimeout(r, 150)); return new Response("[]"); });
    const t0 = performance.now();
    const r = await notifyResidents({ store: s, sms: { live: true, apiKey: "k" }, fetch: f, now: NOW }, ids.map((id) => note(id, "sms")));
    const ms = performance.now() - t0;
    expect(r.sms.sent).toBe(520);
    expect(ms).toBeLessThan(2000); // real-network caveat: depends on Semaphore + Supabase round trips, see README
  });
});

describe("resident-confirmation: AC3 / AC4", () => {
  it("needs a notified barangay (409), checks shape (400), barangay (422), disruption (404)", async () => {
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    expect(await code(recordConfirmation(s, conf("payao", true), NOW))).toMatchObject({ status: 409, code: "barangay_not_notified" });
    expect(await code(recordConfirmation(s, { ...conf("payao", true), restored: "yes" }, NOW))).toMatchObject({ status: 400 });
    expect(await code(recordConfirmation(s, { ...conf("payao", true), channel: "email" }, NOW))).toMatchObject({ status: 400 });
    expect(await code(recordConfirmation(s, conf("nowhere", true), NOW))).toMatchObject({ status: 422 });
    expect(await code(recordConfirmation(s, { ...conf("payao", true), disruption_id: "9a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41" }, NOW))).toMatchObject({ status: 404 });
  });
  it("AC3: only restored=true resolves; single notified barangay -> resolved with a resolved event", async () => {
    await toNotified("payao");
    const r = await recordConfirmation(s, conf("payao", true), T(5));
    expect(r).toMatchObject({ result: "recorded", resolved: true, disruption_status: "resolved", reopen: false });
    expect(s.status).toBe("resolved");
    expect(s.disruptions.get(D1)!.resolved_at).toBe(iso(T(5)));
    expect(s.events.map((e) => e.event_type)).toEqual(["deployed", "notified", "resident_confirmed", "resolved"]);
    expect(s.evs("resolved")[0].barangay_id).toBeNull();
    expect(s.evs("resident_confirmed")[0]).toMatchObject({ barangay_id: "payao", actor: "resident" });
    expect(s.evs("resident_confirmed")[0].payload_json).toMatchObject({ restored: true, reopen: false });
  });
  it("AC3: with two notified barangays, one restored does NOT resolve; both do", async () => {
    await toNotified("payao", "maulong");
    const a = await recordConfirmation(s, conf("payao", true), T(1));
    expect(a).toMatchObject({ resolved: false, pending_barangays: ["maulong"] });
    expect(s.status).toBe("notified");
    expect(s.evs("resolved")).toHaveLength(0);
    const b = await recordConfirmation(s, conf("maulong", true, { confirmed_by: "barangay_captain" }), T(2));
    expect(b.resolved).toBe(true);
    expect(s.evs("resolved")).toHaveLength(1);
  });
  it("AC4: restored=false never writes resolved, flags reopen, puts disruption back to deployed", async () => {
    await toNotified("payao");
    const r = await recordConfirmation(s, conf("payao", false), T(1));
    expect(r).toMatchObject({ reopen: true, resolved: false, disruption_status: "deployed" });
    expect(s.evs("resolved")).toHaveLength(0);
    expect(s.evs("resident_confirmed")[0].payload_json).toMatchObject({ restored: false, reopen: true });
    expect(s.status).toBe("deployed");
    expect(s.disruptions.get(D1)!.resolved_at).toBeNull();
  });
  it("AC4 loop: not restored -> re-allocate -> re-notify -> restored resolves; a later 'no' un-restores", async () => {
    await toNotified("payao", "maulong");
    await recordConfirmation(s, conf("payao", true), T(1));
    await recordConfirmation(s, conf("maulong", false), T(2));
    expect(s.status).toBe("deployed");
    await confirmAllocation(s, [dec("maulong", 1)], T(3));
    await notifyResidents({ store: s, sms: DRY, now: T(4) }, [note("maulong", "pwa_push", { sent_at: iso(T(4)) })]);
    expect(s.status).toBe("notified");
    expect(barangayStates(await s.listEvents(D1)).get("maulong")).toEqual({ restored: false, reopen: false });
    const r = await recordConfirmation(s, conf("maulong", true), T(5));
    expect(r.resolved).toBe(true);
  });
  it("a 'no' after a 'yes' from the same barangay un-restores it (latest wins)", async () => {
    await toNotified("payao", "maulong");
    await recordConfirmation(s, conf("payao", true), T(1));
    await recordConfirmation(s, conf("payao", false, { confirmed_by: "barangay_captain" }), T(2));
    const r = await recordConfirmation(s, conf("maulong", true), T(3));
    expect(r.resolved).toBe(false);
    expect(r.pending_barangays).toEqual(["payao"]);
  });
  it("resolved disruption: restored=false is 409; restored=true is logged, no second resolved", async () => {
    await toNotified("payao");
    await recordConfirmation(s, conf("payao", true), T(1));
    expect(await code(recordConfirmation(s, conf("payao", false), T(2)))).toMatchObject({ status: 409, code: "disruption_resolved" });
    const r = await recordConfirmation(s, conf("payao", true), T(3));
    expect(r.result).toBe("recorded");
    expect(s.evs("resolved")).toHaveLength(1);
  });
  it("idempotent on client_local_id, even after the disruption moved on", async () => {
    await toNotified("payao");
    const a = await recordConfirmation(s, conf("payao", false, { client_local_id: "L1" }), T(1));
    const b = await recordConfirmation(s, conf("payao", false, { client_local_id: "L1" }), T(2));
    expect(a.result).toBe("recorded");
    expect(b.result).toBe("already_synced");
    expect(s.evs("resident_confirmed")).toHaveLength(1);
    await confirmAllocation(s, [dec("payao", 1)], T(3));
    await notifyResidents({ store: s, sms: DRY, now: T(4) }, [note("payao")]);
    await recordConfirmation(s, conf("payao", true, { client_local_id: "L2" }), T(5)); // resolves
    const c = await recordConfirmation(s, conf("payao", false, { client_local_id: "L1" }), T(6)); // replay after resolve: not a 409
    expect(c.result).toBe("already_synced");
  });
  it("future client timestamps are capped at server now; ordering uses server receive time", async () => {
    await toNotified("payao");
    await recordConfirmation(s, conf("payao", true, { confirmed_at: iso(T(9999)) }), T(1));
    expect(s.evs("resident_confirmed")[0].occurred_at).toBe(iso(T(1)));
  });
});

describe("sync-queue", () => {
  const rid = (n: number) => `1b2c3d4e-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const reading = (n: number, at: Date, extra: object = {}) => ({
    local_id: rid(n), kind: "reading", queued_at: iso(at), synced: false,
    payload: { intake_id: "kulador", turbidity_ntu: 120, plant_status: "normal", reservoir_pct: 70, clarifier_inflow_lps: 40, treated_turbidity_ntu: 3.2, recorded_at: iso(at), ...extra },
  });
  it("processes in queued_at order and maps the reading row", async () => {
    const r = await syncQueue(s, [reading(2, T(2)), reading(1, T(1)), reading(3, T(3))], NOW);
    expect(r.results.map((x) => x.local_id)).toEqual([rid(1), rid(2), rid(3)]);
    expect(s.readings.map((x) => x.client_local_id)).toEqual([rid(1), rid(2), rid(3)]);
    expect(s.readings[0]).toMatchObject({ source: "operator", is_simulated: false, treated_turbidity_ntu: 3.2, intake_id: "kulador" });
    expect(r.summary).toEqual({ synced: 3, already_synced: 0, rejected: 0, failed: 0 });
  });
  it("duplicate local_id: already_synced, not an error (same batch and replay)", async () => {
    await syncQueue(s, [reading(1, T(1))], NOW);
    const r = await syncQueue(s, [reading(1, T(1)), reading(2, T(2))], NOW);
    expect(r.results.map((x) => x.status)).toEqual(["already_synced", "synced"]);
    expect(s.readings).toHaveLength(2);
  });
  it("per-item rejection does not block others; null treated turbidity ok; payload errors are rejected", async () => {
    const r = await syncQueue(s, [
      { local_id: "nope", kind: "reading", queued_at: iso(T(1)), payload: {} },
      reading(2, T(2), { turbidity_ntu: -5 }),
      reading(3, T(3), { treated_turbidity_ntu: null, intake_id: "masacpasac", reservoir_pct: null, clarifier_inflow_lps: null }),
    ], NOW);
    expect(r.results.map((x) => x.status).sort()).toEqual(["rejected", "rejected", "synced"]);
    expect(r.results.find((x) => x.code === "invalid_payload")).toBeTruthy();
    expect(s.readings).toHaveLength(1);
  });
  it("transient DB error -> failed (retry), not rejected", async () => {
    s.failReadings = true;
    const r = await syncQueue(s, [reading(1, T(1))], NOW);
    expect(r.results[0]).toMatchObject({ status: "failed" });
  });
  it("resident_confirmation items delegate to the confirmation logic (AC3/4 apply), keyed by local_id", async () => {
    await toNotified("payao");
    const item = (n: number, restored: boolean, at: Date) => ({ local_id: rid(n), kind: "resident_confirmation", queued_at: iso(at), payload: { ...conf("payao", restored), channel: "pwa" } });
    const r = await syncQueue(s, [item(1, false, T(1)), item(1, false, T(1))], NOW);
    expect(r.results.map((x) => x.status)).toEqual(["synced", "already_synced"]);
    expect(s.evs("resolved")).toHaveLength(0);
    expect(s.evs("resident_confirmed")[0].client_local_id).toBe(rid(1));
    const bad = await syncQueue(s, [{ ...item(2, true, T(2)), payload: { nonsense: true } }, { ...item(3, true, T(3)), payload: conf("maulong", true) }], NOW);
    expect(bad.results.map((x) => [x.status, x.code])).toEqual([["rejected", "invalid_request"], ["rejected", "barangay_not_notified"]]);
  });
  it("400 for non-array / empty / oversized body", async () => {
    expect(await code(syncQueue(s, {}, NOW))).toMatchObject({ status: 400 });
    expect(await code(syncQueue(s, [], NOW))).toMatchObject({ status: 400 });
    expect(await code(syncQueue(s, Array(201).fill({}), NOW))).toMatchObject({ status: 400 });
  });
});

describe("sms-webhook", () => {
  const deps = (f = vi.fn()) => ({ store: s, sms: DRY, fetch: f, now: NOW });
  beforeEach(() => { s.residents = [resident(1, "payao", "english")]; });
  it("STATUS: flowing when no active interruption; unregistered number gets a sign-up hint", async () => {
    const a = await handleInbound(deps(), { from: "09171000001", text: "status" });
    expect(a).toMatchObject({ keyword: "STATUS", handled: true });
    expect(a.reply).toContain("Water is flowing in Payao");
    const b = await handleInbound(deps(), { from: "09179999999", text: "STATUS" });
    expect(b.reply).toContain("not registered");
  });
  it("STATUS during an interruption in the resident's barangay returns the notification text; never sends in dry-run", async () => {
    await toNotified("payao");
    const f = vi.fn();
    const a = await handleInbound(deps(f), { from: "+639171000001", text: "STATUS please" });
    expect(a.reply).toContain("Water OFF in Payao");
    expect(f).not.toHaveBeenCalled();
    expect(a.sms.mode).toBe("dry_run");
  });
  it("THANKS records restored=true via sms_reply (idempotent on message id) and can resolve", async () => {
    await toNotified("payao");
    const a = await handleInbound(deps(), { from: "09171000001", text: "THANKS", id: "m1" });
    expect(a.reply).toContain("Thank you");
    expect(s.evs("resident_confirmed")[0]).toMatchObject({ actor: "resident", client_local_id: "sms:m1" });
    expect(s.evs("resident_confirmed")[0].payload_json).toMatchObject({ channel: "sms_reply", restored: true });
    expect(s.status).toBe("resolved");
    await handleInbound(deps(), { from: "09171000001", text: "THANKS", id: "m1" }); // gateway retry
    expect(s.evs("resident_confirmed")).toHaveLength(1);
  });
  it("THANKS with nothing to confirm -> polite no-active reply, no event", async () => {
    const a = await handleInbound(deps(), { from: "09171000001", text: "THANKS" });
    expect(a.reply).toContain("No water interruption to confirm");
    expect(s.evs("resident_confirmed")).toHaveLength(0);
  });
  it("other keywords: documented not-in-demo reply; unknown text: help; bad phone: 400", async () => {
    for (const k of ["JOIN ABC123", "SRC", "STORED", "OPEN 40", "OUT", "CLOSED"]) {
      const r = await handleInbound(deps(), { from: "09171000001", text: k });
      expect(r.handled).toBe(false);
      expect(r.reply).toContain("not available in this demo");
    }
    expect((await handleInbound(deps(), { from: "09171000001", text: "hello" })).reply).toContain("Reply STATUS");
    expect(await code(handleInbound(deps(), { from: "12345", text: "STATUS" }))).toMatchObject({ status: 400 });
  });
  it("replies in the resident's language", async () => {
    s.residents = [resident(1, "payao", "waray")];
    expect((await handleInbound(deps(), { from: "09171000001", text: "STATUS" })).reply).toContain("May tubig ha Payao");
  });
  it("request parsing and shared-secret check", async () => {
    const form = new Request("http://x/f", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "number=09171000001&message=STATUS&id=7" });
    expect(await readInbound(form)).toEqual({ from: "09171000001", text: "STATUS", id: "7" });
    const js = new Request("http://x/f", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "0917", text: "THANKS" }) });
    expect(await readInbound(js)).toMatchObject({ text: "THANKS" });
    expect(await code(readInbound(new Request("http://x/f", { method: "POST", body: "x=1" })))).toMatchObject({ status: 400 });
    expect(extractInbound({})).toBeNull();
    expect(() => checkWebhookSecret("http://x/f?token=abc", "abc", true)).not.toThrow();
    expect(() => checkWebhookSecret("http://x/f?token=bad", "abc", false)).toThrow(HttpError);
    expect(() => checkWebhookSecret("http://x/f", undefined, true)).toThrow(HttpError);
    expect(() => checkWebhookSecret("http://x/f", undefined, false)).not.toThrow();
  });
});

describe("SMS: dry-run switch and phone handling", () => {
  it("SMS_LIVE must be exactly 'true'", () => {
    for (const v of [undefined, "", "TRUE", "1", "false", "yes"]) expect(smsConfigFromEnv((k) => (k === "SMS_LIVE" ? v : undefined)).live).toBe(false);
    expect(smsConfigFromEnv((k) => (k === "SMS_LIVE" ? "true" : undefined)).live).toBe(true);
  });
  it("dry-run never calls fetch even with an API key", async () => {
    const f = vi.fn();
    const r = await sendSms([{ number: "+639171234567", message: "hi" }], { live: false, apiKey: "k" }, f);
    expect(f).not.toHaveBeenCalled();
    expect(r.would_send![0].to).toBe("+*********567");
  });
  it("normalizePhone", () => {
    for (const p of ["09171234567", "639171234567", "+639171234567", "917 123 4567"]) expect(normalizePhone(p)).toBe("+639171234567");
    for (const p of ["12345", "0817123456", "+14155550123"]) expect(normalizePhone(p)).toBeNull();
  });
});

describe("SMS templates: one GSM-7 segment", () => {
  const langs: Lang[] = ["english", "filipino", "waray"];
  const keys = Object.keys(SMS_ROWS) as SmsKey[];
  it("every template, every language, worst-case values <= 160 and GSM-7, prefixed where Dev B's are", () => {
    for (const k of keys) for (const l of langs) {
      const out = fillSms(SMS_ROWS[k][l], WORST_CASE);
      expect(out.length, `${k}/${l} = ${out.length}`).toBeLessThanOrEqual(SMS_MAX);
      expect(isGsm7(out), `${k}/${l} gsm7`).toBe(true);
      expect(out).not.toMatch(/\{\w+\}/); // every placeholder has a worst-case value
      expect(out).not.toContain("₱");
    }
    for (const k of ["sms.water_off", "sms.water_back", "sms.partner_ask", "sms.water_off_no_store"] as SmsKey[])
      for (const l of langs) expect(SMS_ROWS[k][l].startsWith("PIA WATERBACK:")).toBe(true);
  });
  it("the first six rows are byte-identical to apps/web/src/copy/sms.ts when that file is present", () => {
    let web: string;
    try { web = readFileSync(new URL("../../../apps/web/src/copy/sms.ts", import.meta.url), "utf8"); } catch { return; }
    for (const k of ["sms.water_off", "sms.sources", "sms.stored", "sms.water_back", "sms.partner_ask", "sms.partner_thanks"] as SmsKey[])
      for (const l of langs) if (web.includes(`key: "${k}"`)) expect(web, `${k}/${l}`).toContain(SMS_ROWS[k][l]);
  });
  it("notification SMS with the real formatter fits for every served barangay name x language x cause x store advice", () => {
    const seed = readFileSync(new URL("../../seed/barangays.sql", import.meta.url), "utf8");
    const rows = [...seed.matchAll(/^\s*\('([^']+)', '((?:[^']|'')+)', (null|'(?:[^']|'')+'),/gm)].map((m) => ({ id: m[1], name: m[2].replace(/''/g, "'"), wsp_name: m[3] === "null" ? null : m[3].slice(1, -1) }));
    expect(rows.length).toBe(57);
    const d = { started_at: "2026-10-06T03:59:00Z", window_start: "2026-10-06T03:30:00Z", window_end: "2026-10-06T16:29:00Z", likely_at: "2026-10-06T04:59:00Z" };
    const longestSource = "Bayani Refilling Station of Samar Region";
    let worst = 0;
    for (const b of rows) for (const l of langs) for (const cause of ["turbidity", "drought", "repair"] as const) for (const adv of [true, false]) {
      const m = buildNotifySms({ cause, store_water_advice: adv, nearest_source_name: longestSource, sent_at: "x" }, d, b, l);
      worst = Math.max(worst, m.length);
      expect(m.length, `${b.id}/${l}/${cause}/${adv}: ${m}`).toBeLessThanOrEqual(SMS_MAX);
      expect(isGsm7(m)).toBe(true);
    }
    expect(worst).toBeGreaterThan(100);
    // fallbacks when the disruption has no window yet
    const m = buildNotifySms({ cause: "turbidity", store_water_advice: true, nearest_source_name: "x", sent_at: "x" }, { started_at: "bad", window_start: null, window_end: null, likely_at: null }, rows[0], "filipino");
    expect(m.length).toBeLessThanOrEqual(SMS_MAX);
  });
  it("formatting helpers (Asia/Manila) and GSM-7 sanitising", () => {
    expect(fmtClock("2026-10-06T03:45:00Z")).toBe("11:45AM");
    expect(fmtClock("2026-10-06T16:05:00Z")).toBe("12:05AM");
    expect(fmtClock("2026-10-06T04:00:00Z")).toBe("12:00PM");
    expect(fmtWindow("2026-10-06T03:00:00Z", "2026-10-06T06:00:00Z")).toBe("11AM-2PM");
    expect(fmtWindow(null, null)).toBe("later today");
    expect(smsBarangayName({ name: "Poblacion 5 (Barangay 5)", wsp_name: null })).toBe("Poblacion 5");
    expect(smsBarangayName({ name: "Guindaponan", wsp_name: "Guindapunan" })).toBe("Guindapunan");
    expect(toGsm7("Price ₱25 “ok” Cañete")).toBe("Price ?25 ?ok? Cañete");
    expect(CAUSE_TEXT.turbidity.english.length).toBeLessThanOrEqual(WORST_CASE.cause.length);
  });
});

describe("http wrapper", () => {
  const run = (req: Request, fn: () => Promise<unknown>) => serve(req, "t", fn);
  it("CORS preflight, 405, bad JSON 400, HttpError mapping, 500 hides details", async () => {
    const o = await run(new Request("http://x", { method: "OPTIONS" }), async () => 1);
    expect(o.status).toBe(204);
    expect(o.headers.get("access-control-allow-headers")).toContain("apikey");
    expect((await run(new Request("http://x"), async () => 1)).status).toBe(405);
    const bad = await run(new Request("http://x", { method: "POST", body: "{" }), async () => 1);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("access-control-allow-origin")).toBe("*");
    const e = await run(new Request("http://x", { method: "POST", body: "{}" }), async () => { throw new HttpError(409, "c", "m"); });
    expect(e.status).toBe(409);
    expect(await e.json()).toMatchObject({ code: "c", error: "m" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const x = await run(new Request("http://x", { method: "POST", body: "{}" }), async () => { throw new Error("secret detail"); });
    spy.mockRestore();
    expect(x.status).toBe(500);
    expect(JSON.stringify(await x.json())).not.toContain("secret");
  });
  it("validation errors surface as 400 with issue paths", async () => {
    const r = await serve(new Request("http://x", { method: "POST", body: JSON.stringify([{ disruption_id: "bad" }]) }), "t", (b) => confirmAllocation(s, b, NOW));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.code).toBe("invalid_request");
    expect(j.details[0].path).toContain("disruption_id");
  });
});
