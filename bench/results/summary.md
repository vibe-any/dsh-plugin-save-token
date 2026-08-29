# save-token 插件 A/B 对照汇总（自动生成；解读见 report_2026-08-29.md）

> 两臂提示词对称（HARD CONSTRAINTS：禁文件重定向/禁 read 批量查看/测试输出必须可见；唯一变量=插件 compress/dedupe 开关）。
> 判定: TB 官方脚本 / SWE F2P+P2P(v2) / GAIA 答案比对。ce=插件压缩事件数, avoided=插件回放估计的免传输 tokens（旁证口径）。

## 一、逐任务对比

| 任务 | 臂 | n | SR | 总Token | P50 | P90 | ceΣ | avoidedΣ | 触发集数 |
|---|---|---|---|---|---|---|---|---|---|
| gaia-l2-locomotives | baseline | 2 | 100% | 743,955 | 371,978 | 601,491 | 0 | 0 | 0/2 |
| gaia-l2-locomotives | treatment | 2 | 100% | 179,209 | 89,604 | 116,669 | 3 | 6,669 | 1/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -564,746 (-75.9%) | — | — | — | — | — |
| gaia-l2-arxiv-regulation | baseline | 2 | 100% | 999,673 | 499,836 | 708,246 | 0 | 0 | 0/2 |
| gaia-l2-arxiv-regulation | treatment | 2 | 100% | 961,158 | 480,579 | 724,808 | 6 | 26,028 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -38,515 (-3.9%) | — | — | — | — | — |
| tb-access-logs | baseline | 2 | 100% | 613,636 | 306,818 | 462,400 | 0 | 0 | 0/2 |
| tb-access-logs | treatment | 2 | 100% | 411,964 | 205,982 | 215,681 | 2 | 129,962 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -201,672 (-32.9%) | — | — | — | — | — |
| tb-jsonl-aggregator | baseline | 2 | 100% | 193,941 | 96,970 | 108,947 | 0 | 0 | 0/2 |
| tb-jsonl-aggregator | treatment | 2 | 100% | 223,951 | 111,976 | 115,935 | 0 | 0 | 0/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +30,010 (+15.5%) | — | — | — | — | — |
| swe-sympy-24562 | baseline | 2 | 100% | 1,199,150 | 599,575 | 721,699 | 0 | 0 | 0/2 |
| swe-sympy-24562 | treatment | 2 | 100% | 1,385,379 | 692,690 | 755,060 | 2 | 53,249 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +186,229 (+15.5%) | — | — | — | — | — |
| swe-django-16595 | baseline | 2 | 100% | 1,495,228 | 747,614 | 843,888 | 0 | 0 | 0/2 |
| swe-django-16595 | treatment | 2 | 100% | 1,161,318 | 580,659 | 679,287 | 3 | 62,483 | 1/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -333,910 (-22.3%) | — | — | — | — | — |

## 二、总体

- **baseline**: n=12, SR=100.0% (12/12), 总Token=5,245,583, P50=474,108, P90=759,537, ceΣ=0, avoidedΣ=0, 触发集=0/12
- **treatment**: n=12, SR=100.0% (12/12), 总Token=4,322,979, P50=205,982, P90=763,982, ceΣ=16, avoidedΣ=278,391, 触发集=8/12

**Δ总Token(treatment−baseline): -922,604 (-17.6%); ΔSR: +0.0pp**

## 三、触发分层（treatment 臂内）

- 触发集 (ce>0): n=8, 总Token=3,339,310, avoidedΣ=278,391（占其总Token的 8.3%）
- 未触发集 (ce=0): n=4, 总Token=983,669
- 同任务同序配对（8对）: baseline=4,098,599 vs treatment=3,339,310 → 差额 759,289 tok；其中 avoided 估计 278,391

## 四、逐集明细

| 文件 | arm | r | succ | tokens | steps | ce | avoided |
|---|---|---|---|---|---|---|---|
| gaia-l2-arxiv-regulation-baseline-r1 | baseline | 1 | 1 | 239,324 | 12 | 0 | 0 |
| gaia-l2-arxiv-regulation-baseline-r2 | baseline | 2 | 1 | 760,349 | 30 | 0 | 0 |
| gaia-l2-arxiv-regulation-treatment-r1 | treatment | 1 | 1 | 785,865 | 23 | 4 | 25,354 |
| gaia-l2-arxiv-regulation-treatment-r2 | treatment | 2 | 1 | 175,293 | 9 | 2 | 674 |
| gaia-l2-locomotives-baseline-r1 | baseline | 1 | 1 | 85,086 | 5 | 0 | 0 |
| gaia-l2-locomotives-baseline-r2 | baseline | 2 | 1 | 658,869 | 23 | 0 | 0 |
| gaia-l2-locomotives-treatment-r1 | treatment | 1 | 1 | 55,774 | 4 | 0 | 0 |
| gaia-l2-locomotives-treatment-r2 | treatment | 2 | 1 | 123,435 | 8 | 3 | 6,669 |
| swe-django-16595-baseline-r1 | baseline | 1 | 1 | 627,271 | 24 | 0 | 0 |
| swe-django-16595-baseline-r2 | baseline | 2 | 1 | 867,957 | 33 | 0 | 0 |
| swe-django-16595-treatment-r1 | treatment | 1 | 1 | 457,374 | 20 | 3 | 62,483 |
| swe-django-16595-treatment-r2 | treatment | 2 | 1 | 703,944 | 29 | 0 | 0 |
| swe-sympy-24562-baseline-r1 | baseline | 1 | 1 | 752,230 | 29 | 0 | 0 |
| swe-sympy-24562-baseline-r2 | baseline | 2 | 1 | 446,920 | 18 | 0 | 0 |
| swe-sympy-24562-treatment-r1 | treatment | 1 | 1 | 614,726 | 27 | 1 | 33,374 |
| swe-sympy-24562-treatment-r2 | treatment | 2 | 1 | 770,653 | 30 | 1 | 19,875 |
| tb-access-logs-baseline-r1 | baseline | 1 | 1 | 112,341 | 7 | 0 | 0 |
| tb-access-logs-baseline-r2 | baseline | 2 | 1 | 501,295 | 9 | 0 | 0 |
| tb-access-logs-treatment-r1 | treatment | 1 | 1 | 218,106 | 10 | 1 | 62,321 |
| tb-access-logs-treatment-r2 | treatment | 2 | 1 | 193,858 | 9 | 1 | 67,641 |
| tb-jsonl-aggregator-baseline-r1 | baseline | 1 | 1 | 111,941 | 7 | 0 | 0 |
| tb-jsonl-aggregator-baseline-r2 | baseline | 2 | 1 | 82,000 | 5 | 0 | 0 |
| tb-jsonl-aggregator-treatment-r1 | treatment | 1 | 1 | 107,026 | 7 | 0 | 0 |
| tb-jsonl-aggregator-treatment-r2 | treatment | 2 | 1 | 116,925 | 7 | 0 | 0 |

## 五、口径与局限

- 行为约束是本实验的**实验条件**（两臂对称施加）；其作用是把 agent 行为推入「大输出直出」区间，使插件触发面存在。这测量的是「插件在直出工作负载下的价值」；自然行为下 agent 惯用「写文件+定点 read」路线（read 被豁免），插件不触发、亦无代价。
- 约束文本在 T01 首试后补入「禁 read 批量查看」一行（关闭 read 豁免漏洞），该文本用于其后全部 treatment 集；baseline 集在原文本下运行但已证实合规（B01/B02/B05/B08 的巨型 bash 直出在案）。T01 首试按重试处置不计档。
- avoidedTokens 为插件标记回放估计（marker 重建），仅作旁证；真实净节省以同格同序 token 差额为准，受行为方差污染需配对解读。
- n=2，无显著性检验；路由非确定性对两臂对称。GAIA 题存在公开基准污染（agent 可能检索到金标），两臂对称暴露。