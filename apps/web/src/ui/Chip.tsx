// Status chips: colour + icon + word, never colour alone (DESIGN.md, Chips).
import type { ReactNode } from "react";
import { useCopy } from "../copy/i18n";
import type { WaterState } from "../lib/waterState";
import { Icon, type IconName } from "./Icon";

const STYLES: Record<WaterState, { className: string; icon: IconName | null; key: `state.${WaterState}.chip` }> = {
  flowing: { className: "bg-sky text-ink", icon: "drop", key: "state.flowing.chip" },
  headsup: { className: "bg-ink text-foam", icon: "alert", key: "state.headsup.chip" },
  interrupted: { className: "bg-coral text-ink", icon: "dropOff", key: "state.interrupted.chip" },
  repair: { className: "bg-mist text-ink", icon: "clock", key: "state.repair.chip" },
};

export function StatusChip({ state }: { state: WaterState }) {
  const { t } = useCopy();
  const style = STYLES[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-bold leading-none ${style.className}`}>
      {style.icon && <Icon name={style.icon} size={16} />}
      {t(style.key)}
    </span>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-bold leading-none ${className}`}>
      {children}
    </span>
  );
}
