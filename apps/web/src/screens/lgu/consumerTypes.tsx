// SPEC: 09 — how each consumer type looks. Always icon + text + colour, never colour alone (spec 08).
import { useCopy } from "../../copy/i18n";
import type { ConsumerType } from "../../contracts/spec09";
import { Icon, type IconName } from "../../ui/Icon";

// hex mirrors the index.css tokens: Leaflet draws halos as SVG attributes, which can't read CSS variables.
export const TYPE_LOOK: Record<ConsumerType, { icon: IconName; badge: string; pin: string; hex: string }> = {
  lgu: { icon: "building", badge: "bg-coral-deep text-foam", pin: "bg-coral-deep", hex: "#b23f2a" },
  residential: { icon: "home", badge: "bg-water text-foam", pin: "bg-water", hex: "#248dc5" },
  commercial: { icon: "store", badge: "bg-amber text-foam", pin: "bg-amber", hex: "#a5670f" },
  industrial: { icon: "factory", badge: "bg-plum text-foam", pin: "bg-plum", hex: "#6b4c8a" },
};

export function TypeBadge({ type }: { type: ConsumerType }) {
  const { t } = useCopy();
  const look = TYPE_LOOK[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold ${look.badge}`}>
      <Icon name={look.icon} size={14} />
      {t(`type.${type}`)}
    </span>
  );
}
