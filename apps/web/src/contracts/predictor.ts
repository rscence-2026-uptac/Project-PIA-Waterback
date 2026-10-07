// SPEC: 02-disruption-predictor.md — PredictorOutput, mirrored from packages/shared-types (zod 4 there too).
// drivers / operator_actions / forecast_source are optional so older responses still parse.
import { z } from "zod";

export const PredictorDriver = z.object({
  feature: z.string(), // model feature name, or "wsp_rule" when a fallback fired
  text: z.string(), // plain language, ready for the UI
  value: z.number().optional(),
  unit: z.string().optional(),
  contribution: z.number().optional(), // weight x value, log-odds
  share: z.number().min(0).max(1).optional(), // fraction of the positive contributions
});
export type PredictorDriver = z.infer<typeof PredictorDriver>;

export const OperatorAction = z.object({
  action: z.string(),
  source: z.string(), // "WSP p.44" or "PIA WaterBack recommendation"
  when: z.string(),
});
export type OperatorAction = z.infer<typeof OperatorAction>;

export const PredictorOutput = z.object({
  scope: z.literal("system"),
  p_turbidity: z.number().min(0).max(1),
  p_drought: z.number().min(0).max(1),
  signal_level: z.number().int().min(0).max(4),
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  computed_at: z.string().datetime({ offset: true }),
  fallback_used: z.boolean(),
  forecast_source: z.enum(["seeded", "live", "missing"]).optional(),
  drivers: z.object({
    turbidity: z.array(PredictorDriver),
    drought: z.array(PredictorDriver),
    baseline: z.object({ turbidity: z.number().optional(), drought: z.number().optional() }),
  }).optional(),
  operator_actions: z.array(OperatorAction).optional(),
});
export type PredictorOutput = z.infer<typeof PredictorOutput>;

// History mode (`?history_hours=N`): hourly levels and scores, oldest first, ending at as_of. A score is
// 50 + 10 × log-odds (lib/scorecard.ts); null for an hour where that model fell back to a WSP rule.
export const PredictorHistoryHour = z.object({
  as_of: z.string(),
  signal_level: z.number().int().min(0).max(4),
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  fallback_used: z.boolean(),
  score_turbidity: z.number().nullable(),
  score_drought: z.number().nullable(),
});
export const PredictorHistory = z.object({
  as_of: z.string(),
  history_hours: z.number().int(),
  hours: z.array(PredictorHistoryHour),
});
export type PredictorHistory = z.infer<typeof PredictorHistory>;
