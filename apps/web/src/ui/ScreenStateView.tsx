// SPEC: 08 — every async screen handles all four ScreenState values.
// loading and error render here; ready and offline_stale render the screen
// (which shows its own "No signal · saved at …" line when stale).
import type { ReactNode } from "react";
import type { ScreenState } from "../contracts/spec08";
import { useCopy } from "../copy/i18n";
import { Button } from "./Button";
import { DropGauge } from "./Drop";
import { Icon } from "./Icon";

export function ScreenStateView({ state, onRetry, children }: {
  state: ScreenState;
  onRetry: () => void;
  children: () => ReactNode;
}) {
  const { t } = useCopy();

  if (state === "loading") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-16 text-center text-ink-soft">
        <DropGauge look="flowing" width={72} />
        <p>{t("app.loading")}</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className="mt-6 flex flex-col gap-4 rounded-xl bg-mist p-6">
        <Icon name="wifiOff" size={28} className="text-ink" />
        <h2 className="text-[24px] leading-tight">{t("app.error_title")}</h2>
        <p className="text-ink-soft">{t("app.error_body")}</p>
        <Button onClick={onRetry} className="w-full">{t("app.retry")}</Button>
      </div>
    );
  }

  return <>{children()}</>;
}
