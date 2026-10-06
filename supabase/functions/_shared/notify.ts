// notify-residents (spec 06). The `notified` event IS the PWA delivery: residents' PWAs read event_log through
// Realtime (Web Push is out of scope). SMS goes through Semaphore, dry-run unless SMS_LIVE === "true".
// Order for the 10 s acceptance criterion: validate -> write events + status (fast, one round trip each) -> SMS in
// parallel. The events are written BEFORE the SMS so a slow carrier never delays the PWA.
import { HttpError, clampToNow, parseOrThrow } from "./spec06_http.ts";
import { NotificationPayload, z } from "./spec06_schemas.ts";
import type { BarangayRow, DisruptionRow, ResidentRow, Store } from "./spec06_store.ts";
import { CAUSE_TEXT, SMS_STORE_LITRES, fmtClock, fmtWindow, renderSms, smsBarangayName } from "./sms_templates.ts";
import type { Lang } from "./sms_templates.ts";
import { sendSms } from "./sms_send.ts";
import type { FetchFn, SmsConfig, SmsMessage, SmsReport } from "./sms_send.ts";

export const MAX_PAYLOADS = 200;
const SOURCE_NAME_MAX = 18; // keeps the no-store variant inside one 160-char segment

/** Cut at a word boundary so a long station name never overflows the segment. */
export function shortSource(name: string): string {
  const n = name.trim();
  if (n.length <= SOURCE_NAME_MAX) return n;
  const cut = n.slice(0, SOURCE_NAME_MAX).replace(/\s+\S*$/, "").trim();
  return cut || n.slice(0, SOURCE_NAME_MAX);
}

/** The single SMS body for one resident. Exported for tests. */
export function buildNotifySms(
  p: Pick<NotificationPayload, "cause" | "store_water_advice" | "nearest_source_name" | "expected_duration_hint" | "sent_at">,
  disruption: Pick<DisruptionRow, "started_at" | "window_start" | "window_end" | "likely_at">,
  barangay: Pick<BarangayRow, "name" | "wsp_name">,
  lang: Lang,
): string {
  const vars = {
    barangay: smsBarangayName(barangay),
    since: fmtClock(disruption.started_at, "today"),
    cause: CAUSE_TEXT[p.cause][lang],
    window: fmtWindow(disruption.window_start, disruption.window_end),
    likely: fmtClock(disruption.likely_at, "later"),
    litres: SMS_STORE_LITRES,
    source: shortSource(p.nearest_source_name),
  };
  return renderSms(p.store_water_advice ? "sms.water_off" : "sms.water_off_no_store", lang, vars);
}

export interface NotifyDeps { store: Store; sms: SmsConfig; fetch?: FetchFn; now: Date }

export async function notifyResidents(deps: NotifyDeps, body: unknown) {
  const { store, now } = deps;
  const payloads = parseOrThrow(z.array(NotificationPayload).min(1).max(MAX_PAYLOADS), body);
  const disruptionId = payloads[0].disruption_id;
  if (payloads.some((p) => p.disruption_id !== disruptionId)) {
    throw new HttpError(400, "invalid_request", "all payloads must be for the same disruption_id");
  }
  const disruption = await store.getDisruption(disruptionId);
  if (!disruption) throw new HttpError(404, "disruption_not_found", `no disruption ${disruptionId}`);
  if (!["deployed", "notified"].includes(disruption.status)) {
    throw new HttpError(409, "allocation_not_confirmed", `disruption is "${disruption.status}"; confirm the allocation before notifying`);
  }

  // One entry per barangay; a barangay may appear once per channel.
  const byBarangay = new Map<string, NotificationPayload[]>();
  for (const p of payloads) byBarangay.set(p.barangay_id, [...(byBarangay.get(p.barangay_id) ?? []), p]);
  const ids = [...byBarangay.keys()];
  const barangays = new Map((await store.getBarangays(ids)).map((b) => [b.barangay_id, b]));
  const unknown = ids.filter((id) => !barangays.has(id));
  if (unknown.length) throw new HttpError(422, "unknown_barangay", "unknown barangay_id", unknown);

  const events = await store.listEvents(disruptionId);
  const allocated = new Set(events.filter((e) => e.event_type === "deployed" && e.payload_json?.step === "allocation").map((e) => e.barangay_id));
  const notAllocated = ids.filter((id) => !allocated.has(id));
  if (notAllocated.length) throw new HttpError(409, "barangay_not_allocated", "barangays without a confirmed allocation", notAllocated);

  // 1. PWA delivery = the `notified` event (also what the live dashboard and the resident screens subscribe to).
  const at = now.toISOString();
  await store.insertEvents(ids.map((id) => {
    const ps = byBarangay.get(id)!;
    const first = ps[0];
    return {
      disruption_id: disruptionId, event_type: "notified" as const, actor: "system",
      occurred_at: clampToNow(first.sent_at, now), barangay_id: id,
      payload_json: {
        channels: [...new Set(ps.map((p) => p.channel))],
        status: first.status, cause: first.cause,
        expected_duration_hint: first.expected_duration_hint ?? null,
        store_water_advice: ps.some((p) => p.store_water_advice),
        nearest_source_name: first.nearest_source_name, recorded_at: at,
      },
    };
  }));
  await store.setDisruptionStatus(disruptionId, "notified", ["deployed", "notified"]);

  // 2. SMS (only barangays with an sms-channel payload), residents who chose SMS.
  const smsBarangays = ids.filter((id) => byBarangay.get(id)!.some((p) => p.channel === "sms"));
  const residents = smsBarangays.length ? await store.getSmsResidents(smsBarangays) : [];
  const msgs: SmsMessage[] = [];
  const perBarangay = new Map<string, number>();
  for (const r of residents as ResidentRow[]) {
    if (!r.phone) continue;
    const p = byBarangay.get(r.barangay_id)!.find((x) => x.channel === "sms")!;
    msgs.push({ number: r.phone, message: buildNotifySms(p, disruption, barangays.get(r.barangay_id)!, r.preferred_language) });
    perBarangay.set(r.barangay_id, (perBarangay.get(r.barangay_id) ?? 0) + 1);
  }
  const sms: SmsReport = await sendSms(msgs, deps.sms, deps.fetch);
  return {
    disruption_id: disruptionId, status: "notified",
    notified: ids.map((id) => ({
      barangay_id: id, channels: [...new Set(byBarangay.get(id)!.map((p) => p.channel))],
      sms_recipients: perBarangay.get(id) ?? 0,
    })),
    sms,
  };
}
