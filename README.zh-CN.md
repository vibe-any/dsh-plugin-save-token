# dsh-plugin-save-token

[English](./README.md) | 简体中文

**一句话：让 DeepSeek Harness（dsh）会话"只降 token 成本，不降智能水平"的动态插件。**

它在模型请求的入口对超大工具输出做**可逆、结构感知**的瘦身——原文永远完整保存在磁盘上，模型看到的永远是带取回路径的精简版。所有优化都遵守一条红线：**任何替换必须能一键还原**，且压缩后的估算 token 必须严格小于原值。

---

## 为什么需要它

- Agentic 会话的成本大头是**反复进入上下文的工具输出**：API 返回的大 JSON、CLI 表格、日志。同一段 40KB 的价格表可能随每轮对话重复计费。
- 但粗暴截断会"降智"：研究显示即使检索完美，单纯拉长无关上下文也会让准确率下降 13.9–85%（["Context Length Alone Hurts"](https://github.com/pleasedodisturb/awesome-llm-token-optimization) 收录）；反过来过度压缩同样翻车——生产环境随机对照实验中激进压缩（保留率 0.2）反而让成本 **+1.8%**，温和压缩（0.5）才省下 **27.9%**。
- 结论：**省 token 的正确姿势是"保结构的瘦身"，不是"砍内容"。** 本插件的所有策略都以此为设计边界。

---

## 核心优化

### 1. 结构感知压缩：表格不再盲切
检测管道分隔的高密度表格行（≥70% 行共享同一分隔轮廓）。命中后不做盲目头尾窗口，而是：保留头 60 行全文 + 中段**每 N 行步进采样并标注原始行号**（`L61: ...`）+ 尾 40 行全行。模型拿到的是"带坐标的地图"，任何一段都能按行号精确取回。
> 参考：[rtk](https://github.com/rtk-ai/rtk) 的 never-worse guard 与错误行保留策略；步进采样为本插件在 rtk 头尾窗口基础上的改进。

### 2. TOON 式无损编码优先
均匀 JSON 数组（300 个同构对象这类 API 响应）先尝试确定性的表格化重编码：`prices[300]{model,input,output}:` 一行 schema 头 + CSV 数据行。键名只写一次，信息零丢失，通知明确标注 *"zero information loss"*。只有无损路线不可用时才走有损路径。
> 参考：[TOON — Token-Oriented Object Notation](https://github.com/toon-format/toon)，均匀数组上实测可省 30–60% token。

### 3. 压缩即落盘（CCR）：永远留后路
每次替换前，原文先经 dsh `spillStore` 写盘；替换文本内嵌两条取回路径：动态工具 `save_token_expand`（按 marker id 一键取回）+ 原文文件 locator（可用 read/grep 直读）。没有落盘成功就放弃压缩——**可逆性是硬前提，不是可选项**。
> 参考：[headroom](https://github.com/headroomlabs-ai/headroom) 的 CCR（Compress-Cache-Retrieve）模式。

### 4. 跨轮去重
90 秒窗口内字节级相同的工具调用结果（同一命令重跑等）替换为一句 stub："此输出与 N 秒前完全一致，请引用上文"。避免同一段大输出在上下文里出现两遍。
> 参考：[headroom](https://github.com/headroomlabs-ai/headroom) 的 cross-turn dedup。

### 5. Never-worse 双门控
候选压缩结果必须同时通过两道闸门才会被采用：
- **字节门**：压缩后 ≤ 原始的 72%（`keepRatioMax=0.72`，比 RCT 验证的 0.5 更保守），且绝对节省 ≥500B；
- **token 门**：估算 token 必须严格下降（llmtrim 式质量门控思路）。
任一门不过，原样放行。
> 参考：RCT 边界数据与质量门控综述见 [awesome-llm-token-optimization](https://github.com/pleasedodisturb/awesome-llm-token-optimization)。

### 6. 错误行保护
日志类输出的省略区里，匹配 `error/fatal/traceback/timeout...` 的行最多保留 25 条（带行号前缀）。排错信息永远不会被压掉。
> 参考：[rtk](https://github.com/rtk-ai/rtk) 的 error-line keeps。

### 7. compaction 压力联动
每个推理步骤边界检查该会话最近的实际上下文规模，超过 120k token（10 分钟冷却）即以 `'pressure'` 触发 dsh 原生 `compaction.compactIfNeeded()`，把历史摘要化的时机交给引擎决定。
> 触发阈值为保守水位（适配 128k 级上下文窗口）；compaction 本身是 dsh 内置能力，本插件只负责在正确时机递上触发器。

### 8. 全链路计量 + 双面板 Dashboard
拦截每一次 `llm/stream`：真实计费 token（input/cached/output/reasoning）与"避免进入上下文的 token"分开记账；扫描历史消息中的 `[save-token #id]` 标记统计节省量（含多轮重放）。Settings 页有完整面板（KPI、逐请求堆叠图、Top 工具榜、活动流），输入框下方有一条常驻实时摘要。

---

## 实测效果

### 端到端 A/B 实测（2026-08-29）

在 GAIA / Terminal-Bench / SWE-bench-Verified 任务上做随机对照，唯一变量 = 插件压缩/去重开关；
两臂施加相同约束，强制大块工具输出直接打印进对话。完整数据、脚本与逐集记录：[`bench/`](./bench)，报告：[`bench/report_2026-08-29.md`](./bench/report_2026-08-29.md)。

| 集数 | 成功率 | 总 Token | 压缩次数 | 单集中位数 |
|---|---|---|---|---|
| 24/24（6 任务 × 2 臂 × n=2） | **100% vs 100%** | 5.25M vs **4.32M（−17.6%）** | 16 次，覆盖 8/12 集 | **−56%** |

结论：大块工具输出直接进上下文时（详细测试输出、原始日志/JSON 转储）插件有真实净收益；
agent 走「写文件再读取」路线时插件不触发、也无代价。成功率未受损。

### 端到端 A/B 第二轮——优化后构建（2026-09-03，v2.4.1）

v2.4.1 优化（无损 TOON 优先流水线、门控回退、缓存感知层）完成后，同一套 harness 在
Linux 宿主上重跑。同样 24/24 集有效，唯一变量不变。报告：[`bench/report_2026-09-03.md`](./bench/report_2026-09-03.md)，
逐集记录：[`bench/results/raw2/`](./bench/results/raw2)，汇总：[`bench/results/summary-r2.md`](./bench/results/summary-r2.md)。

| 指标 | baseline | treatment（v2.4.1 开启） |
|---|---|---|
| 成功率 | 100%（12/12） | **100%（12/12）**——两轮合计 **48/48，零损伤再次确认** |
| 供应商缓存命中率 | 90.0% | **90.7%**——最重的一集（1.86M token 反复 dump/展开）仍守住 **91.1%** |
| 免传输 Token（插件估计） | — | **约 56 万**——11 次压缩覆盖 6/12 集（占其 Token 的 13.8%） |
| SWE 长上下文任务（sympy / django） | — | **−19.7% / −18.0%**，各自两次重复全部同向 |

结论：优化后版本的价值主张更聚焦——收益集中在上下文最长、输出最大的场景（SWE 型
agent 长跑）；缓存感知回放层在最坏情况的反复重读下仍稳住供应商缓存命中；成功率依旧
零损伤。n=2 下单集的 agent 策略离群可能盖过单输出节省，聚合数字请结合报告中的配对
逐任务分析解读。

### 单事件压缩强度

| 输入 | 压缩前 | 压缩后 | 策略 |
|---|---|---|---|
| CLI 价格表（400 行管道表格） | 41,727 B | **15,191 B（−64%）** | 结构感知：头尾全行 + 中段带原始行号抽样 |
| 模型价格 JSON 注册表（300 条均匀数组） | 34,000 B | **19,935 B（−41%）** | TOON 无损路线，零信息损失 |

> 反面教材存档：早期版本曾对 35.5KB LiteLLM 价格注册表做盲目头尾窗口化，子代理找不到中间行反复重查——结构感知策略正因此而生。

> 单事件数字为开发环境实测；会话级收益取决于工作负载中「直接送进模型的大输出」占比（「写文件再读取」模式按设计绕过压缩，零开销）。

---

## 安装与使用

**环境要求**：一份正在运行的 DeepSeek Harness（dsh）及其 Web GUI，PATH 里有 `pnpm`。插件需要的其余服务 web profile 全部自带（`tools`、`webServer`、面板用的 React；标准部署自带 `spillStore`——万一缺失，压缩会按设计保持关闭）。

### 安装

任选一条命令——`dsh plugin` 会把包装进 profile 并自动激活它的 bundle 层：

```bash
# 从 npm registry
dsh plugin --profile web add dsh-plugin-save-token

# 或直接从 GitHub
dsh plugin --profile web add github:vibe-any/dsh-plugin-save-token

# 或从本地 checkout
dsh plugin --profile web add /absolute/path/to/dsh-plugin-save-token
```

安装到此为止：不用往 GUI 里粘贴任何提示语，也没有动态代码授权弹窗。可用 `dsh --profile web --dump-config | grep save-token` 确认已进入组合层，然后重启运行中的 dsh 实例（ESM 缓存按进程生效）。

卸载：`dsh plugin --profile web remove dsh-plugin-save-token`。

### 使用

装好后无需任何操作：打开 **Settings → Token Saver** 看完整面板，输入框下方有常驻实时条。三个开关（Compress / Dedupe / Compact@120k）可在面板上一键切换。面板与实时条跟随 dsh 的语言设置（Settings → General → Language：English / 简体中文）。

### 配置默认值（[cordis.patch.yml](./cordis.patch.yml) 中 `save-token` 行的 `config:` 块；代码兜底默认在 `src/index.js`）

| 参数 | 默认 | 含义 |
|---|---|---|
| `minBytes` | 1400 | 普通输出参与压缩的最小体积 |
| `errorMinBytes` | 6000 | 错误输出的更高门槛（少动排错现场） |
| `keepRatioMax` | 0.72 | 字节门上限：压缩后不得超过原始 72% |
| `maxLines / headLines / tailLines` | 240/140/80 | 普通长输出的窗口形状 |
| `tabularHeadRows / tabularTailRows / tabularStrideSamples` | 60/40/50 | 表格模式的保留与采样密度 |
| `longLineChars` | 420 | 单行超长的首尾截断阈值 |
| `jsonlMinLines` | 8 | JSONL/NDJSON 无损路线的最少均匀对象行数 |
| `noticeFullTrailerCount` | 3 | 前 N 次压缩使用完整取回通知，其后使用紧凑 trailer（id 与 locator 保留） |
| `dedupeTtlMs` | 600000 | 跨轮去重的有效窗口（指纹字节级全等，长窗口信息安全） |
| `dedupeTtlOverrides` | {} | 分工具 TTL（毫秒）；`0` 表示该工具永不去重（新鲜度敏感命令） |
| `compactAssistEnabled` | false | compaction 联动总开关——**默认关闭**（见下方缓存说明） |
| `compactBudgetTokens / compactCooldownMs` | 120000/600000 | compaction 联动的绝对水位兜底与冷却 |
| `contextWindowTokens / compactWatermarkRatio` | 0/0.85 | 已知模型窗口时，水位 = `窗口 × 比例`，替代绝对预算 |

v2.2.0 行为说明：

- 去重指纹携带会话 id，并对完整参数/内容做哈希（长前缀不再可能误判"字节相同"；同进程多会话互不污染 stub）。
- `save_token_expand` 的输出豁免压缩——展开通知不会再拿到同样被裁剪的预览。
- 无损路线扩展：JSONL/NDJSON 日志、嵌套字段组（`pos{x,y}`）、键控 map、深层主导数组搜索（`{data:{items:[...]}}`）。无损路线过 never-worse 门即优先采纳；有损 elision 作为过门失败的降级候选先于行窗口尝试，且通知会如实披露裁剪形状。
- 压缩计数改为"被采纳的压缩"口径（此前统计的是含门控拒绝在内的尝试次数）。

v2.3.0 缓存感知层（bench 实证：约 90% 的输入 token 是供应商缓存读，DeepSeek 按 ~1/30 未命中价计费）：

- **compaction 联动默认关闭**，并重新定位为"防溢出"手段而非省钱手段：把 120k 上下文摘要成 40k，等于把廉价的缓存重放换成全价输入，需再跑 ~60 个请求才回本。会话真的逼近水位时再打开；不要指望它降成本。面板上的开关与水位如实显示。
- 水位优先使用该会话**最近一次真实计费输入**（仅主请求），启发式估算只兜底首请求；配置了模型窗口时水位随窗口缩放（`contextWindowTokens × compactWatermarkRatio`）。
- **缓存命中哨兵 KPI**：`cacheRead`/`cacheWrite` 分桶计量，面板显示缓存命中率。未来任何改动若打爆这个数字，就是在"省 token、涨成本"。
- **在线自校准**：按模型维护"真实计费/自估"比值的 EMA（每次请求用真实 usage 学习），修正 avoided-token 口径——不捆绑任何 tokenizer。压缩 token 门无需校准（比值在该比较中约掉）。

v2.4.0 收尾项：

- 去重 TTL 默认 90s → 600s，并支持分工具覆盖（`dedupeTtlOverrides`，`0` 完全退出某工具的去重）。
- 纯文本窗口的错误行保护升级为 **±1 上下文行**（25 个锚点、相邻合并）：裸 assertion 行很难自解释，旁边的测试名/栈头才是省掉重跑的关键。
- `save_token_expand` 可跨淘汰与重启：id→locator 侧索引独立于文本缓存存活，未命中时返回落盘 locator（宿主提供 `spillStore.readText` 时透明尝试直读），不再给死胡同。
- 面板新增顶层/嵌套工具调用计数——嵌套豁免目前跳过子 agent 内部调用的压缩，这个计数让"未开发的收益面"第一次有了数字，再决定是否动豁免。

---

## 工作原理（30 秒版）

```
工具返回 ──► tools/post-execute（prepend）
             ├─ 体积 ≤ 阈值？ ──────────── 原样放行
             ├─ 90s 内字节级重复？ ─────── spill 原文 → 替换为 dedup stub
             ├─ JSON 且含均匀数组？ ────── TOON 无损重编码（零损失）
             ├─ 均匀对象 JSONL？ ───────── 整表 TOON 化
             ├─ 管道/制表表格形态？ ────── 行号步进采样窗口
             └─ 其他长文本 ─────────────── 头尾窗口 + 错误行保护
                      │  逐路线双门控：≤72% 字节 且 token 严格下降
                      │  （无损优先；有损 elision 为过门失败的降级候选）
                      ▼
             spillStore 落盘原文 → 注入 [save-token #id] 取回通知
                      ▼
每次模型请求 ◄── llm/stream 计量（真实账单 + avoided tokens，按模型在线校准）
步骤边界   ──► 联动开启 且 真实计费 > 水位？ ──► compaction.compactIfNeeded('pressure')
```

## 目录结构

```
dsh-plugin-save-token/
├── README.md           ← 英文文档（默认入口）
├── README.zh-CN.md     ← 本文（中文文档）
├── manifest.json       ← 元数据 + 配置默认值
├── package.json        ← npm 清单：声明 dsh.bundle 与 ./client 导出
├── cordis.patch.yml    ← 写入 profile 组合层的 bundle 层声明
├── build.mjs           ← esbuild 构建脚本，产出 lib/
├── src/
│   ├── index.js        ← Host 半：瀑布挂接 / 编排 / 工具注册 / API 路由
│   ├── compress.js     ← 纯函数压缩核心（估算器 / TOON 表化 / 双门控 / 通知）
│   └── client/index.js ← Client 半：Dashboard 面板 + 输入框实时条
├── test/               ← node --test 单元测试，钉住压缩核心行为
└── lib/                ← 构建产物（入库提交，git 安装免构建）
    ├── index.js        ← 打包后的 ESM host 半（node）
    └── client.js       ← 打包后的 client 半（window.__ModuleLoader__.load({ id, factory }) 包装）
```

## 设计红线（"不降智"承诺）

1. **可逆**：落盘失败 = 放弃压缩；`read` 与 `save_token_expand` 输出永不处理（设计豁免）。
2. **无损优先**：无损路线过 never-worse 门即必选；有损 elision 仅作过门失败的降级候选，且通知如实披露裁剪内容。
3. **双门控**：任何替换都要证明自己"更小且更省 token"，否则放行。
4. **错误保护**：报错现场高门槛、错误行（±1 上下文行）强制保留。
5. **缓存稳定**：压缩只在工具结果进入上下文时发生一次，此后历史字节不变，供应商提示缓存持续命中（实测约 90% 输入 token 为 ~1/30 价的缓存读，最重的 dump 场景仍守住 91.1%）。回放期改写历史不在设计范围内——那只降 token 表、涨真账单。
