// Automatic heads-up: the predictor drives PREVENTION. As soon as the monitor opens a predicted disruption (signal >= 2),
// or its signal rises to a new level, every barangay with residents hears "store water" BEFORE any LGU allocation.
// Channels: PWA = one per-barangay `predicted` event (payload.kind = 'heads_up'); SMS = existing sendSms + sms_outbox
// (dry-run unless SMS_LIVE === "true"; the fake demo block is never sent live).
// Idempotent per (disruption, barangay, level): the event row IS the dedupe record.
import type { DisruptionRow } from "./disruption_monitor.ts";
import { isDemoPhone, maskForOutbox, sendSms } from "./sms_send.ts";
import type { FetchFn, SmsConfig, SmsMessage } from "./sms_send.ts";
import { CAUSE_TEXT, SMS_STORE_LITRES, fmtWhen, renderSms, smsBarangayName } from "./sms_templates.ts";
import type { Lang, SmsKey } from "./sms_templates.ts";

/** Lowest signal that triggers a heads-up (same as the monitor's OPEN_AT_SIGNAL). Each level >= 2 is its own band. */
export const HEADS_UP_MIN_SIGNAL = 2;

export interface HeadsUpBarangay { barangay_id: string; name: string; wsp_name: string | null; service_level: "level_iii" | "level_i" | "unserved" }
export interface HeadsUpResident { id: string; barangay_id: string; phone: string | null; preferred_language: Lang; channel: "pwa" | "sms" }
export interface HeadsUpEvent {
  disruption_id: string; event_type: "predicted"; actor: string; occurred_at: string; barangay_id: string;
  payload_json: Record<string, unknown>;
}
export interface HeadsUpOutbox {
  disruption_id: string; barangay_id: string; resident_id: string; to_masked: string; template: string; language: Lang;
  body: string; direction: "outbound"; mode: "dry_run" | "live";
}
export interface HeadsUpStore {
  listBarangays(): Promise<HeadsUpBarangay[]>;
  /** Heads-ups already recorded for this disruption: (barangay, level). */
  listHeadsUps(disruptionId: string): Promise<{ barangay_id: string; level: number }[]>;
  /** All residents (any channel); phone may be null. */
  listResidents(): Promise<HeadsUpResident[]>;
  insertEvents(rows: HeadsUpEvent[]): Promise<void>;
  insertSmsOutbox(rows: HeadsUpOutbox[]): Promise<void>;
}
export interface HeadsUpDeps { store: HeadsUpStore; sms: SmsConfig; fetch?: FetchFn }

export interface HeadsUpResult {
  disruption_id: string | null;
  level: number | null;
  /** Barangays that got a NEW heads-up in this call (0 on a repeat). */
  barangays: number;
  sms_planned: number;
  /** Live mode only: demo-block numbers that were NOT sent. */
  sms_skipped_demo: number;
  mode: "dry_run" | "live";
  /** Why nothing was sent, when that is not just "already sent". */
  skipped?: string;
  error?: string;
}

/** The one SMS body for a resident. Exported for tests. */
export function buildHeadsUpSms(
  d: Pick<DisruptionRow, "cause" | "likely_at" | "heads_up_from" | "started_at">,
  b: Pick<HeadsUpBarangay, "name" | "wsp_name" | "service_level">, lang: Lang, ref: string,
): { key: SmsKey; body: string } {
  const key: SmsKey = b.service_level === "unserved" ? "sms.heads_up_unserved" : "sms.heads_up_store_water";
  const body = renderSms(key, lang, {
    barangay: smsBarangayName(b), cause: CAUSE_TEXT[d.cause][lang], litres: SMS_STORE_LITRES,
    when: fmtWhen(d.likely_at ?? d.heads_up_from, ref, "soon", lang),
  });
  return { key, body };
}

export async function sendHeadsUp(deps: HeadsUpDeps, d: DisruptionRow, asOf: Date): Promise<HeadsUpResult> {
  const mode: "dry_run" | "live" = deps.sms.live ? "live" : "dry_run";
  const none = (skipped?: string): HeadsUpResult => ({ disruption_id: d.id, level: d.signal_level, barangays: 0, sms_planned: 0, sms_skipped_demo: 0, mode, ...(skipped ? { skipped } : {}) });
  // After confirm the LGU is already acting and the allocation/notify path takes over; a per-barangay 'predicted'
  // row after a later lifecycle event would also be out of order.
  if (d.status !== "predicted") return none(`disruption is "${d.status}"; heads-up only while predicted`);
  if (d.signal_level < HEADS_UP_MIN_SIGNAL) return none(`signal ${d.signal_level} < ${HEADS_UP_MIN_SIGNAL}`);
  const level = d.signal_level;
  const { store } = deps;
  const [barangays, done, residents] = await Promise.all([store.listBarangays(), store.listHeadsUps(d.id), store.listResidents()]);
  const already = new Set(done.filter((h) => h.level === level).map((h) => h.barangay_id));
  const withResidents = new Set(residents.map((r) => r.barangay_id));
  // Served: always (PWA event even with no registered resident). Unserved: only where residents exist.
  const targets = barangays.filter((b) => !already.has(b.barangay_id) && (b.service_level !== "unserved" || withResidents.has(b.barangay_id)));
  if (!targets.length) return none();
  const byId = new Map(targets.map((b) => [b.barangay_id, b]));
  const ref = asOf.toISOString();

  const msgs: SmsMessage[] = [];
  const outbox: HeadsUpOutbox[] = [];
  const perBarangay = new Map<string, number>();
  for (const r of residents) {
    const b = byId.get(r.barangay_id);
    if (!b || r.channel !== "sms" || !r.phone) continue;
    const { key, body } = buildHeadsUpSms(d, b, r.preferred_language, ref);
    msgs.push({ number: r.phone, message: body });
    outbox.push({
      disruption_id: d.id, barangay_id: r.barangay_id, resident_id: r.id, to_masked: maskForOutbox(r.phone), template: key,
      language: r.preferred_language, body, direction: "outbound", mode: deps.sms.live && !isDemoPhone(r.phone) ? "live" : "dry_run",
    });
    perBarangay.set(r.barangay_id, (perBarangay.get(r.barangay_id) ?? 0) + 1);
  }

  // 1. The event first: it is the PWA delivery AND the dedupe record, so a slow carrier never delays or repeats it.
  await store.insertEvents(targets.map((b) => ({
    disruption_id: d.id, event_type: "predicted" as const, actor: "system", occurred_at: ref, barangay_id: b.barangay_id,
    payload_json: {
      kind: "heads_up", level, likely_at: d.likely_at, cause: d.cause, served: b.service_level !== "unserved",
      store_litres: SMS_STORE_LITRES, sms_recipients: perBarangay.get(b.barangay_id) ?? 0, mode,
    },
  })));
  // 2. SMS (dry-run by default) + simulated-handset rows. Never fails the heads-up.
  const report = await sendSms(msgs, deps.sms, deps.fetch);
  try { await store.insertSmsOutbox(outbox); } catch (e) { console.error("heads-up sms_outbox insert failed", (e as Error).message); }
  return { disruption_id: d.id, level, barangays: targets.length, sms_planned: report.planned, sms_skipped_demo: report.skipped_demo, mode: report.mode };
}
