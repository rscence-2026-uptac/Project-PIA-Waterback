// SPEC: 06 AC3–AC4 — a resident (or the barangay water captain on their behalf) confirms whether
// water is back. Not in the wireframes; required by the spec (flagged).
// The answer is saved to spec 05's offline queue and sent when Dev A's sync exists; the "sent" line
// appears only after the queue item is marked synced, never on save. Only
// restored = true may resolve the disruption; restored = false puts the barangay back on the
// LGU allocation screen. That decision is made server-side, not here.
import { useCopy } from "../copy/i18n";
import { ResidentConfirmation } from "../contracts/spec06";
import { db } from "../offline/db";
import { useLiveQuery } from "../offline/hooks";
import { enqueue } from "../offline/queue";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function ConfirmWaterBack({ disruptionId, barangayId, confirmedBy, title }: {
  disruptionId: string;
  barangayId: string;
  confirmedBy: ResidentConfirmation["confirmed_by"];
  title: string;
}) {
  const { t } = useCopy();

  // The latest answer on this phone for this disruption, if any, and whether it has reached the server.
  const latest = useLiveQuery(
    async () => {
      const items = await db.queue.where("kind").equals("resident_confirmation").sortBy("queued_at");
      const mine = items.filter((item) => item.payload.disruption_id === disruptionId && item.payload.barangay_id === barangayId && item.payload.confirmed_by === confirmedBy);
      const last = mine.at(-1);
      return last ? { restored: last.payload.restored as boolean, sent: last.synced } : null;
    },
    [disruptionId, barangayId, confirmedBy],
    null as { restored: boolean; sent: boolean } | null,
  );
  const saved = latest?.restored ?? null;

  async function answer(restored: boolean) {
    const localId = crypto.randomUUID();
    const confirmation = ResidentConfirmation.parse({
      disruption_id: disruptionId,
      barangay_id: barangayId,
      confirmed_by: confirmedBy,
      channel: "pwa",
      restored,
      confirmed_at: new Date().toISOString(),
      client_local_id: localId,
    });
    await enqueue("resident_confirmation", confirmation, localId);
  }

  return (
    <section className="mt-5 rounded-xl bg-mist p-5" aria-labelledby="confirm-title">
      <h2 id="confirm-title" className="text-[22px] leading-tight">{title}</h2>
      {/* Only once it has really reached the LGU; until then the pressed button shows the answer registered. */}
      {latest?.sent && (
        <p role="status" className="mt-3 flex gap-2.5 text-ink">
          <Icon name={latest.restored ? "check" : "dropOff"} className="mt-0.5" />
          {latest.restored ? t("confirm.sent_yes") : t("confirm.sent_no")}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          icon={saved === true ? "check" : undefined}
          className={`px-3 ${saved === true ? "ring-3 ring-ink ring-offset-2" : ""}`}
          onClick={() => answer(true)}
          aria-pressed={saved === true}
        >
          {t("confirm.yes")}
        </Button>
        <Button
          variant="foam"
          icon={saved === false ? "check" : undefined}
          className={`px-3 ${saved === false ? "ring-3 ring-ink ring-offset-2" : ""}`}
          onClick={() => answer(false)}
          aria-pressed={saved === false}
        >
          {t("confirm.no")}
        </Button>
      </div>
    </section>
  );
}
