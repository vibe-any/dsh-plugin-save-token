#!/bin/bash
# TB 双向 oracle 验证：官方解（或静态已知正确产物）→ 测试必过；原始态 → 测试必挂。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SB="$ROOT/sandboxes"
export UV_CACHE_DIR="$ROOT/.uv-cache"

adapt_tests() { # $1=task $2=workspace $3=outdir
  mkdir -p "$3"
  sed "s#WORKSPACEPLACEHOLDER#$2#g" "$SB/$1/tests/test_outputs.py" > "$3/test_outputs.py"
}

run_case() { # $1=task $2=positive(1)|negative(0)
  local task="$1" want_pass="$2"
  local ws="/tmp/tbval-${task}-$RANDOM"
  rm -rf "$ws" && cp -R "$SB/$task/initial" "$ws"
  case "$task" in
    tb-jsonl-aggregator)
      if [ "$want_pass" = 1 ]; then
        bash "$ROOT/datasets/tb2/original-tasks/jsonl-aggregator/solution.sh" >/dev/null 2>&1 || true
        # solution.sh 可能内嵌 cd /app；若未产出则回退到语义等价的本地解
        if [ ! -f "$ws/aggregates.json" ]; then
          UV_CACHE_DIR="$UV_CACHE_DIR" python3 - "$ws" << 'PY'
import sys, json, glob, collections
ws=sys.argv[1]
amt=collections.Counter(); items=collections.Counter(); tags=collections.Counter()
for f in glob.glob(ws+'/records_*.jsonl'):
    for line in open(f):
        r=json.loads(line)
        amt[r['user']]+=r['amount']; items[r['user']]+=r['items']
        for t in r['tags']: tags[t]+=1
out={'top_5_users_by_amount':{},'top_5_tags_by_count':{}}
for u,_ in sorted(amt.items(), key=lambda kv:-kv[1])[:5]:
    out['top_5_users_by_amount'][u]={'total_amount':round(amt[u],2),'total_items':int(items[u])}
for t,c in sorted(tags.items(), key=lambda kv:(-kv[1],kv[0]))[:5]:
    out['top_5_tags_by_count'][t]={'count':int(c)}
json.dump(out, open(ws+'/aggregates.json','w'), indent=2)
PY
        fi
      fi ;;
    tb-access-logs)
      if [ "$want_pass" = 1 ]; then
        printf 'Total requests: 2000\nUnique IP addresses: 273\nTop 3 URLs:\n  /order-confirmation: 54\n  /product/456: 53\n  /about.html: 52\n404 errors: 83\n' > "$ws/report.txt"
      fi ;;
  esac
  local tdir="/tmp/tbval-tests-$RANDOM"; adapt_tests "$task" "$ws" "$tdir"
  (cd "$ws" && uv run --with pytest python -m pytest "$tdir/test_outputs.py" -q) >/dev/null 2>&1
  local rc=$?
  if [ "$want_pass" = 1 ] && [ $rc -eq 0 ]; then echo "PASS+  $task  (oracle positive 通过)"
  elif [ "$want_pass" = 0 ] && [ $rc -ne 0 ]; then echo "PASS−  $task  (oracle negative 正确失败)"
  else echo "FAIL!! $task want_pass=$want_pass rc=$rc"; fi
  rm -rf "$ws" "$tdir"
}

echo "== POSITIVE oracle =="
run_case tb-jsonl-aggregator 1
run_case tb-access-logs 1
echo "== NEGATIVE oracle =="
run_case tb-jsonl-aggregator 0
run_case tb-access-logs 0
