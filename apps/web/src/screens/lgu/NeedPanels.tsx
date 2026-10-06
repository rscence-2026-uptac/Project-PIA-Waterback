// SPEC: 10 — truck plan panel and early-warning panel on /lgu. English only (LGU screen).
import { useMemo, useState } from "react";
import { useCopy } from "../../copy/i18n";
import { fillSms, SMS_TEMPLATES } from "../../copy/sms";
import { LITRES_PER_PERSON_DAY, TRUCK_WALK_RADIUS_M, type NeedRow } from "../../contracts/spec10";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { clustersFile } from "../../data/needInputs";
import { earlyWarningTiers, type DropPlan } from "../../lib/need";
import { Icon } from "../../ui/Icon";

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export type RouteState = "idle" | "loading" | "road" | "straight";

export function TruckPanel({ plan, capacityLitres, show, onToggle, route }: {
  plan: DropPlan;
  capacityLitres: number;
  show: boolean;
  onToggle: () => void;
  route: RouteState;
}) {
  const { t } = useCopy();
  return (
    <section className="rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="truck-title">
      <h2 id="truck-title" className="flex items-center gap-2 text-[22px]">
        <Icon name="truck" size={22} />
        {t("lgu.truck_plan_title")}
      </h2>

      {plan.stops.length === 0 ? (
        <p className="mt-3 text-ink-soft">{t("lgu.truck_empty")}</p>
      ) : (
        <>
          <ol className="mt-3 flex flex-col gap-2">
            {plan.stops.map((s) => (
              <li key={s.cluster_id} className="flex items-start gap-3 rounded-lg bg-mist p-3">
                <span className="numeral flex size-11 shrink-0 items-center justify-center rounded-md bg-amber text-[20px] text-foam">{s.order}</span>
                <span className="min-w-0">
                  <span className="block font-bold">{s.label}</span>
                  <span className="block text-[14px]">
                    {t("lgu.truck_stop_line", { people: fmt(s.people_served), litres: fmt(s.litres) })}
                    {s.capped && <span className="ml-1.5 font-bold">· {t("lgu.truck_capped")}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <dl className="mt-3">
            <Row label={t("lgu.truck_people_total")} value={fmt(plan.total_people)} />
            <Row label={t("lgu.truck_no_access_total", { jmp })} value={fmt(plan.no_access_people)} />
            <Row label={t("lgu.truck_litres_total")} value={t("lgu.truck_litres_value", { used: fmt(plan.total_litres), cap: fmt(capacityLitres) })} />
            <Row label={t("lgu.truck_unmet", { jmp })} value={fmt(plan.unmet_people)} />
          </dl>

          <button
            type="button"
            aria-pressed={show}
            onClick={onToggle}
            className="press mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-mist px-4 font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink aria-pressed:bg-ink aria-pressed:text-foam"
          >
            <Icon name="truck" size={18} />
            {show ? t("lgu.truck_hide") : t("lgu.truck_show")}
          </button>
          {show && (
            <p role="status" className="mt-3 text-[14px] font-bold">
              {route === "loading" ? t("lgu.truck_loading") : route === "road" ? t("lgu.truck_road") : route === "straight" ? t("lgu.truck_straight") : null}
            </p>
          )}
          <p className="mt-3 text-[14px] text-ink-soft">
            {t("lgu.truck_note", { m: TRUCK_WALK_RADIUS_M, lpp: LITRES_PER_PERSON_DAY })}
          </p>
        </>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-haze py-3 last:border-b-0">
      <dt>{label}</dt>
      <dd className="text-right font-bold tabular-nums">{value}</dd>
    </div>
  );
}

// MOCK: worst-case values for the preview, mirroring WORST_CASE in copy/sms.ts so the character count is an upper bound.
const PREVIEW = { since: "11:45AM", cause: "River too muddy to treat", window: "11AM-2PM", likely: "12:30PM", litres: "60" };
const FALLBACK_BARANGAY = "Guinsorongan";

export function EarlyWarningPanel({ rows, signal }: { rows: NeedRow[]; signal: number }) {
  const { t } = useCopy();
  const [notice, setNotice] = useState(false);
  const tiers = useMemo(() => earlyWarningTiers(rows), [rows]);

  const names = new Map(clustersFile.barangays.map((b) => [b.barangay_id, b.name]));
  const groups = (barangays: string[], tierRows: NeedRow[]) =>
    barangays
      .map((id) => {
        const mine = tierRows.filter((r) => r.barangay_id === id);
        return { id, name: names.get(id) ?? id, clusters: mine.length, people: mine.reduce((s, r) => s + r.people, 0) };
      })
      .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
  const now = groups(tiers.tier1Barangays, tiers.tier1);
  const later = groups(tiers.tier2Barangays, tiers.tier2);

  const longest = clustersFile.barangays.reduce((m, b) => (b.name.length > m.length ? b.name : m), FALLBACK_BARANGAY);
  const template = SMS_TEMPLATES.find((s) => s.key === "sms.water_off" && s.language === "english")!;
  const sms = fillSms(template.template, { barangay: longest, ...PREVIEW });

  return (
    <section className="mt-8 rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="warn-title">
      <h2 id="warn-title" className="flex items-center gap-2 text-[22px]">
        <Icon name="bell" size={22} />
        {t("lgu.warn_title")}
      </h2>
      <p className="mt-2 text-ink-soft">{t("lgu.warn_body", { n: signal })}</p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Group title={t("lgu.warn_now")} tone="bg-coral-wash" items={now} empty={t("lgu.warn_none")} line={(g) => t("lgu.warn_group_line", { name: g.name, clusters: g.clusters, people: fmt(g.people) })} />
        <Group title={t("lgu.warn_later")} tone="bg-mist" items={later} empty={t("lgu.warn_none")} line={(g) => t("lgu.warn_group_line", { name: g.name, clusters: g.clusters, people: fmt(g.people) })} />
      </div>

      <h3 className="mt-5 text-[16px] font-bold">{t("lgu.warn_sms")}</h3>
      <p className="mt-2 rounded-lg bg-ink p-4 font-mono text-[14px] text-foam">{sms}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[14px]">
        <span className={`font-bold ${sms.length > 160 ? "text-coral-deep" : ""}`}>{t("lgu.warn_chars", { n: sms.length })}</span>
        <span className="text-ink-soft">{t("lgu.warn_sms_note")}</span>
      </p>

      <button
        type="button"
        onClick={() => setNotice(true)}
        className="press mt-4 flex min-h-11 items-center gap-2 rounded-md bg-ink px-5 font-bold text-foam focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Icon name="bell" size={18} />
        {t("lgu.warn_send")}
      </button>
      {notice && (
        // MOCK: no sending until Dev A allows notify before allocation (handoff #12). No fake success.
        <p role="alert" className="panel-in mt-3 flex gap-2.5 rounded-lg bg-mist p-3 text-[14px]">
          <Icon name="wifiOff" size={18} className="mt-0.5" />
          {t("lgu.warn_mock")}
        </p>
      )}
    </section>
  );
}

function Group<T extends { id: string }>({ title, tone, items, empty, line }: {
  title: string; tone: string; items: T[]; empty: string; line: (g: T) => string;
}) {
  return (
    <div className={`rounded-lg p-4 ${tone}`}>
      <h3 className="font-bold">{title} · {items.length}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px]">{empty}</p>
      ) : (
        <ul className="mt-2 max-h-[220px] overflow-y-auto overscroll-y-contain pr-1 text-[14px] [scrollbar-width:thin]" tabIndex={0} aria-label={title}>
          {items.map((g) => <li key={g.id} className="py-1">{line(g)}</li>)}
        </ul>
      )}
    </div>
  );
}
