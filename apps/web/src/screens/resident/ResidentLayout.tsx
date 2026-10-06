// Resident app frame: phone-first single column, three-tab bottom bar (wireframe p.4).
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { useCopy } from "../../copy/i18n";
import { useBarangay } from "../../lib/barangay";
import { formatTime } from "../../lib/time";
import { DropMark } from "../../ui/Drop";
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

/** Wordmark + location pill. Tapping the pill changes barangay or language. */
export function ResidentHeader() {
  const { t } = useCopy();
  const barangay = useBarangay();
  return (
    <header className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <DropMark size={24} />
        <span className="font-display text-[20px] text-ink">{t("app.name")}</span>
      </span>
      {barangay && (
        <Link
          to="/settings"
          className="press flex min-h-11 items-center gap-2 rounded-full border-[1.5px] border-haze bg-foam px-4 text-[15px] text-ink"
        >
          <Icon name="pin" size={18} />
          {barangay.name}
        </Link>
      )}
    </header>
  );
}

/** "Saved on this phone · works without signal", or the stale stamp when offline. */
export function ConnectionLine({ stale, savedAt }: { stale: boolean; savedAt: string | null }) {
  const { t } = useCopy();
  return (
    <p className="mt-2 flex items-center gap-2 text-[15px] text-ink-soft">
      <Icon name={stale ? "wifiOff" : "check"} size={16} />
      {stale && savedAt ? t("app.offline_stale", { time: formatTime(savedAt) }) : t("app.saved_offline")}
    </p>
  );
}
