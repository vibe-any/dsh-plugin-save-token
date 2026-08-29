#!/bin/bash
# judge_swe.sh <sympy|django> <episode_tree>
# 成功 = F2P 精确节点 exit0 且 P2P 扫描运行 exit0（官方两清单全过语义）
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export UV_CACHE_DIR="$ROOT/.uv-cache"
PAT="$ROOT/tasks/patches"
kind="$1"; ep="$2"

cd "$ep" || { echo "NO_TREE"; exit 65; }
[ -x ".venv/bin/python" ] || { echo "NO_VENV"; exit 66; }

case "$kind" in
  sympy)
    VER=1.12; TP="$PAT/sympy_sympy-24562.test.diff"
    F2P_CMD=(./.venv/bin/python bin/test sympy/core/tests/test_numbers.py -k test_issue_24543)
    ;;
  django)
    VER=""; TP="$PAT/django_django-16595.test.diff"
    ;;
esac

# editable 指针重指当集树（幂等，秒级）
if [ -n "$VER" ]; then
  SETUPTOOLS_SCM_PRETEND_VERSION=$VER uv pip install --python .venv/bin/python -e . >/dev/null 2>&1
else
  uv pip install --python .venv/bin/python -e . >/dev/null 2>&1
fi

# 幂等应用 test_patch：仅当目标函数不存在时打补丁
NEED_PATCH=1
case "$kind" in
  sympy)    grep -q "def test_issue_24543" sympy/core/tests/test_numbers.py && NEED_PATCH=0 ;;
  django)   grep -q "test_alter_alter_field" tests/migrations/test_optimizer.py && NEED_PATCH=0 ;;
esac
if [ $NEED_PATCH = 1 ]; then
  patch -p1 --quiet -i "$TP" || { echo "TEST_PATCH_APPLY_FAIL"; exit 67; }
fi

F2P_RC=99; P2P_RC=98
case "$kind" in
  sympy)
    "${F2P_CMD[@]}" >/tmp/j_f2p.log 2>&1; F2P_RC=$?
    FILES=$(jq -r '.[]' "$PAT/sympy-24562.p2p_files.json" | tr '\n' ' ')
    ./.venv/bin/python bin/test $FILES >/tmp/j_p2p.log 2>&1; P2P_RC=$?
    ;;
  django)
    ./.venv/bin/python tests/runtests.py migrations.test_optimizer.OptimizerTests.test_alter_alter_field -v 0 >/tmp/j_f2p.log 2>&1; F2P_RC=$?
    ./.venv/bin/python tests/runtests.py migrations.test_optimizer -v 0 >/tmp/j_p2p.log 2>&1; P2P_RC=$?
    ;;
esac

if [ $F2P_RC -eq 0 ] && [ $P2P_RC -eq 0 ]; then V=1; else V=0; fi
echo "JUDGE kind=$kind f2p=$F2P_RC p2p=$P2P_RC success=$V"
exit $((1-V))
