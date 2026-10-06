// SPEC: 10 — /lgu/plan: where people lack safe water, and the 3 best places for a permanent source.
// Works without an event (hours_dry 0). English only (LGU screen).
import { Suspense, lazy, useMemo } from "react";
import { useCopy } from "../../copy/i18n";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { SEED_SOURCES } from "../../data/seedSources";
import { FACILITIES_BY_BARANGAY, VULNERABLE_BY_BARANGAY, clustersFile } from "../../data/needInputs";
import { accessGapSites, countSafeMappedSources, scoreClusters } from "../../lib/need";
import { Icon } from "../../ui/Icon";
import { LguLayout } from "./LguLayout";

// Leaflet only loads on LGU map screens, so resident phones never download it.
const PlanMap = lazy(() => import("./PlanMap").then((m) => ({ default: m.PlanMap })));

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => n.toLocaleString("en-US");

export function PlanScreen() {
  const { t } = useCopy();
  const { rows, gap } = useMemo(() => {
    const scored = scoreClusters({
      clusters: clustersFile.clusters, barangays: clustersFile.barangays, sources: SEED_SOURCES,
      vulnerableByBarangay: VULNERABLE_BY_BARANGAY, facilitiesByBarangay: FACILITIES_BY_BARANGAY,
      startedAt: null, now: new Date(),
    });
    return { rows: scored, gap: accessGapSites(scored, clustersFile.clusters, 3) };
  }, []);
  const empty = clustersFile.clusters.length === 0;

  return (
    <LguLayout>
      <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("plan.title")}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-soft">{t("plan.sub")}</p>

      {empty ? (
        <div className="mt-8 rounded-xl border-[1.5px] border-dashed border-haze p-8" role="status">
          <p className="font-display text-[24px]">{t("lgu.rows_empty_title")}</p>
          <p className="mt-2 text-ink-soft">{t("lgu.rows_empty_body")}</p>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-6">
        <div className="min-w-0 flex-[999_1_640px]">
          <Suspense fallback={<div className="h-[480px] rounded-xl bg-mist" aria-hidden="true" />}>
            <PlanMap clusters={clustersFile.clusters} rows={rows} sites={gap.sites} />
          </Suspense>
        </div>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <section className="rounded-xl bg-coral-wash p-6">
            <p className="flex items-center gap-2 text-[14px] font-bold">
              <Icon name="alert" size={16} className="text-coral-deep" />
              {t("plan.total_label", { jmp })}
            </p>
            <p className="numeral mt-2 text-[40px] leading-none">{fmt(gap.total_gap_people)}</p>
            <p className="mt-2 text-[14px]">{t("lgu.safe_basis", { n: countSafeMappedSources(SEED_SOURCES) })}</p>
            <p className="mt-1 text-[14px]">{t("lgu.map_source")}</p>
          </section>

          <section className="rounded-xl border-[1.5px] border-haze p-6">
            <h2 className="text-[22px]">{t("plan.sites_title")}</h2>
            {gap.sites.length === 0 ? (
              <p className="mt-3 text-ink-soft">{t("plan.sites_empty")}</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {gap.sites.map((s, i) => (
                  <li key={s.cluster_id} className="flex items-start gap-3 rounded-lg bg-mist p-3">
                    <span className="numeral flex size-11 shrink-0 items-center justify-center gap-0.5 rounded-md bg-ink text-[20px] text-foam">
                      <Icon name="star" size={14} />{i + 1}
                    </span>
                    <span className="font-bold">
                      {t("plan.site_line", { n: i + 1, label: s.label, people: fmt(s.gained_people), jmp })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-4 text-[14px] text-ink-soft">{t("plan.note")}</p>
          </section>
        </aside>
      </div>
    </LguLayout>
  );
}
