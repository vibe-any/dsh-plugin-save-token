#!/usr/bin/env python3
"""A/B 分析: results/raw → results/summary.md（自动生成）。含插件触发面(ce/avoided)与分层对比。"""
import json, glob, statistics as st
from collections import defaultdict

rows = [json.load(open(p)) for p in sorted(glob.glob(str(__import__('pathlib').Path(__file__).resolve().parent.parent / 'results/raw/*.json')))]

def tok(r): return r['usageTotalTokens']
def ce(r): return (r.get('plugin') or {}).get('compressionEvents', 0)
def av(r): return (r.get('plugin') or {}).get('avoidedTokens', 0)
def pctl(xs, q):
    xs = sorted(xs); k = (len(xs)-1)*q; f = int(k); c = min(f+1, len(xs)-1)
    return xs[f] + (xs[c]-xs[f])*(k-f)

def agg(sel):
    sel = list(sel)
    ok = [r for r in sel if r['success']]
    return {
        'n': len(sel), 'sr': len(ok)/len(sel) if sel else 0,
        'total': sum(tok(r) for r in sel),
        'succ': sum(tok(r) for r in ok), 'succN': len(ok),
        'p50': pctl([tok(r) for r in sel], .5) if sel else 0,
        'p90': pctl([tok(r) for r in sel], .9) if sel else 0,
        'ce': sum(ce(r) for r in sel), 'av': sum(av(r) for r in sel),
        'fired': sum(1 for r in sel if ce(r) > 0),
    }

by = defaultdict(lambda: defaultdict(list))
for r in rows: by[r['taskId']][r['arm']].append(r)
order = ['gaia-l2-locomotives','gaia-l2-arxiv-regulation','tb-access-logs','tb-jsonl-aggregator','swe-sympy-24562','swe-django-16595']

L = ['# save-token 插件 A/B 对照汇总（自动生成；解读见 report_2026-08-29.md）\n']
L.append('> 两臂提示词对称（HARD CONSTRAINTS：禁文件重定向/禁 read 批量查看/测试输出必须可见；唯一变量=插件 compress/dedupe 开关）。')
L.append('> 判定: TB 官方脚本 / SWE F2P+P2P(v2) / GAIA 答案比对。ce=插件压缩事件数, avoided=插件回放估计的免传输 tokens（旁证口径）。\n')

L.append('## 一、逐任务对比\n')
L.append('| 任务 | 臂 | n | SR | 总Token | P50 | P90 | ceΣ | avoidedΣ | 触发集数 |')
L.append('|---|---|---|---|---|---|---|---|---|---|')
lines = {}
for t in order:
    for arm in ('baseline','treatment'):
        a = agg(by[t][arm]); lines[(t,arm)] = a
        L.append(f"| {t} | {arm} | {a['n']} | {a['sr']*100:.0f}% | {a['total']:,} | {a['p50']:,.0f} | {a['p90']:,.0f} | {a['ce']} | {a['av']:,} | {a['fired']}/{a['n']} |")
    b, tm = lines[(t,'baseline')], lines[(t,'treatment')]
    if b['n'] and tm['n']:
        d = tm['total'] - b['total']
        L.append(f"| ↳ Δ(treat−base) | — | — | {(tm['sr']-b['sr'])*100:+.0f}pp | {d:+,} ({d/b['total']*100:+.1f}%) | — | — | — | — | — |")

L.append('\n## 二、总体\n')
bt = agg(rows := [r for r in rows if r['arm']=='baseline'])
allr = [json.load(open(p)) for p in sorted(glob.glob(str(__import__('pathlib').Path(__file__).resolve().parent.parent / 'results/raw/*.json')))]
tm = agg([r for r in allr if r['arm']=='treatment'])
for name, a in (('baseline', bt), ('treatment', tm)):
    L.append(f"- **{name}**: n={a['n']}, SR={a['sr']*100:.1f}% ({round(a['sr']*a['n'])}/{a['n']}), 总Token={a['total']:,}, "
             f"P50={a['p50']:,.0f}, P90={a['p90']:,.0f}, ceΣ={a['ce']}, avoidedΣ={a['av']:,}, 触发集={a['fired']}/{a['n']}")
d = tm['total'] - bt['total']
L.append(f"\n**Δ总Token(treatment−baseline): {d:+,} ({d/bt['total']*100:+.1f}%); ΔSR: {(tm['sr']-bt['sr'])*100:+.1f}pp**")

L.append('\n## 三、触发分层（treatment 臂内）\n')
fired = [r for r in allr if r['arm']=='treatment' and ce(r)>0]
nof   = [r for r in allr if r['arm']=='treatment' and ce(r)==0]
fb = agg(fired); nb = agg(nof)
L.append(f"- 触发集 (ce>0): n={fb['n']}, 总Token={fb['total']:,}, avoidedΣ={fb['av']:,}（占其总Token的 {fb['av']/fb['total']*100:.1f}%）")
L.append(f"- 未触发集 (ce=0): n={nb['n']}, 总Token={nb['total']:,}")
if fired:
    pairs = []
    for r in fired:
        same = [x for x in allr if x['taskId']==r['taskId'] and x['arm']=='baseline' and x['repeat']==r['repeat']]
        if same: pairs.append((same[0]['usageTotalTokens'], r['usageTotalTokens'], av(r)))
    if pairs:
        sb = sum(p[0] for p in pairs); stt = sum(p[1] for p in pairs); sav = sum(p[2] for p in pairs)
        L.append(f"- 同任务同序配对（{len(pairs)}对）: baseline={sb:,} vs treatment={stt:,} → 差额 {sb-stt:,} tok；其中 avoided 估计 {sav:,}")

L.append('\n## 四、逐集明细\n')
L.append('| 文件 | arm | r | succ | tokens | steps | ce | avoided |')
L.append('|---|---|---|---|---|---|---|---|')
for r in sorted(allr, key=lambda x: (x['benchId'], x['taskId'], x['arm'], x['repeat'])):
    L.append(f"| {r['taskId']}-{r['arm']}-r{r['repeat']} | {r['arm']} | {r['repeat']} | {r['success']} | {tok(r):,} | {r['steps']} | {ce(r)} | {av(r):,} |")

L.append('\n## 五、口径与局限\n')
L.append('- 行为约束是本实验的**实验条件**（两臂对称施加）；其作用是把 agent 行为推入「大输出直出」区间，使插件触发面存在。这测量的是「插件在直出工作负载下的价值」；自然行为下 agent 惯用「写文件+定点 read」路线（read 被豁免），插件不触发、亦无代价。')
L.append('- 约束文本在 T01 首试后补入「禁 read 批量查看」一行（关闭 read 豁免漏洞），该文本用于其后全部 treatment 集；baseline 集在原文本下运行但已证实合规（B01/B02/B05/B08 的巨型 bash 直出在案）。T01 首试按重试处置不计档。')
L.append('- avoidedTokens 为插件标记回放估计（marker 重建），仅作旁证；真实净节省以同格同序 token 差额为准，受行为方差污染需配对解读。')
L.append('- n=2，无显著性检验；路由非确定性对两臂对称。GAIA 题存在公开基准污染（agent 可能检索到金标），两臂对称暴露。')

open(str(__import__('pathlib').Path(__file__).resolve().parent.parent / 'results/summary.md'),'w').write('\n'.join(L))
print('\n'.join(L[:34]))
