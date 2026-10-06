# ML predictor environment

Setup (Python 3.14 used; 3.13 also fine):

    cd ml
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

## Retrain (deterministic, seed 20261006)

    ml/.venv/bin/python ml/train_predictor.py

Writes `predictor_coefficients.json` (human-readable, never a pickle), `predictor_test_vectors.json`, `reports/training_report.md`, `reports/july_2026_replay.md`; prints gate PASS/FAIL. Needs `ml/data/openmeteo_*.json` (cached; fetched on demand if missing, except the historical-forecast file which is committed raw).

## Tests

    ml/.venv/bin/python ml/test_train_predictor.py
    ml/.venv/bin/python ml/test_constants_parity.py
    ml/.venv/bin/python ml/test_simulate_july.py

`test_train_predictor.py` asserts the acceptance gates and all coefficient signs; it fails while a gate is not met (see `specs/02`).

## Regenerate seeds

    ml/.venv/bin/python ml/simulate_july.py          # supabase/seed/july_readings.sql, rainfall_daily.sql
    ml/.venv/bin/python ml/seed_rainfall_hourly.py   # supabase/seed/rainfall_hourly.sql

Forecast assumptions live in `wsp_constants.py`. Docs: `docs/predictor.md`, `specs/02-disruption-predictor.md`.
