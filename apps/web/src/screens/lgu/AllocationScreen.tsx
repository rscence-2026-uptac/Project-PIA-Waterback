// SPEC: 06 — LGU allocation priority: the system recommends, the officer orders (wireframe p.10).
// Human-in-the-loop: every row keeps its suggested rank, so each override is recorded as
// overridden_from_suggested_rank on the AllocationDecision.
import { useLayoutEffect, useRef, useState } from "react";
import { BackendNotConnected, confirmAllocation } from "../../actions/lgu";
import { useCopy } from "../../copy/i18n";
import type { AllocationDecision } from "../../contracts/spec06";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { AFFECTED, OFFICER, OPEN_EVENT, ROUTABLE, type AffectedBarangay } from "../../data/mockLgu";
import { formatTime, formatWindow } from "../../lib/time";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { LguLayout } from "./LguLayout";

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => n.toLocaleString("en-US");

function households(row: AffectedBarangay) {
  return row.piped_households_affected + row.unpiped_households_affected;
}

type SaveState = "idle" | "saving" | "saved" | "not_connected" | "error";

export function AllocationScreen() {
  const { t } = useCopy();
  const [order, setOrder] = useState<AffectedBarangay[]>(() =>
    [...AFFECTED].sort((a, b) => a.suggested_rank - b.suggested_rank),
  );
  const [save, setSave] = useState<SaveState>("idle");
  const listRef = useFlip(order.map((r) => r.barangay_id));

  const decisions: AllocationDecision[] = order.map((row, i) => ({
    disruption_id: OPEN_EVENT.disruption_id,
    barangay_id: row.barangay_id,
    priority_rank: i + 1,
    officer_id: OFFICER.id,
    overridden_from_suggested_rank: row.suggested_rank === i + 1 ? null : row.suggested_rank,
  }));
  const changes = decisions.filter((d) => d.overridden_from_suggested_rank !== null).length;

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setSave("idle");
  }

  async function onConfirm() {
    setSave("saving");
    try {
      await confirmAllocation(decisions);
      setSave("saved");
    } catch (error) {
      setSave(error instanceof BackendNotConnected ? "not_connected" : "error");
    }
  }

  const totals = {
    households: AFFECTED.reduce((sum, r) => sum + households(r), 0),
    noBackup: AFFECTED.reduce((sum, r) => sum + r.no_backup_households, 0),
    vulnerable: AFFECTED.reduce((sum, r) => sum + r.vulnerable_households, 0),
    health: AFFECTED.filter((r) => r.facilities.includes("health_station")).length,
    school: AFFECTED.filter((r) => r.facilities.includes("school")).length,
    evac: AFFECTED.filter((r) => r.facilities.includes("evacuation_center")).length,
  };

  return (
    <LguLayout>
      <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("lgu.title")}</h1>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard tone="bg-coral-wash" icon="dropOff" label={t("lgu.what_happened")}
          value={t(`lgu.headline.${OPEN_EVENT.cause}`)}
          note={t("lgu.flagged_by", { who: OPEN_EVENT.flagged_by, time: formatTime(OPEN_EVENT.flagged_at) })} />
        <SummaryCard tone="bg-sky" icon="drop" label={t("lgu.who_affected")}
          value={t("lgu.households", { n: fmt(totals.households) })}
          note={t("lgu.affected_sub", { barangays: AFFECTED.length, no_backup: totals.noBackup })} />
        <SummaryCard tone="bg-sky" icon="clock" label={t("lgu.expected_back")}
          value={t("lgu.window_today", { window: formatWindow(OPEN_EVENT.window_start, OPEN_EVENT.window_end) })}
          note={t("lgu.most_likely", { time: formatTime(OPEN_EVENT.likely_at) })} />
        <div className="rounded-xl bg-ink p-6 text-foam">
          {save === "saved" ? (
            <div className="panel-in">
              <p className="text-[14px] font-bold text-sky">{t("lgu.decision_step", { n: 2, total: 2 })}</p>
              <p className="mt-2 font-display text-[26px] leading-tight">{t("lgu.decision_done_title")}</p>
              <p className="mt-2 text-[14px] text-sky">{t("lgu.decision_done_body")}</p>
            </div>
          ) : (
            <>
              <p className="text-[14px] font-bold text-sky">{t("lgu.decision_step", { n: 1, total: 2 })}</p>
              <p className="mt-2 font-display text-[26px] leading-tight">{t("lgu.decision_title")}</p>
              <p className="mt-2 text-[14px] text-sky">{t("lgu.decision_body")}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-6">
        <section className="min-w-0 flex-[999_1_640px]" aria-labelledby="priority-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="priority-title" className="text-[24px]">{t("lgu.priority_title")}</h2>
            <span className="text-[14px] text-ink-soft">{t("lgu.priority_rule", { jmp })}</span>
          </div>
          <ol ref={listRef} className="mt-3 flex flex-col gap-3">
            {order.map((row, i) => (
              <PriorityRow
                key={row.barangay_id}
                row={row}
                rank={i + 1}
                first={i === 0}
                last={i === order.length - 1}
                onUp={() => move(i, -1)}
                onDown={() => move(i, 1)}
              />
            ))}
          </ol>
          <p className="mt-4 text-[14px] text-ink-soft">{t("lgu.log_note")}</p>
        </section>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <section className="rounded-xl border-[1.5px] border-haze p-6">
            <h2 className="text-[22px]">{t("lgu.affected_title")}</h2>
            <dl className="mt-3">
              <StatRow label={t("lgu.stat_barangays")} value={AFFECTED.length} />
              <StatRow label={t("lgu.stat_households")} value={fmt(totals.households)} />
              <StatRow label={t("lgu.stat_off_network", { jmp })} value={totals.noBackup} />
              <StatRow label={t("lgu.stat_vulnerable")} value={totals.vulnerable} />
              <StatRow label={t("lgu.stat_facilities")}
                value={t("lgu.facilities_value", { health: totals.health, school: totals.school, evac: totals.evac })} />
            </dl>
          </section>

          <section className="rounded-xl border-[1.5px] border-haze p-6">
            <h2 className="text-[22px]">{t("lgu.route_title")}</h2>
            <dl className="mt-3">
              <StatRow label={t("lgu.trucks")} value={t("lgu.trucks_value", { trucks: ROUTABLE.trucks, trips: ROUTABLE.trips_each })} />
              <StatRow label={t("lgu.truck_water", { time: formatTime(ROUTABLE.truck_deadline) })}
                value={t("lgu.litres_approx", { litres: fmt(ROUTABLE.truck_litres) })} />
              <StatRow label={t("lgu.partners")}
                value={t("lgu.partners_value", { open: ROUTABLE.partners_open, total: ROUTABLE.partners_total })} />
            </dl>
          </section>

          <section className="rounded-xl bg-ink p-6 text-foam">
            <h2 className="text-[24px]">{t("lgu.confirm_title")}</h2>
            <p className="mt-3 text-sky">{t("lgu.confirm_body")}</p>
            <p className="mt-3 text-[14px] font-bold">
              {changes === 0 ? t("lgu.changes_none") : t("lgu.changes_some", { n: changes })}
            </p>
            <Button variant="soft" className="mt-4 w-full" onClick={onConfirm} disabled={save === "saving"}>
              {save === "saving" ? t("lgu.saving") : t("lgu.confirm_button", { name: OFFICER.name })}
            </Button>
            {(save === "not_connected" || save === "error") && (
              <p role="alert" className="panel-in mt-4 flex gap-2.5 rounded-lg bg-ink-raised p-3 text-[14px]">
                <Icon name="wifiOff" size={18} className="mt-0.5" />
                {save === "not_connected" ? t("lgu.not_connected") : t("app.error_body")}
              </p>
            )}
          </section>
        </aside>
      </div>
    </LguLayout>
  );
}

function SummaryCard({ tone, icon, label, value, note }: {
  tone: string;
  icon: "dropOff" | "drop" | "clock";
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={`rounded-xl p-6 ${tone}`}>
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <Icon name={icon} size={16} className={icon === "dropOff" ? "text-coral-deep" : ""} />
        {label}
      </p>
      <p className="mt-2 font-display text-[26px] leading-tight">{value}</p>
      <p className="mt-2 text-[14px]">{note}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-haze py-3 last:border-b-0">
      <dt>{label}</dt>
      <dd className="text-right font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function PriorityRow({ row, rank, first, last, onUp, onDown }: {
  row: AffectedBarangay;
  rank: number;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useCopy();
  const moved = row.suggested_rank !== rank;

  // Spec 03: estimates are labelled; a barangay with no coverage data never shows a guessed number.
  const needParts = [
    ...row.facilities.map((f) => t(`facility.${f}`)),
    row.vulnerable_households > 0 ? t("lgu.need.vulnerable", { n: row.vulnerable_households }) : null,
    row.no_backup_households > 0 ? t("lgu.need.no_backup", { n: row.no_backup_households, jmp }) : null,
  ].filter(Boolean);
  const need = needParts.length > 0 ? needParts.join(" · ") : t("lgu.need.covered", { jmp });

  return (
    <li data-flip-key={row.barangay_id} className="flex items-center gap-4 rounded-xl border-[1.5px] border-haze bg-foam p-4">
      <span className="numeral flex size-12 shrink-0 items-center justify-center rounded-md bg-sky text-[24px]">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[20px]">{row.name}</span>
          {row.reported_not_restored && (
            <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-1 text-[13px] font-bold text-ink">
              <Icon name="dropOff" size={14} />
              {t("lgu.reported_not_restored")}
            </span>
          )}
          {moved && (
            <span className="rounded-full bg-mist px-2.5 py-1 text-[13px] font-bold">{t("lgu.moved_from", { from: row.suggested_rank })}</span>
          )}
        </p>
        <p className="mt-0.5 text-ink-soft">
          {need}
          {row.coverage_confidence === "estimate" && row.no_backup_households > 0 && (
            <span className="ml-1.5 text-[13px] font-bold">({t("lgu.estimate")})</span>
          )}
          {row.coverage_confidence === "unknown" && (
            <span className="ml-1.5 text-[13px] font-bold">· {t("lgu.coverage_unknown")}</span>
          )}
        </p>
      </div>
      <span className="numeral shrink-0 text-[24px]">{t("lgu.households", { n: households(row).toLocaleString("en-US") })}</span>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onUp} disabled={first} aria-label={t("lgu.move_up", { name: row.name })}
          className="press flex size-11 items-center justify-center rounded-sm bg-mist disabled:opacity-40">
          <Icon name="chevronUp" />
        </button>
        <button type="button" onClick={onDown} disabled={last} aria-label={t("lgu.move_down", { name: row.name })}
          className="press flex size-11 items-center justify-center rounded-sm bg-mist disabled:opacity-40">
          <Icon name="chevronDown" />
        </button>
      </div>
    </li>
  );
}

/** FLIP: rows that swap slide to their new place over 200 ms (wireframe motion #9). */
function useFlip(keys: string[]) {
  const listRef = useRef<HTMLOListElement>(null);
  const positions = useRef(new Map<string, number>());
  const signature = keys.join("|");

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-flip-key]"));
    for (const item of items) {
      const key = item.dataset.flipKey!;
      const top = item.getBoundingClientRect().top;
      const before = positions.current.get(key);
      if (before !== undefined && before !== top && !reduce) {
        item.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }],
          { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
      }
      positions.current.set(key, top);
    }
  }, [signature]);

  return listRef;
}
