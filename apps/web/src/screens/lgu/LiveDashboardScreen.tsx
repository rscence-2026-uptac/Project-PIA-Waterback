// SPEC: 07 — live CDRRMO / partner dashboard. No wireframe: built from DESIGN.md and the LGU
// screens. Signal level is color + icon + word (AC2); events apply live (AC1); a dropped feed
// keeps the last data with its time and offers Refresh (AC3).
import { useState } from "react";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import type { DisruptionStatus } from "../../contracts/spec07";
import { BARANGAYS } from "../../data/mock";
import { backendConfigured } from "../../lib/api";
import { formatTime, formatTimeSeconds } from "../../lib/time";
import { waterState, type WaterState } from "../../lib/waterState";
import { useDashboard, type FeedItem, type LiveRow } from "../../realtime/useDashboard";
import { Button } from "../../ui/Button";
import { Pill, StatusChip } from "../../ui/Chip";
import { Icon, type IconName } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { LguLayout } from "./LguLayout";

const nameOf = (id: string) => BARANGAYS.find((b) => b.barangay_id === id)?.name ?? id;

type Filter = "open" | "resolved" | "all";

export function LiveDashboardScreen() {
  const { t } = useCopy();
  const live = useDashboard();
  const [filter, setFilter] = useState<Filter>("open");

  return (
    <LguLayout>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[40px] leading-tight tracking-[-0.03em]">{t("live.title")}</h1>
        <ConnectionPill connection={live.connection} syncedAt={live.syncedAt} />
      </div>

      <ScreenStateView state={live.screenState} onRetry={live.refresh}>
        {() => (
          <>
            {live.connection === "dropped" && live.syncedAt && (
              <div role="alert" className="panel-in mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-coral-wash p-5">
                <p className="flex items-start gap-3 text-[17px]">
                  <Icon name="wifiOff" className="mt-0.5 text-coral-deep" />
                  {t("live.dropped_body", { time: formatTime(live.syncedAt) })}
                </p>
                <Button icon="history" onClick={live.refresh}>{t("live.refresh")}</Button>
              </div>
            )}
            <LevelTiles rows={live.rows} />
            <div className="mt-8 flex flex-wrap gap-6">
              <section className="min-w-0 flex-[999_1_640px]" aria-labelledby="grid-title">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="grid-title" className="text-[24px]">{t("live.grid_title")}</h2>
                  <FilterControl rows={live.rows} value={filter} onChange={setFilter} />
                </div>
                <BarangayGrid rows={live.rows} filter={filter} />
              </section>
              <EventFeed feed={live.feed} />
            </div>
            {!backendConfigured && <p className="mt-6 text-[14px] text-ink-soft">{t("live.sample")}</p>}
          </>
        )}
      </ScreenStateView>
    </LguLayout>
  );
}

function ConnectionPill({ connection, syncedAt }: {
  connection: "connecting" | "live" | "dropped";
  syncedAt: string | null;
}) {
  const { t } = useCopy();
  if (connection === "live") {
    return (
      <Pill className="bg-mist text-ink">
        <span className="size-2.5 rounded-full bg-water" aria-hidden="true" />
        <span role="status">{syncedAt ? t("live.live", { time: formatTimeSeconds(syncedAt) }) : t("live.live_now")}</span>
      </Pill>
    );
  }
  if (connection === "connecting") {
    return <Pill className="bg-mist text-ink"><span role="status">{t("live.connecting")}</span></Pill>;
  }
  // Dropped: the pill says so; the one Refresh button lives in the alert below (one primary action).
  // With no data yet, ScreenStateView's error state offers the retry instead.
  return (
    <Pill className="bg-coral text-ink">
      <Icon name="wifiOff" size={16} />
      {syncedAt ? t("live.dropped", { time: formatTime(syncedAt) }) : t("live.dropped_never")}
    </Pill>
  );
}

const TILE_STYLE: Record<WaterState, { className: string; icon: IconName }> = {
  flowing: { className: "bg-sky text-ink", icon: "drop" },
  headsup: { className: "bg-ink text-foam", icon: "alert" },
  interrupted: { className: "bg-coral text-ink", icon: "dropOff" },
  repair: { className: "bg-mist text-ink", icon: "clock" },
};

/** AC2: how many barangays sit at each level, with colour, icon and word together. */
function LevelTiles({ rows }: { rows: LiveRow[] }) {
  const { t } = useCopy();
  return (
    <section className="mt-6" aria-labelledby="levels-title">
      <h2 id="levels-title" className="text-[18px] font-bold">{t("live.levels_title", { n: rows.length })}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((level) => {
          const state = waterState(level, null);
          const style = TILE_STYLE[state];
          const count = rows.filter((r) => r.signal_level === level).length;
          return (
            <div key={level} className={`rounded-xl px-5 py-4 ${style.className} ${count === 0 ? "opacity-60" : ""}`}>
              <p className="flex items-center gap-2 text-[14px] font-bold">
                <Icon name={style.icon} size={16} />
                {t("live.level", { n: level })} · {t(`state.${state}.chip`)}
              </p>
              <p className="numeral mt-2 text-[40px]">{count}</p>
              <p className="text-[14px]">{count === 1 ? t("live.level_count_one") : t("live.level_count", { n: count })}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FilterControl({ rows, value, onChange }: { rows: LiveRow[]; value: Filter; onChange: (f: Filter) => void }) {
  const { t } = useCopy();
  const counts: Record<Filter, number> = {
    open: rows.filter((r) => r.status !== "resolved").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    all: rows.length,
  };
  const labels: Record<Filter, CopyKeyName> = { open: "live.filter_open", resolved: "live.filter_resolved", all: "live.filter_all" };
  return (
    <div role="radiogroup" aria-label={t("live.filter_label")} className="flex gap-1.5 rounded-md bg-mist p-1.5">
      {(Object.keys(labels) as Filter[]).map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          className={`press min-h-11 rounded-sm px-4 text-[15px] font-bold ${value === f ? "bg-tide text-foam" : "bg-foam text-ink"}`}
        >
          {t("live.filter_count", { label: t(labels[f]), n: counts[f] })}
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<DisruptionStatus, { className: string; icon: IconName; key: CopyKeyName }> = {
  predicted: { className: "bg-mist text-ink", icon: "gauge", key: "live.status.predicted" },
  // Wash, not full coral: the level chip beside it already carries the "interrupted" warning.
  confirmed: { className: "bg-coral-wash text-ink", icon: "alert", key: "live.status.confirmed" },
  deployed: { className: "bg-tide text-foam", icon: "jerrycan", key: "live.status.deployed" },
  notified: { className: "bg-ink text-foam", icon: "bell", key: "live.status.notified" },
  resolved: { className: "bg-sky text-ink", icon: "check", key: "live.status.resolved" },
};

function BarangayGrid({ rows, filter }: { rows: LiveRow[]; filter: Filter }) {
  const { t } = useCopy();
  const shown = rows
    .filter((r) => (filter === "all" ? true : filter === "resolved" ? r.status === "resolved" : r.status !== "resolved"))
    .sort((a, b) => b.signal_level - a.signal_level || nameOf(a.barangay_id).localeCompare(nameOf(b.barangay_id), undefined, { numeric: true }));

  if (shown.length === 0) {
    return <p className="mt-4 rounded-xl bg-mist p-5">{t("live.empty_filter")}</p>;
  }

  return (
    <ul className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
      {shown.map((row) => {
        const status = STATUS_STYLE[row.status];
        return (
          // Re-keyed on change so a card that just updated fades in once (no pulsing).
          <li key={`${row.barangay_id}-${row.changed_at ?? 0}`} className={`rounded-xl border-[1.5px] border-haze p-4 ${row.changed_at ? "panel-in" : ""}`}>
            <p className="font-display text-[19px] leading-tight">{nameOf(row.barangay_id)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusChip state={waterState(row.signal_level, null)} />
              <Pill className={`${status.className} text-[13px]`}>
                <Icon name={status.icon} size={14} />
                {t(status.key)}
              </Pill>
            </div>
            <p className="mt-2 text-[14px] text-ink-soft">
              {t("live.level", { n: row.signal_level })} · {t("live.last_event", { time: formatTime(row.last_event_at) })}
            </p>
            {row.resident_confirmed && row.status !== "resolved" && (
              <p className="mt-1 flex items-center gap-1.5 text-[14px] font-bold">
                <Icon name="check" size={14} />
                {t("live.resident_confirmed_tag")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const EVENT_KEY: Record<FeedItem["event_type"], CopyKeyName> = {
  predicted: "live.event.predicted",
  confirmed: "live.event.confirmed",
  deployed: "live.event.deployed",
  notified: "live.event.notified",
  resident_confirmed: "live.event.resident_confirmed",
  resolved: "live.event.resolved",
};

function EventFeed({ feed }: { feed: FeedItem[] }) {
  const { t } = useCopy();
  return (
    <aside className="flex min-w-0 flex-[1_1_340px] flex-col self-start rounded-xl border-[1.5px] border-haze p-6" aria-labelledby="feed-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="feed-title" className="text-[22px]">{t("live.feed_title")}</h2>
        <span className="text-[13px] text-ink-soft">{t("live.feed_sub")}</span>
      </div>
      {feed.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t("live.feed_empty")}</p>
      ) : (
        <ol className="mt-4 flex flex-col" aria-live="polite">
          {feed.map((item) => (
            <li key={`${item.barangay_id}-${item.occurred_at}-${item.event_type}`} className="panel-in grid grid-cols-[96px_1fr] gap-3 border-b border-haze py-2.5 last:border-b-0">
              <span className="font-bold tabular-nums">{formatTimeSeconds(item.occurred_at)}</span>
              <span>{t("live.event_line", { event: t(EVENT_KEY[item.event_type]), barangay: item.barangay_id === null ? t("live.all_barangays") : nameOf(item.barangay_id) })}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
