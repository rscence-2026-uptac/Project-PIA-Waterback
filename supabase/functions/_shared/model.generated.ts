// GENERATED from ml/predictor_coefficients.json — never hand-edit. Regenerate: node supabase/functions/_shared/gen_model.mjs

export const modelMeta = {
  "version": "2026-10-06.2",
  "trained_at": "2026-10-06T10:02:30+00:00",
  "seed": 20261006,
  "training_data": "synthetic, physics-informed; rain = real Open-Meteo 2016-2025 Catbalogan; not real incident history",
  "decision_threshold": 0.4,
  "signal_level_thresholds": [
    0.2,
    0.4,
    0.6,
    0.8
  ]
} as const;

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export const turbidityCoefficients = {
  "bias": -3.067541607941377,
  "weights": {
    "turbidity_ntu": 0.009111627771016465,
    "turbidity_slope_per_hr": -0.0008902871096390723,
    "rain_24h_mm": 0.09876844308516028,
    "rain_72h_mm": 0.011187125382325063,
    "forecast_rain_48h_mm": 0.20224929833247204
  }
} as const;

export interface TurbidityModelFeatures {
  turbidity_ntu: number;
  turbidity_slope_per_hr: number;
  rain_24h_mm: number;
  rain_72h_mm: number;
  forecast_rain_48h_mm: number;
}

/** p = sigmoid(bias + sum(weight * feature)), RAW feature units. */
export function turbidityRisk(f: TurbidityModelFeatures): number {
  const z = turbidityCoefficients.bias
    + turbidityCoefficients.weights.turbidity_ntu * f.turbidity_ntu
    + turbidityCoefficients.weights.turbidity_slope_per_hr * f.turbidity_slope_per_hr
    + turbidityCoefficients.weights.rain_24h_mm * f.rain_24h_mm
    + turbidityCoefficients.weights.rain_72h_mm * f.rain_72h_mm
    + turbidityCoefficients.weights.forecast_rain_48h_mm * f.forecast_rain_48h_mm;
  return sigmoid(z);
}

export const droughtCoefficients = {
  "bias": 4.237589067675291,
  "weights": {
    "reservoir_pct": -0.057730106823536013,
    "rain_14d_mm": -0.009978047161867032,
    "rain_30d_mm": -0.008676213440875663,
    "days_since_rain_over_5mm": 0.06314853251297636
  }
} as const;

export interface DroughtModelFeatures {
  reservoir_pct: number;
  rain_14d_mm: number;
  rain_30d_mm: number;
  days_since_rain_over_5mm: number;
}

/** p = sigmoid(bias + sum(weight * feature)), RAW feature units. */
export function droughtRisk(f: DroughtModelFeatures): number {
  const z = droughtCoefficients.bias
    + droughtCoefficients.weights.reservoir_pct * f.reservoir_pct
    + droughtCoefficients.weights.rain_14d_mm * f.rain_14d_mm
    + droughtCoefficients.weights.rain_30d_mm * f.rain_30d_mm
    + droughtCoefficients.weights.days_since_rain_over_5mm * f.days_since_rain_over_5mm;
  return sigmoid(z);
}
