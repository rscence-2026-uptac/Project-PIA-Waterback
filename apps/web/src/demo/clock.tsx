// Demo clock provider + the small floating control (shown only with ?demo=1 or VITE_DEMO=1).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isLive } from "../api/client";
import { runMonitor } from "../api/endpoints";
import { Icon } from "../ui/Icon";
import {
  DemoClockContext, PRESETS, formatManila, readInitialClock, rememberClock, useAsOf, type DemoClock,
} from "./clockState";

const REAL_NOW_TICK_MS = 5 * 60_000; // while following the real clock, refresh as_of every 5 minutes

export function DemoClockProvider({ children }: { children: ReactNode }) {
  const [start] = useState(() => readInitialClock());
  const [asOf, setAsOfState] = useState(start.asOf);
  const [pinned, setPinned] = useState(start.pinned);

  const setAsOf = useCallback((at: Date) => {
    rememberClock(at);
    setAsOfState(at);
    setPinned(true);
  }, []);
  const setNow = useCallback(() => {
    rememberClock(null);
    setAsOfState(new Date());
    setPinned(false);
  }, []);
  const shift = useCallback((ms: number) => setAsOf(new Date(asOf.getTime() + ms)), [asOf, setAsOf]);

  useEffect(() => {
    if (pinned) return;
    const id = setInterval(() => setAsOfState(new Date()), REAL_NOW_TICK_MS);
    return () => clearInterval(id);
  }, [pinned]);

  const value = useMemo<DemoClock>(
    () => ({ asOf, asOfKey: asOf.toISOString(), pinned, demo: start.demo, setAsOf, shift, setNow }),
    [asOf, pinned, start.demo, setAsOf, shift, setNow],
  );
  return <DemoClockContext.Provider value={value}>{children}</DemoClockContext.Provider>;
}

const HOUR = 3_600_000;
const STEPS = [
  { label: "−3 h", ms: -3 * HOUR, name: "Back 3 hours" },
  { label: "+3 h", ms: 3 * HOUR, name: "Forward 3 hours" },
  { label: "+1 d", ms: 24 * HOUR, name: "Forward 1 day" },
];

const chip = "press min-h-11 rounded-sm bg-mist px-3 text-[14px] font-bold text-ink";

/** Floating control, bottom-left above the phone tab bar. Closed it is one small pill. */
export function DemoClockControl() {
  const clock = useAsOf();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const live = isLive();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => setResult(null), 8000);
    return () => clearTimeout(id);
  }, [result]);

  if (!clock.demo) return null;

  async function runAtThisTime() {
    setBusy(true);
    setResult(null);
    try {
      const out = await runMonitor(clock.asOf);
      const headsUp = out.heads_up?.barangays ? `, heads-up to ${out.heads_up.barangays} barangays` : "";
      const level = out.prediction?.signal_level ?? out.disruption?.signal_level;
      setResult({ ok: true, text: `Monitor: ${out.action}${level !== undefined ? `, signal ${level}` : ""}${headsUp}` });
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Monitor failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-[76px] left-3 z-50 flex max-w-[calc(100vw-24px)] flex-col items-start gap-2" data-demo-clock>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Demo clock"
          className="panel-in w-[340px] max-w-full rounded-xl border-[1.5px] border-haze bg-foam p-4 text-ink"
          style={{ boxShadow: "0 12px 28px -10px rgba(13, 46, 66, 0.5)" }}
        >
          <p className="text-[13px] font-bold text-ink-soft">Demo clock · Asia/Manila</p>
          <p className="numeral mt-1 text-[24px]" aria-live="polite">{formatManila(clock.asOf)}</p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {clock.pinned ? "Set by you. Every screen reads data as of this time." : "Following the real clock."}
            {!live && " Live mode is off (no keys), so screens show sample data."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Jump to a demo moment">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={chip} onClick={() => clock.setAsOf(new Date(preset.at))}>
                {preset.label}
              </button>
            ))}
            <button type="button" className={chip} onClick={clock.setNow}>Now</button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Step the clock">
            {STEPS.map((step) => (
              <button key={step.label} type="button" className={chip} aria-label={step.name} onClick={() => clock.shift(step.ms)}>
                {step.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={runAtThisTime}
            disabled={!live || busy}
            className="press mt-3 min-h-11 w-full rounded-sm bg-tide px-3 text-[14px] font-bold text-foam disabled:opacity-50"
          >
            {busy ? "Running…" : "Run monitor at this time"}
          </button>
          <p className="mt-1 text-[12px] text-ink-soft">Creates or updates the disruption and heads-up as of the time above.</p>
          <a
            href="/demo/phone"
            target="_blank"
            rel="noopener"
            className="press mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-mist px-3 text-[14px] font-bold text-ink"
          >
            <Icon name="bell" size={16} />
            Open demo phone (new tab)
          </a>
          <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-[13px] font-bold ${result?.ok === false ? "text-coral-deep" : "text-ink"}`}>
            {result?.text}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-haze bg-foam px-3.5 text-[13px] font-bold text-ink"
        style={{ boxShadow: "0 6px 16px -8px rgba(13, 46, 66, 0.45)" }}
      >
        <Icon name="clock" size={16} />
        <span>{clock.pinned ? formatManila(clock.asOf) : "Now"}</span>
      </button>
    </div>
  );
}
