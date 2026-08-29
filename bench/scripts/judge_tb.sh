#!/bin/bash
# judge_tb.sh <task:jsonl|access> <workspace_abs>
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export UV_CACHE_DIR="$ROOT/.uv-cache"
task="$1"; ws="$2"
TD="/tmp/tb-judge-tests.$$"; rm -rf "$TD"; mkdir -p "$TD"
case "$task" in
  jsonl)
    sed "s#WORKSPACEPLACEHOLDER#$ws#g" "$ROOT/sandboxes/tb-jsonl-aggregator/tests/test_outputs.py" > "$TD/test_outputs.py"
    cd "$ws" && uv run --with pytest python -m pytest "$TD/test_outputs.py" -q
    ;;
  access)
    sed "s#WORKSPACEPLACEHOLDER#$ws#g" "$ROOT/sandboxes/tb-access-logs/tests/test_outputs.py" > "$TD/test_outputs.py"
    cd "$ws" && uv run --with pytest python -m pytest "$TD/test_outputs.py" -q
    ;;
  *) echo unknown; rm -rf "$TD"; exit 64;;
esac
rc=$?
rm -rf "$TD"
echo "TB_JUDGE_RC=$rc"
exit $rc
