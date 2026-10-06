// Backup water plan, ranked safety → time → cost (wireframe p.5; ranking comes from spec 04).
import { Link } from "react-router";
import { useCopy } from "../../copy/i18n";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { type BackupSource } from "../../data/mock";
import { useBarangay } from "../../lib/barangay";
import { formatTime } from "../../lib/time";
import { useBarangayStatus } from "../../offline/useBarangayStatus";
import { Icon } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { CostLabel, LiveStatusLabel, RoundTripBar, RoundTripCaption, SafetyLabel, SimulatedLabel } from "../../ui/SourceBits";
import { ConnectionLine } from "./ResidentLayout";

export function SourcesScreen() {
  const { t } = useCopy();
  const barangay = useBarangay();
  const status = useBarangayStatus(barangay?.barangay_id ?? null);

  return (
    <>
      <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-tide">
        <Icon name="chevronLeft" size={18} />
        {t("nav.status")}
      </Link>
      <h1 className="mt-2 text-[32px] leading-[1.05] tracking-[-0.03em]">{t("sources.title")}</h1>
      {barangay && <p className="mt-2 text-ink-soft">{t("sources.sub", { barangay: barangay.name })}</p>}
      {status.view?.is_stale && <ConnectionLine stale savedAt={status.view.last_synced_at} />}

      <div className="mt-4 rounded-xl bg-mist p-4">
        <RoundTripBar minutes={20} />
        <p className="mt-3 text-[15px] text-ink">
          {t("sources.legend_a")}
          <strong>{t("sources.legend_b", { min: WSP_CONSTANTS.JMP_ROUNDTRIP_MIN })}</strong>
          {t("sources.legend_c")}
        </p>
      </div>

      <ScreenStateView state={status.state} onRetry={status.retry}>
        {() => (
          <ol className="mt-5">
            {status.snapshot?.sources.map((source, i, all) => (
              <SourceRow key={source.source_id} source={source} first={i === 0} last={i === all.length - 1} />
            ))}
          </ol>
        )}
      </ScreenStateView>
    </>
  );
}

function SourceRow({ source, first, last }: { source: BackupSource; first: boolean; last: boolean }) {
  const { t } = useCopy();
  const showBar = source.live.kind !== "scheduled";

  return (
    <li className="grid grid-cols-[40px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-10 items-center justify-center rounded-full font-display text-[18px] ${first ? "bg-tide text-foam" : "bg-sky text-ink"}`}
          aria-hidden="true"
        >
          {source.letter}
        </span>
        {!last && <span className="w-[3px] flex-1 bg-sky" aria-hidden="true" />}
      </div>

      <article className={`mb-4 rounded-xl p-4 ${first ? "border-2 border-tide" : "border-[1.5px] border-haze"}`}>
        <div className="flex items-center justify-between gap-2">
          <LiveStatusLabel live={source.live} />
          <span className="text-[14px] text-ink-soft">
            {t("source.reported", { name: source.reported_by, time: formatTime(source.reported_at) })}
          </span>
        </div>
        <h2 className="mt-1 text-[22px] leading-tight">
          <span className="sr-only">{t("sources.plan_label", { letter: source.letter })} </span>
          {source.name}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <SafetyLabel safety={source.safety} />
          <span>{t("source.walk", { n: source.walk_minutes })}</span>
          <CostLabel source={source} />
          {source.bring_containers && <span>{t("source.bring")}</span>}
        </p>
        {showBar && (
          <div className="mt-3">
            <RoundTripBar minutes={source.travel_minutes} />
            <RoundTripCaption minutes={source.travel_minutes} />
          </div>
        )}
        {source.is_simulated && <p className="mt-3"><SimulatedLabel source={source} /></p>}
        {source.note && <p className="mt-3 text-ink-soft">{source.note}</p>}
      </article>
    </li>
  );
}
