#!/usr/bin/env python3
"""judge_gaia.py <task:locomotives|arxiv-regulation> "<final_answer>"

GAIA gold-answer comparison with the protocol's normalization:
lower(), strip(), strip trailing periods. Prints GAIA_JUDGE success=0|1 and
exits 0 on success, 1 on failure (shell-friendly like judge_tb.sh/judge_swe.sh).
Gold answers come from tasks/manifest.json.
"""
import json, sys, os, re

NORMALIZE_STRIP = ' .\t\r\n'

def norm(s):
    s = (s or '').lower().strip(NORMALIZE_STRIP)
    s = re.sub(r'\s+', ' ', s)
    return s

def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manifest = json.load(open(os.path.join(here, 'tasks', 'manifest.json')))
    golds = {
        'locomotives': manifest['gaia_validation']['tasks'][0]['final_answer'],
        'arxiv-regulation': manifest['gaia_validation']['tasks'][1]['final_answer'],
    }
    task, answer = sys.argv[1], sys.argv[2]
    gold = golds[task]
    ok = norm(answer) == norm(gold)
    print(f'GAIA_JUDGE task={task} answer={answer!r} gold={gold!r} success={1 if ok else 0}')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
