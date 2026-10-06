// confirm-allocation + deploy-response (spec 06, Dev B handoff item 4). Pure logic over the Store port.
//
// Event order per spec 06: confirm-allocation writes one `deployed` event per barangay (payload.step = "allocation")
// and moves the disruption to `deployed`. deploy-response adds a second `deployed` event for the barangay
// (payload.step = "source") naming the ranked source actually sent. notify-residents (notify.ts) then writes `notified`.
import { HttpError } from "./spec06_http.ts";
import { clampToNow, parseOrThrow } from "./spec06_http.ts";
import { AllocationDecision, DeployResponse, z } from "./spec06_schemas.ts";
import type { Store } from "./spec06_store.ts";

export const MAX_DECISIONS = 100;

export async function confirmAllocation(store: Store, body: unknown, now: Date) {
  const decisions = parseOrThrow(z.array(AllocationDecision).min(1).max(MAX_DECISIONS), body);
  const disruptionId = decisions[0].disruption_id;
  if (decisions.some((d) => d.disruption_id !== disruptionId)) {
    throw new HttpError(400, "invalid_request", "all decisions must be for the same disruption_id");
  }
  const ids = decisions.map((d) => d.barangay_id);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "invalid_request", "duplicate barangay_id in decisions");
  const ranks = decisions.map((d) => d.priority_rank);
  if (new Set(ranks).size !== ranks.length) throw new HttpError(400, "invalid_request", "duplicate priority_rank in decisions");

  const disruption = await store.getDisruption(disruptionId);
  if (!disruption) throw new HttpError(404, "disruption_not_found", `no disruption ${disruptionId}`);
  if (!["confirmed", "deployed", "notified"].includes(disruption.status)) {
    throw new HttpError(409, "disruption_not_confirmed",
      `disruption is "${disruption.status}"; allocation needs a confirmed (and not resolved) disruption`);
  }
  const known = new Set((await store.getBarangays(ids)).map((b) => b.barangay_id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new HttpError(422, "unknown_barangay", "unknown barangay_id", unknown);

  const at = now.toISOString();
  await store.insertAllocations(decisions.map((d) => ({
    disruption_id: d.disruption_id, barangay_id: d.barangay_id, priority_rank: d.priority_rank,
    officer_id: d.officer_id, decided_at: at, note: d.note ?? null,
  })));
  await store.insertEvents(decisions.map((d) => ({
    disruption_id: d.disruption_id, event_type: "deployed" as const, actor: d.officer_id, occurred_at: at,
    barangay_id: d.barangay_id,
    payload_json: {
      step: "allocation", priority_rank: d.priority_rank,
      overridden_from_suggested_rank: d.overridden_from_suggested_rank,
      overridden: d.overridden_from_suggested_rank !== null,
      note: d.note ?? null, recorded_at: at,
    },
  })));
  await store.setDisruptionStatus(disruptionId, "deployed", ["confirmed", "deployed", "notified"]);
  return { disruption_id: disruptionId, status: "deployed", allocations: decisions.length, events_written: decisions.length };
}

export async function deployResponse(store: Store, body: unknown, now: Date) {
  const r = parseOrThrow(DeployResponse, body);
  const disruption = await store.getDisruption(r.disruption_id);
  if (!disruption) throw new HttpError(404, "disruption_not_found", `no disruption ${r.disruption_id}`);
  if (!["deployed", "notified"].includes(disruption.status)) {
    throw new HttpError(409, "allocation_not_confirmed", `disruption is "${disruption.status}"; confirm the allocation first`);
  }
  const events = await store.listEvents(r.disruption_id);
  const allocated = events.some((e) => e.event_type === "deployed" && e.barangay_id === r.barangay_id && e.payload_json?.step === "allocation");
  if (!allocated) throw new HttpError(409, "barangay_not_allocated", `barangay ${r.barangay_id} has no confirmed allocation`);
  const source = await store.getSource(r.source_id);
  if (!source) throw new HttpError(404, "source_not_found", `no source ${r.source_id}`);
  const chain = await store.getChainSourceIds(r.disruption_id, r.barangay_id);

  const at = now.toISOString();
  await store.insertEvents([{
    disruption_id: r.disruption_id, event_type: "deployed", actor: r.deployed_by,
    occurred_at: clampToNow(r.deployed_at, now), barangay_id: r.barangay_id,
    payload_json: {
      step: "source", source_id: r.source_id, source_name: source.name,
      in_ranked_chain: chain === null ? null : chain.includes(r.source_id), recorded_at: at,
    },
  }]);
  return { disruption_id: r.disruption_id, barangay_id: r.barangay_id, source_id: r.source_id, source_name: source.name, recorded: true };
}
