# disruption-predictor (spec 02, model v3, version `2026-10-06.3`)

System-wide, read-only. Reads recent `readings`, up to 90 days of `rainfall_hourly`, and the next 48 h of `rain_forecast_hourly` (or a live Open-Meteo forecast), runs two logistic models and returns a `PredictorOutput` (zod schema in `packages/shared-types`). It does not write disruptions (that is spec 03/06).

## Endpoint (Dev B)

`GET /functions/v1/disruption-predictor?as_of=<ISO 8601 with offset>` or `POST` with JSON body `{"as_of": "..."}`.

| Param | Required | Notes |
|---|---|---|
| `as_of` | no | ISO 8601 **with offset or Z** (e.g. `2026-07-02T06:00:00+08:00`). Default = now. A bare date or a datetime without offset is rejected (400). In a URL encode `+` as `%2B` (an unencoded `+` is tolerated). |

Headers: `apikey: <ANON_KEY>` and `Authorization: Bearer <ANON_KEY>`. CORS is open (OPTIONS preflight answered).

```ts
const url = `${SUPABASE_URL}/functions/v1/disruption-predictor?as_of=${encodeURIComponent("2026-07-22T12:00:00+08:00")}`;
const res = await fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
const out = PredictorOutput.parse(await res.json());
```

### Response (200)

```json
{
  "scope": "system",
  "p_turbidity": 0.999,
  "p_drought": 0.019,
  "turbidity_level": 4,
  "drought_level": 0,
  "signal_level": 4,
  "computed_at": "2026-07-22T04:00:00.000Z",
  "fallback_used": false,
  "forecast_source": "seeded"
}
```

| Field | Meaning |
|---|---|
| `p_turbidity`, `p_drought` | 0..1 probabilities. When a fallback fired for that hazard, `p_*` is the band midpoint (0.1 / 0.3 / 0.5 / 0.7 / 0.9), not a model output. |
| `turbidity_level`, `drought_level` | 0..4 per hazard (bands below). |
| `signal_level` | `max(turbidity_level, drought_level)`, never an average. This is the number to show / trigger on. |
| `computed_at` | `as_of` as UTC ISO. |
| `fallback_used` | `true` if at least one hazard used the deterministic rule because a model input was missing. Show it as "reduced confidence". |
| `forecast_source` | `"seeded"` (rows from `rain_forecast_hourly`), `"live"` (Open-Meteo call) or `"missing"` (no forecast, turbidity used its fallback). Optional in the zod schema, always present from this function. |

### How `signal_level` is derived

`level` from probability (lower bound inclusive): `p < 0.2` -> 0, `0.2-0.4` -> 1, `0.4-0.6` -> 2, `0.6-0.8` -> 3, `p >= 0.8` -> 4 (`toSignalLevel` in shared-types). Then `signal_level = max(turbidity_level, drought_level)`. One hard rule overrides the model: Caramayon I >= 500 NTU in the last 24 h (WSP p.43 source shut-off) forces `turbidity_level = 4`.

### Model inputs (v3)

- Turbidity: `turbidity_ntu` (latest Kulador reading, at most 6 h old), `rain_24h_mm`, `rain_72h_mm`, `forecast_rain_48h_mm` (sum of forecast hourly rain over (as_of, as_of+48 h]).
- Drought: `reservoir_pct` (latest Kulador), `rain_14d_mm`, `rain_30d_mm`, `days_since_rain_over_5mm` (Manila calendar days since the last day with >= 5 mm; 0 if today already has >= 5 mm; **not capped**; if no wet day exists in the 90 days read, the number of days of history available, a lower bound).
- `clarifier_utilization`, the reservoir trend and (since v3) `turbidity_slope_per_hr` are no longer model inputs. The slope's v2 weight had the wrong sign and no effect on the metrics, so v3 drops it and the 6-reading window with it.

### Fallback rules

| Situation | What happens | `fallback_used` |
|---|---|---|
| All turbidity inputs present | model | false |
| No Kulador reading in the last 6 h (sensor gap) | turbidity WSP rule | true |
| No rainfall rows in the window, or newest hourly rain row older than 3 h | turbidity WSP rule (and drought rule, see below) | true |
| `forecast_source = "missing"` | turbidity WSP rule | true |
| No reservoir reading in the last 24 h, or no rain rows for the 14 d / 30 d windows | drought reservoir rule | true |
| Missing `clarifier_inflow_lps` | nothing (not an input any more) | false |

Turbidity WSP rule (raw NTU, max of Kulador and Caramayon I readings in the last 24 h): `>= 500` -> 4, `>= 250` -> 3, `> 5` -> 1, else 0. With no turbidity at all it uses the worst `plant_status` of the last 24 h (`shutdown` -> 4, `degraded` -> 3, else 0). Drought reservoir rule (**our assumption**, WSP has none): `< 10 %` -> 4, `< 20 %` -> 3, `< 35 %` -> 2, `< 50 %` -> 1, else 0; no reservoir data -> 0.

### Data sources

| Input | Source |
|---|---|
| `readings` | table `readings` (seed: simulated, `is_simulated = true`, July 2026) |
| Rain history | `rainfall_hourly` (Open-Meteo, June + July 2026 seeds), 90-day lookback |
| Forecast | (a) `rain_forecast_hourly` if it has **all 48** hourly rows in (as_of, as_of+48 h] -> `seeded`; else (b) live Open-Meteo forecast (`api.open-meteo.com`, 5 s timeout) **only if as_of is within the last 3 h of now** -> `live`; else (c) `missing` |

### Errors

`400 {"error": ...}` bad `as_of` or invalid JSON body; `405` other methods; `500 {"error": "failed to compute prediction"}` data access failure. An unreachable live forecast is not an error: it degrades to `forecast_source: "missing"`.

### Demo `as_of` suggestions

The seeded data covers 2026-07-01..2026-07-31 (readings) and forecast rows through 2026-07-31 23:00, so use `as_of` between `2026-07-01T00:00+08:00` and `2026-07-29T23:00+08:00` for `forecast_source: "seeded"` without any network. Good picks with model 2026-10-06.2: `2026-07-01T00:00+08:00` (start; only one reading exists, so turbidity uses the fallback: level 1, `fallback_used: true`), `2026-07-02T06:00+08:00` (crisis start: signal 4), `2026-07-15T12:00+08:00` (calm: signal 0), `2026-07-22T12:00+08:00` (second event: signal 4). `2026-07-31T12:00+08:00` has no complete 48 h forecast -> `forecast_source: "missing"`, `fallback_used: true` (a useful demo of the fallback). Omitting `as_of` (now) uses the live forecast, but there are no seeded readings for today, so expect `fallback_used: true`.

## Regenerate model + constants (after retraining or editing shared-types constants)

```
node supabase/functions/_shared/gen_model.mjs        # reads ml/predictor_coefficients.json (v3 feature lists enforced)
```
Writes `_shared/model.generated.ts` and `_shared/constants.generated.ts` (never hand-edit). The edge function only imports from `supabase/functions`.

## Test

```
bash supabase/tests/run_local.sh                         # local pia_dev: migrations + seeds + SQL checks, prints ALL PASS
cd supabase/tests/functions && npm install && npm test   # unit + parity (ml/predictor_test_vectors.json) + e2e on pia_dev
```

## Deploy (user runs these)

```
supabase db push                                   # applies 20261006000005_rain_forecast_hourly.sql (new table)
# load the new/changed seeds on the remote DB (db push does not run seeds; all are idempotent "on conflict do nothing"):
for f in rainfall_context_2026_06 rain_forecast_hourly; do psql "$DB_URL" -f supabase/seed/$f.sql; done
supabase functions deploy disruption-predictor
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. If the remote DB does not have the earlier seeds yet, also run `rainfall_daily.sql`, `rainfall_hourly.sql`, `july_readings.sql` (in `config.toml` `sql_paths` order). Smoke test: `curl -H "apikey: $ANON" "$SUPABASE_URL/functions/v1/disruption-predictor?as_of=2026-07-22T12:00:00%2B08:00"`.
