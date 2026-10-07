// Shared "now" provider. The demo clock (time travel via ?as_of / ?scenario and the floating control)
// is switched off for now: every screen follows the real time.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DemoClockContext, type DemoClock } from "./clockState";

const REAL_NOW_TICK_MS = 5 * 60_000; // refresh as_of every 5 minutes

export function DemoClockProvider({ children }: { children: ReactNode }) {
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAsOf(new Date()), REAL_NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<DemoClock>(() => ({ asOf, asOfKey: asOf.toISOString(), pinned: false }), [asOf]);
  return <DemoClockContext.Provider value={value}>{children}</DemoClockContext.Provider>;
}
