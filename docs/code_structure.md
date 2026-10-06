tubig-patas/
  specs/
    00-data-model.md
    01-seed-data.md
    02-disruption-predictor.md
    03-affected-area-mapping.md
    04-continuity-ranking.md
    05-operator-pwa.md
    06-allocation-and-notify.md
    07-admin-dashboard.md
    08-ui-ux-guidelines.md
  apps/
    web/                     # React + Vite PWA: resident/captain, operator, admin routes
  ml/
    train_predictor.py      # scikit-learn LogisticRegression x2, synthetic data generator
    predictor_coefficients.json   # exported weights, checked in, human-readable
  supabase/
    migrations/              # one file per schema change, numbered
    functions/               # disruption-predictor, rank-chain, allocate, notify, sms-webhook
    seed/
      cwd_wsp_constants.sql  # cited to the 2022 WSP, per spec 01
      july_readings.sql      # simulated, per spec 01
      openmeteo_rainfall.ts
  packages/
    shared-types/            # Zod schemas imported by both web and functions
  .env.example