# bench/ — A/B benchmark harness for dsh-plugin-save-token

Randomized comparison measuring what the plugin saves when it fires: 6
high-output tasks (GAIA ×2, Terminal-Bench ×2, SWE-bench-Verified ×2) ×
{baseline, treatment} × n=2 → 24/24 valid episodes. Unique variable = the
plugin's compress/dedupe switches. Both arms run under identical HARD
CONSTRAINTS (no file redirection, full output printed into the conversation)
so that oversized tool output actually reaches the context.

Result: 16 compression events across 8/12 treatment episodes, **−17.6% total
tokens, success-rate parity (100% both arms)**, per-episode median −56%.
Report: `report_2026-08-29.md`; per-episode records: `results/raw/`.

Round 2 (plugin v2.4.1, Linux host, 2026-09-03): 24/24 valid, success-rate
parity again; aggregate Δ dominated by a single dump-heavy outlier (+38.0%
raw, −0.6% excluding it); consistent savings on SWE tasks (−19.7%/−18.0%);
cache-hit ~90% both arms (±0.7pp). Adds cache-hit-rate as a first-class
metric. Report: `report_2026-09-03.md`; records: `results/raw2/`;
summary: `results/summary-r2.md` (`scripts/analyze2.py`).

## Layout

| Path | What it is |
|---|---|
| `tasks/manifest.json` | Task locks (ids, gold answers, prompt/patch paths), arm definitions, metering plan |
| `tasks/protocol.md` | Episode execution protocol: arm switching, serial discipline, retry rules |
| `tasks/prompts/` | Frozen episode prompts (HARD CONSTRAINTS block included) |
| `tasks/patches/` | SWE test patches (`*.test.diff`), gold patches (`*.src.diff`), PASS_TO_PASS lists |
| `tasks/judge_commands.md` | Judge recipes per task |
| `scripts/set_arm.sh` | Flip compress/dedupe flags via plugin API + reset meters |
| `scripts/prep_episode.sh` | Build a fresh per-episode workspace (`/tmp/bench-eps/<tag>`) |
| `scripts/collect_episode.py` | Pull native tokenUsage/sessionStats projections + plugin dashboard snapshot into `results/raw/` |
| `scripts/judge_tb.sh` | Terminal-Bench judge (sed WORKSPACEPLACEHOLDER → ws, run official tests) |
| `scripts/judge_swe.sh` | SWE judge: F2P node + PASS_TO_PASS sweep (gold/negative calibrated) |
| `scripts/analyze.py` | Aggregate raw records → `results/summary.md` (auto-generated) |
| `scripts/validate_swe_envs.sh`, `scripts/validate_tb_oracles.sh` | Judge calibration: red/green + oracle positive/negative checks |
| `sandboxes/tb-*` | Terminal-Bench initial states + official tests (jsonl corpus committed gzip-compressed; `init_gen.py` documents the deterministic generator) |
| `datasets/` | GAIA metadata + attachment; SWE-bench-Verified parquet; TB2 upstream checkout is **not** committed |
| `results/raw/` | One JSON per episode: four-bucket token usage, steps/turns, success, plugin snapshot (ce/avoided) |

## Reproduce

Prereqs: `uv`, Python 3.11, network for dataset fetches, and the plugin
installed under the dsh web profile (exposing
`http://127.0.0.1:3080/save-token/api/*`).

```bash
cd bench
# 1) external datasets (not committed)
git clone --depth 1 https://github.com/laude-institute/terminal-bench datasets/tb2
#    SWE base commits come from datasets/swe_verified.parquet rows
#    (instances: sympy__sympy-24562, django__django-16595);
#    rebuild sandboxes/swe/<repo>.pristine from those commits, then:
./scripts/prep_episode.sh swe-sympy SMOKE      # builds tree + .venv (sympy example)
# 2) pick an arm
./scripts/set_arm.sh baseline                  # or treatment
# 3) per episode: reset meters, prep, launch the frozen prompt, judge, collect
curl -X POST http://127.0.0.1:3080/save-token/api/reset
ws=$(./scripts/prep_episode.sh tb-access-logs E1)
#    ... launch tasks/prompts/tb-access-logs.txt with {{WS}}=$ws ...
./scripts/judge_tb.sh access "$ws"
python3 scripts/collect_episode.py <sessionId> tb tb-access-logs treatment 1 \
  --success 1 --rawroot results/raw
# 4) regenerate the summary tables
python3 scripts/analyze.py
```

Notes:
- `datasets/gaia/54612da3.xlsx` is the (committed) attachment for the
  locomotives task. A live-leaderboard GAIA task was replaced by the stable
  arXiv task `c61d22de` during pilot runs (answer drift) — see
  `replacement_note` in `tasks/manifest.json`.
- Episodes ran **fully serial** with a ≥95 s gap between treatment episodes
  (dedupe TTL 90 s, cross-session contamination guard). Parallel runs produced
  elevated failure rates in early pilots — keep it serial.
- All metrics come from native persistent projections
  (`~/.dsh/storages/session_projcache.json`); the plugin dashboard is reset
  before every episode and only used for the per-episode compression snapshot.
