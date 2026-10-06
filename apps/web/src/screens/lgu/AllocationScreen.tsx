// SPEC: 06 — LGU allocation priority: the system recommends, the officer orders (wireframe p.10).
// SPEC: 09 — one row per (barangay, consumer type), LGU > Residential > Commercial > Industrial by
// default, with a map of where each barangay sits in the order.
// Human-in-the-loop: every row keeps its suggested rank, so each override is recorded as
// overridden_from_suggested_rank on the AllocationDecision.
import { Suspense, lazy, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BackendNotConnected, StepOutOfOrder, confirmAllocation } from "../../actions/lgu";
import { useCopy } from "../../copy/i18n";
import type { AllocationDecision } from "../../contracts/spec06";
import { CONSUMER_TYPES, type ConsumerType } from "../../contracts/spec09";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { AFFECTED_GROUPS, BARANGAY_POINTS, OFFICER, OPEN_EVENT, ROUTABLE, type AffectedGroupRow } from "../../data/mockLgu";
import { formatTime, formatWindow } from "../../lib/time";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { LguLayout } from "./LguLayout";
import { TypeBadge } from "./consumerTypes";
import type { MapPin, ServedFirst } from "./PriorityMap";

// Leaflet only loads on /lgu, so resident phones never download it (CLAUDE.md: keep pages light).
const PriorityMap = lazy(() => import("./PriorityMap").then((m) => ({ default: m.PriorityMap })));

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => n.toLocaleString("en-US");
const rowKey = (row: AffectedGroupRow) => `${row.barangay_id}:${row.consumer_type}`;

type SaveState = "idle" | "saving" | "saved" | "not_connected" | "out_of_order" | "error";

/** "{n} connections" / "{n} facilities", or "coverage unknown" — never a guessed number (spec 03). */
function useCountLabel() {
  const { t } = useCopy();
  return (type: ConsumerType, n: number | null) => {
    if (n === null) return t("lgu.coverage_unknown");
    if (type === "lgu") return n === 1 ? t("lgu.facility_one") : t("lgu.facilities_n", { n: fmt(n) });
    return n === 1 ? t("lgu.connections_one") : t("lgu.connections", { n: fmt(n) });
  };
}

/** Each barangay's best place in the current order, the type of that row, and its known non-LGU connections. */
function mapPins(order: AffectedGroupRow[]): MapPin[] {
  const pins = new Map<string, MapPin>();
  order.forEach((row, i) => {
    const pin = pins.get(row.barangay_id)
      ?? { barangay_id: row.barangay_id, name: row.name, rank: i + 1, type: row.consumer_type, connections: null };
    if (row.consumer_type !== "lgu" && row.connections_affected !== null) {
      pin.connections = (pin.connections ?? 0) + row.connections_affected;
    }
    pins.set(row.barangay_id, pin);
  });
  return [...pins.values()];
}

/** What a row needs, in words: facilities, elderly/PWD, no backup. Shared by the list and the map card. */
function useNeed() {
  const { t } = useCopy();
  return (row: AffectedGroupRow) => {
    const parts = [
      ...row.facilities.map((f) => t(`facility.${f}`)),
      row.vulnerable_residents > 0 ? t("lgu.need.vulnerable", { n: row.vulnerable_residents }) : null,
      row.no_backup_connections > 0 ? t("lgu.need.no_backup", { n: row.no_backup_connections, jmp }) : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
    return row.consumer_type === "residential" && row.connections_affected !== null ? t("lgu.need.covered", { jmp }) : null;
  };
}

export function AllocationScreen() {
  const { t } = useCopy();
  const countLabel = useCountLabel();
  const needOf = useNeed();
  const [order, setOrder] = useState<AffectedGroupRow[]>(() =>
    [...AFFECTED_GROUPS].sort((a, b) => a.suggested_rank - b.suggested_rank),
  );
  const [save, setSave] = useState<SaveState>("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); // hovered/focused barangay, linked between map and list
  const listRef = useFlip(order.map(rowKey));

  const decisions: AllocationDecision[] = order.map((row, i) => ({
    disruption_id: OPEN_EVENT.disruption_id,
    barangay_id: row.barangay_id,
    consumer_type: row.consumer_type,
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

  // Map pin → the barangay's first row in the list.
  function showInList(barangayId: string) {
    setSelected(barangayId);
    const first = order.find((r) => r.barangay_id === barangayId);
    if (!first) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-flip-key="${rowKey(first)}"]`);
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }

  async function onConfirm() {
    setSave("saving");
    try {
      await confirmAllocation(decisions);
      setSave("saved");
    } catch (error) {
      setSave(
        error instanceof BackendNotConnected ? "not_connected"
          : error instanceof StepOutOfOrder ? "out_of_order"
          : "error",
      );
    }
  }

  const first = order[0];
  const servedFirst: ServedFirst | null = first
    ? { name: first.name, type: first.consumer_type, count: countLabel(first.consumer_type, first.connections_affected), detail: needOf(first) }
    : null;

  const byType = (type: ConsumerType) => AFFECTED_GROUPS.filter((r) => r.consumer_type === type);
  const sumKnown = (rows: AffectedGroupRow[]) => rows.reduce((sum, r) => sum + (r.connections_affected ?? 0), 0);
  const lguRows = byType("lgu");
  const totals = {
    barangays: new Set(AFFECTED_GROUPS.map((r) => r.barangay_id)).size,
    connections: sumKnown(AFFECTED_GROUPS.filter((r) => r.consumer_type !== "lgu")),
    noBackup: AFFECTED_GROUPS.reduce((sum, r) => sum + r.no_backup_connections, 0),
    vulnerable: AFFECTED_GROUPS.reduce((sum, r) => sum + r.vulnerable_residents, 0),
    health: lguRows.filter((r) => r.facilities.includes("health_station")).length,
    school: lguRows.filter((r) => r.facilities.includes("school")).length,
    evac: lguRows.filter((r) => r.facilities.includes("evacuation_center")).length,
  };

  return (
    <LguLayout>
      <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("lgu.title")}</h1>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard tone="bg-coral-wash" icon="dropOff" label={t("lgu.what_happened")}
          value={t(`lgu.headline.${OPEN_EVENT.cause}`)}
          note={t("lgu.flagged_by", { who: OPEN_EVENT.flagged_by, time: formatTime(OPEN_EVENT.flagged_at) })} />
        <SummaryCard tone="bg-sky" icon="drop" label={t("lgu.who_affected")}
          value={t("lgu.connections", { n: fmt(totals.connections) })}
          note={t("lgu.affected_sub", { barangays: totals.barangays, no_backup: totals.noBackup })} />
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
          <h2 id="priority-title" className="text-[24px]">{t("lgu.priority_title")}</h2>
          <Suspense fallback={<div className="mt-3 h-[400px] rounded-xl bg-mist" aria-hidden="true" />}>
            <PriorityMap
              points={BARANGAY_POINTS}
              pins={mapPins(order)}
              servedFirst={servedFirst}
              active={active}
              onActive={setActive}
              onSelect={showInList}
            />
          </Suspense>
          <ol ref={listRef} className="mt-6 flex flex-col gap-3">
            {order.map((row, i) => (
              <PriorityRow
                key={rowKey(row)}
                row={row}
                rank={i + 1}
                first={i === 0}
                last={i === order.length - 1}
                highlighted={row.barangay_id === selected}
                linked={row.barangay_id === active}
                need={needOf(row)}
                countLabel={countLabel(row.consumer_type, row.connections_affected)}
                onActive={setActive}
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
              <StatRow label={t("lgu.stat_barangays")} value={totals.barangays} />
              {CONSUMER_TYPES.map((type) => {
                const rows = byType(type);
                const unknown = rows.some((r) => r.connections_affected === null);
                return (
                  <StatRow key={type} label={<TypeBadge type={type} />}
                    value={`${countLabel(type, sumKnown(rows))}${unknown ? ` + ${t("lgu.coverage_unknown")}` : ""}`} />
                );
              })}
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
            {(save === "not_connected" || save === "out_of_order" || save === "error") && (
              <p role="alert" className="panel-in mt-4 flex gap-2.5 rounded-lg bg-ink-raised p-3 text-[14px]">
                <Icon name="wifiOff" size={18} className="mt-0.5" />
                {save === "not_connected" ? t("lgu.not_connected") : save === "out_of_order" ? t("lgu.out_of_order") : t("app.error_body")}
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

function StatRow({ label, value }: { label: ReactNode; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-haze py-3 last:border-b-0">
      <dt>{label}</dt>
      <dd className="text-right font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function PriorityRow({ row, rank, first, last, highlighted, linked, need, countLabel, onActive, onUp, onDown }: {
  row: AffectedGroupRow;
  rank: number;
  first: boolean;
  last: boolean;
  highlighted: boolean;
  linked: boolean; // its barangay is hovered on the map or the list
  need: string | null;
  countLabel: string;
  onActive: (barangayId: string | null) => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useCopy();
  const moved = row.suggested_rank !== rank;
  const label = `${row.name} · ${t(`type.${row.consumer_type}`)}`;

  const levelI = row.service_level === "level_i" && row.consumer_type === "residential";

  return (
    <li
      data-flip-key={rowKey(row)}
      onMouseEnter={() => onActive(row.barangay_id)}
      onMouseLeave={() => onActive(null)}
      className={`flex items-center gap-4 rounded-xl border-[1.5px] p-4 transition-colors duration-150 ${linked ? "bg-mist" : "bg-foam"} ${highlighted ? "border-ink outline-2 outline-ink" : "border-haze"}`}
    >
      <span className="numeral flex size-12 shrink-0 items-center justify-center rounded-md bg-sky text-[24px]">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[20px]">{row.name}</span>
          <TypeBadge type={row.consumer_type} />
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
        {(need || levelI) && (
          <p className="mt-0.5 text-ink-soft">
            {need}
            {row.coverage_confidence === "estimate" && row.no_backup_connections > 0 && (
              <span className="ml-1.5 text-[13px] font-bold">({t("lgu.estimate")})</span>
            )}
            {levelI && <span className="ml-1.5 text-[13px] font-bold">· {t("lgu.level_i")}</span>}
          </p>
        )}
      </div>
      <span className="numeral shrink-0 text-[24px]">{countLabel}</span>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onUp} disabled={first} aria-label={t("lgu.move_up", { name: label })}
          className="press flex size-11 items-center justify-center rounded-sm bg-mist disabled:opacity-40">
          <Icon name="chevronUp" />
        </button>
        <button type="button" onClick={onDown} disabled={last} aria-label={t("lgu.move_down", { name: label })}
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
