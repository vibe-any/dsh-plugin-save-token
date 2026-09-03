#!/bin/bash
# prep_episode.sh <taskId> <epTag>
# 产出全新集内工作区（stdout 输出其绝对路径；gaia 类无工作区则输出 NONE）
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SB="$ROOT/sandboxes"
EPS="/tmp/bench-eps"
task="$1"; tag="$2"

case "$task" in
  tb-jsonl-aggregator)
    ws="$EPS/$tag/ws"; rm -rf "$ws"; mkdir -p "$ws"
    if ls "$SB"/tb-jsonl-aggregator/initial/records_*.jsonl >/dev/null 2>&1; then
      cp "$SB"/tb-jsonl-aggregator/initial/records_*.jsonl "$ws/"
    else
      for g in "$SB"/tb-jsonl-aggregator/initial/records_*.jsonl.gz; do
        gunzip -c "$g" > "$ws/$(basename "${g%.gz}")"
      done
    fi
    echo "$ws" ;;
  tb-access-logs)
    ws="$EPS/$tag/ws"; rm -rf "$ws"; mkdir -p "$ws"
    cp "$SB/tb-access-logs/initial/access_log" "$ws/access_log"; echo "$ws" ;;
  swe-sympy|swe-django)
    case "$task" in
      swe-sympy) repo=sympy ;;
      swe-django) repo=django ;;
    esac
    # 干净基线快照（一次性，排除 venv 与 git 元数据）
    if [ ! -d "$SB/swe/$repo.pristine" ]; then
      rm -rf "$SB/swe/$repo.pristine"; mkdir -p "$SB/swe/$repo.pristine"
      (cd "$SB/swe/$repo" && tar --exclude='.venv*' --exclude='.git' -cf - .) | (cd "$SB/swe/$repo.pristine" && tar xf -)
    fi
    ep="$EPS/$tag/tree"; rm -rf "$ep"; mkdir -p "$EPS/$tag"
    cp -R "$SB/swe/$repo.pristine" "$ep"
    # 每集全新 venv（deps 走 uv 缓存，秒级）
    export UV_CACHE_DIR="$ROOT/.uv-cache"
    (cd "$ep" && uv venv --python 3.11 .venv >/dev/null 2>&1)
    VENV="$ep/.venv"
    case "$repo" in
      sympy)  uv pip install --python "$VENV/bin/python" mpmath pytest >/dev/null 2>&1
              SETUPTOOLS_SCM_PRETEND_VERSION=1.12 uv pip install --python "$VENV/bin/python" -e "$ep" >/dev/null 2>&1 ;;
      django) uv pip install --python "$VENV/bin/python" asgiref sqlparse >/dev/null 2>&1
              uv pip install --python "$VENV/bin/python" -e "$ep" >/dev/null 2>&1 ;;
    esac
    echo "$ep" ;;
  gaia-*)
    rm -rf "$EPS/$tag"; mkdir -p "$EPS/$tag"
    echo "NONE" ;;
  *) echo "unknown task $task" >&2; exit 64 ;;
esac
