// SPEC: 05 — barangay water captain view, works offline from the cached status (wireframe p.7).
// The morning-round source check has no spec yet: choices are kept on this phone only (flagged).
import { useSyncExternalStore } from "react";
import { useCopy } from "../../copy/i18n";
import type { CopyKeyName } from "../../copy/strings";
import { BARANGAYS, type CaptainSource, type BarangaySnapshot } from "../../data/mock";
import { useBarangay } from "../../lib/barangay";
import { readSetting, subscribeSetting, writeSetting } from "../../lib/settings";
import { formatTime, formatWindow } from "../../lib/time";
import { waterState } from "../../lib/waterState";
import { useBarangayStatus } from "../../offline/useBarangayStatus";
import { StatusChip } from "../../ui/Chip";
import { Logo } from "../../ui/Logo";
import { Icon } from "../../ui/Icon";
import { ScreenStateView } from "../../ui/ScreenStateView";
import { safetyText } from "../../copy/labels";
import { useToast } from "../../ui/Toast";
import { ConfirmWaterBack } from "../../ui/ConfirmWaterBack";

export function CaptainScreen() {
  const { t } = useCopy();
  // MOCK: no captain sign-in yet; the captain sees the barangay chosen on this phone (or Canlapwas).
  const barangay = useBarangay() ?? BARANGAYS[0];
  const status = useBarangayStatus(barangay.barangay_id);

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-foam px-5 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-ink-soft">{t("captain.role", { barangay: barangay.name })}</p>
        <Logo height={30} showName={false} />
      </div>
      <ScreenStateView state={status.state} onRetry={status.retry}>
        {() =>
          status.snapshot &&
          status.view && (
            <CaptainBody
              barangayName={barangay.name}
              snapshot={status.snapshot}
              signalLevel={status.view.signal_level}
              stale={status.view.is_stale}
              syncedAt={status.view.last_synced_at}
            />
          )
        }
      </ScreenStateView>
    </div>
  );
}

function greetingKey(): CopyKeyName {
  const hour = new Date().getHours();
  if (hour < 12) return "captain.greeting_morning";
  if (hour < 18) return "captain.greeting_afternoon";
  return "captain.greeting_evening";
}

function CaptainBody({ barangayName, snapshot, signalLevel, stale, syncedAt }: {
  barangayName: string;
  snapshot: BarangaySnapshot;
  signalLevel: number;
  stale: boolean;
  syncedAt: string;
}) {
  const { t } = useCopy();
  const { captain, detail } = snapshot;
  const state = waterState(signalLevel, detail.cause);
  const pipedOff = state === "interrupted" || state === "repair";

  return (
    <>
      <h1 className="mt-1 text-[32px] leading-[1.05] tracking-[-0.03em]">{t(greetingKey(), { name: captain.name })}</h1>

      <div className="mt-3 inline-flex items-center gap-3 rounded-full bg-mist py-2 pl-2 pr-5">
        <span className="flex size-9 items-center justify-center rounded-full bg-sky">
          <Icon name={stale ? "wifiOff" : "cloudCheck"} size={18} />
        </span>
        <span className="leading-tight">
          <strong className="block text-[15px]">
            {stale ? t("app.offline_stale", { time: formatTime(syncedAt) }) : t("captain.up_to_date", { time: formatTime(syncedAt) })}
          </strong>
        </span>
      </div>

      {pipedOff ? (
        <section className="mt-5 rounded-xl bg-coral-wash p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-coral text-ink">
              <Icon name="dropOff" size={24} />
            </span>
            <div>
              <h2 className="text-[20px] leading-tight">{t("captain.piped_off")}</h2>
              {detail.started_at && detail.cause && (
                <p className="mt-0.5 text-[15px] text-ink-soft">
                  {t("captain.since", { time: formatTime(detail.started_at), cause: t(`cause_short.${detail.cause}`) })}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-foam p-3">
              <p className="text-[14px] text-ink-soft">{t("captain.expected_back")}</p>
              <p className="numeral mt-1 text-[24px]">
                {detail.window_start && detail.window_end ? formatWindow(detail.window_start, detail.window_end) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-foam p-3">
              <p className="text-[14px] text-ink-soft">{t("captain.relies_on")}</p>
              <p className="numeral mt-1 text-[24px]">{t("captain.n_sources", { n: captain.sources.length })}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-mist p-4">
          <h2 className="text-[20px] leading-tight">{t("captain.piped_on")}</h2>
          <StatusChip state={state} />
        </section>
      )}

      {pipedOff && detail.disruption_id && (
        <ConfirmWaterBack
          disruptionId={detail.disruption_id}
          barangayId={snapshot.status.barangay_id}
          confirmedBy="barangay_captain"
          title={t("confirm.title_captain", { barangay: barangayName })}
        />
      )}

      <MorningRound barangayId={snapshot.status.barangay_id} sources={captain.sources} reach={captain.households_reached} />

      <section className="mt-8" aria-labelledby="updates-title">
        <h2 id="updates-title" className="text-[28px] leading-tight">{t("captain.updates_title")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-sky p-4">
            <p className="numeral text-[44px]">{captain.delivered}</p>
            <p className="mt-1">{t("captain.delivered")}</p>
          </div>
          <div className="rounded-xl bg-mist p-4">
            <p className="numeral text-[44px]">{captain.to_working}</p>
            <p className="mt-1">{t("captain.to_working")}</p>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {captain.thanks.map((thanks) => (
            <li key={thanks.at} className="rounded-xl bg-mist p-4">
              <p className="text-[18px] leading-snug">{thanks.quote}</p>
              <p className="mt-2 text-[14px] text-ink-soft">
                {thanks.who} · {formatTime(thanks.at)}
              </p>
            </li>
          ))}
        </ul>
        {captain.more_thanks > 0 && (
          <p className="mt-3 text-[15px] text-ink-soft">{t("captain.more_thanks", { n: captain.more_thanks })}</p>
        )}
      </section>
    </>
  );
}

type RoundStatus = NonNullable<CaptainSource["status"]>;
type RoundEntry = { status: RoundStatus; checked_at: string };

const SEGMENTS: { status: RoundStatus; key: CopyKeyName; selected: string }[] = [
  { status: "flowing", key: "seg.flowing", selected: "bg-tide text-foam" },
  { status: "long_queue", key: "seg.long_queue", selected: "bg-ink text-foam" },
  { status: "dry", key: "seg.dry", selected: "bg-coral text-ink" },
];

function useRound(barangayId: string) {
  const key = `captain.${barangayId}`;
  const raw = useSyncExternalStore(subscribeSetting, () => readSetting(key), () => null);
  let saved: Record<string, RoundEntry> = {};
  try {
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    saved = {};
  }
  const record = (id: string, status: RoundStatus) =>
    writeSetting(key, JSON.stringify({ ...saved, [id]: { status, checked_at: new Date().toISOString() } }));
  return { saved, record };
}

function MorningRound({ barangayId, sources, reach }: { barangayId: string; sources: CaptainSource[]; reach: number }) {
  const { t } = useCopy();
  const { saved, record } = useRound(barangayId);
  const { show, toast } = useToast();

  const rows = sources.map((source) => {
    const local = saved[source.id];
    return local ? { ...source, status: local.status, checked_at: local.checked_at } : source;
  });
  const checked = rows.filter((row) => row.checked_at).length;

  return (
    <section className="mt-8" aria-labelledby="round-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="round-title" className="text-[28px] leading-tight">{t("captain.round_title")}</h2>
        <span className="text-[15px] font-bold">{t("captain.round_progress", { done: checked, total: rows.length })}</span>
      </div>
      <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }} aria-hidden="true">
        {rows.map((row) => (
          <span key={row.id} className={`h-2 rounded-full transition-colors duration-[260ms] ${row.checked_at ? "bg-water" : "bg-sky"}`} />
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border-[1.5px] border-haze p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-body text-[18px] font-bold leading-tight">{row.name}</h3>
              <span className="shrink-0 text-[14px] text-ink-soft">
                {row.checked_at ? t("captain.checked_at", { time: formatTime(row.checked_at) }) : t("captain.not_checked")}
              </span>
            </div>
            <p className="mt-0.5 text-[15px] text-ink-soft">
              {t("captain.plan_line", { letter: row.letter, safety: safetyText(t, row.safety) })}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={row.name}>
              {SEGMENTS.map((segment) => {
                const selected = row.status === segment.status;
                return (
                  <button
                    key={segment.status}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      record(row.id, segment.status);
                      show(t("captain.toast", { n: reach }));
                    }}
                    className={`press h-11 rounded-sm text-[15px] font-bold ${selected ? segment.selected : "bg-mist text-ink"}`}
                  >
                    {t(segment.key)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {toast}
    </section>
  );
}
