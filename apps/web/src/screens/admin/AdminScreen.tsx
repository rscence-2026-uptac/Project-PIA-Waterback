// Placeholder for spec 07 (admin dashboard) and spec 06's allocation screen.
import { useCopy } from "../../copy/i18n";
import { StaffTopBar } from "../../ui/StaffTopBar";

export function AdminScreen() {
  const { t } = useCopy();
  return (
    <div className="min-h-dvh bg-foam">
      <StaffTopBar org={t("admin.org")} />
      <main className="mx-auto max-w-[1360px] px-8 py-10">
        <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("admin.placeholder_title")}</h1>
        <p className="mt-3 max-w-[60ch] text-ink-soft">{t("admin.placeholder_body")}</p>
      </main>
    </div>
  );
}
