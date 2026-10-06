// sms-webhook logic: residents reply to PIA WATERBACK texts with keywords (wireframe p.8, handoff item 6).
//   STATUS, THANKS  implemented.   JOIN <code>, SRC, STORED, OPEN <gallons>, OUT, CLOSED  -> "not in the demo" reply.
// Replies go out through Semaphore and are DRY-RUN unless SMS_LIVE === "true".
import { HttpError } from "./spec06_http.ts";
import { barangayStates, recordConfirmation } from "./confirmation.ts";
import { buildNotifySms } from "./notify.ts";
import type { FetchFn, SmsConfig, SmsReport } from "./sms_send.ts";
import { isDemoPhone, maskForOutbox, normalizePhone, sendSms } from "./sms_send.ts";
import type { Lang, SmsKey } from "./sms_templates.ts";
import { renderSms, smsBarangayName } from "./sms_templates.ts";
import type { NewSmsOutbox, Store } from "./spec06_store.ts";

export interface InboundSms { from: string; text: string; id?: string | null }
export interface InboundDeps { store: Store; sms: SmsConfig; fetch?: FetchFn; now: Date }
const BODY_MAX = 320; // inbound text is user-controlled and the outbox is world-readable: cap it

export const NOT_IMPLEMENTED = ["JOIN", "SRC", "STORED", "OPEN", "OUT", "CLOSED"] as const;

/** Semaphore / generic gateways differ in field names; accept the common ones. */
export function extractInbound(b: Record<string, unknown>): InboundSms | null {
  const pick = (...ks: string[]) => { for (const k of ks) if (typeof b[k] === "string" && (b[k] as string).trim()) return (b[k] as string).trim(); return null; };
  const from = pick("number", "sender", "from", "msisdn", "phone");
  const text = pick("message", "text", "content", "body");
  if (!from || text === null) return null;
  return { from, text, id: pick("message_id", "id", "messageId") };
}

export const parseKeyword = (text: string) => {
  const [first = "", ...rest] = text.trim().split(/\s+/);
  return { keyword: first.replace(/[^A-Za-z]/g, "").toUpperCase(), args: rest.join(" ") };
};

export async function handleInbound(deps: InboundDeps, msg: InboundSms) {
  const { store, now } = deps;
  const phone = normalizePhone(msg.from);
  if (!phone) throw new HttpError(400, "invalid_phone", "sender is not a Philippine mobile number");
  const { keyword } = parseKeyword(msg.text);
  const resident = await store.findResidentByPhone(phone);
  const lang: Lang = resident?.preferred_language ?? "english";
  const barangay = resident ? (await store.getBarangays([resident.barangay_id]))[0] ?? null : null;
  const bName = barangay ? smsBarangayName(barangay) : "your barangay";

  let key: SmsKey = "sms.help";
  let reply: string | null = null;
  let handled = false;
  let template: string | null = null;
  let disruptionId: string | null = null;

  if (keyword === "STATUS") {
    handled = true;
    if (!resident || !barangay) key = "sms.not_registered";
    else {
      const d = await store.getActiveDisruption();
      disruptionId = d?.id ?? null;
      const st = d ? barangayStates(await store.listEvents(d.id)).get(barangay.barangay_id) : undefined;
      if (d && st && !st.restored) {
        template = "sms.water_off";
        reply = buildNotifySms({ cause: d.cause, store_water_advice: true, nearest_source_name: "", expected_duration_hint: undefined, sent_at: now.toISOString() }, d, barangay, lang);
      } else key = "sms.status_flowing";
    }
  } else if (keyword === "THANKS") {
    handled = true;
    if (!resident || !barangay) key = "sms.not_registered";
    else {
      key = "sms.no_active";
      const d = await store.getActiveDisruption();
      disruptionId = d?.id ?? null;
      if (d) {
        try {
          await recordConfirmation(store, {
            disruption_id: d.id, barangay_id: barangay.barangay_id, confirmed_by: "resident", channel: "sms_reply",
            restored: true, confirmed_at: now.toISOString(), client_local_id: msg.id ? `sms:${msg.id}` : undefined,
          }, now);
          key = "sms.thanks_ack";
        } catch (e) {
          if (!(e instanceof HttpError) || e.status >= 500) throw e; // 409 barangay_not_notified -> "no active"
        }
      }
    }
  } else if ((NOT_IMPLEMENTED as readonly string[]).includes(keyword)) {
    key = "sms.not_in_demo";
  }
  if (reply === null) template = key;
  reply ??= renderSms(key, lang, { barangay: bName, keyword });
  const report: SmsReport = await sendSms([{ number: phone, message: reply }], deps.sms, deps.fetch);
  // Simulated handset log: the inbound text and the auto-reply (masked number only). Never fails the webhook.
  const base = {
    disruption_id: disruptionId, barangay_id: barangay?.barangay_id ?? null, resident_id: resident?.id ?? null,
    to_masked: maskForOutbox(phone), language: lang, mode: report.skipped_demo ? "dry_run" : report.mode,
  };
  const rows: NewSmsOutbox[] = [
    { ...base, template: null, body: msg.text.slice(0, BODY_MAX), direction: "inbound" },
    { ...base, template, body: reply, direction: "outbound" },
  ];
  try { await store.insertSmsOutbox(rows); } catch (e) { console.error("sms_outbox insert failed", (e as Error).message); }
  return { keyword: keyword || null, handled, implemented: handled, reply, sms: report };
}

/** Body can be JSON or form-encoded (Semaphore-style gateways post forms). */
export async function readInbound(req: Request): Promise<InboundSms> {
  let fields: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json();
      // some gateways wrap the message in an array
      fields = (Array.isArray(j) ? j[0] : j) ?? {};
    } else {
      fields = Object.fromEntries(new URLSearchParams(await req.text()));
    }
  } catch { throw new HttpError(400, "invalid_body", "could not read request body"); }
  const m = extractInbound(fields as Record<string, unknown>);
  if (!m) throw new HttpError(400, "invalid_request", "need a sender (number/from) and a message (message/text)");
  return m;
}

/**
 * The webhook is called by the SMS gateway without a Supabase JWT (deploy with --no-verify-jwt), so it is protected by a
 * shared secret in the URL: .../sms-webhook?token=<SMS_WEBHOOK_SECRET>. Required whenever SMS_LIVE === "true".
 */
export function checkWebhookSecret(url: string, secret: string | undefined, live: boolean): void {
  if (!secret) {
    if (live) throw new HttpError(401, "unauthorized", "SMS_WEBHOOK_SECRET must be set when SMS_LIVE=true");
    return; // dry-run dev: open, nothing is sent
  }
  if (new URL(url).searchParams.get("token") !== secret) throw new HttpError(401, "unauthorized", "bad webhook token");
}

/**
 * Auth for one inbound request. `?demo=1` is accepted without a token ONLY when the sender is a seeded demo resident in the
 * fake +63900000000X block (the simulated handset); replies on that path are forced to dry-run, so no real SMS can leave.
 * Any other request needs the usual shared secret (mandatory when SMS_LIVE=true).
 */
export async function authorizeInbound(
  store: Store, url: string, msg: InboundSms, secret: string | undefined, live: boolean,
): Promise<{ demo: boolean }> {
  if (new URL(url).searchParams.get("demo") === "1") {
    const phone = normalizePhone(msg.from);
    if (phone && isDemoPhone(phone) && (await store.findResidentByPhone(phone))) return { demo: true };
  }
  checkWebhookSecret(url, secret, live);
  return { demo: false };
}
