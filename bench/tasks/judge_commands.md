# 逐集判定命令（每集评审时执行；工作目录=当集树）

## 共同前置
1. 当集树 = 从 <repo>.base/.pristine 全新拷贝。
2. patch 一律用 `patch -p1 -i`（git apply 在嵌套仓库内被外层 .git 劫持会静默跳过！）。
3. venv 从模板复制后，editable 指针指向模板路径——评审前必须在本集重装：
   SETUPTOOLS_SCM_PRETEND_VERSION=<ver> uv pip install --python <ep>/.venv/bin/python -e .

## sympy__sympy-24562
- 版本：SETUPTOOLS_SCM_PRETEND_VERSION=1.12；deps mpmath
- 先 patch test.diff；判定：./.venv/bin/python bin/test sympy/core/tests/test_numbers.py -k test_issue_24543 （exit 0=成功）
- 注意：sympy 不用 pytest；bin/test 的 -t 是 types 不是 token

## django__django-16595
- deps asgiref sqlparse；无需 scm pretend（无 setuptools_scm）
- 先 patch test.diff（target tests/migrations/test_optimizer.py）
- 判定：./.venv/bin/python tests/runtests.py migrations.test_optimizer.OptimizerTests.test_alter_alter_field -v 0

## TB 两题
- jsonl-aggregator / access-logs：tests 文件先 sed 's#WORKSPACEPLACEHOLDER#<ep_ws>#g'
- 统一：uv run --with pytest python -m pytest <adapted_test> -q

## GAIA
- 归一化比较：lower().strip() 去句点；正确答案见 manifest.json
