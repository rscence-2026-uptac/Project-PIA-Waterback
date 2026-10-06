// SPEC: 05 — CWD operator dashboard. Readings always go into the offline queue first (wireframe p.9).
import { useState, type FormEvent } from "react";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { OperatorReadingForm } from "../../contracts/spec05";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { OPERATOR, PLANT_INTAKE_ID } from "../../data/mock";
import { formatDay, formatShortTime, formatTime, formatWindow } from "../../lib/time";
import { useLiveQuery, useOnline } from "../../offline/hooks";
import { enqueue, latestItem, pendingItems } from "../../offline/queue";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";
import { RainChart, TurbidityChart } from "./Charts";

const { TURBIDITY_SHUTDOWN_NTU, TURBIDITY_WARNING_NTU, CLARIFIER_CAPACITY_LPS } = WSP_CONSTANTS;

type PlantStatus = OperatorReadingForm["plant_status"];

interface Latest {
  turbidity_ntu: number;
  treated_ntu: number;
  clarifier_inflow_lps: number;
  reservoir_pct: number;
  plant_status: PlantStatus;
  logged_at: string;
}

const MOCK_LATEST: Latest = { ...OPERATOR.latest, logged_at: OPERATOR.last_logged_at };

/** The newest reading saved on this device, else the sample reading. */
function useLatestReading(): Latest {
  return useLiveQuery(
    async () => {
      const item = await latestItem("reading");
      if (!item) return MOCK_LATEST;
      const p = item.payload as Record<string, unknown>;
      return {
        turbidity_ntu: Number(p.turbidity_ntu),
        treated_ntu: Number(p.treated_turbidity_ntu ?? MOCK_LATEST.treated_ntu),
        clarifier_inflow_lps: Number(p.clarifier_inflow_lps),
        reservoir_pct: Number(p.reservoir_pct),
        plant_status: p.plant_status as PlantStatus,
        logged_at: item.queued_at,
      };
    },
    [],
    MOCK_LATEST,
  );
}

function nextHour(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function OperatorScreen() {
  const { t } = useCopy();
  const latest = useLatestReading();
  const now = new Date();

  return (
    <div className="min-h-dvh bg-foam text-[15px]">
      <StaffTopBar
        org={t("operator.org")}
        tabs={
          <>
            <StaffTab current>{t("operator.tab_monitor")}</StaffTab>
            <StaffTab>{t("operator.tab_log")}</StaffTab>
            <StaffTab>{t("operator.tab_events")}</StaffTab>
            <StaffTab>{t("operator.tab_thresholds")}</StaffTab>
          </>
        }
        right={t("operator.shift", { name: OPERATOR.shift_name, hours: OPERATOR.shift_hours })}
      />

      <main className="mx-auto max-w-[1360px] px-8 pb-16 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[32px] leading-tight tracking-[-0.03em]">
            {t("operator.title", { day: formatDay(now), time: formatTime(now) })}
          </h1>
          <Pill className="bg-coral text-ink">
            <Icon name="dropOff" size={16} />
            {t("operator.event_open", { id: OPERATOR.event_id })}
          </Pill>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <InfoPill icon="gauge" title={t("operator.readings_pill")} sub={t("operator.readings_sub")}>
            {t("operator.readings_due", { last: formatTime(latest.logged_at), due: formatTime(nextHour()) })}
          </InfoPill>
          <InfoPill icon="cloudRain" title={t("operator.rain_pill")} sub={t("operator.rain_sub")}>
            {t("app.updated_at", { time: formatTime(OPERATOR.rain_updated_at) })}
          </InfoPill>
        </div>

        <div className="mt-6 flex flex-wrap gap-6">
          <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
            <MetricTiles latest={latest} />
            <ChartsPanel />
            <ReadingForm latest={latest} />
          </div>
          <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
            <DetectorPanel />
            <EarlyWarnings />
            <p className="text-[13px] text-ink-soft">
              {t("operator.footnote", { warn: TURBIDITY_WARNING_NTU, shut: TURBIDITY_SHUTDOWN_NTU, cap: CLARIFIER_CAPACITY_LPS })}
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

function InfoPill({ icon, title, sub, children }: {
  icon: "gauge" | "cloudRain";
  title: string;
  sub: string;
  children: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-mist py-2 pl-2 pr-3">
      <span className="flex size-9 items-center justify-center rounded-sm bg-sky">
        <Icon name={icon} size={18} />
      </span>
      <span className="leading-tight">
        <strong className="block text-[14px]">{title}</strong>
        <span className="text-[13px] text-ink-soft">{sub}</span>
      </span>
      <span className="ml-2 rounded-full bg-foam px-3 py-1.5 text-[13px] font-bold">{children}</span>
    </div>
  );
}

function MetricTile({ label, value, unit, note, badge, wide }: {
  label: string;
  value: string | number;
  unit: string;
  note: string;
  badge?: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-sky px-[22px] py-5 ${wide ? "sm:col-span-3" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-bold">{label}</span>
        {badge && <Pill className="bg-coral px-2.5 py-1 text-[13px] text-ink">{badge}</Pill>}
      </div>
      <p className="mt-2">
        <span className="numeral text-[44px]">{value}</span>{" "}
        <span className="font-display text-[20px]">{unit}</span>
      </p>
      <p className="mt-1 text-[14px] text-ink">{note}</p>
    </div>
  );
}

function MetricTiles({ latest }: { latest: Latest }) {
  const { t } = useCopy();
  const rawOver = latest.turbidity_ntu > TURBIDITY_SHUTDOWN_NTU;
  const treatedOver = latest.treated_ntu > TURBIDITY_WARNING_NTU;
  const cutBack = latest.clarifier_inflow_lps < CLARIFIER_CAPACITY_LPS * 0.9;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricTile
        label={t("operator.raw")}
        value={latest.turbidity_ntu}
        unit={t("unit.ntu")}
        badge={rawOver ? t("operator.over_limit") : undefined}
        note={rawOver
          ? t("operator.raw_over", { limit: TURBIDITY_SHUTDOWN_NTU, time: formatTime(OPERATOR.raw_over_since) })
          : t("operator.raw_under", { limit: TURBIDITY_SHUTDOWN_NTU })}
      />
      <MetricTile
        label={t("operator.treated")}
        value={latest.treated_ntu}
        unit={t("unit.ntu")}
        badge={treatedOver ? t("operator.over_limit") : undefined}
        note={treatedOver
          ? t("operator.treated_over", { limit: TURBIDITY_WARNING_NTU })
          : t("operator.treated_under", { limit: TURBIDITY_WARNING_NTU })}
      />
      <MetricTile
        label={t("operator.clarifier")}
        value={latest.clarifier_inflow_lps}
        unit={t("unit.lps")}
        note={cutBack
          ? t("operator.clarifier_cut", { cap: CLARIFIER_CAPACITY_LPS })
          : t("operator.clarifier_full", { cap: CLARIFIER_CAPACITY_LPS })}
      />
      <MetricTile
        wide
        label={t("operator.reservoir")}
        value={latest.reservoir_pct}
        unit={t("unit.pct")}
        note={t("operator.reservoir_trend", { n: OPERATOR.reservoir_falling_per_hour })}
      />
    </div>
  );
}

function ChartsPanel() {
  const { t } = useCopy();
  return (
    <section className="rounded-xl border-[1.5px] border-haze p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px]">{t("operator.chart_turbidity")}</h2>
        <span className="text-[13px] text-ink-soft">{t("operator.chart_units")}</span>
      </div>
      <div className="mt-3">
        <TurbidityChart series={OPERATOR.turbidity_series} end={OPERATOR.series_end} limit={TURBIDITY_SHUTDOWN_NTU} />
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[17px]">{t("operator.chart_rain")}</h3>
        <span className="text-[13px] text-ink-soft">
          {t("operator.rain_summary", {
            mm: OPERATOR.rain_total_mm,
            time: formatShortTime(OPERATOR.rain_since),
            days: OPERATOR.dry_spell_days,
          })}
        </span>
      </div>
      <div className="mt-2">
        <RainChart series={OPERATOR.rain_series} end={OPERATOR.series_end} />
      </div>
    </section>
  );
}

type FieldName = "turbidity_ntu" | "treated_ntu" | "clarifier_inflow_lps" | "reservoir_pct";

const FIELDS: { name: FieldName; label: CopyKeyName; error: CopyKeyName }[] = [
  { name: "turbidity_ntu", label: "operator.field_raw", error: "operator.err_number" },
  { name: "treated_ntu", label: "operator.field_treated", error: "operator.err_number" },
  { name: "clarifier_inflow_lps", label: "operator.field_clarifier", error: "operator.err_number" },
  { name: "reservoir_pct", label: "operator.field_reservoir", error: "operator.err_pct" },
];

const PLANT_OPTIONS: { value: PlantStatus; label: CopyKeyName }[] = [
  { value: "normal", label: "plant.normal" },
  { value: "degraded", label: "plant.degraded" },
  { value: "shutdown", label: "plant.shutdown" },
];

function ReadingForm({ latest }: { latest: Latest }) {
  const { t } = useCopy();
  const online = useOnline();
  const pending = useLiveQuery(() => pendingItems("reading").then((items) => items.length), [], 0);
  const [values, setValues] = useState<Record<FieldName, string>>({
    turbidity_ntu: String(OPERATOR.latest.turbidity_ntu),
    treated_ntu: String(OPERATOR.latest.treated_ntu),
    clarifier_inflow_lps: String(OPERATOR.latest.clarifier_inflow_lps),
    reservoir_pct: String(OPERATOR.latest.reservoir_pct),
  });
  const [plantStatus, setPlantStatus] = useState<PlantStatus>(OPERATOR.latest.plant_status);
  const [errors, setErrors] = useState<Partial<Record<FieldName, boolean>>>({});
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const num = (name: FieldName) => (values[name].trim() === "" ? NaN : Number(values[name]));
    const treated = num("treated_ntu");

    // Spec 05 contract. Treated turbidity is on the wireframe but not in the contract (flagged),
    // so it rides along in the queue payload without being validated by the spec schema.
    const parsed = OperatorReadingForm.safeParse({
      barangay_id: PLANT_INTAKE_ID,
      turbidity_ntu: num("turbidity_ntu"),
      plant_status: plantStatus,
      reservoir_pct: num("reservoir_pct"),
      clarifier_inflow_lps: num("clarifier_inflow_lps"),
    });

    const nextErrors: Partial<Record<FieldName, boolean>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[issue.path[0] as FieldName] = true;
    }
    if (!(treated >= 0)) nextErrors.treated_ntu = true;
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      setSaved(false);
      return;
    }

    await enqueue("reading", {
      ...parsed.data,
      treated_turbidity_ntu: treated,
      recorded_at: new Date().toISOString(),
    });
    setSaved(true);
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <section className="rounded-xl border-[1.5px] border-haze p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px]">{t("operator.log_title", { time: formatTime(nextHour()) })}</h2>
        <span className="text-[13px] text-ink-soft">{t("operator.last_logged", { time: formatTime(latest.logged_at) })}</span>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {FIELDS.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5">
              <span className="text-[14px] font-bold">{t(field.label)}</span>
              <input
                inputMode="decimal"
                value={values[field.name]}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [field.name]: e.target.value }));
                  setSaved(false);
                }}
                aria-invalid={errors[field.name] || undefined}
                className={`h-12 rounded-md border-[1.5px] bg-foam px-3.5 text-[16px] tabular-nums ${errors[field.name] ? "border-coral-deep" : "border-haze"}`}
              />
              {errors[field.name] && <span className="text-[13px] font-bold text-coral-deep">{t(field.error)}</span>}
            </label>
          ))}
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[14px] font-bold">{t("operator.field_status")}</span>
          <select
            value={plantStatus}
            onChange={(e) => {
              setPlantStatus(e.target.value as PlantStatus);
              setSaved(false);
            }}
            className="h-12 rounded-md border-[1.5px] border-haze bg-foam px-3.5 text-[16px]"
          >
            {PLANT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.label)}</option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button type="submit" className="h-13">{t("operator.save")}</Button>
          <p className="flex items-center gap-2 text-[14px] text-ink-soft" role="status" aria-live="polite">
            {hasErrors ? (
              <span className="font-bold text-coral-deep">{t("operator.invalid")}</span>
            ) : saved || pending > 0 ? (
              <>
                <Icon name={online ? "check" : "wifiOff"} size={16} />
                {t("operator.saved", { n: pending })}
              </>
            ) : (
              t("operator.save_hint")
            )}
          </p>
        </div>
      </form>
    </section>
  );
}

function DetectorPanel() {
  const { t } = useCopy();
  const d = OPERATOR.detector;
  const signals = [
    t("detector.sig_raw", { limit: TURBIDITY_SHUTDOWN_NTU, time: formatTime(OPERATOR.raw_over_since) }),
    t("detector.sig_rain", { mm: d.rain_mm, hours: d.rain_hours }),
    t("detector.sig_clarifier", { from: d.clarifier_from, to: d.clarifier_to }),
  ];

  return (
    <section className="rounded-xl bg-ink p-6 text-foam">
      <p className="text-[14px] font-bold text-coral">{t("detector.label")}</p>
      <h2 className="mt-1 text-[26px] leading-tight">{t("detector.turbidity")}</h2>
      <p className="mt-1 text-[14px] text-sky">
        {t("detector.matched", { n: d.matched, total: d.total, time: formatTime(d.confirmed_at) })}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {signals.map((signal) => (
          <li key={signal} className="flex items-start gap-3 text-[15px]">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-coral text-ink">
              <Icon name="check" size={14} strokeWidth={3} />
            </span>
            {signal}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 rounded-lg bg-ink-raised p-3 text-[13px]">
        <p>
          <strong>{t("detector.low_source")}</strong> · {t("detector.low_source_note", { n: d.low_source.n, total: d.low_source.total })}
        </p>
        <p>
          <strong>{t("detector.repair")}</strong> · {t("detector.repair_note", { n: d.repair.n, total: d.repair.total })}
        </p>
      </div>
      <p className="mt-5 text-[14px] font-bold">{t("detector.window")}</p>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-ink-raised p-4">
        <span className="numeral text-[24px] leading-tight">
          {t("detector.window_value", { window: formatWindow(d.window_start, d.window_end), likely: formatShortTime(d.likely_at) })}
        </span>
        {/* Adjusting the window belongs to spec 06's notification flow; not wired yet. */}
        <Button variant="soft" className="h-11 shrink-0 px-4 text-[15px]">{t("detector.adjust")}</Button>
      </div>
      <p className="mt-3 text-[13px] text-sky">
        {t("detector.next", { time: formatTime(d.next_update_at), remind: formatTime(d.remind_at) })}
      </p>
    </section>
  );
}

const WARNING_CAUSE: Record<(typeof OPERATOR.early_warnings)[number]["cause"], CopyKeyName> = {
  turbidity: "warnings.turbidity",
  repair: "warnings.repair",
  low_source: "warnings.low_source",
};

function EarlyWarnings() {
  const { t } = useCopy();
  return (
    <section className="rounded-xl border-[1.5px] border-haze p-6">
      <h2 className="font-display text-[22px]">{t("warnings.title")}</h2>
      <p className="mt-1 text-[14px] text-ink-soft">{t("warnings.sub")}</p>
      <ul className="mt-4">
        {OPERATOR.early_warnings.map((w) => (
          <li key={w.date} className="flex items-center justify-between border-b border-haze py-3 last:border-b-0">
            <span>
              {w.date} · {t(WARNING_CAUSE[w.cause])}
            </span>
            <strong className="tabular-nums">{w.notice}</strong>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-lg bg-mist p-3 text-[14px]">{t("warnings.note")}</p>
    </section>
  );
}
