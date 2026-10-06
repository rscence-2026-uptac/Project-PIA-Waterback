# ML predictor environment

Setup (Python 3.14 used; 3.13 also fine):

    cd ml
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt

`train_predictor.py` trains the turbidity and drought logistic regression models
on the synthetic dataset and writes `predictor_coefficients.json`: human-readable
JSON (`bias` + `weights` keyed by feature name), never a pickle. See
`specs/02-disruption-predictor.md`.

`.venv/` is local only and should not be committed.
