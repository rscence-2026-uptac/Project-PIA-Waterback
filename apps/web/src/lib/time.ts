// 12-hour times with AM/PM, the way the wireframes show them ("8:00 AM", "4–7 PM").
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "long" });

/** "8:00 AM" */
export function formatTime(date: Date | string): string {
  return timeFormat.format(new Date(date));
}

/** "4 PM", or "5:30 PM" when the minutes aren't zero. */
function shortTime(date: Date): { clock: string; period: string } {
  const [clock, period] = formatTime(date).split(" ");
  return { clock: clock.endsWith(":00") ? clock.slice(0, -3) : clock, period };
}

/** "4–7 PM", or "11 AM–2 PM" when the periods differ. */
export function formatWindow(start: Date | string, end: Date | string): string {
  const a = shortTime(new Date(start));
  const b = shortTime(new Date(end));
  return a.period === b.period
    ? `${a.clock}–${b.clock} ${b.period}`
    : `${a.clock} ${a.period}–${b.clock} ${b.period}`;
}

/** "5:24:10 PM", for live feeds where seconds matter. */
export function formatTimeSeconds(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(date));
}

/** "4 PM" / "5:30 PM" */
export function formatShortTime(date: Date | string): string {
  const { clock, period } = shortTime(new Date(date));
  return `${clock} ${period}`;
}

/** "Tuesday" */
export function formatDay(date: Date | string): string {
  return dayFormat.format(new Date(date));
}

/** "11 h 17 m", "2 h 05 m", or "45 min" under an hour. */
export function formatDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}

/** Whole minutes from a to b. */
export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/** "Tuesday 6 October" */
export function formatLongDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(date));
}

/**
 * Residents' date line: "Tuesday 6 October" / "Martes, Oktubre 6". Named day and month, never
 * numbers (elderly-friendly-ui rule 6). Waray has no Intl locale; its day and month names are the
 * same Spanish-derived words Filipino uses, so it borrows the Filipino format.
 */
export function formatResidentDate(date: Date, language: "waray" | "filipino" | "english"): string {
  const locale = language === "english" ? "en-GB" : "fil-PH";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** Today's date at hh:mm local time, as an ISO string. */
export function todayAt(hours: number, minutes = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** Now plus the given hours, rounded to the nearest half hour, as an ISO string. */
export function fromNow(hours: number): string {
  const half = 30 * 60_000;
  return new Date(Math.round((Date.now() + hours * 3_600_000) / half) * half).toISOString();
}

const manilaFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});
const manilaDayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "6 Oct, 2:15 pm" in Asia/Manila, whatever this device's time zone is. */
export function formatManila(date: Date | string): string {
  return manilaFormat.format(new Date(date));
}

/** "Tuesday, 6 October 2026" in Asia/Manila. */
export function formatManilaDay(date: Date | string): string {
  return manilaDayFormat.format(new Date(date));
}
