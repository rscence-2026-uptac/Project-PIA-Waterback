// Runs the spec 02 predictor for a given as_of with injected data access (shared by affected-areas and disruption-monitor).
import { makeLiveFetcher } from "./forecast.ts";
import type { FetchLive } from "./forecast.ts";
import { resolveForecast } from "./handler.ts";
import type { FetchData } from "./handler.ts";
import { predict } from "./predict.ts";
import type { PredictorOutput } from "./predict.ts";

const LOOKBACK_MS = 90 * 24 * 3_600_000; // same 90 d rain history as disruption-predictor

export async function runPredictor(
  fetchData: FetchData, asOf: Date, now: Date, fetchLive: FetchLive = makeLiveFetcher(),
): Promise<PredictorOutput> {
  const data = await fetchData(new Date(asOf.getTime() - LOOKBACK_MS), asOf);
  const fc = await resolveForecast(data.forecastHourly, asOf, now, fetchLive);
  return predict({ readings: data.readings, rainHourly: data.rainHourly, asOf, forecastRain48hMm: fc.mm, forecastSource: fc.source });
}
