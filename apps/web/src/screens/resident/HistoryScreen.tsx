// History tab. No wireframe yet, so this stays a plain empty state.
import { useCopy } from "../../copy/i18n";
import { Icon } from "../../ui/Icon";
import { ResidentHeader } from "./ResidentLayout";

export function HistoryScreen() {
  const { t } = useCopy();
  return (
    <>
      <ResidentHeader />
      <h1 className="mt-6 text-[32px] leading-tight">{t("history.title")}</h1>
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-mist p-5">
        <Icon name="history" className="mt-0.5" />
        <p>{t("history.empty")}</p>
      </div>
    </>
  );
}
