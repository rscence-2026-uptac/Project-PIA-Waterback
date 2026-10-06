// Dashboard top bar: Project PIA logo, name over organisation, text tabs (DESIGN.md, Navigation).
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { useCopy } from "../copy/i18n";
import { Logo } from "./Logo";

export function StaffTopBar({ org, tabs, right }: { org: string; tabs?: ReactNode; right?: ReactNode }) {
  const { t } = useCopy();
  return (
    <header className="border-b border-haze bg-foam">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-2 px-8 py-3">
        <span className="flex items-center gap-2.5">
          <Logo height={38} showName={false} />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[18px]">{t("app.name")}</span>
            <span className="text-[13px] text-ink-soft">{org}</span>
          </span>
        </span>
        {tabs && <nav className="flex flex-wrap items-center gap-1 text-[15px]">{tabs}</nav>}
        {right && <span className="ml-auto text-[15px] text-ink-soft">{right}</span>}
      </div>
    </header>
  );
}

export function StaffTab({ current, to, children }: { current?: boolean; to?: string; children: ReactNode }) {
  if (to) {
    return (
      <NavLink
        to={to}
        end
        className={({ isActive }) =>
          `flex min-h-11 items-center rounded-full px-3 ${isActive ? "bg-mist font-bold text-ink" : "text-ink-soft"}`
        }
      >
        {children}
      </NavLink>
    );
  }
  return (
    <span
      aria-current={current ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 ${current ? "bg-mist font-bold text-ink" : "text-ink-soft"}`}
    >
      {children}
    </span>
  );
}
