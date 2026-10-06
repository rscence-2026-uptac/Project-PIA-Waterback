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

/** "4 PM" / "5:30 PM" */
export function formatShortTime(date: Date | string): string {
  const { clock, period } = shortTime(new Date(date));
  return `${clock} ${period}`;
}

/** "Tuesday" */
export function formatDay(date: Date | string): string {
  return dayFormat.format(new Date(date));
}

/** Today's date at hh:mm local time, as an ISO string. */
export function todayAt(hours: number, minutes = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}
