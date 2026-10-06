import { z } from "zod";

// specs/02-disruption-predictor.md
export const TurbidityFeatures = z.object({
  turbidity_ntu: z.number(),
  turbidity_slope_per_hr: z.number(),       // over the last 6 readings
  rain_24h_mm: z.number(),                   // Open-Meteo
  rain_72h_mm: z.number(),
  clarifier_utilization: z.number().min(0).max(2), // inflow ÷ 46 L/s rated capacity
});
export type TurbidityFeatures = z.infer<typeof TurbidityFeatures>;

export const DroughtFeatures = z.object({
  reservoir_pct: z.number().min(0).max(100), // % of 340 m³ usable capacity
  reservoir_trend_pct_per_day: z.number(),    // 7-day trend
  rain_14d_mm: z.number(),
  rain_30d_mm: z.number(),
  days_since_rain_over_5mm: z.number().int().nonnegative(),
});
export type DroughtFeatures = z.infer<typeof DroughtFeatures>;

export const PredictorOutput = z.object({
  barangay_id: z.string(),
  p_turbidity: z.number().min(0).max(1),
  p_drought: z.number().min(0).max(1),
  signal_level: z.number().int().min(0).max(4), // max of the two levels below
  turbidity_level: z.number().int().min(0).max(4),
  drought_level: z.number().int().min(0).max(4),
  computed_at: z.string().datetime(),
  fallback_used: z.boolean(), // true when a missing feature forced the WSP deterministic rule
});
export type PredictorOutput = z.infer<typeof PredictorOutput>;

export const PredictorCoefficients = z.object({
  bias: z.number(),
  weights: z.record(z.number()), // keyed by feature name, matches FEATURE_NAMES
});
export type PredictorCoefficients = z.infer<typeof PredictorCoefficients>;
