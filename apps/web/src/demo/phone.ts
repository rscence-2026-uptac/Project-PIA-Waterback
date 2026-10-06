// Demo handset data (README "SMS demo"): the four demo residents, the masked-number filter, the sms_outbox inbox
// (backfill latest 20 + Realtime INSERT) and the reply call to sms-webhook?demo=1. Nothing here sends a real SMS.
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { getClient, isLive } from "../api/client";
import { callFn } from "../api/http";

export interface DemoResident {
  id: string;
  barangay_id: string;
  barangay: string;
  language: "waray" | "filipino" | "english";
  phone: string; // fake placeholder block +63900000000X (sms-webhook ?demo=1 accepts only this block)
}

export const DEMO_RESIDENTS: DemoResident[] = [
  { id: "lagundi", barangay_id: "lagundi", barangay: "Lagundi", language: "waray", phone: "+639000000001" },
  { id: "payao", barangay_id: "payao", barangay: "Payao", language: "filipino", phone: "+639000000002" },
  { id: "darahuway-dako", barangay_id: "darahuway-dako", barangay: "Darahuway Dako", language: "english", phone: "+639000000003" },
  { id: "darahuway-guti", barangay_id: "darahuway-guti", barangay: "Darahuway Guti", language: "waray", phone: "+639000000004" },
];

/** "+639000000001" -> "+63900•••0001" (first 6 characters + last 4 digits; the full number is never exposed). */
export const maskPhone = (phone: string) => `${phone.slice(0, 6)}•••${phone.slice(-4)}`;

export interface SmsRow {
  id: string;
  to_masked: string;
  barangay_id: string | null;
  template: string | null;
  language: string | null;
  body: string;
  direction: "outbound" | "inbound";
  mode: "dry_run" | "live";
  created_at: string;
}

const toRow = (raw: Record<string, unknown>): SmsRow | null => {
  if (typeof raw.id !== "string" || typeof raw.body !== "string" || typeof raw.to_masked !== "string" || typeof raw.created_at !== "string") return null;
  return {
    id: raw.id,
    to_masked: raw.to_masked,
    barangay_id: typeof raw.barangay_id === "string" ? raw.barangay_id : null,
    template: typeof raw.template === "string" ? raw.template : null,
    language: typeof raw.language === "string" ? raw.language : null,
    body: raw.body,
    direction: raw.direction === "inbound" ? "inbound" : "outbound",
    mode: raw.mode === "live" ? "live" : "dry_run",
    created_at: raw.created_at,
  };
};

/** Oldest first, no repeats. */
export function mergeRows(current: SmsRow[], incoming: SmsRow[]): SmsRow[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export type InboxStatus = "off" | "loading" | "ready" | "error";
export type Connection = "connecting" | "live" | "dropped";

/** The inbox of one demo number: latest 20 rows, then every new INSERT for that masked number. */
export function usePhoneInbox(masked: string) {
  const [store, setStore] = useState<{ masked: string; rows: SmsRow[]; status: InboxStatus }>({ masked, rows: [], status: "loading" });
  const [connection, setConnection] = useState<{ masked: string; value: Connection }>({ masked, value: "connecting" });
  const [attempt, setAttempt] = useState(0);
  const live = isLive();

  useEffect(() => {
    const client = getClient();
    if (!client) return;
    let cancelled = false;

    client
      .from("sms_outbox")
      .select("id,to_masked,barangay_id,template,language,body,direction,mode,created_at")
      .eq("to_masked", masked)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setStore((s) => ({ masked, rows: s.masked === masked ? s.rows : [], status: "error" }));
        const rows = (data ?? []).map((r) => toRow(r as Record<string, unknown>)).filter((r): r is SmsRow => r !== null);
        setStore((s) => ({ masked, rows: mergeRows(s.masked === masked ? s.rows : [], rows), status: "ready" }));
      });

    const channel = client
      .channel(`phone-${masked}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sms_outbox" }, (payload) => {
        const row = toRow(payload.new as Record<string, unknown>);
        if (!row || row.to_masked !== masked || cancelled) return;
        setStore((s) => ({ masked, rows: mergeRows(s.masked === masked ? s.rows : [], [row]), status: "ready" }));
      })
      .subscribe((status) => {
        if (cancelled) return;
        setConnection({ masked, value: status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "dropped" : "connecting" });
      });

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [masked, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = store.masked === masked;
  return {
    rows: current ? store.rows : [],
    status: (!live ? "off" : current ? store.status : "loading") as InboxStatus,
    connection: (connection.masked === masked ? connection.value : "connecting") as Connection,
    reload,
  };
}

const WebhookReply = z.looseObject({ keyword: z.string().optional(), handled: z.boolean().optional(), reply: z.string().nullable().optional() });
export type WebhookReply = z.infer<typeof WebhookReply>;

/** The resident "types" on the phone: POST sms-webhook?demo=1 {from, message}. The auto-reply also arrives via sms_outbox. */
export const sendDemoReply = (from: string, message: string) =>
  callFn("sms-webhook", { method: "POST", query: { demo: 1 }, body: { from, message }, schema: WebhookReply });

const manilaTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true });
const manilaDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short" });

/** "21 Jul, 10:00 pm" in Asia/Manila. */
export const formatSmsTime = (iso: string) => `${manilaDay.format(new Date(iso))}, ${manilaTime.format(new Date(iso))}`;
