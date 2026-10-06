// SPEC: 06 (AC5 allocation log) + MEM-1 post-event record (wireframe p.11).
// "Hours without piped water" is MEM-2 (spec 07's trend view), drawn here because it's on this page.
import { isLive } from "../../api/client";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { CLOSED_EVENT, type TimelineKind } from "../../data/mockLgu";
import { formatDuration, formatLongDate, formatTime, minutesBetween } from "../../lib/time";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { LguLayout } from "./LguLayout";
import { LiveEventRecord } from "./LiveEventRecord";

const TIMELINE_DOT: Record<TimelineKind, string> = {
  predicted: "bg-coral",
  confirmed: "bg-coral",
  deployed_priorities: "bg-tide",
  notified: "bg-tide",
  deployed_truck: "bg-sky",
  resident_confirmed: "bg-sky",
  resolved: "bg-tide",
};

const ALLOC_KEY: Record<(typeof CLOSED_EVENT.allocation_log)[number]["kind"], CopyKeyName> = {
  generated: "alloc.generated",
  confirmed: "alloc.confirmed",
  moved: "alloc.moved",
  closed: "alloc.closed",
};

/** Live mode shows the real record from the backend; otherwise the wireframe sample. */
export function EventRecordScreen() {
  return isLive() ? <LiveEventRecord /> : <SampleEventRecord />;
}

function SampleEventRecord() {
  const { t } = useCopy();
  const e = CLOSED_EVENT;
  const duration = minutesBetween(e.started_at, e.restored_at);
  const vsLikely = minutesBetween(e.restored_at, e.likely_at); // positive = early
  const sooner = e.previous.notice_minutes - e.notice_minutes;
  const maxHours = Math.max(...e.hours_without_water.map((b) => b.hours));

  return (
    <LguLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tide px-3 py-1.5 text-[14px] font-bold text-foam">
            <Icon name="check" size={16} />
            {t("record.closed", { time: formatTime(e.restored_at) })}
          </span>
          <h1 className="mt-3 text-[40px] leading-tight tracking-[-0.03em]">
            {t("record.title", { id: e.code, cause: t(`record.cause.${e.cause}`) })}
          </h1>
          <p className="mt-1 text-[17px] text-ink-soft">
            {t("record.subtitle", { day: formatLongDate(e.started_at), start: formatTime(e.started_at), end: formatTime(e.restored_at) })}
          </p>
        </div>
        {/* No spec covers exporting the record yet; shown as drawn, not wired. */}
        <Button variant="quiet" icon="download">{t("record.download")}</Button>
      </div>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-6 rounded-hero bg-sky p-8">
        <div className="max-w-[60ch]">
          <h2 className="text-[34px] leading-[1.1]">
            {t("record.hero", { diff: formatDuration(sooner), month: e.previous.month })}
          </h2>
          <p className="mt-3 text-[17px]">{t("record.hero_body", { n: e.off_network_tracked, month: e.previous.month })}</p>
        </div>
        <div className="rounded-xl bg-foam px-6 py-5">
          <p className="text-[14px]">{t("record.notice_label")}</p>
          <p className="numeral mt-2 text-[44px]">{formatDuration(e.notice_minutes)}</p>
          <p className="mt-2 text-[14px]">
            {t("record.notice_prev", { month: e.previous.month, value: formatDuration(e.previous.notice_minutes) })}
          </p>
        </div>
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border-[1.5px] border-haze p-6 md:grid-cols-5">
        <Stat label={t("record.stat_duration")} value={formatDuration(duration)} />
        <Stat label={t("record.stat_barangays")} value={String(e.barangays)} />
        <Stat label={t("record.stat_households")} value={e.households.toLocaleString("en-US")} />
        <Stat label={t("record.stat_truck")} value={t("record.litres", { litres: e.truck_litres_delivered.toLocaleString("en-US") })} />
        <Stat label={t("record.stat_vs")}
          value={vsLikely >= 0 ? t("record.early", { n: vsLikely }) : t("record.late", { n: -vsLikely })} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-6">
        <section className="flex-[1_1_380px] self-start rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="timeline-title">
          <h2 id="timeline-title" className="text-[22px]">{t("record.what_happened")}</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {e.timeline.map((item, i) => (
              <li key={`${item.at}-${i}`} className="grid grid-cols-[80px_14px_1fr] items-start gap-3">
                <span className="font-bold tabular-nums">{formatTime(item.at)}</span>
                <span className={`mt-1.5 size-3 rounded-full ${TIMELINE_DOT[item.kind]}`} aria-hidden="true" />
                <span className={item.kind === "resolved" ? "font-bold" : ""}>{t(`event.${item.kind}`, item.vars)}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
          <section className="rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="alloc-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="alloc-title" className="text-[22px]">{t("record.alloc_title")}</h2>
              <span className="text-[14px] text-ink-soft">{t("record.alloc_sub")}</span>
            </div>
            <table className="mt-4 w-full text-left">
              <thead>
                <tr className="border-b-2 border-ink text-[14px]">
                  <th className="py-2 pr-4 font-bold">{t("record.col_time")}</th>
                  <th className="py-2 pr-4 font-bold">{t("record.col_decision")}</th>
                  <th className="py-2 font-bold">{t("record.col_by")}</th>
                </tr>
              </thead>
              <tbody>
                {e.allocation_log.map((entry, i) => (
                  <tr key={`${entry.at}-${i}`} className="border-b border-haze last:border-b-0">
                    <td className="py-3 pr-4 align-top tabular-nums">{formatTime(entry.at)}</td>
                    <td className="py-3 pr-4 align-top">
                      {t(ALLOC_KEY[entry.kind], { ...entry.vars, jmp: WSP_CONSTANTS.JMP_ROUNDTRIP_MIN })}
                    </td>
                    <td className="py-3 align-top">{entry.by ?? t("alloc.system")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="hours-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="hours-title" className="text-[22px]">
                {t("record.hours_title", { year: new Date(e.started_at).getFullYear() })}
              </h2>
              <span className="text-[14px] text-ink-soft">{t("record.hours_sub")}</span>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {e.hours_without_water.map((b) => (
                <li key={b.name} className="grid grid-cols-[130px_1fr_40px] items-center gap-3">
                  <span>{b.name}</span>
                  <span className="h-3 rounded-full bg-mist">
                    <span className="block h-full rounded-full bg-water" style={{ width: `${(b.hours / maxHours) * 100}%` }} />
                  </span>
                  <span className="text-right font-bold tabular-nums">{b.hours}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl bg-ink p-6 text-foam">
            <h2 className="text-[24px]">{t("record.carry_title")}</h2>
            <p className="mt-3 text-sky">{t("record.carry_body", e.carry_forward)}</p>
            {/* No spec covers early-warning rules yet; buttons shown as drawn, not wired. */}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="soft">{t("record.add_rule")}</Button>
              <Button variant="raised">{t("record.not_now")}</Button>
            </div>
          </section>
        </div>
      </div>

      <p className="mt-6 text-[14px] text-ink-soft">{t("record.sample")}</p>
    </LguLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[14px] text-ink-soft">{label}</dt>
      <dd className="numeral mt-1 text-[30px]">{value}</dd>
    </div>
  );
}
