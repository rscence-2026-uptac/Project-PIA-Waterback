// SPEC: 06 — LGU allocation priority: the system recommends, the officer orders (wireframe p.10).
// SPEC: 10 — rows are settlement clusters ranked by need points (replaces the spec 09 consumer-type ranking), in a
// scrollable list, with a need-hotspot map, a truck plan and an early-warning panel.
// Human-in-the-loop: every row keeps its suggested rank, so each override is recorded as
// overridden_from_suggested_rank on the AllocationDecision.
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackendNotConnected, StepOutOfOrder, confirmAllocation } from "../../actions/lgu";
import { useCopy } from "../../copy/i18n";
import type { AllocationDecision } from "../../contracts/spec06";
import { DEPOT, FACILITY_WEIGHT, MAX_TIME_FACTOR, NO_ACCESS_WEIGHT, VULNERABLE_WEIGHT, type NeedRow } from "../../contracts/spec10";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { FACILITIES_BY_BARANGAY, VULNERABLE_BY_BARANGAY, clustersFile } from "../../data/needInputs";
import { AFFECTED, OFFICER, OPEN_EVENT, ROUTABLE } from "../../data/mockLgu";
import { SEED_SOURCES } from "../../data/seedSources";
import { fetchDrivingRoute } from "../../lib/drivingRoute";
import { countSafeMappedSources, pickDropPoints, scoreClusters } from "../../lib/need";
import { formatTime, formatWindow } from "../../lib/time";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { LguLayout } from "./LguLayout";
import { EarlyWarningPanel, TruckPanel, type RouteState } from "./NeedPanels";
import type { MapRow } from "./PriorityMap";

// Leaflet only loads on /lgu, so resident phones never download it (CLAUDE.md: keep pages light).
const PriorityMap = lazy(() => import("./PriorityMap").then((m) => ({ default: m.PriorityMap })));

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// MOCK: the predictor signal level for the open event; every affected barangay carries the same one (spec 02).
const EVENT_SIGNAL = Math.max(0, ...AFFECTED.map((a) => a.signal_level));
const EARLY_WARNING_MIN_SIGNAL = 2; // SPEC: 10 — Tier 1 is warned at prediction, signal >= 2

type SaveState = "idle" | "saving" | "saved" | "not_connected" | "out_of_order" | "error";

/** A ticking clock, so hours-without-water stays current without a reload. */
function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function AllocationScreen() {
  const { t } = useCopy();
  const now = useNow();
  const nowKey = Math.floor(now.getTime() / 60_000);
  const scored = useMemo(
    () => scoreClusters({
      clusters: clustersFile.clusters, barangays: clustersFile.barangays, sources: SEED_SOURCES,
      vulnerableByBarangay: VULNERABLE_BY_BARANGAY, facilitiesByBarangay: FACILITIES_BY_BARANGAY,
      startedAt: OPEN_EVENT.flagged_at, now,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed once a minute, keyed on nowKey
    [nowKey],
  );
  const byId = useMemo(() => new Map(scored.map((r) => [r.cluster_id, r])), [scored]);
  const clusterById = useMemo(() => new Map(clustersFile.clusters.map((c) => [c.cluster_id, c])), []);

  // Officer order: ids only, seeded from the suggested order. Ranks never change with time (the time factor is uniform).
  const [orderIds, setOrderIds] = useState<string[]>(() => scored.map((r) => r.cluster_id));
  const order = useMemo(() => orderIds.map((id) => byId.get(id)).filter((r): r is NeedRow => !!r), [orderIds, byId]);

  const [save, setSave] = useState<SaveState>("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); // hovered/focused cluster, linked between map and list
  const [showRoute, setShowRoute] = useState(false);
  const [moved, setMoved] = useState<{ id: string; n: number } | null>(null);
  const { listRef, scrollRef, more, onScroll, centreRow } = useScrollList(order.map((r) => r.cluster_id), moved);

  const decisions: AllocationDecision[] = order.map((row, i) => ({
    disruption_id: OPEN_EVENT.disruption_id,
    cluster_id: row.cluster_id,
    barangay_id: row.barangay_id,
    priority_rank: i + 1,
    officer_id: OFFICER.id,
    overridden_from_suggested_rank: row.suggested_rank === i + 1 ? null : row.suggested_rank,
  }));
  const changes = decisions.filter((d) => d.overridden_from_suggested_rank !== null).length;

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= orderIds.length) return;
    const next = [...orderIds];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderIds(next);
    setMoved({ id: orderIds[index], n: (moved?.n ?? 0) + 1 });
    setSave("idle");
  }

  // Map pin → its row: scrolls only the list container, never the page.
  function showInList(clusterId: string) {
    setSelected(clusterId);
    const el = centreRow(clusterId, reduceMotion());
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

  // Truck plan: drop points over the current order; stops = trucks x trips, litres capped by the truck total.
  const plan = useMemo(
    () => pickDropPoints(order, clustersFile.clusters, ROUTABLE.trucks * ROUTABLE.trips_each, ROUTABLE.truck_litres),
    [order],
  );
  const stopsKey = plan.stops.map((s) => s.cluster_id).join("|");
  const [road, setRoad] = useState<{ key: string; path: [number, number][] | null } | null>(null);
  useEffect(() => {
    if (!showRoute || plan.stops.length === 0 || road?.key === stopsKey) return;
    let live = true;
    fetchDrivingRoute([DEPOT, ...plan.stops])
      .then((r) => live && setRoad({ key: stopsKey, path: r.path }))
      .catch(() => live && setRoad({ key: stopsKey, path: null })); // straight dashed lines
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the toggle or the stops change
  }, [showRoute, stopsKey]);
  const routeState: RouteState = !showRoute ? "idle" : road?.key !== stopsKey ? "loading" : road.path ? "road" : "straight";

  const mapRows: MapRow[] = useMemo(() => order.flatMap((r, i) => {
    const c = clusterById.get(r.cluster_id);
    return c
      ? [{ cluster_id: r.cluster_id, label: r.label, lat: c.lat, lng: c.lng, people: r.people, need_points: r.need_points, no_safe_access: r.no_safe_access, rank: i + 1, reasons: r.reasons }]
      : [];
  }), [order, clusterById]);

  const totals = useMemo(() => ({
    clusters: scored.length,
    barangays: new Set(scored.map((r) => r.barangay_id)).size,
    people: scored.reduce((s, r) => s + r.people, 0),
    noSafe: scored.filter((r) => r.no_safe_access).reduce((s, r) => s + r.people, 0),
    vulnerable: scored.reduce((s, r) => s + r.vulnerable_est, 0),
    facilities: scored.filter((r) => r.has_critical_facility).reduce((s, r) => s + (FACILITIES_BY_BARANGAY[r.barangay_id]?.length ?? 0), 0),
  }), [scored]);
  const empty = scored.length === 0;

  return (
    <LguLayout>
      <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("lgu.title")}</h1>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard tone="bg-coral-wash" icon="dropOff" label={t("lgu.what_happened")}
          value={t(`lgu.headline.${OPEN_EVENT.cause}`)}
          note={t("lgu.flagged_by", { who: OPEN_EVENT.flagged_by, time: formatTime(OPEN_EVENT.flagged_at) })} />
        <SummaryCard tone="bg-sky" icon="drop" label={t("lgu.who_affected")}
          value={t("lgu.who_value", { n: fmt(totals.people) })}
          note={t("lgu.affected_sub_clusters", { clusters: totals.clusters, barangays: totals.barangays })} />
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
          <Suspense fallback={<div className="mt-3 h-[480px] rounded-xl bg-mist" aria-hidden="true" />}>
            <PriorityMap
              rows={mapRows}
              truck={{ show: showRoute, stops: plan.stops, path: road?.key === stopsKey ? road.path : null }}
              active={active}
              onActive={setActive}
              onSelect={showInList}
            />
          </Suspense>

          {empty ? (
            <div role="status" className="mt-6 rounded-xl border-[1.5px] border-dashed border-haze p-8">
              <p className="font-display text-[24px]">{t("lgu.rows_empty_title")}</p>
              <p className="mt-2 text-ink-soft">{t("lgu.rows_empty_body")}</p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              onScroll={onScroll}
              role="region"
              aria-label={t("lgu.priority_title")}
              tabIndex={0}
              className="relative mt-6 max-h-[min(640px,70dvh)] overflow-y-auto overscroll-y-contain rounded-xl p-1 pr-2 [scrollbar-width:thin] [scrollbar-color:var(--color-sky)_transparent] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <ol ref={listRef} className="relative flex flex-col gap-3">
                {order.map((row, i) => (
                  <PriorityRow
                    key={row.cluster_id}
                    row={row}
                    rank={i + 1}
                    first={i === 0}
                    last={i === order.length - 1}
                    highlighted={row.cluster_id === selected}
                    linked={row.cluster_id === active}
                    onActive={setActive}
                    onUp={() => move(i, -1)}
                    onDown={() => move(i, 1)}
                  />
                ))}
              </ol>
              {more && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none sticky bottom-0 -mt-12 h-12"
                  style={{ background: "linear-gradient(to top, var(--color-foam), transparent)" }}
                />
              )}
            </div>
          )}

          <details className="mt-4 rounded-xl border-[1.5px] border-haze p-4">
            <summary className="flex min-h-11 cursor-pointer items-center font-bold focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink">
              {t("lgu.need_why_title")}
            </summary>
            <p className="mt-2 max-w-[70ch]">
              {t("lgu.need_why_body", { jmp, access: 1 + NO_ACCESS_WEIGHT, vuln: VULNERABLE_WEIGHT, fac: FACILITY_WEIGHT, max: MAX_TIME_FACTOR })}
            </p>
          </details>
          <p className="mt-4 text-[14px] text-ink-soft">{t("lgu.log_note")}</p>

          {EVENT_SIGNAL >= EARLY_WARNING_MIN_SIGNAL && !empty && <EarlyWarningPanel rows={scored} signal={EVENT_SIGNAL} />}
        </section>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-6">
          <section className="rounded-xl border-[1.5px] border-haze p-6">
            <h2 className="text-[22px]">{t("lgu.affected_title")}</h2>
            <dl className="mt-3">
              <StatRow label={t("lgu.stat_barangays")} value={totals.barangays} />
              <StatRow label={t("lgu.stat_clusters")} value={totals.clusters} />
              <StatRow label={t("lgu.stat_people")} value={fmt(totals.people)} />
              <StatRow label={t("lgu.stat_no_safe", { jmp })} value={fmt(totals.noSafe)} />
              <p className="pb-2 text-[14px] text-ink-soft">{t("lgu.safe_basis", { n: countSafeMappedSources(SEED_SOURCES) })}</p>
              <StatRow label={t("lgu.stat_vulnerable_est")} value={fmt(totals.vulnerable)} />
              <StatRow label={t("lgu.stat_facilities_n")} value={totals.facilities} />
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

          <TruckPanel plan={plan} capacityLitres={ROUTABLE.truck_litres} show={showRoute} onToggle={() => setShowRoute((v) => !v)} route={routeState} />

          <section className="rounded-xl bg-ink p-6 text-foam">
            <h2 className="text-[24px]">{t("lgu.confirm_title")}</h2>
            <p className="mt-3 text-sky">{t("lgu.confirm_body")}</p>
            <p className="mt-3 text-[14px] font-bold">
              {changes === 0 ? t("lgu.changes_none") : t("lgu.changes_some", { n: changes })}
            </p>
            <Button variant="soft" className="mt-4 w-full" onClick={onConfirm} disabled={save === "saving" || empty}>
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

function PriorityRow({ row, rank, first, last, highlighted, linked, onActive, onUp, onDown }: {
  row: NeedRow;
  rank: number;
  first: boolean;
  last: boolean;
  highlighted: boolean;
  linked: boolean; // hovered/focused on the map or the list
  onActive: (clusterId: string | null) => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useCopy();
  const moved = row.suggested_rank !== rank;
  const [people, ...rest] = row.reasons; // first chip = people, always

  return (
    <li
      data-flip-key={row.cluster_id}
      onMouseEnter={() => onActive(row.cluster_id)}
      onMouseLeave={() => onActive(null)}
      className={`flex items-center gap-4 rounded-xl border-[1.5px] p-4 transition-colors duration-150 ${linked ? "bg-mist" : "bg-foam"} ${highlighted ? "border-ink outline-2 outline-ink" : "border-haze"}`}
    >
      <span className="numeral flex size-12 shrink-0 items-center justify-center rounded-md bg-sky text-[24px]">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-[20px]">{row.label}</span>
          {moved && (
            <span className="rounded-full bg-mist px-2.5 py-1 text-[14px] font-bold">{t("lgu.moved_from", { from: row.suggested_rank })}</span>
          )}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t("lgu.reason_list")}>
          <li className="rounded-full bg-mist px-2.5 py-1 text-[14px] font-bold">{people}</li>
          {rest.map((reason, i) =>
            i === 0 && row.no_safe_access ? (
              <li key={reason} className="inline-flex items-center gap-1 rounded-full bg-coral-wash px-2.5 py-1 text-[14px] font-bold text-coral-deep">
                <Icon name="alert" size={14} />
                {reason}
              </li>
            ) : (
              <li key={reason} className="rounded-full bg-mist px-2.5 py-1 text-[14px]">{reason}</li>
            ),
          )}
        </ul>
      </div>
      <span className="numeral shrink-0 text-right text-[20px] leading-tight">{t("lgu.need_pts", { n: fmt(row.need_points) })}</span>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onUp} disabled={first} aria-label={t("lgu.move_up", { name: row.label })}
          className="press flex size-11 items-center justify-center rounded-sm bg-mist disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink">
          <Icon name="chevronUp" />
        </button>
        <button type="button" onClick={onDown} disabled={last} aria-label={t("lgu.move_down", { name: row.label })}
          className="press flex size-11 items-center justify-center rounded-sm bg-mist disabled:opacity-40 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink">
          <Icon name="chevronDown" />
        </button>
      </div>
    </li>
  );
}

/**
 * The scrollable list: FLIP for reordering (measured with offsetTop, so scrolling the container doesn't move rows),
 * the "more below" fade, keeping a moved row in view, and centring a row when the map asks for it.
 * Reduced motion: no FLIP, no smooth scroll.
 */
function useScrollList(keys: string[], moved: { id: string; n: number } | null) {
  const listRef = useRef<HTMLOListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const [more, setMore] = useState(false);
  const signature = keys.join("|");

  const check = () => {
    const el = scrollRef.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduce = reduceMotion();
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-flip-key]"));
    for (const item of items) {
      const key = item.dataset.flipKey!;
      const top = item.offsetTop; // relative to the <ol>, unaffected by the container's scroll
      const before = positions.current.get(key);
      if (before !== undefined && before !== top && !reduce) {
        item.animate(
          [{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }],
          { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
      }
      positions.current.set(key, top);
    }
    check();
  }, [signature]);

  useEffect(() => {
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // After a move, scroll the container the minimum needed to keep the moved row visible.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const list = listRef.current;
    if (!moved || !box || !list) return;
    const el = list.querySelector<HTMLElement>(`[data-flip-key="${CSS.escape(moved.id)}"]`);
    if (!el) return;
    const top = list.offsetTop + el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
  }, [moved]);

  function centreRow(key: string, reduce: boolean) {
    const box = scrollRef.current;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-flip-key="${CSS.escape(key)}"]`) ?? null;
    if (!box || !list || !el) return null;
    const top = list.offsetTop + el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" }); // the container only, never the page
    return el;
  }

  return { listRef, scrollRef, more, onScroll: check, centreRow };
}
