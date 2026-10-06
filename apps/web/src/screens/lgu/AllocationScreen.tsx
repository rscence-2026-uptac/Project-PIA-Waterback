// SPEC: 06 — LGU allocation priority: the system recommends, the officer orders (wireframe p.10).
// SPEC: 10 — rows are settlement clusters ranked by need points (replaces the spec 09 consumer-type ranking), in a
// scrollable list, with a need-hotspot map, a truck plan and an early-warning panel.
// Human-in-the-loop: every row keeps its suggested rank, so each override is recorded as
// overridden_from_suggested_rank on the AllocationDecision.
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackendNotConnected, StepOutOfOrder, confirmAllocation, notifyResidents } from "../../actions/lgu";
import { useCopy } from "../../copy/i18n";
import type { AllocationDecision, NotificationPayload } from "../../contracts/spec06";
import { DEPOT, FACILITY_WEIGHT, MAX_TIME_FACTOR, NO_ACCESS_WEIGHT, VULNERABLE_WEIGHT, type NeedRow } from "../../contracts/spec10";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import { FACILITIES_BY_BARANGAY, VULNERABLE_BY_BARANGAY, clustersFile } from "../../data/needInputs";
import { AFFECTED, OFFICER, OPEN_EVENT, ROUTABLE } from "../../data/mockLgu";
import { sourcesFor, type Cause } from "../../data/mock";
import { SEED_SOURCES } from "../../data/seedSources";
import { ApiError, backendConfigured } from "../../lib/api";
import { useLiveSnapshot } from "../../realtime/liveApi";
import { fetchDrivingRoute } from "../../lib/drivingRoute";
import { countSafeMappedSources, pickDropPoints, scoreClusters } from "../../lib/need";
import { formatDay, formatTime, formatWindow } from "../../lib/time";
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

type SaveState = "idle" | "saving" | "saved" | "partial" | "not_connected" | "out_of_order" | "error";

/** The disruption this screen acts on: the live open one when configured, else the MOCK sample event. */
interface ActiveEvent {
  disruption_id: string;
  cause: Cause;
  status: "predicted" | "confirmed" | "deployed" | "notified" | "resolved";
  signal_level: number;
  flagged_at: string;
  window_start: string | null;
  window_end: string | null;
  likely_at: string | null;
}

/** "5:30 PM", or "Friday 5:30 PM" when it isn't today. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(d) : `${formatDay(d)} ${formatTime(d)}`;
}

/** Barangay ids in order of their best-ranked cluster. The backend takes one decision per barangay. */
function barangayOrder(rows: { barangay_id: string }[]): string[] {
  return [...new Set(rows.map((r) => r.barangay_id))];
}

const reasonOf = (error: unknown) => (error instanceof ApiError ? error.message : "Something went wrong.");

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
  const liveFeed = useLiveSnapshot(5_000); // no-op when the backend isn't configured
  const liveDisruption = backendConfigured ? liveFeed.data?.disruption ?? null : null;
  const event: ActiveEvent | null = backendConfigured
    ? liveDisruption && {
        disruption_id: liveDisruption.id, cause: liveDisruption.cause, status: liveDisruption.status,
        signal_level: liveDisruption.signal_level, flagged_at: liveDisruption.started_at,
        window_start: liveDisruption.window_start ?? null, window_end: liveDisruption.window_end ?? null,
        likely_at: liveDisruption.likely_at ?? null,
      }
    : { ...OPEN_EVENT, status: "confirmed", signal_level: EVENT_SIGNAL }; // MOCK: the sample event
  const eventStart = event?.flagged_at ?? null;
  const scored = useMemo(
    () => scoreClusters({
      clusters: clustersFile.clusters, barangays: clustersFile.barangays, sources: SEED_SOURCES,
      vulnerableByBarangay: VULNERABLE_BY_BARANGAY, facilitiesByBarangay: FACILITIES_BY_BARANGAY,
      startedAt: eventStart, now,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed once a minute, keyed on nowKey
    [nowKey, eventStart],
  );
  const byId = useMemo(() => new Map(scored.map((r) => [r.cluster_id, r])), [scored]);
  const clusterById = useMemo(() => new Map(clustersFile.clusters.map((c) => [c.cluster_id, c])), []);

  // Officer order: ids only, seeded from the suggested order. Ranks never change with time (the time factor is uniform).
  const [orderIds, setOrderIds] = useState<string[]>(() => scored.map((r) => r.cluster_id));
  const order = useMemo(() => orderIds.map((id) => byId.get(id)).filter((r): r is NeedRow => !!r), [orderIds, byId]);

  const [save, setSave] = useState<SaveState>("idle");
  const [outcome, setOutcome] = useState<{ saved: number; notified: number } | null>(null);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null); // hovered/focused cluster, linked between map and list
  const [showRoute, setShowRoute] = useState(false);
  const [moved, setMoved] = useState<{ id: string; n: number } | null>(null);
  const { listRef, scrollRef, more, onScroll, centreRow } = useScrollList(order.map((r) => r.cluster_id), moved);

  // One decision per barangay: the backend rejects a repeated barangay_id until Dev A ships cluster support, so
  // cluster_id is left out. A barangay's rank is its best-ranked cluster in the officer's order (dense 1..n); the
  // suggested rank is worked out the same way from the suggested order. Only the 26 CWD-served barangays are
  // allocated and notified: unserved ones have no tap to interrupt (they stay in the need list for planning).
  const served = new Set(clustersFile.barangays.filter((b) => b.served).map((b) => b.barangay_id));
  const servedOnly = (ids: string[]) => ids.filter((id) => served.has(id));
  const suggestedBarangays = servedOnly(barangayOrder([...scored].sort((x, y) => x.suggested_rank - y.suggested_rank)));
  const decisions: AllocationDecision[] = event
    ? servedOnly(barangayOrder(order)).map((barangayId, i) => {
        const suggested = suggestedBarangays.indexOf(barangayId) + 1;
        return {
          disruption_id: event.disruption_id,
          barangay_id: barangayId,
          priority_rank: i + 1,
          officer_id: OFFICER.id,
          overridden_from_suggested_rank: suggested === i + 1 ? null : suggested,
        };
      })
    : [];
  const changes = decisions.filter((d) => d.overridden_from_suggested_rank !== null).length;
  const waitingOnOperator = backendConfigured && event?.status === "predicted";

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
    if (!event) return;
    setSave("saving");
    setOutcome(null);
    try {
      const saved = await confirmAllocation(decisions);
      // Then tell residents (PWA). The real counts come back from the server; nothing is assumed.
      const payloads: NotificationPayload[] = decisions.map((d) => ({
        disruption_id: event.disruption_id,
        barangay_id: d.barangay_id,
        channel: "pwa_push",
        status: "Water interrupted",
        cause: event.cause,
        expected_duration_hint: event.window_start && event.window_end
          ? `Water expected back between ${formatWindow(event.window_start, event.window_end)}`
          : undefined,
        store_water_advice: true,
        nearest_source_name: sourcesFor(d.barangay_id, event.cause)[0]?.name ?? "LGU water truck",
        sent_at: new Date().toISOString(),
      }));
      try {
        const sent = await notifyResidents(payloads);
        setOutcome({ saved: saved.allocations, notified: sent.notified.length });
        setSave("saved");
      } catch (error) {
        setOutcome({ saved: saved.allocations, notified: 0 });
        setReason(reasonOf(error));
        setSave("partial");
      }
    } catch (error) {
      setReason(reasonOf(error));
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
          value={event ? t(`lgu.headline.${event.cause}`) : t("lgu.none_value")}
          note={!event ? t("lgu.no_open")
            : backendConfigured ? t("lgu.live_flagged", { time: whenLabel(event.flagged_at) })
            : t("lgu.flagged_by", { who: OPEN_EVENT.flagged_by, time: formatTime(event.flagged_at) })} />
        <SummaryCard tone="bg-sky" icon="drop" label={t("lgu.who_affected")}
          value={t("lgu.who_value", { n: fmt(totals.people) })}
          note={t("lgu.affected_sub_clusters", { clusters: totals.clusters, barangays: totals.barangays })} />
        <SummaryCard tone="bg-sky" icon="clock" label={t("lgu.expected_back")}
          value={!event?.window_start || !event.window_end ? t("lgu.none_value")
            : new Date(event.window_start).toDateString() === new Date().toDateString() && new Date(event.window_end).toDateString() === new Date().toDateString()
              ? t("lgu.window_today", { window: formatWindow(event.window_start, event.window_end) })
              : t("lgu.window_span", { from: whenLabel(event.window_start), to: whenLabel(event.window_end) })}
          note={event?.likely_at ? t("lgu.most_likely", { time: whenLabel(event.likely_at) }) : ""} />
        <div className="rounded-xl bg-ink p-6 text-foam">
          {save === "saved" || save === "partial" ? (
            <div className="panel-in">
              <p className="text-[14px] font-bold text-sky">{t("lgu.decision_step", { n: 2, total: 2 })}</p>
              <p className="mt-2 font-display text-[26px] leading-tight">{t("lgu.decision_done_title")}</p>
              <p className="mt-2 text-[14px] text-sky">
                {save === "partial" ? t("lgu.decision_partial_body") : backendConfigured ? t("lgu.decision_done_body_live") : t("lgu.decision_done_body")}
              </p>
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

          {(event?.signal_level ?? 0) >= EARLY_WARNING_MIN_SIGNAL && !empty && <EarlyWarningPanel rows={scored} signal={event?.signal_level ?? 0} />}
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
            <Button variant="soft" className="mt-4 w-full" onClick={onConfirm} disabled={save === "saving" || empty || !event || waitingOnOperator}>
              {save === "saving" ? t("lgu.saving") : t("lgu.confirm_button", { name: OFFICER.name })}
            </Button>
            {backendConfigured && !event && liveFeed.data && (
              <p className="mt-4 text-[14px] text-sky">{t("lgu.no_open")}</p>
            )}
            {waitingOnOperator && <p className="mt-4 text-[14px] text-sky">{t("lgu.not_confirmed_yet")}</p>}
            {(save === "saved" || save === "partial") && outcome && (
              <p role="status" className="panel-in mt-4 flex gap-2.5 rounded-lg bg-ink-raised p-3 text-[14px]">
                <Icon name={save === "saved" ? "check" : "alert"} size={18} className="mt-0.5" />
                {save === "saved"
                  ? t("lgu.result_ok", { saved: outcome.saved, notified: outcome.notified })
                  : t("lgu.result_partial", { saved: outcome.saved, reason })}
              </p>
            )}
            {(save === "not_connected" || save === "out_of_order" || save === "error") && (
              <p role="alert" className="panel-in mt-4 flex gap-2.5 rounded-lg bg-ink-raised p-3 text-[14px]">
                <Icon name="wifiOff" size={18} className="mt-0.5" />
                {save === "not_connected" ? t("lgu.not_connected") : save === "out_of_order" ? t("lgu.out_of_order") : t("lgu.result_error", { reason })}
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
