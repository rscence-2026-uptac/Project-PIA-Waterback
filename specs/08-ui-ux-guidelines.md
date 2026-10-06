# Spec: UI/UX guidelines

## What it does
Cross-cutting rules every screen and message must follow — offline/low-bandwidth states, elderly & PWD-friendly layout, Waray-Waray/Filipino/English copy, and SMS template limits — so `05`, `06`, and `07` don't each invent their own. Written first; every other client-facing spec reads from this one.

## Data contract
```ts
import { z } from "zod";

export const CopyKey = z.object({
  key: z.string(), // e.g. "status.restored", "notify.store_water"
  waray: z.string(),
  filipino: z.string(),
  english: z.string(),
});

export const SmsTemplate = z.object({
  key: z.string(),
  template: z.string(), // supports {placeholders}
  max_length: z.literal(160), // one GSM segment; flag explicitly if a message must exceed it
  language: z.enum(["waray", "filipino", "english"]),
});

export const ScreenState = z.enum(["loading", "ready", "offline_stale", "error"]);
```

## Acceptance criteria
- [ ] Every user-facing string lives in one trilingual `CopyKey` table — never hardcoded inline in a component
- [ ] Minimum tap target 44×44px, minimum body text 16px, color contrast ≥ WCAG AA — checked on the operator, resident, and admin views
- [ ] Every async screen implements all four `ScreenState` values up front (loading, ready, offline/stale, error) — no screen ships with only the happy path
- [ ] Every `SmsTemplate` fits 160 characters in all three languages, or is explicitly flagged as multi-segment before it ships

## Out of scope
- Full WCAG AAA compliance
- Professional translation review — team's own Waray-Waray/Filipino fluency only; flag any string the team is unsure of rather than guessing

## Depends on
- none — write first, informs specs/05-operator-pwa.md, specs/06-allocation-and-notify.md, specs/07-admin-dashboard.md
