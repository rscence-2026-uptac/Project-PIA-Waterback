// SPEC: 05 — CWD operator dashboard. Readings are logged per water intake (CWD 2022 WSP review,
// docs/wsp_findings.md) and always go into the offline queue first (wireframe p.9).
import { useState, type FormEvent } from "react";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { OperatorReadingForm } from "../../contracts/spec05";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { INTAKES, OPERATOR, type IntakeId, type IntakeReading } from "../../data/mock";
import { formatDay, formatShortTime, formatTime, formatWindow } from "../../lib/time";
import { db } from "../../offline/db";
import { useLiveQuery, useOnline } from "../../offline/hooks";
import { enqueue, pendingItems } from "../../offline/queue";
import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";
import { StaffTab, StaffTopBar } from "../../ui/StaffTopBar";
import { RainChart, TurbidityChart } from "./Charts";

const { TURBIDITY_SHUTOFF_NTU, TURBIDITY_LIMIT_NTU, CLARIFIER_CAPACITY_LPS } = WSP_CONSTANTS;

type PlantStatus = OperatorReadingForm["plant_status"];
type Latest = IntakeReading & { logged_at: string };

const intakeName = (id: IntakeId) => INTAKES.find((i) => i.intake_id === id)!.name;
const isPlant = (id: IntakeId) => INTAKES.find((i) => i.intake_id === id)!.plant;
// WSP p.43: the >= 500 NTU temporary shut-off applies to the Caramayon I source only.
const shutOffApplies = (id: IntakeId, ntu: number) => id === "caramayon_1" && ntu >= TURBIDITY_SHUTOFF_NTU;

/** The newest reading for this intake saved on this device, else the sample reading. */
function useLatestReading(intake: IntakeId): Latest {
  const sample: Latest = { ...OPERATOR.latest[intake], logged_at: OPERATOR.last_logged_at };
  return useLiveQuery(
    async () => {
      const items = await db.queue.where("kind").equals("reading").sortBy("queued_at");
      const item = items.filter((i) => i.payload.intake_id === intake).at(-1);
      if (!item) return sample;
      const p = item.payload;
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        turbidity_ntu: Number(p.turbidity_ntu),
        plant_status: p.plant_status as PlantStatus,
        treated_ntu: num(p.treated_turbidity_ntu),
        clarifier_inflow_lps: num(p.clarifier_inflow_lps),
        reservoir_pct: num(p.reservoir_pct),
        logged_at: item.queued_at,
      };
    },
    [intake],
    sample,
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
  const [intake, setIntake] = useState<IntakeId>("kulador");
  const latest = useLatestReading(intake);
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
            {t("operator.title", { intake: intakeName(intake), day: formatDay(now), time: formatTime(now) })}
          </h1>
          <Pill className="bg-coral text-ink">
            <Icon name="dropOff" size={16} />
            {t("operator.event_open", { id: OPERATOR.event_id })}
          </Pill>
        </div>

        <fieldset className="mt-4">
          <legend className="text-[14px] font-bold">{t("operator.intake_label")}</legend>
          <div className="mt-2 inline-grid grid-cols-2 gap-1.5 rounded-md bg-mist p-1.5 sm:grid-cols-4">
            {INTAKES.map((option) => (
              <label
                key={option.intake_id}
                className={`press flex min-h-11 cursor-pointer items-center justify-center rounded-sm px-4 font-bold ${intake === option.intake_id ? "bg-tide text-foam" : "bg-foam text-ink"}`}
              >
                <input
                  type="radio"
                  name="intake"
                  value={option.intake_id}
                  checked={intake === option.intake_id}
                  onChange={() => setIntake(option.intake_id)}
                  className="sr-only"
                />
                {option.name}
              </label>
            ))}
          </div>
        </fieldset>

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
            <MetricTiles intake={intake} latest={latest} />
            <ChartsPanel intake={intake} />
            <ReadingForm key={intake} intake={intake} latest={latest} />
          </div>
          <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
            <DetectorPanel />
            <EarlyWarnings />
            <p className="text-[13px] text-ink-soft">
              {t("operator.footnote", { limit: TURBIDITY_LIMIT_NTU, shut: TURBIDITY_SHUTOFF_NTU, cap: CLARIFIER_CAPACITY_LPS })}
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

function MetricTiles({ intake, latest }: { intake: IntakeId; latest: Latest }) {
  const { t } = useCopy();
  const raw = latest.turbidity_ntu;
  const shutOff = shutOffApplies(intake, raw);
  const rawOver = raw > TURBIDITY_LIMIT_NTU;
  const { treated_ntu: treated, clarifier_inflow_lps: clarifier, reservoir_pct: reservoir } = latest;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricTile
        label={t("operator.raw")}
        value={raw}
        unit={t("unit.ntu")}
        badge={shutOff ? t("operator.shutoff") : rawOver ? t("operator.over_limit") : undefined}
        note={shutOff
          ? t("operator.raw_shutoff", { limit: TURBIDITY_SHUTOFF_NTU, time: formatTime(OPERATOR.over_since) })
          : rawOver
            ? t("operator.raw_over", { limit: TURBIDITY_LIMIT_NTU })
            : t("operator.raw_under", { limit: TURBIDITY_LIMIT_NTU })}
      />
      {isPlant(intake) ? (
        <>
          {treated !== null && (
            <MetricTile
              label={t("operator.treated")}
              value={treated}
              unit={t("unit.ntu")}
              badge={treated > TURBIDITY_LIMIT_NTU ? t("operator.over_limit") : undefined}
              note={treated > TURBIDITY_LIMIT_NTU
                ? t("operator.treated_over", { limit: TURBIDITY_LIMIT_NTU })
                : t("operator.treated_under", { limit: TURBIDITY_LIMIT_NTU })}
            />
          )}
          {clarifier !== null && (
            <MetricTile
              label={t("operator.clarifier")}
              value={clarifier}
              unit={t("unit.lps")}
              note={clarifier < CLARIFIER_CAPACITY_LPS * 0.9
                ? t("operator.clarifier_cut", { cap: CLARIFIER_CAPACITY_LPS })
                : t("operator.clarifier_full", { cap: CLARIFIER_CAPACITY_LPS })}
            />
          )}
          {reservoir !== null && (
            <MetricTile
              wide
              label={t("operator.reservoir")}
              value={reservoir}
              unit={t("unit.pct")}
              note={t("operator.reservoir_trend", { n: OPERATOR.reservoir_falling_per_hour })}
            />
          )}
        </>
      ) : (
        <p className="flex items-center rounded-xl bg-mist px-[22px] py-5 text-[15px] sm:col-span-2">
          {t("operator.kulador_only")}
        </p>
      )}
    </div>
  );
}

function ChartsPanel({ intake }: { intake: IntakeId }) {
  const { t } = useCopy();
  return (
    <section className="rounded-xl border-[1.5px] border-haze p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px]">{t("operator.chart_turbidity", { intake: intakeName(intake) })}</h2>
        <span className="text-[13px] text-ink-soft">{t("operator.chart_units")}</span>
      </div>
      <div className="mt-3">
        <TurbidityChart
          label={t("operator.chart_turbidity", { intake: intakeName(intake) })}
          series={OPERATOR.turbidity_series[intake]}
          end={OPERATOR.series_end}
          shutOff={intake === "caramayon_1" ? TURBIDITY_SHUTOFF_NTU : undefined}
        />
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

// Treated turbidity, clarifier flow and reservoir exist only at the Kulador plant (spec 05: nullable).
const FIELDS: { name: FieldName; label: CopyKeyName; error: CopyKeyName; plantOnly: boolean }[] = [
  { name: "turbidity_ntu", label: "operator.field_raw", error: "operator.err_number", plantOnly: false },
  { name: "treated_ntu", label: "operator.field_treated", error: "operator.err_number", plantOnly: true },
  { name: "clarifier_inflow_lps", label: "operator.field_clarifier", error: "operator.err_number", plantOnly: true },
  { name: "reservoir_pct", label: "operator.field_reservoir", error: "operator.err_pct", plantOnly: true },
];

const PLANT_OPTIONS: { value: PlantStatus; label: CopyKeyName }[] = [
  { value: "normal", label: "plant.normal" },
  { value: "degraded", label: "plant.degraded" },
  { value: "shutdown", label: "plant.shutdown" },
];

const asText = (v: number | null) => (v === null ? "" : String(v));

function ReadingForm({ intake, latest }: { intake: IntakeId; latest: Latest }) {
  const { t } = useCopy();
  const online = useOnline();
  const plant = isPlant(intake);
  const fields = FIELDS.filter((f) => plant || !f.plantOnly);
  const pending = useLiveQuery(() => pendingItems("reading").then((items) => items.length), [], 0);
  const sample = OPERATOR.latest[intake];
  const [values, setValues] = useState<Record<FieldName, string>>({
    turbidity_ntu: String(sample.turbidity_ntu),
    treated_ntu: asText(sample.treated_ntu),
    clarifier_inflow_lps: asText(sample.clarifier_inflow_lps),
    reservoir_pct: asText(sample.reservoir_pct),
  });
  const [plantStatus, setPlantStatus] = useState<PlantStatus>(sample.plant_status);
  const [errors, setErrors] = useState<Partial<Record<FieldName, boolean>>>({});
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const num = (name: FieldName) => (values[name].trim() === "" ? NaN : Number(values[name]));
    const treated = plant ? num("treated_ntu") : null;

    // Spec 05 contract. Treated turbidity is on the wireframe but not in the contract (flagged,
    // docs/dev-b-handoff.md #2), so it rides along in the queue payload unvalidated by the schema.
    const parsed = OperatorReadingForm.safeParse({
      intake_id: intake,
      turbidity_ntu: num("turbidity_ntu"),
      plant_status: plantStatus,
      reservoir_pct: plant ? num("reservoir_pct") : null,
      clarifier_inflow_lps: plant ? num("clarifier_inflow_lps") : null,
    });

    const nextErrors: Partial<Record<FieldName, boolean>> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) nextErrors[issue.path[0] as FieldName] = true;
    }
    if (treated !== null && !(treated >= 0)) nextErrors.treated_ntu = true;
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
        <h2 className="font-display text-[20px]">
          {t("operator.log_title", { time: formatTime(nextHour()), intake: intakeName(intake) })}
        </h2>
        <span className="text-[13px] text-ink-soft">{t("operator.last_logged", { time: formatTime(latest.logged_at) })}</span>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {fields.map((field) => (
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
        {!plant && <p className="mt-3 text-[14px] text-ink-soft">{t("operator.kulador_only")}</p>}

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
    t("detector.sig_raw", { limit: TURBIDITY_SHUTOFF_NTU, time: formatTime(OPERATOR.over_since) }),
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
