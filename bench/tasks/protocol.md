# Episode 执行协议

## 唯一变量与切换纪律
- Treatment: compress/dedupe/compactAssist 全 true；Baseline: 全 false。
- **完全串行执行（修订）**：去重缓存是进程级且不分会话——并行同任务的两集可能在 90s TTL 内产生字节相同输出，导致跨会话假引用（对其中一臂非对称）。故放弃并行：baseline 批→切臂→treatment 批。
- 切臂序列 = POST set-enabled ×3 → 验证 GET dashboard flags → 等待 dedupeTtl(90s)+5s。
- treatment 批内每集之间也间隔 ≥95s（防上一集的相同输出指纹落入本集 90s 窗口）。
- 每集开始前 POST /save-token/api/reset（仪表数据仅作监控，不作统计口径）。

## 子 agent 发射模板（逐字）
- 工具约束：允许 bash/read/glob/grep/write/edit；**禁问用户**（无问题可答）。
- 结束条件：完成任务或明确宣布无法完成；不得无限重试（>25 步自行收尾）。
- 输出约定：最后一条消息必须以 `EPISODE_DONE` 开头并简述结论。
- 通用导言（原样嵌入每集提示词）：
  "You are an autonomous engineering agent working under bench conditions. Work only inside the given workspace path. Do not ask questions (no user is present). Finish or clearly report failure."

## 三家基准的题目注入
| bench | 工作区 | 题目 | 成功判定 |
|---|---|---|---|
| SWE | sandboxes/swe/<repo>（钉 base_commit；每集前 `git checkout -- . && git clean -fd -e .venv`） | problem_statement 原文 | apply test_patch 后跑 FAIL_TO_PASS 节点，exit=0 |
| TB | sandboxes/<tb>/initial 拷贝到集内临时目录（指令中 /app 字样改写为实际路径） | task.yaml instruction 原文 | 适配版 pytest，exit=0 |
| GAIA | 无工作区（题面+附件路径） | Question 原文 | 归一化 exact match（lower/strip） |

## 计量收集（每集结束立即执行）
1. sessionId = subagent 工具返回 id（已验证等于 projcache 键）。
2. 读 `~/.dsh/storages/session_projcache.json`：
   - tokenUsage.val.totals 四桶（真值计费）
   - sessionStats.val：steps、turns → 报告口径 ToolCalls ≈ steps−turns
   - subagentTiming.val.settledMs（时长参考）
3. flush 风险：若字段缺失，等待 3s 重读一次，仍缺则记录 incident。

## 数据落盘格式（bench/results/raw/<bench>-<task>-<arm>-r<i>.json）
{ benchId, taskId, arm, repeat, sessionId, usage:{uncachedInput,output,cacheRead,cacheWrite},
  steps, turns, settledMs, success(0/1), note }

## 无效集判定（v3 修订，含全串行决策）
- **全面串行**：一次只跑一集。依据：2025-08-27 实测，多集并发时 5 集中 4 集异常
  （启动崩溃 steps=1 全零 ~17s；中途死亡 steps=2~5 后静默终止）；纯单发 pilot 2/2 成功。
  根因疑似本地模型路由在并发流下不稳定。
- 无效签名：(a) closing message 缺失/为空；(b) tokenUsage 四桶全零；(c) 中途死亡
  （settledMs 存在但无结语且未输出最终格式行）。命中即重发同格，每格重发上限 2 次。
- 路由慢属正常（观测到单步 llmMs≈146s）；发射后至少观察 3 分钟再判定卡死。

## 执行顺序（两臂各 18 集）
baseline: gaia×6 → tb×6 → swe×6 → 切臂(等90s) → treatment 同序（集间 ≥95s 间隔）。

## 近似性声明（必须写入最终报告）
- SWE/TB 为原生 macOS 复刻，非官方 Docker harness；
- ToolCalls 为 steps−turns 口径；
- n=2，成功率分辨率粗、P90 受小样本影响；
- 唯一受控变量为插件三开关；模型路由与非确定性不受控但两臂对称。
