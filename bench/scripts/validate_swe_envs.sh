#!/bin/bash
# sympy & django 实例的 红绿 验证（patch -p1 + 本地 editable 重装）
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SW="$ROOT/sandboxes/swe"
export UV_CACHE_DIR="$ROOT/.uv-cache"
PAT="$ROOT/tasks/patches"

val_instance() { # $1=dir $2=name $3=testfile $4=node_expr $5=test_diff $6=src_diff
  local d="$1" name="$2" tf="$3" node="$4" tdiff="$5" sdiff="$6"
  cd "$d" || return 1
  patch -p1 --quiet -i "$tdiff" 2>/dev/null; local pr=$?
  echo "[$name] test_patch_rc=$pr"
  [ $pr -ne 0 ] && { echo "[$name] FAIL at test_patch"; return 1; }
  SETUPTOOLS_SCM_PRETEND_VERSION_FAST=1 true
}

# ---------- SYMPY ----------
echo "===== SYMPY ====="
cd "$SW"
rm -rf sympy.base && cp -R sympy sympy.base && rm -rf sympy.base/.venv-verify
cd sympy.base
uv venv --python 3.11 .venv >/dev/null 2>&1
mpmath_ok=$(SETUPTOOLS_SCM_PRETEND_VERSION="" uv pip install --python .venv/bin/python mpmath 2>&1 | tail -1)
echo "sympy deps: $mpmath_ok"
SETUPTOOLS_SCM_PRETEND_VERSION=1.12 uv pip install --python .venv/bin/python -e . >/dev/null 2>&1 || { echo editable_fail; }
TP="$PAT/sympy_sympy-24562.test.diff"; SP="$PAT/sympy_sympy-24562.src.diff"
grep '^diff --git\|^+++' "$TP" | head -4
patch -p1 --quiet -i "$TP" && echo TEST_PATCH_OK
TF=$(grep '^+++ b/' "$TP" | head -1 | sed 's|^+++ b/||')
echo "target file: $TF"
./.venv/bin/python bin/mod_import_placeholder 2>/dev/null # noop
./.venv/bin/python -m pytest "$TF::test_issue_24543" -q > /tmp/sympy_red.log 2>&1; RED=$?
echo "RED(exit=1 expected)= $RED"
tail -3 /tmp/sympy_red.log
patch -p1 --quiet -i "$SP" && echo SRC_PATCH_OK
./.venv/bin/python -m pytest "$TF::test_issue_24543" -q > /tmp/sympy_green.log 2>&1; GREEN=$?
echo "GREEN(0 expected)= $GREEN"
tail -3 /tmp/sympy_green.log

# ---------- DJANGO ----------
echo "===== DJANGO ====="
cd "$SW"
rm -rf django.base && cp -R django django.base && rm -rf django.base/.venv-verify
cd django.base
uv venv --python 3.11 .venv >/dev/null 2>&1
uv pip install --python .venv/bin/python asgiref sqlparse >/dev/null 2>&1
SETUPTOOLS_SCM_PRETEND_VERSION=5.0 uv pip install --python .venv/bin/python -e . >/dev/null 2>&1 || echo django_editable_fallback_ok
TP="$PAT/django_django-16595.test.diff"; SP="$PAT/django_django-16595.src.diff"
grep '^+++ b/' "$TP" "$SP" | head -4
patch -p1 --quiet -i "$TP" && echo TEST_PATCH_OK
./.venv/bin/python tests/runtests.py migrations.test_optimizer.OptimizerTests.test_alter_alter_field -v 0 > /tmp/dj_red.log 2>&1; RED=$?
echo "RED(nonzero expected)= $RED"; tail -4 /tmp/dj_red.log
patch -p1 --quiet -i "$SP" && echo SRC_PATCH_OK
./.venv/bin/python tests/runtests.py migrations.test_optimizer.OptimizerTests.test_alter_alter_field -v 0 > /tmp/dj_green.log 2>&1; GREEN=$?
echo "GREEN(0 expected)= $GREEN"; tail -2 /tmp/dj_green.log
echo VALIDATION_SCRIPT_DONE
