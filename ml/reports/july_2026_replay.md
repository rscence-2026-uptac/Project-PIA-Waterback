# July 2026 replay (v2; simulated intake series, real Open-Meteo rain)

Both models run over `ml/simulate_july.py` output (SIMULATED readings; not CWD telemetry) with REAL July rain. Trailing rain windows (24h/72h/14d/30d, days since >=5 mm) use real June 2026 rain as context (`ml/data/openmeteo_2026-06.json`); the Kulador slope uses July readings only (June readings are unknown), so it is 0 for the first hours.

**Forecast feature caveat.** `forecast_rain_48h_mm` comes from Open-Meteo's Historical Forecast archive (`ml/data/openmeteo_histforecast_2026-06-07.json`): stitched first hours of successive model runs, not a true 24-48 h-ahead forecast. For this window it is value-identical to the archive rain, so the main replay below is an **oracle-forecast upper bound**. The sensitivity section re-runs it with the training forecast-error model (noisy forecasts), which is the honest expectation for real use.

## Result with the archive forecast (oracle)

- First crisis onset in the series (Kulador raw >= 250 NTU or Caramayon I >= 500 NTU): **Jul 02 16:00** (Kulador 353 NTU; scenario `crisis_start` Jul 02 00:00).
- p >= 0.4 first reached **Jul 01 00:00** (series start, Jul 01 00:00). The alarm is **unbroken from the first hour of July through the onset**, so within the seeded July series the lead time is only a **lower bound of 40 h, censored at the series start**, not a measured lead time.
- Pre-roll diagnostic (June+July simulated as one series with different noise; June readings are not in the seed): p >= 0.4 alarm run containing the onset starts **Jun 26 14:00** (146 h before onset); last hour with p < 0.4 before it: Jun 26 13:00; share of June hours alarming: 65%. Only that last-below-0.4 hour supports a genuine lead claim.
- Event recall (hours with a turbidity label in the next 48 h): 1.00; precision 0.87.
- **Non-event alarm rate for the whole month** (p >= 0.4 on hours with no turbidity label in the next 48 h; last 48 h excluded, no look-ahead): **21.7%** (63 of 290 h) -> gate < 20%: **FAIL**. Excluding also the 48-72 h band before an event (an alarm 2-3 days ahead is early warning, not noise): 14.7% (218 h).

### Episode lead times (event episodes merged when < 48 h apart)

| onset | p at onset | unbroken alarm run starts | lead (h) | note |
|---|---|---|---|---|
| Jul 02 16:00 | 0.97 | Jul 01 00:00 | 40 | censored at series start |
| Jul 08 09:00 | 0.99 | Jul 06 05:00 | 52 | alarm run began after a quiet period |
| Jul 11 05:00 | 0.98 | Jul 06 05:00 | 120 | alarm run began after a quiet period |
| Jul 21 22:00 | 1.00 | Jul 19 19:00 | 51 | alarm run began after a quiet period |
| Jul 31 14:00 | 1.00 | Jul 19 19:00 | 283 | alarm run began after a quiet period |

### Late-July storms (real rain: Jul 23 = 27.0 mm, Jul 28 = 35.9 mm)

| storm day | first turbidity-event hour that day | unbroken alarm run starts | lead (h) | p < 0.4 at some earlier July hour? |
|---|---|---|---|---|
| 2026-07-23 | Jul 23 01:00 | Jul 19 19:00 | 78 | yes (before Jul 19 19:00) |
| 2026-07-28 | Jul 28 17:00 | Jul 19 19:00 | 214 | yes (before Jul 19 19:00) |

Honest reading: Jul 19-31 is one continuous 13-day wet spell (every day >= 3 mm, most >= 8 mm), and turbidity p stays >= 0.4 the whole time. The alarm began Jul 19 19:00, ~51 h before the first event hour of that spell (Jul 21 22:00), which is a real lead for the spell. For the Jul 23 and Jul 28 storms inside it the alarm was already on, so their 'lead' is just the spell's, not an independent warning.

On Jul 8-12 the same pattern: one alarm run from Jul 06 05:00 covers the Jul 8 and Jul 11 events (52 h lead for the first).

### Jul 1-8 per day

| date | rain mm | Kulador max NTU | turbidity p max | turbidity level (from max p) | hours with p >= 0.4 | drought p (day) | drought level |
|---|---|---|---|---|---|---|---|
| 2026-07-01 | 9.6 | 146 | 0.96 | 4 | 24 | 0.02 | 0 |
| 2026-07-02 | 14.4 | 359 | 0.97 | 4 | 24 | 0.02 | 0 |
| 2026-07-03 | 3.2 | 215 | 0.83 | 4 | 13 | 0.03 | 0 |
| 2026-07-04 | 1.6 | 64 | 0.26 | 1 | 0 | 0.04 | 0 |
| 2026-07-05 | 2.5 | 91 | 0.23 | 1 | 0 | 0.83 | 4 |
| 2026-07-06 | 1.8 | 67 | 0.62 | 3 | 19 | 0.86 | 4 |
| 2026-07-07 | 1.9 | 55 | 0.89 | 4 | 24 | 0.84 | 4 |
| 2026-07-08 | 12.2 | 253 | 0.99 | 4 | 24 | 0.03 | 0 |

## Sensitivity: noisy forecasts (training error model, 20 seeds)

Non-event alarm rate: median 25.9% (range 19.7-31.0%); event recall median 0.92; event precision median 0.83. Share of seeds under the 20% gate: 5%.

## Drought model on the July crisis

July 2026 is a turbidity + power-outage crisis, not a rain deficit. The simulated outage collapses the reservoir (Jul 5-7), and the drought model, whose inputs cannot see the cause, fires (max drought p 0.86). Framing: it flags a **supply shortage** (reservoir collapse), which is real and operationally useful, but it is not a drought in the climatological sense. Training labels exclude outage-caused drops; the features cannot tell them apart. The system signal is the max of the two levels.
