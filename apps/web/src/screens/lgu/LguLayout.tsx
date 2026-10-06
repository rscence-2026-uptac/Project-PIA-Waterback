// CDRRMO frame shared by the allocation screen and event records.
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useOpenEvent } from "../../api/allocation";
import { useCopy } from "../../copy/i18n";
import { useAsOf } from "../../demo/clockState";
import { CLOSED_EVENT, OFFICER } from "../../data/mockLgu";
import { formatTime } from "../../lib/time";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";

export function LguLayout({ children }: { children: ReactNode }) {
  const { t } = useCopy();
  const { pathname } = useLocation();
  const { asOf } = useAsOf();
  const open = useOpenEvent().data; // Dev A's live open disruption at the demo clock; the sample event when not live
  const onRecord = pathname.startsWith("/lgu/event");

  // /lgu/event is the closed-event record (MOCK); everywhere else the open event.
  const pill = onRecord
    ? t("lgu.event_pill_closed", { id: CLOSED_EVENT.code, cause: t(`lgu.cause.${CLOSED_EVENT.cause}`) })
    : open
      ? t("lgu.event_pill", { id: open.code, cause: t(`lgu.cause.${open.cause}`) })
      : t("lgu.no_event");
  return (
    <div className="min-h-dvh bg-foam text-[15px]">
      <StaffTopBar
        org={t("admin.org")}
        tabs={
          <>
            <Pill className={onRecord || !open ? "bg-mist text-ink" : "bg-coral text-ink"}>
              <Icon name="dropOff" size={16} />
              {pill}
            </Pill>
            <StaffTab to="/lgu">{t("lgu.tab_priorities")}</StaffTab>
            <StaffTab to="/lgu/live">{t("lgu.tab_live")}</StaffTab>
            <StaffTab to="/lgu/plan">{t("lgu.tab_plan")}</StaffTab>
            <StaffTab to="/lgu/event">{t("lgu.tab_records")}</StaffTab>
          </>
        }
        right={t("lgu.officer_line", { time: formatTime(asOf), name: OFFICER.name })}
      />
      <main className="mx-auto max-w-[1360px] px-8 pb-16 pt-8">{children}</main>
    </div>
  );
}
