# Spec: Allocation, deploy, notify & resident confirmation

## What it does
Covers the full Action phase of the process flow: the LGU allocation-priority screen, deploying the response, notifying residents (PWA + SMS), capturing resident confirmation, and writing the `event_log` entries that either close the loop back to Monitor baseline or re-open allocation if the resident reports access was not restored.

## Data contract
```ts
import { z } from "zod";

export const AllocationDecision = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  priority_rank: z.number().int().positive(),
  officer_id: z.string(),
  overridden_from_suggested_rank: z.number().int().positive().nullable(), // null = accepted as suggested
  note: z.string().optional(),
});

export const DeployResponse = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  source_id: z.string().uuid(), // the ranked_chain entry actually deployed
  deployed_by: z.string(),
  deployed_at: z.string().datetime(),
});

export const NotificationPayload = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  channel: z.enum(["pwa_push", "sms"]),
  status: z.string(),
  cause: z.enum(["turbidity", "drought", "repair"]),
  expected_duration_hint: z.string().optional(), // plain-language, not a committed SLA
  store_water_advice: z.boolean(),
  nearest_source_name: z.string(),
  sent_at: z.string().datetime(),
});

export const ResidentConfirmation = z.object({
  disruption_id: z.string().uuid(),
  barangay_id: z.string(),
  confirmed_by: z.enum(["resident", "barangay_captain"]),
  channel: z.enum(["pwa", "sms_reply"]),
  restored: z.boolean(), // false => re-enters allocation, matches the "no, adjust" loop
  confirmed_at: z.string().datetime(),
});

export const EventLogEntry = z.object({
  disruption_id: z.string().uuid(),
  event_type: z.enum(["deployed", "notified", "resident_confirmed", "resolved"]),
  actor: z.string(),
  occurred_at: z.string().datetime(),
});
```

## Acceptance criteria
- [ ] An LGU officer can view a confirmed disruption's ranked, affected barangays and confirm or override the suggested priority order — every override records `officer_id`, `overridden_from_suggested_rank`, and a timestamp (human-in-the-loop, auditable, not a black box)
- [ ] Confirming an allocation writes a `deployed` event, then sends a resident notification via PWA push and SMS (Semaphore) for feature-phone users, in under 10 seconds end-to-end on seed data
- [ ] A resident, or a barangay captain on their behalf, can confirm receipt via the PWA or an SMS reply keyword — this writes a `resident_confirmed` event, and only this action is allowed to flip a disruption to `resolved`
- [ ] If `ResidentConfirmation.restored === false`, the disruption re-enters the allocation screen instead of auto-closing — matching the process-flow diagram's "no, adjust" loop back to Deploy response, and does **not** write a `resolved` event
- [ ] A plain, timestamped allocation log (who was prioritized, when, by whom) is viewable end to end — hash-chaining is P1, added only if time remains

## Out of scope
- Full cryptographic/hash-chained ledger (P1, cut by default)
- Automated fund disbursement or procurement
- A retry cap or escalation path for repeated "not restored" reports — open design question, not yet speced; flag to the LGU after N failed confirmations is the likely P1 follow-up

## Depends on
- specs/02-disruption-predictor.md
- specs/03-affected-area-mapping.md
- specs/04-continuity-ranking.md
- specs/05-operator-pwa.md
- specs/08-ui-ux-guidelines.md
