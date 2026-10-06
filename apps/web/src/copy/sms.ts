// SPEC: 08 SmsTemplate table, feeding spec 06's notify step (wireframe p.8).
// Rules from the wireframe: one message, plain GSM-7 (write "P25", never the peso sign, which forces
// Unicode and cuts the limit to 70), and end with the next reply keyword.
// Dev A's notify / sms-webhook functions send these through Semaphore; the app never sends SMS.
// REVIEW: Filipino and Waray are drafts (see strings.ts).
import { SmsTemplate } from "../contracts/spec08";

type Lang = SmsTemplate["language"];
type Row = { key: string; english: string; filipino: string; waray: string };

const ROWS: Row[] = [
  {
    key: "sms.water_off",
    english: "PIA WATERBACK: Water OFF in {barangay} since {since}. {cause}. Back {window}, likely {likely}. Store {litres}L now. Reply SRC for backup water.",
    filipino: "PIA WATERBACK: Walang tubig sa {barangay} mula {since}. {cause}. Babalik {window}, malamang {likely}. Mag-ipon ng {litres}L. Reply SRC sa reserba.",
    waray: "PIA WATERBACK: Waray tubig ha {barangay} tikang {since}. {cause}. Mabalik {window}, posible {likely}. Pag-ipon {litres}L. Reply SRC para reserba.",
  },
  {
    key: "sms.sources",
    english: "Backup near {barangay}: {list}. Reply STORED when you have {litres}L.",
    filipino: "Reserba malapit sa {barangay}: {list}. Reply STORED pag may {litres}L ka na.",
    waray: "Reserba hirani ha {barangay}: {list}. Reply STORED kun may {litres}L ka na.",
  },
  {
    key: "sms.stored",
    english: "Good. Your household is set for 24h. Next update by {time}, even if nothing changes. Reply STATUS anytime.",
    filipino: "Ayos. Handa ang pamilya mo para sa 24 oras. Susunod na update bago {time}, kahit walang pagbabago. Reply STATUS kahit kailan.",
    waray: "Maupay. Andam an imo pamilya para ha 24 oras. Sunod nga update antes {time}, bisan waray pagbag-o. Reply STATUS bisan san-o.",
  },
  {
    key: "sms.water_back",
    english: "PIA WATERBACK: Water BACK in {barangay} at {time}, {diff}. Run tap until clear before drinking. Reply THANKS to thank your captain {captain}.",
    filipino: "PIA WATERBACK: May tubig na sa {barangay} {time}, {diff}. Padaluyin hanggang luminaw bago inumin. Reply THANKS para kay {captain}.",
    waray: "PIA WATERBACK: May tubig na ha {barangay} {time}, {diff}. Pabay-i magawas tubtob tumin-aw antes imnon. Reply THANKS para kan {captain}.",
  },
  {
    key: "sms.partner_ask",
    english: "PIA WATERBACK: {barangays} have no piped water until about {time}. Are you open with stock? Reply OPEN and gallons (e.g. OPEN 40) or CLOSED.",
    filipino: "PIA WATERBACK: Walang tubig sa {barangays} hanggang {time}. Bukas ka ba at may stock? Reply OPEN at galon (hal. OPEN 40) o CLOSED.",
    waray: "PIA WATERBACK: Waray tubig ha {barangays} tubtob {time}. Bukas ka ngan may stock? Reply OPEN ngan galon (pananglitan OPEN 40) o CLOSED.",
  },
  {
    key: "sms.partner_thanks",
    english: "Thanks, {partner}. You are now Plan {letter} for {n} households in {barangay}. Reply OUT when stock runs low.",
    filipino: "Salamat, {partner}. Ikaw na ang Plan {letter} ng {n} pamilya sa {barangay}. Reply OUT pag paubos na ang stock.",
    waray: "Salamat, {partner}. Ikaw na an Plan {letter} han {n} nga pamilya ha {barangay}. Reply OUT kun nauubos na an stock.",
  },
];

/** Longest realistic values, so the length check is a worst case, not the happy path. */
const WORST_CASE: Record<string, string> = {
  barangay: "Guinsorongan",
  barangays: "Guinsorongan and San Andres",
  since: "11:45AM",
  cause: "Water too turbid to treat",
  window: "11AM-2PM",
  likely: "12:30PM",
  litres: "60",
  list: "A) Faucet, 6min, free. B) Bayani Refill, 9min, P25/20L. D) LGU truck 2PM",
  time: "10:00AM",
  diff: "25 min early",
  captain: "Liza",
  partner: "Bayani Refilling",
  letter: "B",
  n: "212",
};

const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇ\n\rØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;

export function fillSms(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export const SMS_TEMPLATES: SmsTemplate[] = ROWS.flatMap((row) =>
  (["english", "filipino", "waray"] as Lang[]).map((language) =>
    SmsTemplate.parse({ key: row.key, template: row[language], max_length: 160, language }),
  ),
);

export interface SmsCheck {
  key: string;
  language: Lang;
  worstLength: number;
  fits: boolean;
  gsm7: boolean;
}

/** Spec 08: every template fits one 160-char GSM-7 segment, or is flagged before it ships. */
export function checkSmsTemplates(): SmsCheck[] {
  return SMS_TEMPLATES.map((tpl) => {
    const filled = fillSms(tpl.template, WORST_CASE);
    return {
      key: tpl.key,
      language: tpl.language,
      worstLength: filled.length,
      fits: filled.length <= tpl.max_length,
      gsm7: GSM7.test(filled),
    };
  });
}

if (import.meta.env.DEV) {
  const flagged = checkSmsTemplates().filter((c) => !c.fits || !c.gsm7);
  if (flagged.length > 0) console.warn("SMS templates over one GSM-7 segment (spec 08, flag before shipping):", flagged);
}
