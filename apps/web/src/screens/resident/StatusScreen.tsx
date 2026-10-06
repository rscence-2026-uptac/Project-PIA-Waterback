// SPEC: 05 — resident status, last-known status from cache when offline (wireframe p.4).
import { useSyncExternalStore } from "react";
import { Link } from "react-router";
import { useCopy } from "../../copy/i18n";
import type { DisruptionDetail, BarangaySnapshot } from "../../data/mock";
import { useBarangay } from "../../lib/barangay";
import { readSetting, subscribeSetting, writeSetting } from "../../lib/settings";
import { formatShortTime, formatTime, formatWindow } from "../../lib/time";
import { dropLook, waterState, type WaterState } from "../../lib/waterState";
import { useBarangayStatus } from "../../offline/useBarangayStatus";
import { Button, ButtonLink } from "../../ui/Button";
import { StatusChip } from "../../ui/Chip";
import { DropGauge } from "../../ui/Drop";
import { Icon } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { CostLabel, LiveStatusLabel, SafetyLabel } from "../../ui/SourceBits";
import { ConfirmWaterBack } from "../../ui/ConfirmWaterBack";
import { ConnectionLine, ResidentHeader } from "./ResidentLayout";
import { WaterBackView } from "./WaterBackView";

export function StatusScreen() {
  const barangay = useBarangay();
  const status = useBarangayStatus(barangay?.barangay_id ?? null);

  return (
    <>
      <ResidentHeader />
      <ConnectionLine stale={status.view?.is_stale ?? false} savedAt={status.view?.last_synced_at ?? null} />
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

  const state = waterState(signalLevel, detail.cause);
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
      <div className="flex items-center justify-between gap-3">
        <StatusChip state={state} />
        <span className="text-[14px] text-ink">{t("app.updated_at", { time: formatTime(detail.updated_at) })}</span>
      </div>

      <div className="mt-3 flex items-start gap-4">
        <DropGauge look={dropLook(state, detail.cause)} width={96} className="shrink-0" />
        <div className="pt-1">
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

      <p className="mt-4 flex gap-2.5 text-[15px] text-ink">
        <Icon name="bell" size={18} className="mt-0.5" />
        <span>
          <strong>{t("status.next_update_by", { time: formatTime(detail.next_update_at) })}</strong>
          {t("status.next_update_rest")}
        </span>
      </p>
    </section>
  );
}

function TimeWindowCard({ detail }: { detail: DisruptionDetail }) {
  const { t } = useCopy();
  return (
    <div className="mt-4 rounded-xl bg-foam p-4">
      <p className="text-[15px] font-bold">{t("status.back_between")}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="numeral text-[52px] text-ink">{formatWindow(detail.window_start!, detail.window_end!)}</p>
        {detail.likely_at && (
          <p className="rounded-sm bg-mist px-3 py-2 text-center text-[14px] leading-tight">
            {t("status.most_likely")}
            <br />
            <strong className="text-[15px]">{formatTime(detail.likely_at)}</strong>
          </p>
        )}
      </div>
      <DayTimeline detail={detail} />
    </div>
  );
}

// 6 AM → 12 AM, the day a resident is waiting through.
const DAY_START_H = 6;
const DAY_SPAN_H = 18;

function dayPosition(iso: string | Date) {
  const d = new Date(iso);
  const hours = d.getHours() + d.getMinutes() / 60 - DAY_START_H;
  return Math.min(Math.max(hours / DAY_SPAN_H, 0), 1) * 100;
}

function DayTimeline({ detail }: { detail: DisruptionDetail }) {
  const { t } = useCopy();
  const now = dayPosition(new Date());
  const start = dayPosition(detail.window_start!);
  const end = dayPosition(detail.window_end!);
  const likely = detail.likely_at ? dayPosition(detail.likely_at) : null;
  const backAt = (start + end) / 2;
  // When "Now" sits close to the window, push the two labels apart instead of overlapping.
  const crowded = Math.abs(now - backAt) < 16;
  const nowFirst = now <= backAt;
  const nowShift = !crowded ? "-translate-x-1/2" : nowFirst ? "-translate-x-[calc(100%+6px)]" : "translate-x-[6px]";
  const backShift = !crowded ? "-translate-x-1/2" : nowFirst ? "translate-x-[14px]" : "-translate-x-[calc(100%+14px)]";
  const backLeft = !crowded ? backAt : nowFirst ? Math.max(now, start) : Math.min(now, end);

  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative h-5 whitespace-nowrap text-[13px] font-bold">
        <span className={`absolute ${nowShift}`} style={{ left: `${now}%` }}>{t("status.now")}</span>
        <span className={`absolute ${backShift}`} style={{ left: `${backLeft}%` }}>{t("status.back")}</span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-mist">
        <div className="h-full rounded-full bg-sky" style={{ width: `${now}%` }} />
        <div className="absolute -top-1.5 h-5 rounded-full bg-water" style={{ left: `${start}%`, width: `${end - start}%` }} />
        {likely !== null && <div className="absolute -top-2 h-6 w-[3px] rounded-full bg-ink" style={{ left: `${likely}%` }} />}
        <div
          className="absolute -top-[5px] size-[18px] -translate-x-1/2 rounded-full border-[3px] border-ink bg-foam"
          style={{ left: `${now}%` }}
        />
      </div>
      <div className="relative mt-2 h-5 text-[13px] text-ink-soft">
        <span className="absolute left-0">{t("status.scale_6am")}</span>
        <span className="absolute left-1/3 -translate-x-1/2">{t("status.scale_noon")}</span>
        <span className="absolute left-2/3 -translate-x-1/2">{t("status.scale_6pm")}</span>
        <span className="absolute right-0">{t("status.scale_12am")}</span>
      </div>
    </div>
  );
}

function useFilledContainers(barangayId: string) {
  const key = `storage.${barangayId}`;
  const raw = useSyncExternalStore(subscribeSetting, () => readSetting(key), () => null);
  const filled: boolean[] = raw ? JSON.parse(raw) : [];
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
  const { filled, toggle } = useFilledContainers(status.barangay_id);
  const target = storage.people * storage.per_person_l;
  const filledCount = Array.from({ length: storage.containers }, (_, i) => filled[i]).filter(Boolean).length;
  const litres = filledCount * storage.container_l;
  const totalSteps = storage.containers + 1; // alerts on + each container
  const doneSteps = 1 + filledCount;

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

      <div className="mt-4 flex items-center gap-3 rounded-lg bg-mist p-4">
        <span className="flex size-8 items-center justify-center rounded-full bg-water text-foam">
          <Icon name="check" size={18} strokeWidth={3} />
        </span>
        <span>
          <strong className="block">{t("storage.alerts_title")}</strong>
          <span className="text-[15px] text-ink-soft">{t("storage.alerts_body")}</span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
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
          <LiveStatusLabel live={nearest.live} />
        </div>
        <p className="mt-1 font-display text-[22px] leading-tight">{nearest.name}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <SafetyLabel safety={nearest.safety} />
          <span>{t("source.walk", { n: nearest.walk_minutes })}</span>
          <CostLabel source={nearest} />
        </p>
        <p className="mt-2 text-[15px] text-ink-soft">
          {t("source.checked_by", { name: nearest.reported_by, time: formatTime(nearest.reported_at) })}
        </p>
      </Link>
      <ButtonLink to="/sources" className="mt-4 w-full" trailingIcon="chevronRight">
        {t("runout.see_all", { n: snapshot.sources.length })}
      </ButtonLink>
    </section>
  );
}
