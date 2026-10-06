// SPEC: 05 — resident status, last-known status from cache when offline (wireframe p.4).
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { useCopy } from "../../copy/i18n";
import type { DisruptionDetail, BarangaySnapshot } from "../../data/mock";
import { useBarangay } from "../../lib/barangay";
import { readSetting, subscribeSetting, writeSetting } from "../../lib/settings";
import { formatShortTime, formatTime, formatWindow, minutesBetween } from "../../lib/time";
import { snapshotWaterState } from "../../lib/snapshotState";
import { dropLook, type WaterState } from "../../lib/waterState";
import { useBarangayStatus } from "../../offline/useBarangayStatus";
import { Button, ButtonLink } from "../../ui/Button";
import { DropGauge } from "../../ui/Drop";
import { Icon } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { CostLabel, LiveStatusLabel, SafetyLabel, SimulatedLabel } from "../../ui/SourceBits";
import { ConfirmWaterBack } from "../../ui/ConfirmWaterBack";
import { useAsOf } from "../../demo/clockState";
import { ConnectionLine, ResidentHeader } from "./ResidentLayout";
import { WaterBackView } from "./WaterBackView";

export function StatusScreen() {
  const barangay = useBarangay();
  const status = useBarangayStatus(barangay?.barangay_id ?? null);

  return (
    <>
      <ResidentHeader />
      {status.view?.is_stale && status.view.last_synced_at && <ConnectionLine savedAt={status.view.last_synced_at} />}
      <ScreenStateView state={status.state} onRetry={status.retry}>
        {() => status.snapshot && status.view && <StatusBody snapshot={status.snapshot} signalLevel={status.view.signal_level} />}
      </ScreenStateView>
    </>
  );
}

// SPEC: 06 — this screen is the PWA view of NotificationPayload: status (chip + headline), cause,
// expected_duration_hint (time window), store_water_advice (storage plan), nearest_source_name (Plan A).
function StatusBody({ snapshot, signalLevel }: { snapshot: BarangaySnapshot; signalLevel: number }) {
  const { t } = useCopy();
  const { detail } = snapshot;
  if (detail.restored_at) return <WaterBackView snapshot={snapshot} />;

  const state = snapshotWaterState(snapshot, signalLevel);
  const needsPlan = state !== "flowing";
  const pipedOff = state === "interrupted" || state === "repair";

  return (
    <>
      <StatusCard state={state} detail={detail} />
      {pipedOff && detail.disruption_id && (
        <ConfirmWaterBack
          disruptionId={detail.disruption_id}
          barangayId={snapshot.status.barangay_id}
          confirmedBy="resident"
          title={t("confirm.title_resident")}
        />
      )}
      {needsPlan && <StoragePlanSection snapshot={snapshot} />}
      {needsPlan && <RunOutSection snapshot={snapshot} />}
    </>
  );
}

function StatusCard({ state, detail }: { state: WaterState; detail: DisruptionDetail }) {
  const { t } = useCopy();
  const sub =
    state === "flowing" ? t("state.flowing.sub")
    : state === "headsup" && detail.heads_up_from ? t("state.headsup.sub", { time: formatShortTime(detail.heads_up_from) })
    : detail.cause ? t(`cause.${detail.cause}`)
    : "";
  const hasWindow = (state === "interrupted" || state === "repair") && detail.window_start && detail.window_end;

  return (
    <section className="mt-4 rounded-hero bg-sky px-[18px] py-5" aria-labelledby="status-headline">
      <div className="flex items-center gap-4">
        <DropGauge look={dropLook(state, detail.cause)} width={72} className="shrink-0" />
        <div className="min-w-0">
          <h1 id="status-headline" className="text-[30px] leading-[1.05] tracking-[-0.03em] text-ink">
            {t(`state.${state}.headline`)}
          </h1>
          <p className="mt-2 text-ink-soft">{sub}</p>
        </div>
      </div>

      {hasWindow && <TimeWindowCard detail={detail} />}

      {state !== "flowing" && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            icon="jerrycan"
            className="px-3"
            onClick={() => document.getElementById("storage")?.scrollIntoView({ behavior: "smooth" })}
          >
            {t("action.store_water")}
          </Button>
          <ButtonLink to="/sources" variant="foam" icon="pin" className="px-3">
            {t("action.find_water")}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

/** "Now" for this screen: the demo clock when it is pinned to a replayed moment, else the real clock (ticking). */
function useNow() {
  const { asOf, pinned } = useAsOf();
  const [real, setReal] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setReal(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return pinned ? asOf : real;
}

const DAY_MS = 86_400_000;
/** Whole calendar days from `now` to `date` (0 = same day, 1 = tomorrow). */
function dayDiff(date: Date, now: Date) {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(date) - midnight(now)) / DAY_MS);
}

/** "Thursday" in the resident's language (Waray borrows the Filipino day names). */
function weekday(date: Date, language: string) {
  return new Intl.DateTimeFormat(language === "english" ? "en-GB" : "fil-PH", { weekday: "long" }).format(date);
}

function TimeWindowCard({ detail }: { detail: DisruptionDetail }) {
  const { t, language } = useCopy();
  const now = useNow();
  const start = new Date(detail.window_start!);
  const end = new Date(detail.window_end!);
  const late = now >= end;
  const dayWord = (d: Date) => {
    const n = dayDiff(d, now);
    return n === 0 ? t("status.day_today") : n === 1 ? t("status.day_tomorrow") : weekday(d, language);
  };
  const sameDay = dayDiff(start, end) === 0;
  const startIn = dayDiff(start, now);
  const heading = !sameDay ? t("status.back_between_days")
    : startIn <= 0 || start <= now ? t("status.back_between")
    : startIn === 1 ? t("status.back_between_tomorrow")
    : t("status.back_between_on", { day: weekday(start, language) });
  const windowText = sameDay
    ? formatWindow(start, end)
    : `${dayWord(start)} ${formatShortTime(start)} – ${dayWord(end)} ${formatShortTime(end)}`;
  const minutesDry = detail.started_at ? Math.max(0, minutesBetween(detail.started_at, now)) : null;
  const hoursDry = minutesDry === null ? 0 : Math.round(minutesDry / 60);

  return (
    <div className="mt-4 rounded-xl bg-foam p-4">
      {minutesDry !== null && (
        <p className="flex items-center gap-2.5 rounded-sm bg-coral-wash px-3 py-3 text-[20px] font-bold leading-tight text-ink">
          <Icon name="dropOff" size={26} className="shrink-0 text-coral-deep" />
          {minutesDry < 60 ? t("status.dry_minutes", { n: Math.max(1, minutesDry) })
            : hoursDry === 1 ? t("status.dry_hour")
            : t("status.dry_hours", { n: hoursDry })}
        </p>
      )}
      <p className="mt-4 text-[16px] font-bold">{heading}</p>
      <p className={`numeral mt-1 text-ink ${sameDay ? "text-[44px]" : "text-[30px] leading-tight"}`}>{windowText}</p>
      {late ? (
        <p className="mt-3 flex gap-2.5 text-[18px] font-bold text-ink">
          <Icon name="alert" size={22} className="mt-0.5 shrink-0" />
          {t("status.wait_late", { time: formatTime(end) })}
        </p>
      ) : (
        detail.started_at && <OutageTimeline stopped={new Date(detail.started_at)} now={now} start={start} end={end} />
      )}
    </div>
  );
}

/**
 * The outage on one line: dry so far (coral), still to wait (pale), the window water is due back (blue).
 * Every point is named in words below the bar, so nothing depends on colour (spec 08).
 */
function OutageTimeline({ stopped, now, start, end }: { stopped: Date; now: Date; start: Date; end: Date }) {
  const { t } = useCopy();
  const span = end.getTime() - stopped.getTime();
  const pct = (d: Date) => Math.min(Math.max(((d.getTime() - stopped.getTime()) / span) * 100, 0), 100);
  const nowP = pct(now);
  const startP = pct(start);
  // "Now" sits under its marker, but never over the two end labels.
  const nowLabelP = Math.min(Math.max(nowP, 34), 66);

  return (
    <figure className="mt-4">
      <figcaption className="sr-only">
        {t("status.chart_sr", { stopped: formatTime(stopped), now: formatTime(now), window: formatWindow(start, end) })}
      </figcaption>
      <div className="relative h-3" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-mist" />
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-coral" style={{ width: `${nowP}%` }} />
        <div
          className="absolute inset-y-0 rounded-full bg-water ring-2 ring-foam"
          style={{ left: `${startP}%`, width: `${100 - startP}%` }}
        />
        <div
          className="absolute top-1/2 size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-foam"
          style={{ left: `${nowP}%` }}
        />
      </div>
      <div className="relative mt-3 h-[46px] text-[16px] leading-tight" aria-hidden="true">
        <p className="absolute left-0 top-0">
          <span className="block font-bold">{t("status.chart_stopped")}</span>
          <span className="text-ink-soft">{formatTime(stopped)}</span>
        </p>
        <p className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${nowLabelP}%` }}>
          <span className="block font-bold">{t("status.now")}</span>
          <span className="text-ink-soft">{formatTime(now)}</span>
        </p>
        <p className="absolute right-0 top-0 text-right">
          <span className="block font-bold">{t("status.chart_back")}</span>
          <span className="text-ink-soft">{formatWindow(start, end)}</span>
        </p>
      </div>
    </figure>
  );
}

function useFilledContainers(barangayId: string, disruptionId: string | null | undefined) {
  const key = `storage.${barangayId}.${disruptionId ?? "none"}`;
  const raw = useSyncExternalStore(subscribeSetting, () => readSetting(key), () => null);
  let filled: boolean[] = [];
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) filled = parsed;
  } catch {
    filled = [];
  }
  const toggle = (index: number) => {
    const next = [...filled];
    next[index] = !next[index];
    writeSetting(key, JSON.stringify(next));
  };
  return { filled, toggle };
}

function StoragePlanSection({ snapshot }: { snapshot: BarangaySnapshot }) {
  const { t } = useCopy();
  const { storage, status } = snapshot;
  const { filled, toggle } = useFilledContainers(status.barangay_id, snapshot.detail.disruption_id);
  const target = storage.people * storage.per_person_l;
  const filledCount = Array.from({ length: storage.containers }, (_, i) => filled[i]).filter(Boolean).length;
  const litres = filledCount * storage.container_l;
  const totalSteps = storage.containers; // one step per container
  const doneSteps = filledCount;

  return (
    <section id="storage" className="mt-8 scroll-mt-4" aria-labelledby="storage-title">
      <h2 id="storage-title" className="text-[28px] leading-tight">{t("storage.title", { litres: target })}</h2>
      <p className="mt-1 text-ink-soft">{t("storage.household", { people: storage.people, per: storage.per_person_l })}</p>

      <div className="mt-4 flex items-center justify-between text-[15px]">
        <span className="font-bold">{t("storage.steps", { done: doneSteps, total: totalSteps })}</span>
        <span className="tabular-nums">{t("storage.litres", { have: litres, target })}</span>
      </div>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }} aria-hidden="true">
        {Array.from({ length: totalSteps }, (_, i) => (
          <span key={i} className={`h-2 rounded-full transition-colors duration-[260ms] ${i < doneSteps ? "bg-water" : "bg-sky"}`} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {Array.from({ length: storage.containers }, (_, i) => (
          <ContainerTile
            key={i}
            index={i}
            full={Boolean(filled[i])}
            litres={storage.container_l}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>

      <p className="mt-3 text-ink">{filledCount === storage.containers ? t("storage.done") : t("storage.hint")}</p>
    </section>
  );
}

function ContainerTile({ index, full, litres, onToggle }: {
  index: number;
  full: boolean;
  litres: number;
  onToggle: () => void;
}) {
  const { t } = useCopy();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={full}
      aria-label={full ? t("storage.container_full", { n: index + 1 }) : t("storage.container", { n: index + 1 })}
      className={`press flex flex-col items-center rounded-xl px-2 pb-3 pt-4 ${full ? "bg-sky" : "bg-mist"}`}
    >
      <svg viewBox="0 0 64 80" width="58" height="72" aria-hidden="true">
        <rect x="24" y="2" width="16" height="8" rx="2" fill="var(--color-ink)" />
        <rect
          x="9" y="14" width="46" height="62" rx="7"
          fill="var(--color-water)"
          style={{
            transformBox: "fill-box",
            transformOrigin: "bottom",
            transform: `scaleY(${full ? 1 : 0})`,
            transition: "transform 420ms var(--ease-soft)",
          }}
        />
        <rect x="9" y="14" width="46" height="62" rx="7" fill="none" stroke="var(--color-ink)" strokeWidth="2.5" />
      </svg>
      <span className="numeral mt-2 text-[20px]">{t("storage.container_litres", { litres })}</span>
      <span className="mt-1 text-[14px] text-ink-soft">{t("storage.container", { n: index + 1 })}</span>
    </button>
  );
}

function RunOutSection({ snapshot }: { snapshot: BarangaySnapshot }) {
  const { t } = useCopy();
  const nearest = snapshot.sources[0];
  if (!nearest) return null;

  return (
    <section className="mt-8" aria-labelledby="runout-title">
      <h2 id="runout-title" className="text-[28px] leading-tight">{t("runout.title")}</h2>
      <Link to="/sources" className="press mt-3 block rounded-xl border-[1.5px] border-haze p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-bold text-tide">{t("runout.nearest", { letter: nearest.letter })}</span>
          {nearest.live && <LiveStatusLabel live={nearest.live} />}
        </div>
        <p className="mt-1 font-display text-[22px] leading-tight">{nearest.name}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <SafetyLabel safety={nearest.safety} />
          <span>{t("source.walk", { n: nearest.walk_minutes })}</span>
          <CostLabel source={nearest} />
        </p>
        {nearest.is_simulated && <p className="mt-2"><SimulatedLabel source={nearest} /></p>}
        {nearest.reported_by && nearest.reported_at && (
          <p className="mt-2 text-[15px] text-ink-soft">
            {t("source.checked_by", { name: nearest.reported_by, time: formatTime(nearest.reported_at) })}
          </p>
        )}
      </Link>
      <ButtonLink to="/sources" className="mt-4 w-full" trailingIcon="chevronRight">
        {t("runout.see_all", { n: snapshot.sources.length })}
      </ButtonLink>
    </section>
  );
}
