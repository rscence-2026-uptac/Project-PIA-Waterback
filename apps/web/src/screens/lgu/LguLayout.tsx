// CDRRMO frame shared by the allocation screen and event records.
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useCopy } from "../../copy/i18n";
import { CLOSED_EVENT, OFFICER, OPEN_EVENT } from "../../data/mockLgu";
import { backendConfigured } from "../../lib/api";
import { useLiveSnapshot } from "../../realtime/liveApi";
import { formatTime } from "../../lib/time";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";

export function LguLayout({ children }: { children: ReactNode }) {
  const { t } = useCopy();
  const { pathname } = useLocation();
  const live = useLiveSnapshot(5_000); // no-op when the backend isn't configured
  const disruption = live.data?.disruption ?? null;

  // /lgu/event is the closed-event record (MOCK); everywhere else the open event: live when configured, else the sample.
  let pill: string | null;
  if (pathname.startsWith("/lgu/event")) {
    pill = t("lgu.event_pill_closed", { id: CLOSED_EVENT.code, cause: t(`lgu.cause.${CLOSED_EVENT.cause}`) });
  } else if (!backendConfigured) {
    pill = t("lgu.event_pill", { id: OPEN_EVENT.code, cause: t(`lgu.cause.${OPEN_EVENT.cause}`) });
  } else if (disruption) {
    pill = t("lgu.event_pill_live", { cause: t(`lgu.cause.${disruption.cause}`), status: t(`live.status.${disruption.status}`) });
  } else {
    pill = live.data ? t("lgu.event_pill_none") : null; // null while the first answer is on its way
  }

  return (
    <div className="min-h-dvh bg-foam text-[15px]">
      <StaffTopBar
        org={t("admin.org")}
        tabs={
          <>
            {pill && (
              <Pill className={pathname.startsWith("/lgu/event") || (backendConfigured && !disruption) ? "bg-mist text-ink" : "bg-coral text-ink"}>
                <Icon name="dropOff" size={16} />
                {pill}
              </Pill>
            )}
            <StaffTab to="/lgu">{t("lgu.tab_priorities")}</StaffTab>
            <StaffTab to="/lgu/live">{t("lgu.tab_live")}</StaffTab>
            <StaffTab to="/lgu/plan">{t("lgu.tab_plan")}</StaffTab>
            <StaffTab to="/lgu/event">{t("lgu.tab_records")}</StaffTab>
          </>
        }
        right={t("lgu.officer_line", { time: formatTime(new Date()), name: OFFICER.name })}
      />
      <main className="mx-auto max-w-[1360px] px-8 pb-16 pt-8">{children}</main>
    </div>
  );
}
