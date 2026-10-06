// "Why" for a prediction: per-feature log-odds contributions and WSP-grounded operator actions. Pure, no I/O.
import { droughtCoefficients, turbidityCoefficients } from "./model.generated.ts";

export type DriverModel = "turbidity" | "drought";
export interface Driver {
  feature: string; // model feature name, or "wsp_rule" when a deterministic WSP rule fired
  text: string; // plain language
  value?: number; // raw feature value (model drivers only)
  unit?: string;
  contribution?: number; // weight x value, in log-odds (model drivers only)
  share?: number; // fraction of the sum of the POSITIVE contributions (0 for protective drivers)
}
export interface Drivers {
  turbidity: Driver[];
  drought: Driver[];
  /** Model bias (log-odds); present only for a model that ran. baseline + sum(contribution) == logit(p). */
  baseline: { turbidity?: number; drought?: number };
}
export interface OperatorAction {
  action: string;
  /** "WSP p.NN" or "PIA WaterBack recommendation" (never an invented WSP citation). */
  source: string;
  /** Which signal and, where relevant, which top driver selected this action. */
  when: string;
}

export const PIA_REC = "PIA WaterBack recommendation";

const UNITS: Record<string, string> = {
  turbidity_ntu: "NTU", rain_24h_mm: "mm", rain_72h_mm: "mm", forecast_rain_48h_mm: "mm",
  reservoir_pct: "%", rain_14d_mm: "mm", rain_30d_mm: "mm", days_since_rain_over_5mm: "days",
};
const num = (v: number): string => (Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));

/** Plain-language sentence for one feature value. */
export function driverText(feature: string, v: number): string {
  switch (feature) {
    case "turbidity_ntu": return `Kulador raw-water turbidity is ${num(v)} NTU now`;
    case "rain_24h_mm": return `${num(v)} mm of rain fell in the last 24 h`;
    case "rain_72h_mm": return `${num(v)} mm of rain fell in the last 72 h`;
    case "forecast_rain_48h_mm": return `${num(v)} mm of rain forecast in the next 48 h`;
    case "reservoir_pct": return `Reservoir at ${num(v)}% of its 340 m3 usable capacity`;
    case "rain_14d_mm": return `${num(v)} mm of rain in the last 14 days`;
    case "rain_30d_mm": return `${num(v)} mm of rain in the last 30 days`;
    case "days_since_rain_over_5mm": return v === 0 ? "Rain of 5 mm or more fell today" : `${num(v)} ${v === 1 ? "day" : "days"} since a day with 5 mm or more of rain`;
    default: return `${feature} = ${num(v)}`;
  }
}

/** Contributions for the model that ran, sorted by contribution (log-odds) descending. */
export function modelDrivers(model: DriverModel, features: object): { baseline: number; items: Driver[] } {
  const coef = model === "turbidity" ? turbidityCoefficients : droughtCoefficients;
  const f = features as Record<string, number>;
  const items: Driver[] = Object.entries(coef.weights).map(([feature, w]) => {
    const value = f[feature];
    return { feature, value, unit: UNITS[feature] ?? "", contribution: w * value, share: 0, text: driverText(feature, value) };
  });
  const posSum = items.reduce((s, d) => s + Math.max(0, d.contribution as number), 0);
  for (const d of items) d.share = posSum > 0 ? Math.max(0, d.contribution as number) / posSum : 0;
  items.sort((a, b) => (b.contribution as number) - (a.contribution as number));
  return { baseline: coef.bias, items };
}

export const wspRuleDriver = (text: string): Driver => ({ feature: "wsp_rule", text });

/** Recommended actions for the two levels and the top driver of each. Everything not in the WSP is labelled PIA_REC. */
export function operatorActions(turbLevel: number, droughtLevel: number, topTurb?: string, topDrought?: string): OperatorAction[] {
  const out: OperatorAction[] = [];
  if (turbLevel >= 2) {
    const w = `turbidity_level>=2`;
    out.push({ action: "Pre-dose PAC/polymer and caustic soda at Kulador before the turbidity peak arrives", source: "WSP p.44", when: w });
    out.push({ action: "Make sure the 440 m3 reservoir (Brgy. 13) is topped up before intake turbidity rises", source: "WSP p.13", when: w });
    out.push({ action: "Check fuel and readiness of the Caramayon standby generator and spare pumps", source: "WSP p.43", when: w });
    out.push({ action: "Have filter bags ready to clean or replace, and keep pre- and post-chlorination running", source: "WSP p.44", when: w });
    if (topTurb === "forecast_rain_48h_mm") out.push({ action: "Rain is the main driver: check stock of PAC, polymer and caustic soda covers the forecast rain window", source: PIA_REC, when: `${w}; top driver forecast_rain_48h_mm` });
    if (topTurb === "turbidity_ntu") out.push({ action: "Turbidity already high at Kulador: take a turbidimeter reading now rather than waiting for the daily check", source: PIA_REC, when: `${w}; top driver turbidity_ntu` });
  }
  if (turbLevel >= 4) {
    out.push({ action: "If Caramayon I reads 500 NTU or above: temporary shut-off of that source", source: "WSP p.43", when: "turbidity_level>=4" });
  }
  if (droughtLevel >= 2) {
    const w = "drought_level>=2";
    out.push({ action: "Plan within the 340 m3 usable reservoir volume: 100 m3 of the 440 m3 is reserved for fire fighting", source: "WSP p.13", when: w });
    out.push({ action: "Check the booster pumps serving the low-pressure zones (Maulong, Mercedes, Brgy. 13, Bunu-anan)", source: "WSP pp.27-28", when: w });
    out.push({ action: "Issue a water-conservation advisory (the WSP has no rationing or rotation schedule)", source: PIA_REC, when: w });
    if (topDrought === "days_since_rain_over_5mm") out.push({ action: "Long dry spell is the main driver: re-check source yields daily", source: PIA_REC, when: `${w}; top driver days_since_rain_over_5mm` });
  }
  return out;
}
