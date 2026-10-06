// Semaphore SMS sender. DRY-RUN BY DEFAULT: nothing is sent (fetch is never called) unless SMS_LIVE === "true".
// That protects SMS credits and real residents' phones during development. Docs: https://semaphore.co/docs
export const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";

export interface SmsConfig { live: boolean; apiKey?: string; senderName?: string }
export interface SmsMessage { number: string; message: string } // number = E.164 "+639XXXXXXXXX"
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface SmsReport {
  mode: "dry_run" | "live";
  planned: number;
  sent: number;
  failed: number;
  /** Dry-run only: what would be sent, phone numbers masked (the response is readable with the anon key). */
  would_send?: { to: string; message: string }[];
  errors: string[];
}

export function smsConfigFromEnv(get: (k: string) => string | undefined): SmsConfig {
  return { live: get("SMS_LIVE") === "true", apiKey: get("SEMAPHORE_API_KEY"), senderName: get("SEMAPHORE_SENDER_NAME") };
}

export const maskPhone = (p: string) => p.replace(/\d(?=\d{3})/g, "*"); // keep the last 3 digits

/** "09171234567" | "639171234567" | "+639171234567" | "9171234567" -> "+639171234567", else null. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  const m = /^(?:63|0)?(9\d{9})$/.exec(d);
  return m ? `+63${m[1]}` : null;
}

const CHUNK = 100; // Semaphore allows up to 1000 numbers per call; stay well below

export async function sendSms(
  msgs: SmsMessage[], cfg: SmsConfig, doFetch: FetchFn = fetch as FetchFn, timeoutMs = 8000,
): Promise<SmsReport> {
  if (!cfg.live) {
    return {
      mode: "dry_run", planned: msgs.length, sent: 0, failed: 0, errors: [],
      would_send: msgs.map((m) => ({ to: maskPhone(m.number), message: m.message })),
    };
  }
  const report: SmsReport = { mode: "live", planned: msgs.length, sent: 0, failed: 0, errors: [] };
  if (!cfg.apiKey) {
    report.failed = msgs.length;
    report.errors.push("SEMAPHORE_API_KEY is not set");
    return report;
  }
  // One request per distinct text (numbers comma-joined), in parallel: keeps the whole notify well under 10 s.
  const byText = new Map<string, string[]>();
  for (const m of msgs) byText.set(m.message, [...(byText.get(m.message) ?? []), m.number.replace(/^\+/, "")]);
  const jobs: Promise<void>[] = [];
  for (const [message, numbers] of byText) {
    for (let i = 0; i < numbers.length; i += CHUNK) {
      const chunk = numbers.slice(i, i + CHUNK);
      jobs.push((async () => {
        const body = new URLSearchParams({ apikey: cfg.apiKey!, number: chunk.join(","), message });
        if (cfg.senderName) body.set("sendername", cfg.senderName);
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeoutMs);
        try {
          const res = await doFetch(SEMAPHORE_URL, {
            method: "POST", body, signal: ctl.signal,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
          if (!res.ok) throw new Error(`Semaphore HTTP ${res.status}`);
          report.sent += chunk.length;
        } catch (e) {
          report.failed += chunk.length;
          report.errors.push((e as Error).message); // never include the API key or numbers
        } finally { clearTimeout(timer); }
      })());
    }
  }
  await Promise.all(jobs);
  return report;
}
