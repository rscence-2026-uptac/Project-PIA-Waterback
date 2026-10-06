// SPEC: 06 resolved state — "Water's back" (wireframe p.6, motion #1: the one full-screen moment).
import { useCopy } from "../../copy/i18n";
import type { BarangaySnapshot } from "../../data/mock";
import { useBarangay } from "../../lib/barangay";
import { formatDuration, formatTime, minutesBetween } from "../../lib/time";
import { Button } from "../../ui/Button";
import { SampleChip } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";

// One wave period is 390px wide; the path is two periods so the drift loops seamlessly.
const WAVE = "M0 18 Q97.5 0 195 18 T390 18 T585 18 T780 18 V40 H0 Z";

export function WaterBackView({ snapshot }: { snapshot: BarangaySnapshot }) {
  const { t } = useCopy();
  const barangay = useBarangay();
  const { detail, captain, storage } = snapshot;
  const restored = detail.restored_at!;
  const offFor = detail.started_at ? formatDuration(minutesBetween(detail.started_at, restored)) : null;
  const vsLikely = detail.likely_at ? minutesBetween(restored, detail.likely_at) : null; // positive = early

  return (
    <>
      <h1 className="mt-5 text-[40px] leading-[1.05] tracking-[-0.03em]">{t("back.time", { time: formatTime(restored) })}</h1>
      {vsLikely !== null && detail.likely_at && offFor && (
        <p className="mt-2 text-[17px]">
          <strong>{vsLikely >= 0 ? t("back.earlier", { n: vsLikely }) : t("back.later", { n: -vsLikely })}</strong>
          {t("back.vs_rest", { time: formatTime(detail.likely_at), duration: offFor })}
        </p>
      )}

      <section className="relative -mx-5 mt-2 overflow-hidden pt-10" aria-labelledby="back-headline">
        <div className="flood bg-water pb-10">
          <svg viewBox="0 0 390 40" preserveAspectRatio="none" className="block h-10 w-full -translate-y-full bg-transparent" aria-hidden="true">
            <g className="drift-slow"><path d={WAVE} fill="var(--color-sky)" /></g>
            <g className="drift-fast"><path d={WAVE} fill="var(--color-water)" transform="translate(0 6)" /></g>
          </svg>
          <div className="-mt-6 px-5 pt-14">
            <h2 id="back-headline" className="rise-in text-[52px] leading-none tracking-[-0.035em] text-foam" style={{ animationDelay: "420ms" }}>
              {t("back.headline")}
            </h2>
            <p className="rise-in mt-2 font-display text-[24px] text-foam" style={{ animationDelay: "420ms" }}>{t("back.sub")}</p>

            <div
              className="rise-in mt-16 rounded-xl bg-foam p-5 text-ink"
              style={{ animationDelay: "620ms", boxShadow: "0 12px 32px -12px rgba(13, 46, 66, 0.45)" }}
            >
              <ul className="flex flex-col gap-3">
                <li className="flex gap-3">
                  <Icon name="tap" className="mt-0.5 text-tide" />
                  {t("back.tip_run")}
                </li>
                <li className="flex gap-3">
                  <Icon name="jerrycan" className="mt-0.5 text-tide" />
                  {t("back.tip_keep", { litres: storage.people * storage.per_person_l })}
                </li>
              </ul>
              <div className="mt-4 border-t border-haze pt-4">
                {/* Captain check counts and thank-yous have no backend yet. */}
                {captain.live && <SampleChip className="mb-2" />}
                <p className="font-bold">{t("back.captain", { name: captain.name, n: captain.checks_today })}</p>
                <p className="mt-1">
                  {t("back.captain_reach", { name: captain.name, n: captain.to_working, barangay: barangay?.name ?? "" })}
                </p>
              </div>
              {/* No spec covers resident thank-yous yet (wireframe only); not wired. */}
              <Button className="mt-4 w-full" icon="heart">{t("back.thanks", { name: captain.name })}</Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
