"""Parity: ml/wsp_constants.py vs packages/shared-types/src/constants.ts. Run: ml/.venv/bin/python ml/test_constants_parity.py"""
import re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import wsp_constants as w

TS = Path(__file__).resolve().parent.parent / "packages/shared-types/src/constants.ts"


def parse_ts() -> dict:
    src = TS.read_text()
    body = re.search(r"WSP_CONSTANTS\s*=\s*\{(.*?)\}\s*as const", src, re.S).group(1)
    out = {}
    for m in re.finditer(r"^\s*([A-Z0-9_]+):\s*(\[[^\]]*\]|[-\d.]+)\s*,", body, re.M):
        v = m.group(2)
        out[m.group(1)] = [int(x) for x in v.strip("[]").split(",")] if v.startswith("[") else (float(v) if "." in v else int(v))
    return out


def test_parity():
    ts = parse_ts()
    assert len(ts) >= 11 and "LOW_PRESSURE_ZONES" in ts, ts
    missing = [k for k in ts if not hasattr(w, k)]
    assert not missing, f"in constants.ts but missing from wsp_constants.py: {missing}"
    for k, v in ts.items():
        assert getattr(w, k) == v, (k, getattr(w, k), v)
        assert w.WSP_CONSTANTS[k] == v
    assert set(w.WSP_CONSTANTS) == set(ts)


if __name__ == "__main__":
    test_parity(); print("ok test_constants_parity")
