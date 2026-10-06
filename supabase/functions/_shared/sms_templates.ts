// SMS copy for notify-residents and sms-webhook.
// COPY of apps/web/src/copy/sms.ts (Dev B, spec 08) — Edge Functions cannot import from apps/web, so when Dev B
// edits a template there, mirror it here. Rules: one plain GSM-7 segment (<= 160 chars with worst-case values),
// no peso sign (write "P25"), prefix "PIA WATERBACK:", end with the next reply keyword.
// Rows marked BACKEND-ADDED do not exist in Dev B's file (see supabase/functions/README.md); Filipino and Waray
// there are drafts like Dev B's own — REVIEW with a native speaker before the demo.

export type Lang = "english" | "filipino" | "waray";
export type SmsKey =
  | "sms.water_off" | "sms.sources" | "sms.stored" | "sms.water_back" | "sms.partner_ask" | "sms.partner_thanks"
  | "sms.water_off_no_store" | "sms.status_flowing" | "sms.thanks_ack" | "sms.not_registered" | "sms.not_in_demo"
  | "sms.help" | "sms.no_active" | "sms.heads_up_store_water" | "sms.heads_up_unserved";

type Row = Record<Lang, string>;

export const SMS_ROWS: Record<SmsKey, Row> = {
  "sms.water_off": {
    english: "PIA WATERBACK: Water OFF in {barangay} since {since}. {cause}. Back {window}, likely {likely}. Store {litres}L now. Reply SRC for backup water.",
    filipino: "PIA WATERBACK: Walang tubig sa {barangay} mula {since}. {cause}. Babalik {window}, malamang {likely}. Mag-ipon ng {litres}L. Reply SRC sa reserba.",
    waray: "PIA WATERBACK: Waray tubig ha {barangay} tikang {since}. {cause}. Mabalik {window}, posible {likely}. Pag-ipon {litres}L. Reply SRC para reserba.",
  },
  "sms.sources": {
    english: "Backup near {barangay}: {list}. Reply STORED when you have {litres}L.",
    filipino: "Reserba malapit sa {barangay}: {list}. Reply STORED pag may {litres}L ka na.",
    waray: "Reserba hirani ha {barangay}: {list}. Reply STORED kun may {litres}L ka na.",
  },
  "sms.stored": {
    english: "Good. Your household is set for 24h. Next update by {time}, even if nothing changes. Reply STATUS anytime.",
    filipino: "Ayos. Handa ang pamilya mo para sa 24 oras. Susunod na update bago {time}, kahit walang pagbabago. Reply STATUS kahit kailan.",
    waray: "Maupay. Andam an imo pamilya para ha 24 oras. Sunod nga update antes {time}, bisan waray pagbag-o. Reply STATUS bisan san-o.",
  },
  "sms.water_back": {
    english: "PIA WATERBACK: Water BACK in {barangay} at {time}, {diff}. Run tap until clear before drinking. Reply THANKS to thank your captain {captain}.",
    filipino: "PIA WATERBACK: May tubig na sa {barangay} {time}, {diff}. Padaluyin hanggang luminaw bago inumin. Reply THANKS para kay {captain}.",
    waray: "PIA WATERBACK: May tubig na ha {barangay} {time}, {diff}. Pabay-i magawas tubtob tumin-aw antes imnon. Reply THANKS para kan {captain}.",
  },
  "sms.partner_ask": {
    english: "PIA WATERBACK: {barangays} have no piped water until about {time}. Are you open with stock? Reply OPEN and gallons (e.g. OPEN 40) or CLOSED.",
    filipino: "PIA WATERBACK: Walang tubig sa {barangays} hanggang {time}. Bukas ka ba at may stock? Reply OPEN at galon (hal. OPEN 40) o CLOSED.",
    waray: "PIA WATERBACK: Waray tubig ha {barangays} tubtob {time}. Bukas ka ngan may stock? Reply OPEN ngan galon (pananglitan OPEN 40) o CLOSED.",
  },
  "sms.partner_thanks": {
    english: "Thanks, {partner}. You are now Plan {letter} for {n} households in {barangay}. Reply OUT when stock runs low.",
    filipino: "Salamat, {partner}. Ikaw na ang Plan {letter} ng {n} pamilya sa {barangay}. Reply OUT pag paubos na ang stock.",
    waray: "Salamat, {partner}. Ikaw na an Plan {letter} han {n} nga pamilya ha {barangay}. Reply OUT kun nauubos na an stock.",
  },
  // --- BACKEND-ADDED ---
  "sms.water_off_no_store": { // notify with store_water_advice = false (no "Store NL" line)
    english: "PIA WATERBACK: Water OFF in {barangay} since {since}. {cause}. Back {window}, likely {likely}. Backup: {source}. Reply SRC.",
    filipino: "PIA WATERBACK: Walang tubig sa {barangay} mula {since}. {cause}. Babalik {window}, malamang {likely}. Reserba: {source}. Reply SRC.",
    waray: "PIA WATERBACK: Waray tubig ha {barangay} tikang {since}. {cause}. Mabalik {window}, posible {likely}. Reserba: {source}. Reply SRC.",
  },
  "sms.status_flowing": {
    english: "PIA WATERBACK: Water is flowing in {barangay}. No interruption right now. Reply SRC for backup water.",
    filipino: "PIA WATERBACK: May tubig sa {barangay}. Walang pagputol ngayon. Reply SRC para sa reserba.",
    waray: "PIA WATERBACK: May tubig ha {barangay}. Waray pagpatay yana. Reply SRC para reserba.",
  },
  "sms.thanks_ack": {
    english: "PIA WATERBACK: Thank you. We logged that water is back in {barangay}. Reply STATUS anytime.",
    filipino: "PIA WATERBACK: Salamat. Naitala naming may tubig na sa {barangay}. Reply STATUS kahit kailan.",
    waray: "PIA WATERBACK: Salamat. Natala namon nga may tubig na ha {barangay}. Reply STATUS bisan san-o.",
  },
  "sms.not_registered": {
    english: "PIA WATERBACK: This number is not registered. Open the PIA WaterBack app to sign up for alerts.",
    filipino: "PIA WATERBACK: Hindi rehistrado ang numerong ito. Buksan ang PIA WaterBack app para mag-sign up.",
    waray: "PIA WATERBACK: Diri rehistrado ini nga numero. Buksi an PIA WaterBack app para mag-sign up.",
  },
  "sms.not_in_demo": {
    english: "PIA WATERBACK: {keyword} is not available in this demo yet. Reply STATUS for water updates.",
    filipino: "PIA WATERBACK: Wala pa ang {keyword} sa demo na ito. Reply STATUS para sa update.",
    waray: "PIA WATERBACK: Waray pa an {keyword} hini nga demo. Reply STATUS para ha update.",
  },
  "sms.help": {
    english: "PIA WATERBACK: Reply STATUS for water news, SRC for backup water, THANKS when water is back.",
    filipino: "PIA WATERBACK: Reply STATUS para sa balita, SRC para sa reserba, THANKS kapag may tubig na.",
    waray: "PIA WATERBACK: Reply STATUS para balita, SRC para reserba, THANKS kun may tubig na.",
  },
  "sms.no_active": {
    english: "PIA WATERBACK: No water interruption to confirm in {barangay} right now. Reply STATUS for updates.",
    filipino: "PIA WATERBACK: Walang kailangang kumpirmahin sa {barangay} ngayon. Reply STATUS para sa update.",
    waray: "PIA WATERBACK: Waray pagtugot nga kumpirmaron ha {barangay} yana. Reply STATUS para ha update.",
  },
  // Automatic heads-up (BEFORE any allocation): sent by disruption-monitor, see _shared/heads_up.ts. Filipino/Waray = DRAFTS, native review needed.
  "sms.heads_up_store_water": { // served barangays. {litres} = 60 (4 people x 15 L per household)
    english: "PIA WATERBACK: Water may stop in {barangay} from {when}. {cause}. Store {litres}L per home (4 people x 15L). Reply SRC for backup water.",
    filipino: "PIA WATERBACK: Posibleng walang tubig sa {barangay} mula {when}. {cause}. Mag-ipon ng {litres}L kada bahay (4 tao x 15L). Reply SRC.",
    waray: "PIA WATERBACK: Basin waray tubig ha {barangay} tikang {when}. {cause}. Pag-ipon {litres}L kada balay (4 ka tawo x 15L). Reply SRC.",
  },
  "sms.heads_up_unserved": { // barangays outside the CWD network that still have registered residents
    english: "PIA WATERBACK: CWD outage expected from {when}. Refill stations near {barangay} may be busy. Store water if you can. Reply SRC.",
    filipino: "PIA WATERBACK: May inaasahang putol ng CWD mula {when}. Maaaring siksikan ang refill station sa {barangay}. Mag-ipon kung kaya. Reply SRC.",
    waray: "PIA WATERBACK: May kutob nga pagpatay han CWD tikang {when}. Basin damo tawo ha refill station ha {barangay}. Pag-ipon kon mahimo. Reply SRC.",
  },
};

export const CAUSE_TEXT: Record<"turbidity" | "drought" | "repair", Row> = {
  turbidity: { english: "River too muddy to treat", filipino: "Sobrang labo ng ilog", waray: "Sobra kalubog an salog" },
  drought: { english: "River too low", filipino: "Mababa ang ilog", waray: "Sobra kahubas an salog" },
  repair: { english: "Pipe repair", filipino: "Pag-aayos ng tubo", waray: "Pag-ayad han tubo" },
};

export const SMS_MAX = 160;
export const SMS_STORE_LITRES = 60; // storage plan default: 4 people x 15 L (apps/web mock STORAGE)

const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇ\n\rØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;
export const isGsm7 = (s: string) => GSM7.test(s);

export function fillSms(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Replace anything outside GSM-7 (smart quotes, accents we do not list...) so one stray char cannot force UCS-2 (70-char limit). */
export function toGsm7(s: string): string {
  if (isGsm7(s)) return s;
  return [...s].map((ch) => {
    if (isGsm7(ch)) return ch;
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return isGsm7(base) && base ? base : "?";
  }).join("");
}

export function renderSms(key: SmsKey, lang: Lang, vars: Record<string, string | number>): string {
  return toGsm7(fillSms(SMS_ROWS[key][lang], vars));
}

// ---- value formatting (Asia/Manila is UTC+8, no DST) ----
const MANILA_OFFSET_MS = 8 * 3_600_000;
function manila(iso: string): { h: number; m: number } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + MANILA_OFFSET_MS);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}
const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** "11:45AM" */
export function fmtClock(iso: string | null | undefined, fallback = "soon"): string {
  if (!iso) return fallback;
  const p = manila(iso);
  if (!p) return fallback;
  return `${h12(p.h)}:${String(p.m).padStart(2, "0")}${p.h < 12 ? "AM" : "PM"}`;
}
/** "2PM" (hour only, rounded to nearest hour, to keep the SMS short) */
export function fmtHour(iso: string): string | null {
  const p = manila(iso);
  if (!p) return null;
  const h = (p.h + (p.m >= 30 ? 1 : 0)) % 24;
  return `${h12(h)}${h < 12 ? "AM" : "PM"}`;
}
const WHEN_WORDS: Record<Lang, { today: string; tomorrow: string }> = {
  english: { today: "today", tomorrow: "tomorrow" }, filipino: { today: "ngayon", tomorrow: "bukas" }, waray: { today: "yana", tomorrow: "buwas" },
};
/**
 * Day + hour for a heads-up ("today 2PM", "tomorrow 2AM", "Sat 11AM"), relative to `ref` in Asia/Manila.
 * More than 6 days away -> weekday would be ambiguous, so it falls back to `fallback`.
 */
export function fmtWhen(iso: string | null | undefined, ref: string, fallback = "soon", lang: Lang = "english"): string {
  const w = WHEN_WORDS[lang]; // Filipino/Waray day words are DRAFTS (native review)
  if (!iso) return fallback;
  const t = Date.parse(iso), r = Date.parse(ref);
  const hour = fmtHour(iso);
  if (Number.isNaN(t) || Number.isNaN(r) || !hour) return fallback;
  const tr = t + 30 * 60_000; // same nearest-hour rounding as fmtHour, so "12AM" lands on the right day
  const day = (ms: number) => Math.floor((ms + MANILA_OFFSET_MS) / 86_400_000);
  const diff = day(tr) - day(r);
  if (diff <= 0) return `${w.today} ${hour}`;
  if (diff === 1) return `${w.tomorrow} ${hour}`;
  if (diff > 6) return fallback;
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(tr + MANILA_OFFSET_MS).getUTCDay()]} ${hour}`;
}
/** "11AM-2PM"; falls back to `fallback` when the disruption has no window yet. */
export function fmtWindow(start: string | null | undefined, end: string | null | undefined, fallback = "later today"): string {
  if (!start || !end) return fallback;
  const a = fmtHour(start), b = fmtHour(end);
  return a && b ? `${a}-${b}` : fallback;
}

/** Short barangay name for SMS: WSP spelling if any, else official name without the "(Barangay 5)" style suffix. */
export function smsBarangayName(b: { name: string; wsp_name: string | null }): string {
  return (b.wsp_name ?? b.name).replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/** Worst-case values for the length test (same as apps/web/src/copy/sms.ts WORST_CASE, plus backend-added vars). */
export const WORST_CASE: Record<string, string> = {
  barangay: "Guinsorongan", barangays: "Guinsorongan and San Andres", since: "11:45AM", cause: "River too muddy to treat",
  window: "11AM-2PM", likely: "12:30PM", litres: "60",
  list: "A) Faucet, 6min, free. B) Bayani Refill, 9min, P25/20L. D) LGU truck 2PM",
  time: "10:00AM", diff: "25 min early", captain: "Liza", partner: "Bayani Refilling", letter: "B", n: "212",
  source: "Bayani Refilling 2", keyword: "OPEN", when: "tomorrow 11AM",
};
