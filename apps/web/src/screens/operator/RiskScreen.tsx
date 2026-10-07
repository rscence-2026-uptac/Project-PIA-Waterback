// Operator Predictions tab (/operator/risk): the turbidity and drought models in full, side by side,
// with every recommended action. Monitor (/operator) shows the short RiskSummary and links here.
import { useEffect } from "react";
import { useCopy } from "../../copy/i18n";
import { formatManila, useAsOf } from "../../demo/clockState";
import { SampleChip } from "../../ui/Chip";
import { OperatorTopBar } from "./OperatorTopBar";
import { RiskTrend } from "./RiskTrend";
import { ActionList, ModelScorecard, RiskHero, SignalPill } from "./PlantRisk";
import { MODELS, useOperatorPrediction } from "./plantRiskState";

export function RiskScreen() {
  const { t } = useCopy();
  const { asOf } = useAsOf();
  const { prediction, sample, history } = useOperatorPrediction({ withHistory: true });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []); // opened from the Monitor summary, which sits below the fold

  return (
    <div className="min-h-dvh bg-foam text-[15px]">
      <OperatorTopBar />
      <main className="mx-auto max-w-[1360px] px-8 pb-16 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[32px] leading-tight tracking-[-0.03em]">{t("risk.title")}</h1>
          {prediction && (
            <span className="flex items-center gap-2">
              {sample && <SampleChip always />}
              <SignalPill level={prediction.signal_level} />
            </span>
          )}
        </div>
        <p className="mt-2 text-[14px] text-ink-soft">
          {t("why.as_of", { time: formatManila(asOf) })} · {t("why.scope_note")} {t("risk.signal_note")}
        </p>

        {!prediction ? (
          <p className="mt-8 rounded-xl bg-mist p-6 text-[15px]">{t("risk.unavailable")}</p>
        ) : (
          <>
            {/* Reading order: where each risk is now, how it got there, why, then what to do. */}
            <div className="mt-6">
              <RiskHero prediction={prediction} history={history} />
            </div>
            {/* Live: the predictor's 48 h history mode. Sample mode: the sample history. Hidden when there is none. */}
            {history && (
              <div className="mt-6">
                <RiskTrend history={history} sample={sample} />
              </div>
            )}
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {MODELS.map((model) => <ModelScorecard key={model} prediction={prediction} model={model} />)}
            </div>

            <section className="mt-6 rounded-xl bg-ink p-6 text-foam" aria-labelledby="risk-actions">
              <h2 id="risk-actions" className="text-[22px] leading-tight">{t("why.actions_title")}</h2>
              <ActionList actions={prediction.operator_actions ?? []} />
            </section>

            <details className="mt-6 rounded-xl bg-mist p-6 text-[14px]">
              <summary className="cursor-pointer font-bold">{t("why.how_title")}</summary>
              <p className="mt-2 max-w-[80ch]">{t("why.how_body")}</p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
