#!/usr/bin/env python3
"""collect_episode.py <sessionId> <benchId> <taskId> <arm> <repeat> [--success 0|1] [--note str]
从 ~/.dsh/storages/session_projcache.json 提取该会话的计量并落盘原始记录。
"""
import json, sys, os, time, argparse

CACHE = os.path.expanduser('~/.dsh/storages/session_projcache.json')
RAW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'results', 'raw')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('session_id'); ap.add_argument('bench'); ap.add_argument('task')
    ap.add_argument('arm'); ap.add_argument('repeat', type=int)
    ap.add_argument('--success', type=int, default=0); ap.add_argument('--note', default='')
    ap.add_argument('--rawroot', default=RAW)
    ap.add_argument('--dashboard', default='http://127.0.0.1:3080/save-token/api/dashboard')
    a = ap.parse_args()

    def read_cache():
        with open(CACHE) as f:
            return json.load(f)

    sid = a.session_id
    data = read_cache()
    rows = data['tables']['sessions'].get(sid, {}).get('rows', {})
    # flush 容忍：tokenUsage 缺失时等 3s 重读一次
    if 'tokenUsage' not in rows or 'sessionStats' not in rows:
        time.sleep(3)
        data = read_cache()
        rows = data['tables']['sessions'].get(sid, {}).get('rows', {})

    tu = rows.get('tokenUsage', {}).get('val', {})
    totals = tu.get('totals', {}) if isinstance(tu, dict) else {}
    ss = rows.get('sessionStats', {}).get('val', {}) if 'sessionStats' in rows else {}
    st = rows.get('subagentTiming', {}).get('val', {}) if 'subagentTiming' in rows else {}

    rec = {
        'benchId': a.bench, 'taskId': a.task, 'arm': a.arm, 'repeat': a.repeat,
        'sessionId': sid,
        'usage': {
            'uncachedInputTokens': totals.get('uncachedInputTokens'),
            'outputTokens': totals.get('outputTokens'),
            'cacheReadTokens': totals.get('cacheReadTokens'),
            'cacheWriteTokens': totals.get('cacheWriteTokens'),
        },
        'steps': ss.get('steps'), 'turns': ss.get('turns'),
        'llmMs': ss.get('llmMs'), 'toolMs': ss.get('toolMs'),
        'settledMs': st.get('settledMs'),
        'success': a.success, 'note': a.note,
        'missing_fields': sorted(
            k for k, chk in [('tokenUsage', totals), ('sessionStats', ss), ('subagentTiming', st)] if not chk
        ),
    }
    total_in = (totals.get('uncachedInputTokens') or 0) + (totals.get('cacheReadTokens') or 0) + (totals.get('cacheWriteTokens') or 0)
    rec['usageTotalTokens'] = total_in + (totals.get('outputTokens') or 0)

    # v2: 快照插件仪表（约定：发射前已 reset，故当前值≈本集插件活动）
    import urllib.request
    try:
        with urllib.request.urlopen(a.dashboard, timeout=5) as r:
            dash = json.load(r)
        comp = dash.get('compression', {}) or {}
        rec['plugin'] = {
            'compressionEvents': comp.get('count', 0),
            'dedupeHits': comp.get('dedupeHits', 0),
            'byTool': comp.get('byTool') or {},
            'avoidedTokens': (dash.get('totals', {}) or {}).get('avoidedTokens', 0),
        }
    except Exception as e:
        rec['plugin'] = {'error': str(e)}

    rawroot = a.rawroot
    os.makedirs(rawroot, exist_ok=True)
    out = os.path.join(rawroot, f"{a.bench}-{a.task}-{a.arm}-r{a.repeat}.json")
    with open(out, 'w') as f:
        json.dump(rec, f, indent=1)
    print(json.dumps({'written': out, 'totalTokens': rec['usageTotalTokens'], 'steps': rec['steps'], 'turns': rec['turns'], 'missing': rec['missing_fields']}))

if __name__ == '__main__':
    main()
