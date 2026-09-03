#!/usr/bin/env python3
"""analyze2.py — round-2 A/B analysis with cache-hit-rate as a first-class metric.

Reads a rawroot of collect_episode.py records (same JSON schema as round 1,
plus optional extra plugin snapshot fields) and writes a markdown summary:
  - per-task/arm tables incl. cache-hit% (ΣcacheRead / Σ(uncachedInput+cacheRead+cacheWrite))
  - overall arm comparison + Δ
  - triggered stratification (ce>0 vs ce=0) within treatment
  - paired same-task/same-repeat comparison (ALL pairs, not only fired ones)
  - per-episode detail with per-episode hit%
  - optional round-over-round comparison vs the round-1 rawroot

Usage:
  analyze2.py [--rawroot results/raw2] [--out results/summary-r2.md]
              [--compare results/raw] [--roundlabel r2]
"""
import argparse, glob, json, statistics as st
from collections import defaultdict
from pathlib import Path


def pctl(xs, q):
    xs = sorted(xs)
    if not xs:
        return 0
    k = (len(xs) - 1) * q
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def load(rawroot):
    rows = []
    for p in sorted(glob.glob(str(Path(rawroot) / '*.json'))):
        try:
            rows.append(json.load(open(p)))
        except Exception as e:
            print(f'WARN unreadable: {p}: {e}')
    return rows


def tok(r):
    return r.get('usageTotalTokens') or 0


def buckets(r):
    u = r.get('usage') or {}
    unc = u.get('uncachedInputTokens') or 0
    cr = u.get('cacheReadTokens') or 0
    cw = u.get('cacheWriteTokens') or 0
    out = u.get('outputTokens') or 0
    return unc, cr, cw, out


def hit_pct(r):
    unc, cr, cw, _ = buckets(r)
    din = unc + cr + cw
    return (cr / din * 100.0) if din else None


def fmt_hit(h):
    return f'{h:.1f}%' if h is not None else 'n/a'


def ce(r):
    return ((r.get('plugin') or {}).get('compressionEvents') or 0) + ((r.get('plugin') or {}).get('dedupeHits') or 0)


def av(r):
    return (r.get('plugin') or {}).get('avoidedTokens') or 0


def replay(r):
    return (r.get('plugin') or {}).get('replays') or 0


def lossless(r):
    return (r.get('plugin') or {}).get('losslessEncodes') or 0


def agg(sel):
    sel = list(sel)
    if not sel:
        return None
    ok = [r for r in sel if r.get('success')]
    tot_unc = sum(buckets(r)[0] for r in sel)
    tot_cr = sum(buckets(r)[1] for r in sel)
    tot_cw = sum(buckets(r)[2] for r in sel)
    tot_out = sum(buckets(r)[3] for r in sel)
    din = tot_unc + tot_cr + tot_cw
    return {
        'n': len(sel),
        'sr': (len(ok) / len(sel)) if sel else 0,
        'total': sum(tok(r) for r in sel),
        'in': din, 'cr': tot_cr, 'cw': tot_cw, 'unc': tot_unc, 'out': tot_out,
        'hit': (tot_cr / din * 100.0) if din else None,
        'p50': pctl([tok(r) for r in sel], .5),
        'p90': pctl([tok(r) for r in sel], .9),
        'ce': sum(ce(r) for r in sel), 'av': sum(av(r) for r in sel),
        'replays': sum(replay(r) for r in sel), 'lossless': sum(lossless(r) for r in sel),
        'fired': sum(1 for r in sel if ce(r) > 0),
    }


ORDER = ['gaia-l2-locomotives', 'gaia-l2-arxiv-regulation', 'tb-access-logs',
         'tb-jsonl-aggregator', 'swe-sympy-24562', 'swe-django-16595']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rawroot', default='results/raw2')
    ap.add_argument('--out', default='results/summary-r2.md')
    ap.add_argument('--compare', default='results/raw', help='round-1 rawroot for cross-round table')
    ap.add_argument('--roundlabel', default='r2')
    a = ap.parse_args()

    base = Path(__file__).resolve().parent.parent
    rows = load(Path(base) / a.rawroot)
    if not rows:
        print('no records found; nothing to do')
        return

    by = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by[r['taskId']][r['arm']].append(r)

    L = [f'# save-token 插件 A/B 对照汇总（{a.roundlabel}，自动生成 by analyze2.py）\n']
    L.append('> 两臂提示词对称（HARD CONSTRAINTS 同 round-1）；唯一变量=插件 compress/dedupe(/compactAssist) 开关。')
    L.append('> 计量: projcache 四桶真值。**命中率 = ΣcacheRead / Σ(uncached+cacheRead+cacheWrite)**（按臂聚合口径）。')
    L.append('> ce=压缩事件+去重命中；avoided=插件回放估计（旁证）；replays=expand 工具回放次数；lossless=无损 TOON 编码事件数。\n')

    # ---- 一、per-task ----
    L.append('## 一、逐任务对比\n')
    L.append('| 任务 | 臂 | n | SR | 总Token | 输入Token | 命中率 | P50 | P90 | ceΣ | avoidedΣ | replays | lossless | 触发集 |')
    L.append('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    lines = {}
    for t in ORDER:
        for arm in ('baseline', 'treatment'):
            s = agg(by[t][arm])
            if not s:
                continue
            lines[(t, arm)] = s
            L.append(f"| {t} | {arm} | {s['n']} | {s['sr']*100:.0f}% | {s['total']:,} | {s['in']:,} | {fmt_hit(s['hit'])} | "
                     f"{s['p50']:,.0f} | {s['p90']:,.0f} | {s['ce']} | {s['av']:,} | {s['replays']} | {s['lossless']} | {s['fired']}/{s['n']} |")
        if (t, 'baseline') in lines and (t, 'treatment') in lines:
            b, tm = lines[(t, 'baseline')], lines[(t, 'treatment')]
            d = tm['total'] - b['total']
            dh = (tm['hit'] - b['hit']) if (tm['hit'] is not None and b['hit'] is not None) else None
            dhs = f'{dh:+.1f}pp' if dh is not None else '—'
            L.append(f"| ↳ Δ(treat−base) | — | — | {(tm['sr']-b['sr'])*100:+.0f}pp | {d:+,} ({d/b['total']*100:+.1f}%) | — | {dhs} | — | — | — | — | — | — | — |")

    # ---- 二、overall ----
    bt = agg([r for r in rows if r['arm'] == 'baseline'])
    tm = agg([r for r in rows if r['arm'] == 'treatment'])
    L.append('\n## 二、总体\n')
    for name, s in (('baseline', bt), ('treatment', tm)):
        if not s:
            continue
        L.append(f"- **{name}**: n={s['n']}, SR={s['sr']*100:.1f}% ({round(s['sr']*s['n'])}/{s['n']}), 总Token={s['total']:,} "
                 f"(in={s['in']:,}, out={s['out']:,}), **命中率={fmt_hit(s['hit'])}**, P50={s['p50']:,.0f}, P90={s['p90']:,.0f}, "
                 f"ceΣ={s['ce']}, avoidedΣ={s['av']:,}, replaysΣ={s['replays']}, losslessΣ={s['lossless']}, 触发集={s['fired']}/{s['n']}")
    if bt and tm:
        d = tm['total'] - bt['total']
        dh = (tm['hit'] - bt['hit']) if (tm['hit'] is not None and bt['hit'] is not None) else None
        dhs = f'{dh:+.1f}pp' if dh is not None else '—'
        L.append(f"\n**Δ总Token(treatment−baseline): {d:+,} ({d/bt['total']*100:+.1f}%); ΔSR: {(tm['sr']-bt['sr'])*100:+.1f}pp; Δ命中率: {dhs}**")

    # ---- 三、triggered stratification ----
    L.append('\n## 三、触发分层（treatment 臂内）\n')
    fired = [r for r in rows if r['arm'] == 'treatment' and ce(r) > 0]
    nof = [r for r in rows if r['arm'] == 'treatment' and ce(r) == 0]
    fb, nb = agg(fired), agg(nof)
    if fb:
        L.append(f"- 触发集 (ce>0): n={fb['n']}, 总Token={fb['total']:,}, 命中率={fmt_hit(fb['hit'])}, avoidedΣ={fb['av']:,}"
                 f"（占其总Token的 {fb['av']/fb['total']*100:.1f}%）")
    if nb:
        L.append(f"- 未触发集 (ce=0): n={nb['n']}, 总Token={nb['total']:,}, 命中率={fmt_hit(nb['hit'])}")

    # ---- 四、paired comparison (all pairs) ----
    L.append('\n## 四、同任务同序配对（全部配对）\n')
    L.append('| 任务 | r | baseline | treatment | Δ | Δ% | baseline命中率 | treatment命中率 |')
    L.append('|---|---|---|---|---|---|---|---|')
    sd_b = sd_t = 0
    for t in ORDER:
        b_recs = sorted(by[t].get('baseline', []), key=lambda r: r['repeat'])
        for b in b_recs:
            same = [x for x in by[t].get('treatment', []) if x['repeat'] == b['repeat']]
            if not same:
                continue
            tmr = same[0]
            d = tok(tmr) - tok(b)
            sd_b += tok(b)
            sd_t += tok(tmr)
            L.append(f"| {t} | {b['repeat']} | {tok(b):,} | {tok(tmr):,} | {d:+,} | {d/tok(b)*100:+.1f}% | {fmt_hit(hit_pct(b))} | {fmt_hit(hit_pct(tmr))} |")
    if sd_b:
        L.append(f"| **Σ** | — | **{sd_b:,}** | **{sd_t:,}** | **{sd_t-sd_b:+,}** | **{(sd_t-sd_b)/sd_b*100:+.1f}%** | — | — |")

    # ---- 五、per-episode ----
    L.append('\n## 五、逐集明细\n')
    L.append('| 文件 | arm | r | succ | tokens | 输入 | 命中率 | steps | ce | avoided | replays | lossless |')
    L.append('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for r in sorted(rows, key=lambda x: (x['benchId'], x['taskId'], x['arm'], x['repeat'])):
        unc, cr, cw, out = buckets(r)
        L.append(f"| {r['taskId']}-{r['arm']}-r{r['repeat']} | {r['arm']} | {r['repeat']} | {r.get('success')} | "
                 f"{tok(r):,} | {unc+cr+cw:,} | {fmt_hit(hit_pct(r))} | {r.get('steps')} | {ce(r)} | {av(r):,} | {replay(r)} | {lossless(r)} |")

    # ---- 六、cross-round comparison ----
    if a.compare:
        r1 = load(Path(base) / a.compare)
        if r1:
            L.append('\n## 六、跨轮对比（round-1 @2026-08-29 vs 本轮）\n')
            L.append('| 维度 | 臂 | round-1 | 本轮 | Δ |')
            L.append('|---|---|---|---|---|')
            for arm in ('baseline', 'treatment'):
                o = agg([r for r in r1 if r['arm'] == arm])
                n = agg([r for r in rows if r['arm'] == arm])
                if o and n:
                    L.append(f"| 总Token | {arm} | {o['total']:,} | {n['total']:,} | {n['total']-o['total']:+,} ({(n['total']-o['total'])/o['total']*100:+.1f}%) |")
                    oh = fmt_hit(o['hit']) if o['hit'] is not None else 'n/a'
                    L.append(f"| 命中率 | {arm} | {oh} | {fmt_hit(n['hit'])} | — |")
            for t in ORDER:
                for arm in ('baseline', 'treatment'):
                    o = agg([r for r in r1 if r['taskId'] == t and r['arm'] == arm])
                    n = agg(by[t].get(arm, []))
                    if o and n:
                        L.append(f"| {t} | {arm} | {o['total']:,} | {n['total']:,} | {n['total']-o['total']:+,} ({(n['total']-o['total'])/o['total']*100:+.1f}%) |")
            # combined effect: per-task treatment-vs-baseline delta, r1 vs r2
            L.append('\n### 净效果（同任务配对 Δ=treatment−baseline 总Token）\n')
            L.append('| 任务 | round-1 Δ | 本轮 Δ |')
            L.append('|---|---|---|')
            for t in ORDER:
                o_b = agg([r for r in r1 if r['taskId'] == t and r['arm'] == 'baseline'])
                o_t = agg([r for r in r1 if r['taskId'] == t and r['arm'] == 'treatment'])
                n_b = agg(by[t].get('baseline', []))
                n_t = agg(by[t].get('treatment', []))
                od = (o_t['total'] - o_b['total']) if (o_b and o_t) else None
                nd = (n_t['total'] - n_b['total']) if (n_b and n_t) else None
                if od is not None and nd is not None:
                    L.append(f"| {t} | {od:+,} | {nd:+,} |")

    L.append('\n## 七、口径与局限\n')
    L.append('- 命中率为**输入侧聚合口径**（ΣcacheRead/Σ输入三桶），与 DSH 原生计费一致；单集命中率波动大，按臂聚合解读。')
    L.append('- avoidedTokens 为插件回放估计（旁证）；净节省以同格配对 Token 差额为准。')
    L.append('- n=2 无显著性检验；行为方差可大于干预效应，逐任务 Δ 必须配对解读。')
    L.append('- 行为约束（HARD CONSTRAINTS）为两臂对称的实验条件，测量的是「直出型工作负载下的插件价值」。')

    outp = Path(base) / a.out
    outp.write_text('\n'.join(L))
    print(f'written {outp}')
    print('\n'.join(L[:40]))


if __name__ == '__main__':
    main()
