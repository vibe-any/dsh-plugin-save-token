# dsh-plugin-save-token

English | [简体中文](./README.zh-CN.md)

**In one sentence: a DeepSeek Harness (dsh) dynamic plugin that cuts token cost without cutting model intelligence.**

It slims down oversized tool outputs at the entrance of every model request — **reversibly and structure-aware**. The full original text is always saved to disk; what the model sees is always a condensed version carrying a retrieval path. Every optimization obeys one red line: **any replacement must be restorable in one step**, and the estimated token count after compression must be strictly smaller than the original.

---

## Why you need it

- The bulk of agentic-session cost is **tool output that keeps re-entering the context**: large JSON from APIs, CLI tables, logs. The same 40KB price table may be billed again on every conversation turn.
- But blunt truncation degrades intelligence: research shows that even with perfect retrieval, merely padding the context with irrelevant content drops accuracy by 13.9–85% (curated in ["Context Length Alone Hurts"](https://github.com/pleasedodisturb/awesome-llm-token-optimization)); conversely, over-compression fails too — in production randomized controlled trials, aggressive compression (keep ratio 0.2) actually made cost **+1.8%** worse, while moderate compression (0.5) delivered **−27.9%**.
- Conclusion: **the right way to save tokens is structure-preserving slimming, not content hacking.** All strategies in this plugin are designed within that boundary.

---

## Core optimizations

### 1. Structure-aware compression: no more blind table slicing
Detects pipe-delimited high-density table rows (≥70% of lines sharing the same separator profile). When matched, instead of a blind head/tail window it does: keep the first 60 rows verbatim + stride-sample the middle section every N rows with original line numbers annotated (`L61: ...`) + keep the last 40 rows verbatim. The model receives a "map with coordinates" — any segment can be fetched precisely by line number.
> Reference: [rtk](https://github.com/rtk-ai/rtk)'s never-worse guard and error-line retention policy; the stride sampling is this plugin's improvement over rtk's head/tail window.

### 2. TOON-style lossless encoding first
Uniform JSON arrays (e.g. API responses with 300 homogeneous objects) first go through deterministic tabular re-encoding: `prices[300]{model,input,output}:` — one schema header line + CSV data rows. Keys are written once, zero information loss, and the notice explicitly says *"zero information loss"*. Lossy paths are only used when the lossless route is unavailable.
> Reference: [TOON — Token-Oriented Object Notation](https://github.com/toon-format/toon); measured savings of 30–60% tokens on uniform arrays.

### 3. Compress means spill (CCR): never burn the bridge
Before every replacement, the original text is written to disk via the dsh `spillStore`; the replacement embeds two retrieval paths: the dynamic tool `save_token_expand` (one-call fetch by marker id) plus a file locator for the original (readable directly with read/grep). If spilling fails, compression is abandoned — **reversibility is a hard precondition, not an option**.
> Reference: [headroom](https://github.com/headroomlabs-ai/headroom)'s CCR (Compress-Cache-Retrieve) pattern.

### 4. Cross-turn dedup
Tool-call results byte-identical within a 90-second window (rerunning the same command, etc.) are replaced by one stub: "This output is identical to N seconds ago, refer to earlier context." Prevents the same large output from appearing twice in the context.
> Reference: [headroom](https://github.com/headroomlabs-ai/headroom)'s cross-turn dedup.

### 5. Never-worse double gate
A candidate compressed result is adopted only if it passes both gates:
- **Byte gate**: compressed ≤ 72% of the original (`keepRatioMax=0.72`, more conservative than the RCT-validated 0.5), and absolute savings ≥500B;
- **Token gate**: estimated tokens must strictly decrease (an llmtrim-style quality-gating idea).
If either gate fails, the output passes through untouched.
> Reference: RCT boundary data and quality-gating survey in [awesome-llm-token-optimization](https://github.com/pleasedodisturb/awesome-llm-token-optimization).

### 6. Error-line protection
Within the omitted region of log-like output, up to 25 lines matching `error/fatal/traceback/timeout...` are kept (with line-number prefixes). Debugging evidence is never compressed away.
> Reference: [rtk](https://github.com/rtk-ai/rtk)'s error-line keeps.

### 7. Compaction pressure coupling
At each reasoning-step boundary, check the session's most recent actual context size; above 120k tokens (10-minute cooldown), fire dsh's native `compaction.compactIfNeeded()` with `'pressure'` and let the engine decide when to summarize history.
> The threshold is a conservative water line (sized for 128k-class context windows); compaction itself is built into dsh — the plugin only hands over the trigger at the right moment.

### 8. Full-chain metering + dual-panel dashboard
Every `llm/stream` is intercepted: real billed tokens (input/cached/output/reasoning) and "tokens avoided from context" are accounted separately. Historical messages are scanned for `[save-token #id]` markers to total savings (including multi-turn replays). The Settings page hosts a full panel (KPIs, per-request stacked chart, top-tools leaderboard, activity feed), plus a persistent live strip under the input box.

---

## Measured results

### End-to-end A/B on real agent tasks (2026-08-29)

Randomized comparison on GAIA / Terminal-Bench / SWE-bench-Verified tasks — unique variable: the plugin's compress/dedupe switches; both arms under identical constraints that force large tool output to be printed directly into the conversation. Full data, scripts and per-episode records: [`bench/`](./bench), report: [`bench/report_2026-08-29.md`](./bench/report_2026-08-29.md).

| Episodes | Success rate | Total tokens | Compressions | Per-episode median |
|---|---|---|---|---|
| 24/24 (6 tasks × 2 arms × n=2) | **100% vs 100%** | 5.25M vs **4.32M (−17.6%)** | 16 events across 8/12 episodes | **−56%** |

Take-aways: the plugin pays off exactly when large tool output lands directly in
the context (verbose test runs, raw log/JSON dumps); when agents go through the
write-file-then-read pattern it never triggers — and costs nothing. Success rate
was never hurt.

### Single-event compression strength

| Input | Before | After | Strategy |
|---|---|---|---|
| CLI price table (400-line pipe table) | 41,727 B | **15,191 B (−64%)** | Structure-aware: verbatim head/tail + stride-sampled middle with original line numbers |
| Model-price JSON registry (300-item uniform array) | 34,000 B | **19,935 B (−41%)** | TOON lossless route, zero information loss |

> Anti-pattern on record: an early version once applied blind head/tail windowing to a 35.5KB LiteLLM price registry; subagents couldn't locate middle rows and re-queried repeatedly — that failure is why the structure-aware strategy exists.

> Single-event figures were measured in a development environment; session-level gains depend on how much of your workload is large tool output delivered directly to the model (write-file-then-read patterns bypass compression by design, at zero cost).

---

## Installation & usage

**Requirements**: a running DeepSeek Harness (dsh) with its Web GUI, and `pnpm` on PATH. The web profile provides everything else the plugin needs (`tools`, `webServer`, React for the dashboard; `spillStore` is included in standard deployments — if it is ever missing, compression stays off by design).

### Install

Run **one** of these commands — `dsh plugin` installs the package into the profile and activates its bundle layer automatically:

```bash
# from the npm registry
dsh plugin --profile web add dsh-plugin-save-token

# or straight from GitHub
dsh plugin --profile web add github:vibe-any/dsh-plugin-save-token

# or from a local checkout
dsh plugin --profile web add /absolute/path/to/dsh-plugin-save-token
```

That's the whole installation: no prompts to paste into the GUI, no dynamic-code authorization dialogs. Verify it's in the roster with `dsh --profile web --dump-config | grep save-token`, then restart the running dsh instance (ESM caches are per-process).

Removal: `dsh plugin --profile web remove dsh-plugin-save-token`.

### Using it

Once installed there is nothing to operate: open **Settings → Token Saver** for the full panel, and look for the persistent live strip under the input box. Three toggles (Compress / Dedupe / Compact@120k) switch right on the panel. The panel and the strip follow dsh's language setting (Settings → General → Language: English / 简体中文).

### Config defaults (the `config:` block of the `save-token` row in [cordis.patch.yml](./cordis.patch.yml); code fallbacks live in `src/index.js`)

| Parameter | Default | Meaning |
|---|---|---|
| `minBytes` | 1400 | Minimum size for ordinary outputs to enter compression |
| `errorMinBytes` | 6000 | Higher threshold for error output (leave debugging scenes alone) |
| `keepRatioMax` | 0.72 | Byte-gate cap: compressed must not exceed 72% of original |
| `maxLines / headLines / tailLines` | 240/140/80 | Window shape for ordinary long outputs |
| `tabularHeadRows / tabularTailRows / tabularStrideSamples` | 60/40/50 | Retention and sampling density in table mode |
| `longLineChars` | 420 | Head/tail truncation threshold for single oversized lines |
| `jsonlMinLines` | 8 | Minimum uniform-object lines for the JSONL/NDJSON lossless route |
| `noticeFullTrailerCount` | 3 | First N adopted compressions carry the verbose retrieval notice; later ones use the compact trailer (same id + locator) |
| `dedupeTtlMs` | 600000 | Validity window for cross-turn dedup (fingerprints are byte-exact, so a longer window is information-safe) |
| `dedupeTtlOverrides` | {} | Per-tool TTL in ms; `0` disables dedupe for that tool (freshness-sensitive commands) |
| `compactAssistEnabled` | false | Compaction coupling master switch — **off by default** (see cache note below) |
| `compactBudgetTokens / compactCooldownMs` | 120000/600000 | Absolute fallback watermark and cooldown for the compaction assist |
| `contextWindowTokens / compactWatermarkRatio` | 0/0.85 | When the model window is known, the watermark is `window × ratio` instead of the absolute budget |

v2.2.0 behavior notes:

- Dedupe keys carry the owning session id and hash the FULL args/content strings (long shared prefixes can no longer produce false "byte-identical" stubs; two sessions sharing one process never see each other's stubs).
- `save_token_expand` output is exempt from compression — unfolding a notice can never hand back the same elided preview again.
- Lossless routes extended: JSONL/NDJSON logs, nested field groups (`pos{x,y}`), keyed maps, and a depth-2 dominant-array search (`{data:{items:[...]}}`). Lossless wins whenever it passes the never-worse gates; the lossy elision candidate is generated as the gate-checked fallback before the line compressor, and lossy notices disclose exactly what was omitted.
- Compression counters increment on adopted candidates (previously on attempts that the gates could still reject).

v2.3.0 cache-aware layer (bench evidence: 88.9% of measured input tokens were provider cache reads, billed at ~1/30 of the miss price on DeepSeek):

- **Compaction assist defaults to OFF** and is repositioned as an anti-overflow measure, not a saver: summarizing 120k→40k tokens converts cheap cached replay into full-price input and breaks even only after ~60 further requests. Turn it on when sessions actually grow past the watermark; do not expect it to cut spend. The toggle and watermark are honest in the panel.
- The watermark prefers the **last real billed input** for the session (main requests only) over the heuristic estimate, and scales with the model window (`contextWindowTokens × compactWatermarkRatio`) when configured.
- **Cache-hit sentinel KPI**: `cacheRead`/`cacheWrite` are metered separately and the panel shows the cache-hit percentage. If a future change tanks that number, it is saving tokens while silently raising real cost.
- **Online calibration**: a per-model EMA of billed/estimated tokens (learned from real usage each request) corrects the avoided-token accounting — no bundled tokenizer. The compression token gate needs no calibration (the ratio cancels in that comparison).

v2.4.0 closing items:

- Dedupe TTL default 90s → 600s with per-tool overrides (`dedupeTtlOverrides`, `0` opts a tool out entirely).
- Error-line protection in plain-text windows widened to **±1 context line** (25 anchors, adjacent anchors merged): a bare assertion line rarely explains itself; the neighboring test name / stack header is what saves a re-run.
- `save_token_expand` survives eviction and restarts: an id→locator side index outlives the text cache, so a miss returns the spill locator (with a transparent `spillStore.readText` attempt when the host offers one) instead of a dead end.
- Top-level vs nested tool calls are counted on the panel — the nesting exemption currently skips compression for subagent-internal calls, and this counter finally quantifies that unexploited surface before anyone flips it.

---

## How it works (30-second version)

```
tool returns ──► tools/post-execute (prepend)
             ├─ size ≤ threshold? ────────── pass through
             ├─ byte-identical within 90s? ─ spill original → replace with dedup stub
             ├─ JSON with uniform array? ─── TOON lossless re-encode (zero loss)
             ├─ JSONL of uniform objects? ── one TOON table for the whole log
             ├─ pipe/tab table shape? ────── stride-sampled window with line numbers
             └─ other long text ──────────── head/tail window + error-line protection
                      │  double gate per route: ≤72% bytes AND tokens strictly decrease
                      │  (lossless first; lossy elision is the gate-checked fallback)
                      ▼
             spill original to spillStore → inject [save-token #id] retrieval notice
                      ▼
every model request ◄── llm/stream metering (real billing + avoided tokens, per-model calibrated)
step boundaries ──► assist on AND billed > watermark? ──► compaction.compactIfNeeded('pressure')
```

All compression logic lives in `src/compress.js` (pure, side-effect free) and is pinned by the unit-test suite: `npm test` (`node --test`, zero extra dependencies).

## Directory layout

```
dsh-plugin-save-token/
├── README.md             ← this file (English, default entry)
├── README.zh-CN.md       ← Chinese documentation
├── manifest.json         ← metadata + config defaults
├── package.json          ← npm manifest declaring dsh.bundle + ./client export
├── cordis.patch.yml      ← the bundle layer inserted into the profile roster
├── build.mjs             ← esbuild script producing lib/
├── src/
│   ├── index.js          ← Host half: waterfall hooks / orchestration / tool registration / API routes
│   ├── compress.js       ← pure compression brain (estimators, TOON tabular, gates, notices)
│   └── client/index.js   ← Client half: Dashboard panel + input-box live strip
├── test/                 ← node --test unit suite pinning the compression brain
└── lib/                  ← built artifacts (committed, so git installs need no build step)
    ├── index.js          ← bundled ESM host half (node)
    └── client.js         ← bundled client half wrapped in window.__ModuleLoader__.load({ id, factory })
```

## Design red lines ("no dumbing down" promises)

1. **Reversible**: failed disk write = abandon compression; `read` and `save_token_expand` outputs are never processed (by-design exemptions).
2. **Lossless first**: lossless wins whenever it passes the never-worse gate; lossy elision runs only as the gate-checked fallback and its notices disclose what was omitted.
3. **Double gate**: every replacement must prove itself "smaller in bytes AND cheaper in tokens," or it passes through.
4. **Error protection**: high thresholds around failure scenes, mandatory retention of error lines (±1 context line).
5. **Cache-stable**: compression happens once, at tool-result entry; history stays byte-stable afterwards, so the provider prompt cache keeps hitting (measured: 88.9% of input tokens were cache reads at ~1/30 price). Replay-time rewriting of history is out of scope by design — it lowers the token meter while raising the real bill.
