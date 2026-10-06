// SPEC: 06 (AC5 allocation log) + MEM-1 post-event record, built from the live backend only:
// disruptions + event_log + allocations + continuity chains + sms_outbox (api/eventRecord.ts).
// Nothing on this page is sample data. The sample record stays in EventRecordScreen for not-live mode.
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import {
  STAGES, barangayName, eventCodeOf, useEventRecord, type EventRecord, type Stage, type TimelineEvent,
} from "../../api/eventRecord";
import { formatDuration, formatManila, formatManilaDay, minutesBetween } from "../../lib/time";
import { Icon } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { LguLayout } from "./LguLayout";

const DOT: Record<Stage, string> = {
  predicted: "bg-coral", heads_up: "bg-amber", confirmed: "bg-coral", deployed: "bg-tide",
  notified: "bg-tide", resident_confirmed: "bg-sky", resolved: "bg-tide",
};
const STAGE_KEY: Record<Stage, CopyKeyName> = {
  predicted: "evrec.stage.predicted", heads_up: "evrec.stage.heads_up", confirmed: "evrec.stage.confirmed",
  deployed: "evrec.stage.deployed", notified: "evrec.stage.notified",
  resident_confirmed: "evrec.stage.resident_confirmed", resolved: "evrec.stage.resolved",
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

export function LiveEventRecord() {
  const { t } = useCopy();
  const res = useEventRecord();
  return (
    <LguLayout>
      {!res.data && !res.error && <ScreenStateView state="loading" onRetry={res.reload}>{() => null}</ScreenStateView>}
      {!res.data && res.error && <ScreenStateView state="error" onRetry={res.reload}>{() => null}</ScreenStateView>}
      {res.data === null && !res.loading && !res.error && (
        <div className="rounded-xl bg-mist p-6">
          <h1 className="text-[28px]">{t("evrec.none_title")}</h1>
          <p className="mt-2 text-ink-soft">{t("evrec.none_body")}</p>
        </div>
      )}
      {res.data && <Body record={res.data} />}
    </LguLayout>
  );
}

function Body({ record }: { record: EventRecord }) {
  const { t } = useCopy();
  const { disruption: d, events, allocations, sms, smsError, firstStops, smsByBarangay } = record;
  const resolved = d.status === "resolved";
  const end = d.resolved_at ?? events.find((e) => e.stage === "resolved")?.occurred_at ?? null;
  const overrides = events.filter((e) => e.stage === "deployed" && e.payload_json?.step !== "source" && num(e.payload_json?.overridden_from_suggested_rank) !== null);
  const overriddenBy = new Map(overrides.map((e) => [e.barangay_id ?? "", num(e.payload_json?.overridden_from_suggested_rank)!]));
  const notified = new Set(events.filter((e) => e.stage === "notified" && e.barangay_id).map((e) => e.barangay_id));

  return (
    <>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-bold ${resolved ? "bg-tide text-foam" : "bg-coral text-ink"}`}>
        <Icon name={resolved ? "check" : "dropOff"} size={16} />
        {resolved && end ? t("evrec.resolved_badge", { time: formatManila(end) }) : t("evrec.open_badge", { time: formatManila(d.started_at) })}
      </span>
      <h1 className="mt-3 text-[40px] leading-tight tracking-[-0.03em]">
        {t("evrec.title", { id: eventCodeOf(d.id), cause: t(`record.cause.${d.cause}`) })}
      </h1>
      <p className="mt-1 text-[17px] text-ink-soft">{t("evrec.subtitle", { day: formatManilaDay(d.started_at), time: formatManila(d.started_at) })}</p>
      <p className="mt-1 text-[14px] text-ink-soft">{t("evrec.live_note")}</p>

      <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-label={t("evrec.timeline_title")}>
        {STAGES.map((stage) => {
          const rows = events.filter((e) => e.stage === stage);
          const reached = rows.length > 0;
          return (
            <li key={stage} className={`rounded-xl p-4 ${reached ? "bg-sky" : "border-[1.5px] border-haze"}`}>
              <p className="flex items-center gap-2 text-[14px] font-bold">
                <Icon name={reached ? "check" : "clock"} size={16} />
                {t(STAGE_KEY[stage])}
              </p>
              <p className="mt-2 text-[15px]">{reached ? formatManila(rows[0].occurred_at) : t("evrec.stage_pending")}</p>
              {reached && <p className="text-[13px] text-ink-soft">{t("evrec.stage_events", { n: rows.length })}</p>}
            </li>
          );
        })}
      </ol>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl border-[1.5px] border-haze p-6 md:grid-cols-5">
        <Stat label={t("evrec.stat_duration")} value={end ? formatDuration(minutesBetween(d.started_at, end)) : t("evrec.stat_open")} />
        <Stat label={t("evrec.stat_barangays")} value={String(notified.size)} />
        <Stat label={t("evrec.stat_allocated")} value={String(allocations.length)} />
        <Stat label={t("evrec.stat_overrides")} value={String(overriddenBy.size)} />
        <Stat label={t("evrec.stat_sms")} value={sms ? String(sms.outbound) : "—"} />
      </dl>

      <div className="mt-6 flex flex-wrap gap-6">
        <section className="flex-[1_1_420px] self-start rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="evrec-timeline">
          <h2 id="evrec-timeline" className="text-[22px]">{t("evrec.timeline_title")}</h2>
          <p className="mt-1 text-[14px] text-ink-soft">{t("evrec.timeline_sub")}</p>
          {events.length === 0 ? (
            <p className="mt-4 text-ink-soft">{t("evrec.timeline_empty")}</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-4">
              {events.map((e) => <TimelineRow key={e.id} e={e} />)}
            </ol>
          )}
        </section>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <section className="rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="evrec-alloc">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="evrec-alloc" className="text-[22px]">{t("evrec.alloc_title")}</h2>
              <span className="text-[14px] text-ink-soft">{t("evrec.alloc_sub")}</span>
            </div>
            {allocations.length === 0 ? (
              <p className="mt-4 text-ink-soft">{t("evrec.alloc_empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-4 w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-ink text-[14px]">
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_rank")}</th>
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_barangay")}</th>
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_first_stop")}</th>
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_decision")}</th>
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_by")}</th>
                      <th className="py-2 pr-4 font-bold">{t("evrec.col_time")}</th>
                      <th className="py-2 text-right font-bold">{t("evrec.col_sms")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => {
                      const from = overriddenBy.get(a.barangay_id);
                      const stop = firstStops.get(a.barangay_id);
                      return (
                        <tr key={a.id} className="border-b border-haze last:border-b-0">
                          <td className="numeral py-3 pr-4 align-top text-[20px]">{a.priority_rank}</td>
                          <td className="py-3 pr-4 align-top font-bold">{barangayName(a.barangay_id)}</td>
                          <td className="py-3 pr-4 align-top">{stop ? stop.name : <span className="text-ink-soft">{t("evrec.no_chain")}</span>}</td>
                          <td className="py-3 pr-4 align-top">
                            {from !== undefined ? t("evrec.overridden", { from, rank: a.priority_rank }) : t("evrec.followed")}
                            {a.note && <span className="block text-[14px] text-ink-soft">{a.note}</span>}
                          </td>
                          <td className="py-3 pr-4 align-top">{a.officer_id}</td>
                          <td className="py-3 pr-4 align-top tabular-nums">{formatManila(a.decided_at)}</td>
                          <td className="py-3 text-right align-top tabular-nums">{sms ? smsByBarangay.get(a.barangay_id) ?? 0 : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="evrec-sms">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="evrec-sms" className="text-[22px]">{t("evrec.sms_title")}</h2>
              <span className="text-[14px] text-ink-soft">{t("evrec.sms_sub")}</span>
            </div>
            {smsError || !sms ? (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-mist p-3 text-[14px]" role="status">
                <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
                {t("evrec.sms_unavailable")}
              </p>
            ) : sms.outbound + sms.inbound === 0 ? (
              <p className="mt-4 text-ink-soft">{t("evrec.sms_none")}</p>
            ) : (
              <>
                <p className="numeral mt-3 text-[30px]">{t("evrec.sms_totals", { out: sms.outbound, in: sms.inbound })}</p>
                <p className="text-[14px] text-ink-soft">{t("evrec.sms_modes", { dry: sms.dry_run, live: sms.live })}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {sms.byTemplate.map(([template, n]) => (
                    <li key={template} className="rounded-full bg-mist px-3 py-1 text-[14px]"><strong className="tabular-nums">{n}</strong> {template}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function TimelineRow({ e }: { e: TimelineEvent }) {
  const { t } = useCopy();
  const p = e.payload_json ?? {};
  const where = e.barangay_id ? barangayName(e.barangay_id) : t("evrec.all_barangays");
  let detail: string | null = null;
  if (e.stage === "heads_up") {
    detail = t("evrec.d.heads_up", { level: num(p.level) ?? "?", n: num(p.sms_recipients) ?? 0, mode: str(p.mode) ?? "?" });
  } else if (e.stage === "deployed" && p.step === "source") {
    detail = t("evrec.d.source", { name: str(p.source_name) ?? "?" }) + (p.in_ranked_chain === false ? ` (${t("evrec.d.off_chain")})` : "");
  } else if (e.stage === "deployed") {
    const from = num(p.overridden_from_suggested_rank);
    const rank = num(p.priority_rank) ?? "?";
    detail = from !== null ? t("evrec.d.override", { rank, from }) : t("evrec.d.allocation", { rank });
  } else if (e.stage === "notified") {
    const channels = Array.isArray(p.channels) ? p.channels.join(", ") : str(p.channels);
    detail = channels ? t("evrec.d.notified", { channels }) : null;
  } else if (e.stage === "resident_confirmed") {
    detail = p.restored === false || p.reopen === true ? t("evrec.d.not_restored") : t("evrec.d.restored");
  } else if (e.stage === "resolved") {
    detail = t("evrec.d.resolved");
  }
  return (
    <li className="grid grid-cols-[96px_14px_1fr] items-start gap-3">
      <span className="text-[14px] font-bold tabular-nums">{formatManila(e.occurred_at)}</span>
      <span className={`mt-1.5 size-3 rounded-full ${DOT[e.stage]}`} aria-hidden="true" />
      <span>
        <span className={e.stage === "resolved" ? "font-bold" : ""}>{t(STAGE_KEY[e.stage])}</span>
        <span className="text-ink-soft"> · {where} · {t("evrec.by", { actor: e.actor === "system" ? t("evrec.system") : e.actor })}</span>
        {detail && <span className="block text-[14px] text-ink-soft">{detail}</span>}
      </span>
    </li>
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
