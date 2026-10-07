// Operator top bar shared by Monitor (/operator) and Predictions (/operator/risk).
import { useCopy } from "../../copy/i18n";
import { OPERATOR } from "../../data/mock";
import { SampleChip } from "../../ui/Chip";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";

export function OperatorTopBar() {
  const { t } = useCopy();
  return (
    <StaffTopBar
      org={t("operator.org")}
      tabs={
        <>
          <StaffTab to="/operator">{t("operator.tab_monitor")}</StaffTab>
          <StaffTab to="/operator/risk">{t("operator.tab_risk")}</StaffTab>
          <StaffTab>{t("operator.tab_log")}</StaffTab>
          <StaffTab>{t("operator.tab_events")}</StaffTab>
          <StaffTab>{t("operator.tab_thresholds")}</StaffTab>
        </>
      }
      right={
        <span className="inline-flex flex-wrap items-center gap-2">
          {/* No shift roster in the backend: stays a sample, labelled in live mode. */}
          {t("operator.shift", { name: OPERATOR.shift_name, hours: OPERATOR.shift_hours })}
          <SampleChip />
        </span>
      }
    />
  );
}
