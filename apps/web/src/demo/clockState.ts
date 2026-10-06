// Demo clock: ONE `asOf` instant shared by every screen. It is passed as `as_of` to every Edge
// Function call and used as the end of every REST time window, so the whole app can be replayed at
// a chosen moment of the seeded July 2026 data (docs/predictor.md).
//
// Sources of truth, first match wins:
//   1. URL   ?as_of=2026-07-21T22:00+08:00   or   ?scenario=late-july|event|crisis|now
//   2. the value remembered on this phone (localStorage, guarded)
//   3. the real current time
import { createContext, useContext } from "react";
import { readSetting, writeSetting } from "../lib/settings";

export const MANILA = "Asia/Manila";

export interface ClockPreset {
  id: "late-july" | "event" | "crisis";
  label: string;
  at: string; // ISO 8601 with offset
}

// Demo moments in the seeded July 2026 data (docs/predictor.md, scripts/demo/README.md).
export const PRESETS: ClockPreset[] = [
  { id: "late-july", label: "Late-July spell", at: "2026-07-19T18:00:00+08:00" },
  { id: "event", label: "Event", at: "2026-07-21T22:00:00+08:00" },
  { id: "crisis", label: "Crisis", at: "2026-07-02T06:00:00+08:00" },
];

export interface DemoClock {
  asOf: Date;
  /** Stable string for hook dependencies. */
  asOfKey: string;
  /** True when the time was chosen (URL / control / remembered), false when it follows the real clock. */
  pinned: boolean;
  /** The floating control is shown (?demo=1 or VITE_DEMO=1). */
  demo: boolean;
  setAsOf: (at: Date) => void;
  shift: (ms: number) => void;
  setNow: () => void;
}

const FALLBACK_NOW = new Date();
export const DemoClockContext = createContext<DemoClock>({
  asOf: FALLBACK_NOW,
  asOfKey: FALLBACK_NOW.toISOString(),
  pinned: false,
  demo: false,
  setAsOf: () => {},
  shift: () => {},
  setNow: () => {},
});

/** The demo clock. Outside a provider it is the real time, so components also work in isolation. */
export function useAsOf(): DemoClock {
  return useContext(DemoClockContext);
}

/** Parses an ISO string leniently: a "+" in a URL query turns into a space, so put it back. */
export function parseAsOf(value: string | null | undefined): Date | null {
  if (!value) return null;
  const fixed = value.trim().replace(/ (\d{2}:?\d{2})$/, "+$1");
  const date = new Date(fixed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO 8601 in Manila time with its +08:00 offset ("2026-07-21T22:00:00+08:00"). */
export function toManilaIso(date: Date): string {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 19) + "+08:00";
}

const manilaFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: MANILA, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});

/** "21 Jul 2026, 10:00 pm" in Asia/Manila. */
export function formatManila(date: Date): string {
  return manilaFormat.format(date);
}

const STORE_KEY = "asof";
const DEMO_KEY = "demo";

export type ClockStart = { asOf: Date; pinned: boolean; demo: boolean };

/** Reads the URL, then storage, then the real clock. Persists what the URL asked for so SPA navigation keeps it. */
export function readInitialClock(search: string = window.location.search, env: Record<string, unknown> = import.meta.env): ClockStart {
  const params = new URLSearchParams(search);

  let demo = env.VITE_DEMO === "1" || readSetting(DEMO_KEY) === "1";
  if (params.get("demo") === "1") { demo = true; writeSetting(DEMO_KEY, "1"); }
  if (params.get("demo") === "0") { demo = env.VITE_DEMO === "1"; writeSetting(DEMO_KEY, "0"); }

  const scenario = params.get("scenario");
  const fromScenario =
    scenario === "late-july" ? PRESETS[0] : scenario === "crisis" ? PRESETS[2] : scenario === "event" ? PRESETS[1] : null;
  const fromUrl = parseAsOf(params.get("as_of")) ?? (fromScenario ? new Date(fromScenario.at) : null);
  if (fromUrl) {
    writeSetting(STORE_KEY, fromUrl.toISOString());
    return { asOf: fromUrl, pinned: true, demo };
  }
  if (scenario === "now") writeSetting(STORE_KEY, "now");

  const stored = scenario === "now" ? null : parseAsOf(readSetting(STORE_KEY));
  if (stored) return { asOf: stored, pinned: true, demo };
  return { asOf: new Date(), pinned: false, demo };
}

export function rememberClock(at: Date | null) {
  writeSetting(STORE_KEY, at ? at.toISOString() : "now");
}
