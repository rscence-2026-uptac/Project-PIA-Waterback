// ONE `asOf` instant shared by every screen. It is passed as `as_of` to every Edge Function call and
// used as the end of every REST time window. It follows the real time (the demo clock is switched off).
import { createContext, useContext } from "react";

export const MANILA = "Asia/Manila";

export interface DemoClock {
  asOf: Date;
  /** Stable string for hook dependencies. */
  asOfKey: string;
  /** Always false while the demo clock is off (the time is never pinned to a replayed moment). */
  pinned: boolean;
}

const FALLBACK_NOW = new Date();
export const DemoClockContext = createContext<DemoClock>({
  asOf: FALLBACK_NOW,
  asOfKey: FALLBACK_NOW.toISOString(),
  pinned: false,
});

/** The shared "now". Outside a provider it is the time the module loaded, so components also work in isolation. */
export function useAsOf(): DemoClock {
  return useContext(DemoClockContext);
}

const manilaFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: MANILA, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

/** "21 Jul 2026, 10:00 pm" in Asia/Manila. */
export function formatManila(date: Date): string {
  return manilaFormat.format(date);
}
