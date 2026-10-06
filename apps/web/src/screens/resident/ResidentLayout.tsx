// Resident app frame: phone-first single column, three-tab bottom bar (wireframe p.4).
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { useCopy } from "../../copy/i18n";
import { useBarangay } from "../../lib/barangay";
import { formatResidentDate, formatTime } from "../../lib/time";
import { Logo } from "../../ui/Logo";
import { Icon, type IconName } from "../../ui/Icon";

export function ResidentLayout() {
  const barangay = useBarangay();
  const { pathname } = useLocation();
  if (!barangay && pathname !== "/settings") return <Navigate to="/settings" replace />;

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-foam">
      <main className="px-5 pb-28 pt-[max(16px,env(safe-area-inset-top))]">
        <Outlet />
      </main>
      {pathname !== "/settings" && <BottomBar />}
    </div>
  );
}

function BottomBar() {
  const { t } = useCopy();
  const tabs: { to: string; icon: IconName; label: string }[] = [
    { to: "/", icon: "drop", label: t("nav.status") },
    { to: "/sources", icon: "pin", label: t("nav.sources") },
    { to: "/history", icon: "clock", label: t("nav.history") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-haze bg-foam pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-[430px] grid-cols-3">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-[13px] ${isActive ? "font-bold text-ink" : "text-ink-soft"}`
              }
            >
              <Icon name={tab.icon} />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Today, re-read every minute so the date turns over at midnight while the app stays open. */
function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

/** Local YYYY-MM-DD (toISOString gives the UTC date, a day behind after midnight in PH time). */
function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Logo + location pill, then today's date. Tapping the pill changes barangay or language. */
export function ResidentHeader() {
  const barangay = useBarangay();
  const { language } = useCopy();
  const today = useToday();
  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <Logo height={28} />
        {barangay && (
          <Link
            to="/settings"
            className="press flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-haze bg-foam px-4 text-[15px] text-ink"
          >
            <Icon name="pin" size={18} />
            {barangay.name}
          </Link>
        )}
      </div>
      <p className="mt-2 text-[17px] font-bold text-ink">
        <time dateTime={localDate(today)}>{formatResidentDate(today, language)}</time>
      </p>
    </header>
  );
}

/** Shown only when offline: no signal, and the time of the status being shown (elderly-friendly-ui rule 11). */
export function ConnectionLine({ savedAt }: { savedAt: string }) {
  const { t } = useCopy();
  return (
    <p className="mt-2 flex items-center gap-2 text-[15px] text-ink-soft">
      <Icon name="wifiOff" size={16} />
      {t("app.offline_stale", { time: formatTime(savedAt) })}
    </p>
  );
}
