// Resident / captain heads-up card (resident state v2): a prediction, so the water is still ON.
// Never says "no water" or "dry since"; it says when it is likely, how much to store, and why we think so.
import { useCopy } from "../copy/i18n";
import type { BarangaySnapshot } from "../data/mock";
import { likelyStart } from "../lib/headsUp";
import { topReason } from "../lib/drivers";
import { formatShortTime } from "../lib/time";
import { ButtonLink } from "./Button";
import { Icon } from "./Icon";

export function HeadsUpCard({ snapshot, compact = false, vulnerable }: {
  snapshot: BarangaySnapshot;
  compact?: boolean;
  /** Captain only: vulnerable households on this barangay's list, when known. */
  vulnerable?: number;
}) {
  const { t } = useCopy();
  const { storage } = snapshot;
  const litres = storage.people * storage.per_person_l; // 60 L = 4 people x 15 L, same as the SMS
  const start = likelyStart(snapshot);
  const reason = topReason(snapshot.prediction);

  return (
    <section className="mt-4 rounded-xl bg-mist p-4" aria-labelledby="headsup-card-title" data-testid="headsup-card">
      <h2 id="headsup-card-title" className="flex items-center gap-2 text-[18px] leading-tight">
        <Icon name="clock" size={20} className="shrink-0" />
        {start ? t("headsup.likely_at", { time: formatShortTime(start) }) : t("headsup.within_48h")}
      </h2>
      <p className="mt-1 text-[15px] text-ink-soft">{t("headsup.still_on")}</p>

      <p className="mt-3 flex items-start gap-2.5 rounded-sm bg-sky px-3 py-3 font-bold leading-snug">
        <Icon name="jerrycan" size={22} className="mt-0.5 shrink-0" />
        {t("headsup.store", { litres, people: storage.people, per: storage.per_person_l })}
      </p>

      {reason && !compact && <p className="mt-3 text-[15px]">{t("headsup.why", { reason })}</p>}
      {reason && compact && <p className="mt-2 text-[14px] text-ink-soft">{t("headsup.why", { reason })}</p>}

      {typeof vulnerable === "number" && vulnerable > 0 && (
        <p className="mt-3 flex items-start gap-2 text-[15px] font-bold">
          <Icon name="heart" size={18} className="mt-0.5 shrink-0" />
          {t("headsup.vulnerable", { n: vulnerable })}
        </p>
      )}

      {!compact && (
        <ButtonLink to="/sources" variant="foam" icon="pin" className="mt-4 w-full">
          {t("headsup.see_sources")}
        </ButtonLink>
      )}
    </section>
  );
}
