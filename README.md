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

## Measured results (real scenarios)

| Scenario | Input | Result | Notes |
|---|---|---|---|
| CLI price table (400-line pipe table) | 41,727 B | **15,191 B (−64%)** | Verbatim head/tail + middle sampled every 7 lines with line numbers; whole-table structure visible |
| Model-price JSON registry (300-item uniform array) | 34,000 B | **19,935 B (−41%)** | TOON lossless route, zero information loss |
| Real session cumulative (14 large-output events, 146,935 B) | — | Best single event **−96%** (33,184→1,317 B); worst −31% | Lossy path as fallback; even the worst case passed the double gate |
| Anti-pattern → design motivation | A 35.5KB LiteLLM price registry once got blind head/tail windowing; subagents couldn't find middle rows and re-queried repeatedly | v2 switched to structure-aware strategy | Honestly recorded: this is why optimization #1 exists |

> Figures above were measured in a development environment, not a lab benchmark; your gains depend on how much of your workload is large tool output.

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

Once installed there is nothing to operate: open **Settings → Token Saver** for the full panel, and look for the persistent live strip under the input box. Three toggles (Compress / Dedupe / Compact@120k) switch right on the panel.

### Config defaults (the `config:` block of the `save-token` row in [cordis.patch.yml](./cordis.patch.yml); code fallbacks live in `src/index.js`)

| Parameter | Default | Meaning |
|---|---|---|
| `minBytes` | 1400 | Minimum size for ordinary outputs to enter compression |
| `errorMinBytes` | 6000 | Higher threshold for error output (leave debugging scenes alone) |
| `keepRatioMax` | 0.72 | Byte-gate cap: compressed must not exceed 72% of original |
| `maxLines / headLines / tailLines` | 240/140/80 | Window shape for ordinary long outputs |
| `tabularHeadRows / tabularTailRows / tabularStrideSamples` | 60/40/50 | Retention and sampling density in table mode |
| `longLineChars` | 420 | Head/tail truncation threshold for single oversized lines |
| `dedupeTtlMs` | 90000 | Validity window for cross-turn dedup |
| `compactBudgetTokens / compactCooldownMs` | 120000/600000 | Trigger level and cooldown for compaction coupling |

---

## How it works (30-second version)

```
tool returns ──► tools/post-execute (prepend)
             ├─ size ≤ threshold? ────────── pass through
             ├─ byte-identical within 90s? ─ spill original → replace with dedup stub
             ├─ JSON with uniform array? ─── TOON lossless re-encode (zero loss)
             ├─ pipe/tab table shape? ────── stride-sampled window with line numbers
             └─ other long text ──────────── head/tail window + error-line protection
                      │  double gate: ≤72% bytes AND tokens strictly decrease
                      ▼
             spill original to spillStore → inject [save-token #id] retrieval notice
                      ▼
every model request ◄── llm/stream metering (real billing + avoided tokens)
step boundaries ──► est > 120k? ──► compaction.compactIfNeeded('pressure')
```

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
│   ├── index.js          ← Host half: waterfall hooks / compression algorithms / tool registration / API routes
│   └── client/index.js   ← Client half: Dashboard panel + input-box live strip
└── lib/                  ← built artifacts (committed, so git installs need no build step)
    ├── index.js          ← bundled ESM host half (node)
    └── client.js         ← bundled client half wrapped in window.__ModuleLoader__.load({ id, factory })
```

## Design red lines ("no dumbing down" promises)

1. **Reversible**: failed disk write = abandon compression; `read` tool output is never processed (by-design exemption).
2. **Lossless first**: if lossless is possible, lossy never runs; notices say so truthfully.
3. **Double gate**: every replacement must prove itself "smaller in bytes AND cheaper in tokens," or it passes through.
4. **Error protection**: high thresholds around failure scenes, mandatory retention of error lines.
