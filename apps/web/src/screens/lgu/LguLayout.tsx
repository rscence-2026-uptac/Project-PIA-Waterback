// CDRRMO frame shared by the allocation screen and event records.
import type { ReactNode } from "react";
import { useCopy } from "../../copy/i18n";
import { OFFICER, OPEN_EVENT } from "../../data/mockLgu";
import { formatTime } from "../../lib/time";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";

export function LguLayout({ children }: { children: ReactNode }) {
  const { t } = useCopy();
  return (
    <div className="min-h-dvh bg-foam text-[15px]">
      <StaffTopBar
        org={t("admin.org")}
        tabs={
          <>
            <Pill className="bg-coral text-ink">
              <Icon name="dropOff" size={16} />
              {t("lgu.event_pill", { id: OPEN_EVENT.code, cause: t(`lgu.cause.${OPEN_EVENT.cause}`) })}
            </Pill>
            <StaffTab to="/lgu">{t("lgu.tab_priorities")}</StaffTab>
            <StaffTab to="/lgu/live">{t("lgu.tab_live")}</StaffTab>
            <StaffTab to="/lgu/event">{t("lgu.tab_records")}</StaffTab>
          </>
        }
        right={t("lgu.officer_line", { time: formatTime(new Date()), name: OFFICER.name })}
      />
      <main className="mx-auto max-w-[1360px] px-8 pb-16 pt-8">{children}</main>
    </div>
  );
}
