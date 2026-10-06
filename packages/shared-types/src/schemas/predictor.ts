import { z } from "zod";

// specs/02-disruption-predictor.md
export const TurbidityFeatures = z.object({
  turbidity_ntu: z.number(),
  rain_24h_mm: z.number(),                   // Open-Meteo
  rain_72h_mm: z.number(),
  forecast_rain_48h_mm: z.number().nonnegative(), // sum of forecast hourly rain over (as_of, as_of+48h] (v2; replaces clarifier_utilization). v3 (2026-10-06.3) drops turbidity_slope_per_hr
});
export type TurbidityFeatures = z.infer<typeof TurbidityFeatures>;

export const DroughtFeatures = z.object({
  reservoir_pct: z.number().min(0).max(100), // % of 340 m³ usable capacity
  rain_14d_mm: z.number(),
  rain_30d_mm: z.number(),
  days_since_rain_over_5mm: z.number().int().nonnegative(), // Manila calendar days; uncapped (v2); lower bound if no wet day in history
});
export type DroughtFeatures = z.infer<typeof DroughtFeatures>;

// Why a prediction is what it is. Model drivers carry value/unit/contribution/share; a fallback rule is {feature:"wsp_rule", text}.
export const PredictorDriver = z.object({
  feature: z.string(),                 // model feature name, or "wsp_rule"
  text: z.string(),                    // plain language, e.g. "41 mm of rain forecast in the next 48 h"
  value: z.number().optional(),
  unit: z.string().optional(),
  contribution: z.number().optional(), // weight x value, log-odds; baseline + sum == logit(p)
  share: z.number().min(0).max(1).optional(), // fraction of the sum of positive contributions
});
export type PredictorDriver = z.infer<typeof PredictorDriver>;

export const PredictorDrivers = z.object({
  turbidity: z.array(PredictorDriver), // sorted by contribution, descending
  drought: z.array(PredictorDriver),
  baseline: z.object({ turbidity: z.number().optional(), drought: z.number().optional() }), // model bias; absent for a model that fell back
});
export type PredictorDrivers = z.infer<typeof PredictorDrivers>;

export const OperatorAction = z.object({
  action: z.string(),
  source: z.string(), // "WSP p.44" ... or "PIA WaterBack recommendation" (not in the WSP)
  when: z.string(),   // which level / top driver selected it
});
export type OperatorAction = z.infer<typeof OperatorAction>;

export const PredictorOutput = z.object({
  scope: z.literal("system"), // blended network -> one system-wide prediction; spec 03 fans out to barangays
  p_turbidity: z.number().min(0).max(1),
  p_drought: z.number().min(0).max(1),
  signal_level: z.number().int().min(0).max(4), // max of the two levels below
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  computed_at: z.iso.datetime({ offset: true }),
  fallback_used: z.boolean(), // true when a missing feature forced the WSP deterministic rule
  forecast_source: z.enum(["seeded", "live", "missing"]).optional(), // where forecast_rain_48h_mm came from (optional: older responses omit it)
  drivers: PredictorDrivers.optional(),               // 2026-10-06: why (optional: older responses omit it)
  operator_actions: z.array(OperatorAction).optional(), // recommended actions for the current levels
});
export type PredictorOutput = z.infer<typeof PredictorOutput>;

export const PredictorCoefficients = z.object({
  bias: z.number(),
  weights: z.record(z.string(), z.number()), // keyed by feature name, matches FEATURE_NAMES
});
export type PredictorCoefficients = z.infer<typeof PredictorCoefficients>;
