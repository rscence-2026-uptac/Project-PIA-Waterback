// /demo/phone: a simulated feature phone for the stage demo. Shows the sms_outbox rows for one demo resident
// (Realtime) and lets the presenter "reply" through sms-webhook?demo=1. Not linked from the resident nav; reached
// from the demo clock control. FixedLanguage english: it is presenter chrome, the SMS bodies keep their own language.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isLive } from "../../api/client";
import { useCopy } from "../../copy/i18n";
import { DEMO_RESIDENTS, formatSmsTime, maskPhone, sendDemoReply, usePhoneInbox, type SmsRow } from "../../demo/phone";
import { Icon } from "../../ui/Icon";
import { Logo } from "../../ui/Logo";

const QUICK = ["THANKS", "STATUS", "SRC"] as const;
const LANGUAGE_LABEL = { waray: "Waray", filipino: "Filipino", english: "English" } as const;

export function PhoneScreen() {
  const { t } = useCopy();
  const [residentId, setResidentId] = useState(DEMO_RESIDENTS[0].id);
  const resident = DEMO_RESIDENTS.find((r) => r.id === residentId) ?? DEMO_RESIDENTS[0];
  const masked = maskPhone(resident.phone);
  const inbox = usePhoneInbox(masked);
  const live = isLive();

  return (
    <div className="min-h-dvh bg-mist px-4 pb-24 pt-5">
      <header className="mx-auto flex max-w-[380px] items-center justify-between gap-3">
        <Logo height={26} />
        <h1 className="text-[20px] leading-tight">{t("phone.title")}</h1>
      </header>

      <fieldset className="mx-auto mt-4 max-w-[380px]">
        <legend className="text-[14px] font-bold">{t("phone.sender")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-md bg-foam p-1.5">
          {DEMO_RESIDENTS.map((r) => (
            <label
              key={r.id}
              className={`press flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-sm px-2 py-1.5 text-center leading-tight ${residentId === r.id ? "bg-tide text-foam" : "bg-mist text-ink"}`}
            >
              <input type="radio" name="resident" value={r.id} checked={residentId === r.id} onChange={() => setResidentId(r.id)} className="sr-only" />
              <span className="text-[14px] font-bold">{r.barangay}</span>
              <span className="text-[12px] opacity-90">{LANGUAGE_LABEL[r.language]} · {maskPhone(r.phone)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {!live && (
        <p role="status" className="mx-auto mt-4 flex max-w-[380px] gap-2.5 rounded-lg bg-foam p-4 text-[15px]">
          <Icon name="wifiOff" size={22} className="mt-0.5 shrink-0" />
          {t("phone.needs_keys")}
        </p>
      )}

      <Handset resident={resident} rows={inbox.rows} live={live} connection={inbox.connection} onSent={inbox.reload} />
    </div>
  );
}

function Handset({ resident, rows, live, connection, onSent }: {
  resident: (typeof DEMO_RESIDENTS)[number];
  rows: SmsRow[];
  live: boolean;
  connection: "connecting" | "live" | "dropped";
  onSent: () => void;
}) {
  const { t } = useCopy();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [rows.length, resident.id]);

  async function send(message: string) {
    const body = message.trim();
    if (!body || busy || !live) return;
    setBusy(true);
    setError(null);
    try {
      await sendDemoReply(resident.phone, body);
      setText("");
      setTimeout(onSent, 700); // the reply also comes in through Realtime; this catches a missed INSERT
    } catch (e) {
      setError(t("phone.reply_failed", { error: e instanceof Error ? e.message : "error" }));
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };

  return (
    <div
      className="mx-auto mt-5 w-full max-w-[380px] rounded-[40px] bg-ink p-4 pb-5"
      style={{ boxShadow: "0 18px 36px -14px rgba(13, 46, 66, 0.55)" }}
      data-testid="demo-phone"
    >
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink-raised" aria-hidden="true" />

      <div className="rounded-lg bg-frost p-3 font-mono text-ink" style={{ boxShadow: "inset 0 2px 6px rgba(13, 46, 66, 0.25)" }}>
        <div className="flex items-center justify-between border-b border-haze pb-2 text-[12px] font-bold">
          <span>{resident.barangay.toUpperCase()}</span>
          <span className="flex items-center gap-1.5">
            {connection !== "live" && live && <span title={t("phone.realtime_off")}>{connection === "dropped" ? "OFFLINE" : "…"}</span>}
            <Icon name="bell" size={13} />
          </span>
        </div>

        <div className="mt-2 flex h-[360px] flex-col gap-2.5 overflow-y-auto pr-0.5" role="log" aria-live="polite" aria-label="SMS inbox">
          {rows.length === 0 && <p className="m-auto px-3 text-center text-[13px] text-ink-soft">{t("phone.inbox_empty")}</p>}
          {rows.map((row) => <Bubble key={row.id} row={row} />)}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-3" aria-label="Reply keypad">
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Quick replies">
          {QUICK.map((word) => (
            <button
              key={word}
              type="button"
              disabled={!live || busy}
              onClick={() => void send(word)}
              className="press min-h-11 rounded-sm bg-haze font-mono text-[14px] font-bold text-ink disabled:opacity-50"
            >
              {word}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!live}
            placeholder={t("phone.type")}
            aria-label={t("phone.type")}
            autoComplete="off"
            maxLength={160}
            className="h-11 min-w-0 flex-1 rounded-sm border-[1.5px] border-haze bg-foam px-3 font-mono text-[14px] disabled:opacity-60"
          />
          <button type="submit" disabled={!live || busy || text.trim() === ""} className="press min-h-11 rounded-sm bg-tide px-4 text-[14px] font-bold text-foam disabled:opacity-50">
            {busy ? t("phone.sending") : t("phone.send")}
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] font-bold text-coral">{error}</p>
      </form>
    </div>
  );
}

function Bubble({ row }: { row: SmsRow }) {
  const { t } = useCopy();
  const incoming = row.direction === "outbound"; // sent BY the backend: arrives on the phone
  const back = row.template === "sms.water_back";
  const tone = back ? "bg-tide text-foam" : incoming ? "bg-foam text-ink" : "bg-sky text-ink";
  return (
    <div className={`flex max-w-[88%] flex-col ${incoming ? "items-start self-start" : "items-end self-end"}`}>
      <p className={`whitespace-pre-wrap break-words rounded-md px-3 py-2 text-[13px] leading-snug ${tone}`}>{row.body}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-soft">
        <span>{formatSmsTime(row.created_at)}</span>
        {row.mode === "dry_run" ? (
          <span className="rounded-full bg-mist px-1.5 py-0.5 font-bold text-ink">{t("phone.dry_run")}</span>
        ) : (
          <span className="rounded-full bg-ink px-1.5 py-0.5 font-bold text-foam">{t("phone.live")}</span>
        )}
      </p>
    </div>
  );
}
