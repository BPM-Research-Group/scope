#!/usr/bin/env bash
# Regenerates all cases and runs Python repo, rust4pm and the paper reference on each.
# Usage: ./run_all.sh <path to OCPT-Conformance-Checking checkout> <dir containing fast_hash.py shim>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$1"; SHIM="$2"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HERE/rust_harness/target}"
PY=(uv run -q --no-project --python 3.12 --with pm4py==2.7.15 --with pandas==2.2.3
    --with networkx --with joblib --with matplotlib --with jsonschema python -I)

python3 "$HERE/cases.py"
(cd "$HERE/rust_harness" && cargo build -q --release --offline)
for d in "$HERE"/cases/*/; do
  d="${d%/}"
  echo "== $(basename "$d")"
  "${PY[@]}" "$HERE/run_python.py" "$REPO" "$SHIM" "$d"
  "$CARGO_TARGET_DIR/release/footprint_harness" "$d"
  python3 "$HERE/reference.py" "$d"
  python3 "$HERE/reference.py" "$d" --literal-leaf-skip
done
"${PY[@]}" "$HERE/df2_non_ends.py" "$REPO" "$SHIM" "$HERE/extra/df2_non_ends"
python3 "$HERE/make_report.py"
