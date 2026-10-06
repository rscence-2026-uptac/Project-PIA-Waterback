// Operator "why" panel: what the disruption predictor says at the demo clock's asOf, and why (spec 02 drivers +
// operator_actions). Replaces the sample detector / early-warning cards when the live predictor returns drivers;
// an older deploy without drivers keeps the old cards (see OperatorScreen).
import type { PredictorOutput } from "../../contracts/predictor";
import { useCopy } from "../../copy/i18n";
import { formatManila, useAsOf } from "../../demo/clockState";
import { driverBars, firedRules, leadingModel, type DriverBar } from "../../lib/drivers";
import { Pill } from "../../ui/Chip";
import { Icon } from "../../ui/Icon";

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function WhyPanel({ prediction }: { prediction: PredictorOutput }) {
  const { t } = useCopy();
  const { asOf } = useAsOf();
  const model = leadingModel(prediction);
  const bars = driverBars(prediction.drivers?.[model], 3);
  const rules = firedRules(prediction);
  const level = prediction.signal_level;
  const actions = prediction.operator_actions ?? [];

  return (
    <section className="rounded-xl bg-ink p-6 text-foam" aria-labelledby="why-title" data-testid="why-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-bold text-coral">{t("detector.label")}</p>
        <Pill className={level >= 3 ? "bg-coral text-ink" : "bg-ink-raised text-foam"}>
          <Icon name={level >= 1 ? "alert" : "check"} size={14} />
          {t("why.signal", { level })}
        </Pill>
      </div>
      <h2 id="why-title" className="mt-1 text-[26px] leading-tight">{t("why.title")}</h2>
      <p className="mt-1 text-[14px] text-sky">{t("why.as_of", { time: formatManila(asOf) })}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Probability label={t("why.p_turbidity")} value={prediction.p_turbidity} lead={model === "turbidity"} />
        <Probability label={t("why.p_drought")} value={prediction.p_drought} lead={model === "drought"} />
      </div>

      <h3 className="mt-5 text-[15px] font-bold">
        {t("why.drivers_title", { model: t(model === "turbidity" ? "why.model_turbidity" : "why.model_drought") })}
      </h3>
      {rules.length > 0 && (
        <div className="mt-2 rounded-lg bg-ink-raised p-3 text-[14px]">
          <strong className="block">{t("why.fallback")}</strong>
          <ul className="mt-1 flex flex-col gap-1">
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      )}
      <ul className="mt-2 flex flex-col gap-3">
        {bars.filter((bar) => !bar.rule).map((bar) => <DriverRow key={bar.feature} bar={bar} />)}
      </ul>

      <h3 className="mt-5 text-[15px] font-bold">{t("why.actions_title")}</h3>
      {actions.length === 0 ? (
        <p className="mt-2 text-[14px] text-sky">{t("why.no_actions")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {actions.map((action) => (
            <li key={`${action.source}-${action.action}`} className="rounded-lg bg-ink-raised p-3 text-[14px]">
              <p>{action.action}</p>
              <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[12px] font-bold ${action.source.startsWith("WSP") ? "bg-sky text-ink" : "bg-mist text-ink"}`}>
                {action.source}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[13px] text-sky">{t("why.model_note")}</p>
    </section>
  );
}

function Probability({ label, value, lead }: { label: string; value: number; lead: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${lead ? "bg-ink-raised ring-2 ring-sky" : "bg-ink-raised"}`}>
      <p className="text-[13px] text-sky">{label}</p>
      <p className="numeral mt-1 text-[32px]">{pct(value)}</p>
    </div>
  );
}

function DriverRow({ bar }: { bar: DriverBar }) {
  const { t } = useCopy();
  const width = Math.max(4, Math.round(bar.fraction * 100));
  return (
    <li>
      <p className="text-[14px]">{bar.text}</p>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="h-2.5 flex-1 rounded-full bg-ink-raised" aria-hidden="true">
          <div className={`h-full rounded-full ${bar.positive ? "bg-coral" : "bg-sky"}`} style={{ width: `${width}%` }} />
        </div>
        <span className="w-[132px] shrink-0 text-right text-[12px] font-bold tabular-nums">
          {bar.positive ? t("why.share", { pct: Math.round(bar.fraction * 100) }) : t("why.protective")}
        </span>
      </div>
    </li>
  );
}
