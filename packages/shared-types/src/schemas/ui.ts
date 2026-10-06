import { z } from "zod";

// specs/08-ui-ux-guidelines.md (Dev B). Moved here from apps/web/src/contracts/spec08.ts.
export const CopyKey = z.object({
  key: z.string(), // e.g. "status.restored", "notify.store_water"
  waray: z.string(),
  filipino: z.string(),
  english: z.string(),
});
export type CopyKey = z.infer<typeof CopyKey>;

export const SmsTemplate = z.object({
  key: z.string(),
  template: z.string(), // supports {placeholders}
  max_length: z.literal(160), // one GSM segment; flag explicitly if a message must exceed it
  language: z.enum(["waray", "filipino", "english"]),
});
export type SmsTemplate = z.infer<typeof SmsTemplate>;

export const ScreenState = z.enum(["loading", "ready", "offline_stale", "error"]);
export type ScreenState = z.infer<typeof ScreenState>;

export type Language = SmsTemplate["language"];
