#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/datasets/tb2/original-tasks"
SB="$ROOT/sandboxes"
mkdir -p "$SB"/{tb-jsonl-aggregator,tb-access-logs}/{initial,tests}

# --- 1. jsonl-aggregator（确定性生成器跑一次）---
cp "$SRC/jsonl-aggregator/task-deps/generate_records.py" "$SB/tb-jsonl-aggregator/init_gen.py"
cat "$SRC/jsonl-aggregator/tests/test_outputs.py" | sed 's#/app/#WORKSPACEPLACEHOLDER/#g' > "$SB/tb-jsonl-aggregator/tests/test_outputs.py"

# --- 2. analyze-access-logs ---
cp "$SRC/analyze-access-logs/access_log" "$SB/tb-access-logs/initial/"
cat "$SRC/analyze-access-logs/tests/test_outputs.py" | sed 's#/app/#WORKSPACEPLACEHOLDER/#g' > "$SB/tb-access-logs/tests/test_outputs.py"

echo "== generating jsonl records (deterministic) =="
GEN="$SB/tb-jsonl-aggregator/init_gen.py"
OUT="$SB/tb-jsonl-aggregator/initial"
mkdir -p "$OUT"
(cd "$OUT" && python3 "$GEN" && rm -f "$OUT/generate_records.py")
ls -la "$OUT" | head -8
du -sh "$OUT"
echo ALL_SANDBOXES_BUILT
