// Simulated handset: sms_outbox logging, demo webhook path. All offline (FakeStore, no network).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmAllocation } from "../../functions/_shared/allocation.ts";
import { notifyResidents } from "../../functions/_shared/notify.ts";
import { authorizeInbound, handleInbound } from "../../functions/_shared/sms_inbound.ts";
import { isDemoPhone, maskForOutbox } from "../../functions/_shared/sms_send.ts";
import { SMS_MAX, isGsm7 } from "../../functions/_shared/sms_templates.ts";
import type { HttpError } from "../../functions/_shared/spec06_http.ts";
import { D1, FakeStore, resident } from "./fakeStore06.ts";

const NOW = new Date("2026-10-06T05:00:00Z");
const DRY = { live: false };
const note = (b: string, ch: "pwa_push" | "sms" = "sms") => ({
  disruption_id: D1, barangay_id: b, channel: ch, status: "interrupted", cause: "turbidity" as const,
  store_water_advice: true, nearest_source_name: "Bayani Refilling", sent_at: NOW.toISOString(),
});
const dec = (b: string, rank: number) => ({ disruption_id: D1, barangay_id: b, priority_rank: rank, officer_id: "mock-officer-1", overridden_from_suggested_rank: null });
const code = async (p: Promise<unknown>) => p.then(() => null, (e: HttpError) => ({ status: e.status, code: e.code }));
const demoRes = (n: number, barangay: string, lang: "waray" | "filipino" | "english" = "english") =>
  ({ ...resident(n, barangay, lang), phone: `+63900000000${n}` });

let s: FakeStore;
beforeEach(() => { s = new FakeStore(); });

describe("notify-residents -> sms_outbox", () => {
  it("dry-run: one outbound row per planned message, masked numbers only, fetch never called", async () => {
    s.residents = [demoRes(1, "payao", "waray"), resident(2, "payao", "english"), resident(3, "payao", "english", "pwa")];
    const f = vi.fn();
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const r = await notifyResidents({ store: s, sms: DRY, fetch: f, now: NOW }, [note("payao")]);
    expect(f).not.toHaveBeenCalled();
    expect(r.sms.planned).toBe(2);
    expect(s.outbox).toHaveLength(2);
    for (const o of s.outbox) {
      expect(o).toMatchObject({ direction: "outbound", mode: "dry_run", barangay_id: "payao", disruption_id: D1, template: "sms.water_off" });
      expect(o.to_masked).toMatch(/^\+63\d{3}•••\d{4}$/);
      expect(o.resident_id).toBeTruthy();
      expect(o.body.length).toBeLessThanOrEqual(SMS_MAX);
      expect(isGsm7(o.body)).toBe(true);
    }
    expect(s.outbox[0].to_masked).toBe("+63900•••0001");
    expect(s.outbox[0].language).toBe("waray");
    expect(s.outbox[0].body).toContain("Waray tubig ha Payao");
    // no full number anywhere in what the anon key can read
    const blob = JSON.stringify(s.outbox);
    for (const r2 of s.residents) if (r2.phone) expect(blob).not.toContain(r2.phone);
  });
  it("live mode logs mode 'live'; no-store advice uses its own template key", async () => {
    s.residents = [resident(1, "payao")];
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    await notifyResidents({ store: s, sms: { live: true, apiKey: "k" }, fetch: f, now: NOW }, [{ ...note("payao"), store_water_advice: false }]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.outbox).toHaveLength(1);
    expect(s.outbox[0]).toMatchObject({ mode: "live", template: "sms.water_off_no_store" });
  });
  it("an outbox failure never fails the notify", async () => {
    s.residents = [resident(1, "payao")];
    s.insertSmsOutbox = async () => { throw new Error("table missing"); };
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await notifyResidents({ store: s, sms: DRY, now: NOW }, [note("payao")]);
    expect(r.status).toBe("notified");
    err.mockRestore();
  });
  it("pwa-only payloads write no outbox rows", async () => {
    s.residents = [resident(1, "payao")];
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    await notifyResidents({ store: s, sms: DRY, now: NOW }, [note("payao", "pwa_push")]);
    expect(s.outbox).toHaveLength(0);
  });
});

describe("sms-webhook -> sms_outbox and the demo path", () => {
  const deps = (f = vi.fn()) => ({ store: s, sms: DRY, fetch: f, now: NOW });
  beforeEach(() => { s.residents = [demoRes(1, "payao", "waray")]; });
  async function notified() {
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    await notifyResidents({ store: s, sms: DRY, now: NOW }, [note("payao")]);
    s.outbox.length = 0;
  }

  it("logs the inbound text and the auto-reply, masked", async () => {
    await notified();
    await handleInbound(deps(), { from: "+639000000001", text: "STATUS" });
    expect(s.outbox.map((o) => o.direction)).toEqual(["inbound", "outbound"]);
    expect(s.outbox[0]).toMatchObject({ body: "STATUS", template: null, barangay_id: "payao", mode: "dry_run", to_masked: "+63900•••0001" });
    expect(s.outbox[1]).toMatchObject({ template: "sms.water_off", language: "waray", disruption_id: D1 });
    expect(s.outbox[1].body).toContain("Waray tubig ha Payao");
    expect(JSON.stringify(s.outbox)).not.toContain("+639000000001");
  });
  it("THANKS confirms the barangay (restored=true) and logs the thank-you", async () => {
    await notified();
    const r = await handleInbound(deps(), { from: "+639000000001", text: "THANKS" });
    expect(s.evs("resident_confirmed")[0]).toMatchObject({ barangay_id: "payao", actor: "resident" });
    expect(s.evs("resident_confirmed")[0].payload_json).toMatchObject({ restored: true, channel: "sms_reply" });
    expect(s.status).toBe("resolved");
    expect(r.reply).toContain("Salamat");
    expect(s.outbox[1].template).toBe("sms.thanks_ack");
  });
  it("unregistered sender is logged without resident/barangay and a long text is capped", async () => {
    await handleInbound(deps(), { from: "09179999999", text: "x".repeat(1000) });
    expect(s.outbox[0].resident_id).toBeNull();
    expect(s.outbox[0].body).toHaveLength(320);
  });

  it("demo=1 is accepted only for a seeded demo resident in the fake block", async () => {
    const url = "http://x/sms-webhook?demo=1";
    expect(isDemoPhone("+639000000001")).toBe(true);
    expect(isDemoPhone("+639171000001")).toBe(false);
    expect(await authorizeInbound(s, url, { from: "+639000000001", text: "THANKS" }, "sekret", true)).toEqual({ demo: true });
    expect(await authorizeInbound(s, url, { from: "09000000001", text: "THANKS" }, "sekret", true)).toEqual({ demo: true }); // local format
  });
  it("demo=1 with a real (non-demo) number falls back to the token check", async () => {
    s.residents.push(resident(2, "payao")); // +639171000002, a real-looking resident
    const url = "http://x/sms-webhook?demo=1";
    expect(await code(authorizeInbound(s, url, { from: "+639171000002", text: "THANKS" }, "sekret", true))).toMatchObject({ status: 401 });
    expect(await code(authorizeInbound(s, url + "&token=bad", { from: "+639171000002", text: "THANKS" }, "sekret", true))).toMatchObject({ status: 401 });
    expect(await authorizeInbound(s, url + "&token=sekret", { from: "+639171000002", text: "THANKS" }, "sekret", true)).toEqual({ demo: false });
    // live and no secret configured: unchanged, 401
    expect(await code(authorizeInbound(s, url, { from: "+639171000002", text: "THANKS" }, undefined, true))).toMatchObject({ status: 401 });
  });
  it("demo=1 with a fake-block number that is NOT seeded is rejected when live", async () => {
    const url = "http://x/sms-webhook?demo=1";
    expect(await code(authorizeInbound(s, url, { from: "+639000000009", text: "THANKS" }, "sekret", true))).toMatchObject({ status: 401 });
  });
  it("without demo=1 even a demo number needs the token", async () => {
    expect(await code(authorizeInbound(s, "http://x/sms-webhook", { from: "+639000000001", text: "THANKS" }, "sekret", true))).toMatchObject({ status: 401 });
  });
  it("maskForOutbox keeps 6 + 4 chars only", () => {
    expect(maskForOutbox("+639171234567")).toBe("+63917•••4567");
  });
});

describe("SMS_LIVE=true never reaches the carrier for demo numbers", () => {
  const LIVE = { live: true, apiKey: "k" };
  it("notify-residents: demo recipient -> no fetch, skipped_demo counted, outbox mode dry_run; real number still sent", async () => {
    s.residents = [demoRes(1, "payao")];
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await confirmAllocation(s, [dec("payao", 1)], NOW);
    const r = await notifyResidents({ store: s, sms: LIVE, fetch: f, now: NOW }, [note("payao")]);
    expect(f).not.toHaveBeenCalled();
    expect(r.sms).toMatchObject({ mode: "live", planned: 1, sent: 0, failed: 0, skipped_demo: 1 });
    expect(s.outbox).toHaveLength(1);
    expect(s.outbox[0]).toMatchObject({ mode: "dry_run", direction: "outbound" });

    s.outbox.length = 0;
    s.residents = [demoRes(1, "payao"), resident(2, "payao")];
    const r2 = await notifyResidents({ store: s, sms: LIVE, fetch: f, now: NOW }, [note("payao")]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[][])[1] && ((f.mock.calls[0] as unknown[])[1] as RequestInit).body)).not.toContain("639000000001");
    expect(r2.sms).toMatchObject({ sent: 1, skipped_demo: 1 });
    expect(s.outbox.map((o) => o.mode).sort()).toEqual(["dry_run", "live"]);
  });
  it("sms-webhook auto-reply to a demo number is never sent live", async () => {
    s.residents = [demoRes(1, "payao")];
    const f = vi.fn();
    const r = await handleInbound({ store: s, sms: LIVE, fetch: f, now: NOW }, { from: "+639000000001", text: "STATUS" });
    expect(f).not.toHaveBeenCalled();
    expect(r.sms.skipped_demo).toBe(1);
    expect(s.outbox.every((o) => o.mode === "dry_run")).toBe(true);
  });
});
