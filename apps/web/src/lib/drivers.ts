// "Why" for a prediction: turns the predictor's drivers (spec 02) into the few bars a person can read.
// Positive contributions push the risk up (bar = share of today's risk); protective ones pull it down.
import type { PredictorDriver, PredictorOutput } from "../contracts/predictor";

export type DriverModel = "turbidity" | "drought";

export interface DriverBar {
  feature: string;
  text: string;
  /** Raises the risk (true) or protects against it (false). */
  positive: boolean;
  /** A WSP rule fired instead of a model score (no bar). */
  rule: boolean;
  /** 0-1 bar length: share of today's risk for positive drivers, share of the protection for protective ones. */
  fraction: number;
}

/** The model that explains the signal: the one with the higher probability (turbidity on a tie). */
export function leadingModel(p: Pick<PredictorOutput, "p_turbidity" | "p_drought">): DriverModel {
  return p.p_turbidity >= p.p_drought ? "turbidity" : "drought";
}

const MIN_CONTRIBUTION = 0.005; // log-odds below this is noise, not a reason

export function driverBars(list: PredictorDriver[] | undefined, n = 3): DriverBar[] {
  if (!list || list.length === 0) return [];
  const rules = list.filter((d) => d.feature === "wsp_rule");
  const scored = list.filter((d) => d.feature !== "wsp_rule" && typeof d.contribution === "number" && Math.abs(d.contribution) >= MIN_CONTRIBUTION);
  const protective = scored.filter((d) => d.contribution! < 0);
  const protectiveTotal = protective.reduce((sum, d) => sum + Math.abs(d.contribution!), 0);
  const positiveTotal = scored.filter((d) => d.contribution! > 0).reduce((sum, d) => sum + d.contribution!, 0);

  const bars: DriverBar[] = scored
    .sort((a, b) => Math.abs(b.contribution!) - Math.abs(a.contribution!))
    .map((d) => {
      const positive = d.contribution! > 0;
      const fraction = positive
        ? d.share ?? (positiveTotal > 0 ? d.contribution! / positiveTotal : 0)
        : protectiveTotal > 0 ? Math.abs(d.contribution!) / protectiveTotal : 0;
      return { feature: d.feature, text: d.text, positive, rule: false, fraction: Math.min(1, Math.max(0, fraction)) };
    });
  const ruleBars: DriverBar[] = rules.map((d) => ({ feature: d.feature, text: d.text, positive: true, rule: true, fraction: 1 }));
  return [...ruleBars, ...bars].slice(0, Math.max(n, ruleBars.length));
}

/** Every WSP rule that fired, in either model, without repeats. */
export function firedRules(p: PredictorOutput): string[] {
  const all = [...(p.drivers?.turbidity ?? []), ...(p.drivers?.drought ?? [])];
  return [...new Set(all.filter((d) => d.feature === "wsp_rule").map((d) => d.text))];
}

/** Plain-language top reason for the resident card: the first rule or the biggest risk-raising driver. */
export function topReason(p: PredictorOutput | null | undefined): string | null {
  if (!p?.drivers) return null;
  const bars = driverBars(p.drivers[leadingModel(p)], 3);
  return (bars.find((b) => b.rule) ?? bars.find((b) => b.positive))?.text ?? null;
}

export const hasDrivers = (p: PredictorOutput | null | undefined): p is PredictorOutput & Required<Pick<PredictorOutput, "drivers">> =>
  Boolean(p?.drivers && (p.drivers.turbidity.length > 0 || p.drivers.drought.length > 0));
