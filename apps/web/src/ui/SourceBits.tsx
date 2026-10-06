// Small pieces shared by the resident "If you run out" card, the Sources screen and the captain view.
import { useCopy } from "../copy/i18n";
import { SAFETY_KEY } from "../copy/labels";
import type { BackupSource, LiveStatus, Safety } from "../data/mock";
import { WSP_CONSTANTS } from "../contracts/wsp";
import { formatShortTime } from "../lib/time";
import { Icon } from "./Icon";

export function LiveStatusLabel({ live }: { live: LiveStatus }) {
  const { t } = useCopy();
  const text =
    live.kind === "queue" ? t("source.live.queue", { n: live.people })
    : live.kind === "scheduled" ? t("source.live.scheduled", { time: formatShortTime(live.at) })
    : t(`source.live.${live.kind}`);

  const mark =
    live.kind === "scheduled" ? <Icon name="clock" size={16} />
    : live.kind === "queue" ? <span className="size-2.5 rounded-full border-2 border-water" />
    : live.kind === "dry" ? <span className="size-2.5 rounded-full bg-coral-deep" />
    : live.kind === "long_queue" ? <span className="size-2.5 rounded-full bg-ink" />
    : <span className="size-2.5 rounded-full bg-water" />;

  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-bold text-ink">
      {mark}
      {text}
    </span>
  );
}

/** Shown on placeholder rows (spec 04 `is_simulated`). Text + icon, never colour alone. */
export function SimulatedLabel({ source }: { source: { is_simulated?: boolean } }) {
  const { t } = useCopy();
  if (!source.is_simulated) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-haze px-2.5 py-1 text-[15px] font-bold text-ink">
      <Icon name="alert" size={16} />
      {t("source.simulated")}
    </span>
  );
}

export function SafetyLabel({ safety }: { safety: Safety }) {
  const { t } = useCopy();
  if (safety === "boil") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-wash px-2.5 py-1 text-[15px] font-bold text-ink">
        <Icon name="alert" size={16} className="text-coral-deep" />
        {t("source.boil")}
      </span>
    );
  }
  return <span>{t(SAFETY_KEY[safety])}</span>;
}

export function CostLabel({ source }: { source: BackupSource }) {
  const { t } = useCopy();
  return (
    <span>
      {source.cost_php_per_unit === 0
        ? t("source.free")
        : t("source.cost", { price: source.cost_php_per_unit, litres: source.price_litres ?? 20 })}
    </span>
  );
}

const BAR_MAX_MIN = 45; // the 30-minute mark sits two-thirds along, as in the wireframe

/** Round-trip bar with the WHO/UNICEF 30-minute mark. */
export function RoundTripBar({ minutes }: { minutes: number }) {
  const fill = Math.min(minutes / BAR_MAX_MIN, 1) * 100;
  const mark = (WSP_CONSTANTS.JMP_ROUNDTRIP_MIN / BAR_MAX_MIN) * 100;
  return (
    <div className="relative h-2.5 rounded-full bg-mist" aria-hidden="true">
      <div className="h-full rounded-full bg-water" style={{ width: `${fill}%` }} />
      <div className="absolute -top-1.5 h-5.5 w-[3px] rounded-full bg-ink" style={{ left: `${mark}%` }} />
    </div>
  );
}

export function RoundTripCaption({ minutes }: { minutes: number }) {
  const { t } = useCopy();
  const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
  return (
    <p className="mt-1.5 text-[14px] text-ink-soft">
      {minutes > jmp ? t("sources.over_line", { n: minutes, jmp }) : t("sources.round_trip", { n: minutes })}
    </p>
  );
}
