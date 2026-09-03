# save-token 插件 A/B 对照汇总（r2，自动生成 by analyze2.py）

> 两臂提示词对称（HARD CONSTRAINTS 同 round-1）；唯一变量=插件 compress/dedupe(/compactAssist) 开关。
> 计量: projcache 四桶真值。**命中率 = ΣcacheRead / Σ(uncached+cacheRead+cacheWrite)**（按臂聚合口径）。
> ce=压缩事件+去重命中；avoided=插件回放估计（旁证）；replays=expand 工具回放次数；lossless=无损 TOON 编码事件数。

## 一、逐任务对比

| 任务 | 臂 | n | SR | 总Token | 输入Token | 命中率 | P50 | P90 | ceΣ | avoidedΣ | replays | lossless | 触发集 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gaia-l2-locomotives | baseline | 2 | 100% | 283,769 | 274,816 | 81.2% | 141,884 | 146,883 | 0 | 0 | 0 | 0 | 0/2 |
| gaia-l2-locomotives | treatment | 2 | 100% | 572,404 | 564,810 | 87.9% | 286,202 | 452,487 | 0 | 0 | 0 | 0 | 0/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +288,635 (+101.7%) | — | +6.7pp | — | — | — | — | — | — | — |
| gaia-l2-arxiv-regulation | baseline | 2 | 100% | 684,445 | 658,476 | 84.1% | 342,222 | 388,732 | 0 | 0 | 0 | 0 | 0/2 |
| gaia-l2-arxiv-regulation | treatment | 2 | 100% | 987,445 | 960,082 | 90.4% | 493,722 | 502,933 | 4 | 31,680 | 17 | 0 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +303,000 (+44.3%) | — | +6.3pp | — | — | — | — | — | — | — |
| tb-access-logs | baseline | 2 | 100% | 244,076 | 240,333 | 73.8% | 122,038 | 122,903 | 0 | 0 | 0 | 0 | 0/2 |
| tb-access-logs | treatment | 2 | 100% | 2,127,368 | 2,113,335 | 89.8% | 1,063,684 | 1,704,386 | 5 | 478,775 | 54 | 0 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +1,883,292 (+771.6%) | — | +16.0pp | — | — | — | — | — | — | — |
| tb-jsonl-aggregator | baseline | 2 | 100% | 253,137 | 246,840 | 73.8% | 126,568 | 128,817 | 0 | 0 | 0 | 0 | 0/2 |
| tb-jsonl-aggregator | treatment | 2 | 100% | 257,998 | 250,981 | 73.1% | 128,999 | 146,215 | 0 | 0 | 0 | 0 | 0/2 |
| ↳ Δ(treat−base) | — | — | +0pp | +4,861 (+1.9%) | — | -0.8pp | — | — | — | — | — | — | — |
| swe-sympy-24562 | baseline | 2 | 100% | 2,217,526 | 2,189,014 | 95.5% | 1,108,763 | 1,144,966 | 0 | 0 | 0 | 0 | 0/2 |
| swe-sympy-24562 | treatment | 2 | 100% | 1,781,712 | 1,752,418 | 94.3% | 890,856 | 940,733 | 0 | 0 | 0 | 0 | 0/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -435,814 (-19.7%) | — | -1.1pp | — | — | — | — | — | — | — |
| swe-django-16595 | baseline | 2 | 100% | 1,149,221 | 1,130,744 | 91.9% | 574,610 | 678,507 | 0 | 0 | 0 | 0 | 0/2 |
| swe-django-16595 | treatment | 2 | 100% | 942,562 | 930,470 | 92.4% | 471,281 | 539,507 | 2 | 49,987 | 35 | 0 | 2/2 |
| ↳ Δ(treat−base) | — | — | +0pp | -206,659 (-18.0%) | — | +0.6pp | — | — | — | — | — | — | — |

## 二、总体

- **baseline**: n=12, SR=100.0% (12/12), 总Token=4,832,174 (in=4,740,223, out=91,951), **命中率=90.0%**, P50=216,110, P90=1,027,606, ceΣ=0, avoidedΣ=0, replaysΣ=0, losslessΣ=0, 触发集=0/12
- **treatment**: n=12, SR=100.0% (12/12), 总Token=6,669,489 (in=6,572,096, out=97,393), **命中率=90.7%**, P50=488,134, P90=940,733, ceΣ=11, avoidedΣ=560,442, replaysΣ=106, losslessΣ=0, 触发集=6/12

**Δ总Token(treatment−baseline): +1,837,315 (+38.0%); ΔSR: +0.0pp; Δ命中率: +0.7pp**

## 三、触发分层（treatment 臂内）

- 触发集 (ce>0): n=6, 总Token=4,057,375, 命中率=90.6%, avoidedΣ=560,442（占其总Token的 13.8%）
- 未触发集 (ce=0): n=6, 总Token=2,612,114, 命中率=90.8%

## 四、同任务同序配对（全部配对）

| 任务 | r | baseline | treatment | Δ | Δ% | baseline命中率 | treatment命中率 |
|---|---|---|---|---|---|---|---|
| gaia-l2-locomotives | 1 | 135,636 | 78,346 | -57,290 | -42.2% | 71.9% | 60.7% |
| gaia-l2-locomotives | 2 | 148,133 | 494,058 | +345,925 | +233.5% | 89.6% | 92.2% |
| gaia-l2-arxiv-regulation | 1 | 400,359 | 482,209 | +81,850 | +20.4% | 83.7% | 93.0% |
| gaia-l2-arxiv-regulation | 2 | 284,086 | 505,236 | +221,150 | +77.8% | 84.7% | 87.8% |
| tb-access-logs | 1 | 123,119 | 1,864,562 | +1,741,443 | +1414.4% | 73.8% | 91.1% |
| tb-access-logs | 2 | 120,957 | 262,806 | +141,849 | +117.3% | 73.8% | 80.5% |
| tb-jsonl-aggregator | 1 | 123,758 | 150,519 | +26,761 | +21.6% | 75.0% | 77.1% |
| tb-jsonl-aggregator | 2 | 129,379 | 107,479 | -21,900 | -16.9% | 72.8% | 67.4% |
| swe-sympy-24562 | 1 | 1,063,509 | 953,202 | -110,307 | -10.4% | 95.3% | 94.8% |
| swe-sympy-24562 | 2 | 1,154,017 | 828,510 | -325,507 | -28.2% | 95.6% | 93.8% |
| swe-django-16595 | 1 | 704,481 | 556,564 | -147,917 | -21.0% | 93.0% | 92.9% |
| swe-django-16595 | 2 | 444,740 | 385,998 | -58,742 | -13.2% | 90.0% | 91.7% |
| **Σ** | — | **4,832,174** | **6,669,489** | **+1,837,315** | **+38.0%** | — | — |

## 五、逐集明细

| 文件 | arm | r | succ | tokens | 输入 | 命中率 | steps | ce | avoided | replays | lossless |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gaia-l2-arxiv-regulation-baseline-r1 | baseline | 1 | 1 | 400,359 | 386,458 | 83.7% | 11 | 0 | 0 | 0 | 0 |
| gaia-l2-arxiv-regulation-baseline-r2 | baseline | 2 | 1 | 284,086 | 272,018 | 84.7% | 10 | 0 | 0 | 0 | 0 |
| gaia-l2-arxiv-regulation-treatment-r1 | treatment | 1 | 1 | 482,209 | 468,225 | 93.0% | 15 | 2 | 3,136 | 7 | 0 |
| gaia-l2-arxiv-regulation-treatment-r2 | treatment | 2 | 1 | 505,236 | 491,857 | 87.8% | 16 | 2 | 28,544 | 10 | 0 |
| gaia-l2-locomotives-baseline-r1 | baseline | 1 | 1 | 135,636 | 130,760 | 71.9% | 6 | 0 | 0 | 0 | 0 |
| gaia-l2-locomotives-baseline-r2 | baseline | 2 | 1 | 148,133 | 144,056 | 89.6% | 7 | 0 | 0 | 0 | 0 |
| gaia-l2-locomotives-treatment-r1 | treatment | 1 | 1 | 78,346 | 76,901 | 60.7% | 4 | 0 | 0 | 0 | 0 |
| gaia-l2-locomotives-treatment-r2 | treatment | 2 | 1 | 494,058 | 487,909 | 92.2% | 21 | 0 | 0 | 0 | 0 |
| swe-django-16595-baseline-r1 | baseline | 1 | 1 | 704,481 | 693,018 | 93.0% | 23 | 0 | 0 | 0 | 0 |
| swe-django-16595-baseline-r2 | baseline | 2 | 1 | 444,740 | 437,726 | 90.0% | 16 | 0 | 0 | 0 | 0 |
| swe-django-16595-treatment-r1 | treatment | 1 | 1 | 556,564 | 551,895 | 92.9% | 23 | 1 | 21,974 | 21 | 0 |
| swe-django-16595-treatment-r2 | treatment | 2 | 1 | 385,998 | 378,575 | 91.7% | 15 | 1 | 28,013 | 14 | 0 |
| swe-sympy-24562-baseline-r1 | baseline | 1 | 1 | 1,063,509 | 1,049,356 | 95.3% | 38 | 0 | 0 | 0 | 0 |
| swe-sympy-24562-baseline-r2 | baseline | 2 | 1 | 1,154,017 | 1,139,658 | 95.6% | 37 | 0 | 0 | 0 | 0 |
| swe-sympy-24562-treatment-r1 | treatment | 1 | 1 | 953,202 | 940,822 | 94.8% | 31 | 0 | 0 | 0 | 0 |
| swe-sympy-24562-treatment-r2 | treatment | 2 | 1 | 828,510 | 811,596 | 93.8% | 27 | 0 | 0 | 0 | 0 |
| tb-access-logs-baseline-r1 | baseline | 1 | 1 | 123,119 | 121,072 | 73.8% | 6 | 0 | 0 | 0 | 0 |
| tb-access-logs-baseline-r2 | baseline | 2 | 1 | 120,957 | 119,261 | 73.8% | 6 | 0 | 0 | 0 | 0 |
| tb-access-logs-treatment-r1 | treatment | 1 | 1 | 1,864,562 | 1,857,517 | 91.1% | 18 | 4 | 423,484 | 48 | 0 |
| tb-access-logs-treatment-r2 | treatment | 2 | 1 | 262,806 | 255,818 | 80.5% | 8 | 1 | 55,291 | 6 | 0 |
| tb-jsonl-aggregator-baseline-r1 | baseline | 1 | 1 | 123,758 | 121,495 | 75.0% | 6 | 0 | 0 | 0 | 0 |
| tb-jsonl-aggregator-baseline-r2 | baseline | 2 | 1 | 129,379 | 125,345 | 72.8% | 6 | 0 | 0 | 0 | 0 |
| tb-jsonl-aggregator-treatment-r1 | treatment | 1 | 1 | 150,519 | 147,150 | 77.1% | 7 | 0 | 0 | 0 | 0 |
| tb-jsonl-aggregator-treatment-r2 | treatment | 2 | 1 | 107,479 | 103,831 | 67.4% | 5 | 0 | 0 | 0 | 0 |

## 六、跨轮对比（round-1 @2026-08-29 vs 本轮）

| 维度 | 臂 | round-1 | 本轮 | Δ |
|---|---|---|---|---|
| 总Token | baseline | 5,245,583 | 4,832,174 | -413,409 (-7.9%) |
| 命中率 | baseline | 86.9% | 90.0% | — |
| 总Token | treatment | 4,322,979 | 6,669,489 | +2,346,510 (+54.3%) |
| 命中率 | treatment | 91.2% | 90.7% | — |
| gaia-l2-locomotives | baseline | 743,955 | 283,769 | -460,186 (-61.9%) |
| gaia-l2-locomotives | treatment | 179,209 | 572,404 | +393,195 (+219.4%) |
| gaia-l2-arxiv-regulation | baseline | 999,673 | 684,445 | -315,228 (-31.5%) |
| gaia-l2-arxiv-regulation | treatment | 961,158 | 987,445 | +26,287 (+2.7%) |
| tb-access-logs | baseline | 613,636 | 244,076 | -369,560 (-60.2%) |
| tb-access-logs | treatment | 411,964 | 2,127,368 | +1,715,404 (+416.4%) |
| tb-jsonl-aggregator | baseline | 193,941 | 253,137 | +59,196 (+30.5%) |
| tb-jsonl-aggregator | treatment | 223,951 | 257,998 | +34,047 (+15.2%) |
| swe-sympy-24562 | baseline | 1,199,150 | 2,217,526 | +1,018,376 (+84.9%) |
| swe-sympy-24562 | treatment | 1,385,379 | 1,781,712 | +396,333 (+28.6%) |
| swe-django-16595 | baseline | 1,495,228 | 1,149,221 | -346,007 (-23.1%) |
| swe-django-16595 | treatment | 1,161,318 | 942,562 | -218,756 (-18.8%) |

### 净效果（同任务配对 Δ=treatment−baseline 总Token）

| 任务 | round-1 Δ | 本轮 Δ |
|---|---|---|
| gaia-l2-locomotives | -564,746 | +288,635 |
| gaia-l2-arxiv-regulation | -38,515 | +303,000 |
| tb-access-logs | -201,672 | +1,883,292 |
| tb-jsonl-aggregator | +30,010 | +4,861 |
| swe-sympy-24562 | +186,229 | -435,814 |
| swe-django-16595 | -333,910 | -206,659 |

## 七、口径与局限

- 命中率为**输入侧聚合口径**（ΣcacheRead/Σ输入三桶），与 DSH 原生计费一致；单集命中率波动大，按臂聚合解读。
- avoidedTokens 为插件回放估计（旁证）；净节省以同格配对 Token 差额为准。
- n=2 无显著性检验；行为方差可大于干预效应，逐任务 Δ 必须配对解读。
- 行为约束（HARD CONSTRAINTS）为两臂对称的实验条件，测量的是「直出型工作负载下的插件价值」。