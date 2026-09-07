# dsh-eval-cli

[English](README.md) | 中文

dsh-data-agent NL2SQL 流水线的独立 eval CLI。驱动 eval 用例对真实引擎执行，将结果以 JSON 持久化，并向 stdout 报告。

## 标准评测模式：SQL 语义判定器

**SQL 语义判定器是标准评测模式**（自 CL-10 起默认启用）。它使用一个 LLM 评估生成的 SQL 在语义上是否正确——检查表选择、字段选择、过滤条件、聚合逻辑以及整体语义。

旧的 `--no-sql-judge` 模式对任何返回 SQL 的用例自动判通过，掩盖了真实的语义错误（例如选错表、缺失 JOIN、过滤条件错误）。它在原始用例上显示 100%，而 sql-judge 揭示真实质量只有 70%。

### 质量基线

一个通过率只有在与之在**同一协议**下测量的另一个通过率相比时才具有可比性。始终连同数字一起读协议列。

> ### ⚠ 2026-09-06：基线 ARTIFACT 已从磁盘消失——下面的数字留存，但 `compare.ts` 对它们的比较已无法执行
>
> `rebaseline-passk-168-clean`（标为 CURRENT 的那一行）**作为文件在任何地方都不存在**：已检查全部 8 个 worktree 的 `eval-results/` 以及一次全仓库 `find`——零命中。原因：`eval-results/*.json` 被 gitignore（`.gitignore:61`），因此运行产物只存在于产生它们的机器上，并随 worktree 一起消失。
>
> 后果，具体地：
> - **`node --import tsx/esm packages/eval/eval-cli/bin/compare.ts rebaseline-passk-168-clean <new>` 无法运行。** 本 README 中每一条"与基线比较"的说明（包括下面的复现行）当前都无法执行。
> - CLAUDE.md 要求记录每次 eval 运行，且 CL-22 要求 ≥3 次运行取中位数——二者都假设产物持久存在。它们并不。
> - 记录下来的数字仍然可信（它们在本表以及 experiment-audit-log.md 中）；丢失的是按用例的比较与重新评分。
>
> 一次 2026-09-06 的 CL-20 会话直接撞上了这个问题：它被要求与 `rebaseline-passk-168-clean` 比较，但做不到，于是改为与两次仍然存在的同协议 k=1 运行比较。决策待定于 [CL-29](../../../wayfinder/semantic-layer/tickets/CL29-eval-artifact-persistence.md)。

| Protocol | Model | Run ID | Date | Rate |
|---|---|---|---|---|
| **pass@3 pass^k, judge-only（CURRENT）** | **qwen3.7-max** | `rebaseline-passk-168-clean` | 2026-09-04 | **104/168 = 61.9%** |
| pass@3 pass^k, **real-exec**（RBI 10000251，39 个 EXEC 用例——**用例集不同**） | qwen3.7-max | `rebaseline-real-exec-rbi-10000251` | 2026-09-04 | **5/39 = 12.8%** real-exec；同次运行内 judge 放过率 **35.9pp (14/39)** ⚠ 双分上限已撤回（引擎自校正；独立 judge-only `rebaseline-judge-only-rbi-10000251` = **48.7% (19/39，首次尝试 SQL)**；跨运行差距 35.9pp **被混淆**（自校正——judge-pass 集合不同：13 重叠 + 6 仅 real-exec + 6 仅 judge-only；计数相等是巧合）；同次运行内 35.9pp (14/39) 才是干净的按 SQL 度量 |
| pass@3 pass^k, **real-exec** 在 (a)+(d) 之后的 eventdef-prefetch（RBI 10000251，39 EXEC） | qwen3.7-max | `eventdef-realexec` | 2026-09-06 | **2/39 = 5.1%** as-shipped · **5/39 = 12.8% re-anchored**；**null-SQL 23→13 /117 (−43%)**；`FROM <数据视图>` 占位尝试 **3→0**；使用 `ieu_ods.ods_10000251_all_view` 的尝试 **0→18**（全部 6 个被检测的事件用例；**0 个 DWS 用例**）。⚠ **as-shipped 速率在这个 n 下不可解读**：通过的集合从 {036,037,039} → {041,046}——零重叠，全部是 DWS——所以在 n=39 上 `passKVerdict=every` 使之成为 DWS 用例间的抽奖。⚠ **16/18 个事件用例的期望值已陈旧**（原始事件 ODS 视图的历史分区不是冻结锚点；DWS 13/13 仍精确）——按每个用例各自的参考 SQL 实跑重新评分后，事件用例从 **0/18 → 3/18**，其中 119/125/126 在全部 3 次尝试上都精确命中实跑值。见 GA-EVAL-CASESET-EVENT-ANCHOR + `dev/reanchored-score.mjs` |
| pass@3 pass^k, **judge-only** 在 (a)+(d) 之后的 eventdef-prefetch（RBI 10000251，39 EXEC） | qwen3.7-max | `eventdef-judgeonly-v2` | 2026-09-06 | **24/39 = 61.5%** judge-only（在 (d) 之后为 53.8%）；**null-SQL 21→13 /117 (−38%)**；非 SQL 发出 **0%** 维持；使用 `ieu_ods.ods_10000251_all_view` 的尝试 **0→18**。增益落在 (a) 针对的用例上：相比 (d) +9，其中 7 个是事件用例（057/119/125/126/128/136/137）。6 个回退逐用例检查过：5 个是检测从未触发的 DWS 用例（3 次尝试全部 `eventView=false`，prompt 与 (d) 逐字节相同）= `passKVerdict=every` 放大了尝试级采样；1 个 (135) 是 3 次尝试中 1 次的 judge 源歧义。⚠ 一次更早的运行（`eventdef-judgeonly`, 41.0%）度量的是对事件视图**盲视的 judge**——见 GA-EVAL-EVENTDEF-PREFETCH 条目 |
| pass@3 pass^k, **real-exec** 在 prompt-fix 之后（RBI 10000251，39 EXEC） | qwen3.7-max | `rebaseline-real-exec-rbi-10000251-postpromptfix` | 2026-09-05 | **3/39 = 7.7%** real-exec；非 SQL 工具调用发出 **0% (原 16.2%)** ✓ 准则 #1 达成；准则 #2 未达成（从 12.8 跌至 7.7——假设对 real-exec 被证伪；real-exec 瓶颈是 SQL 正确性/错误值，而非非 SQL 发出——引擎 responder 不预取 `eventDef`） |
| pass@3 pass^k, **judge-only** 在 prompt-fix 之后（RBI 10000251，39 EXEC） | qwen3.7-max | `rebaseline-judge-only-rbi-10000251-postpromptfix` | 2026-09-05 | **22/39 = 56.4%** judge-only；非 SQL **0% (原 22.2%)** ✓；准则 #2 对 judge-only 达成（从 48.7 升至 56.4——judge 通过更多语义上合理但取值错误的 SQL；judge 宽松模式；二者均在 n=39 噪声 MDE~20pp 之内） |
| pass@3 pass^k, judge-only（hybrid merge，被 clean 取代） | qwen3.7-max | `rebaseline-passk-168-merged` | 2026-09-03 | 88/168 = 52.4% |
| pass@3 best-of-k, judge-only | qwen3.7-max | `exp4-arm-a` | 2026-09-02 | 148/168 = 88.1% |
| pass@1, exec+judge | qwen3.7-max | `1510b3e0`（CL-16+17） | 2026-08-31 | 129/168 = 76.8% |
| pass@3 best-of-k, judge-only | qwen-plus *（已拒绝）* | `exp2-arm-a` | 2026-09-02 | 121/168 = 72.0% |

> **2026-09-03：pass^k 语义已上线**（`runner.ts` `passKVerdict` 落地）。~~确定的 pass^k 基线是 **52.4%**~~——**2026-09-04 被 `rebaseline-passk-168-clean` = 61.9% 取代；见下一条说明。**（`rebaseline-passk-168-merged`, 88/168）——对比 best-of-k 88.1% = −35.7pp（pass^k 按设计严格更低；二者不能直接相减）。其下的 best-of-k / pass@1 行是历史性的。52.4% 那次运行被 AGA 在机器负载下的空响应突发所污染（63/168 用例），并通过以 conc=4 干净重跑这 63 例 + 合并来纠正——见 `wayfinder/data-agent/research/experiment-audit-log.md`（2026-09-03 确定条目）。

> **2026-09-04 (GA-EVAL-CLEAN-RERUN)：当前的 pass^k 基线现在是单一 uniform-clean 产物 `rebaseline-passk-168-clean` = 61.9% (104/168, conc=3, --today 20260903 pinned, 0 AGA-burst 污染)。** 以一次干净的单一产物运行取代 52.4% 的 hybrid merge（105 genuine + 63 clean rerun）。相比 52.4% 的 +9.5pp 在 n=168 双样本 MDE（~10.5pp，不显著）之内——可能是模型非确定性（pass^k 噪声）+ conc=3 比 conc=4-under-load merge 更干净的 AGA。Item-4 `config` 字段在产物上是 LIVE 的（verdict_semantics='pass^k', today, with_query, concurrency）。**executor real-exec (`--with-query`) 在 k11-v2 上不是一个可用的基线**：k11-v2 的期望 result_values 是 judge-only 语义目标（不是 real-exec 派生的；没有 `expected.sql`；k11v2_001 的 1.5M 任何合理 SQL 都达不到——覆盖表上的 SUM = 13.6B）。一个 real-exec 基线需要一个 real-exec 派生的用例集（RBI eval `eval_10000251_*` 有一个）。`--with-query` 引导 bug（凭据 seam 回归）已修复（context.ts）。见 `experiment-audit-log.md`（2026-09-04 条目）。

> **2026-09-04 (GA-EVAL-REAL-EXEC)：real-exec 基线现已建立在一个 real-exec 派生的用例集上** ——`rebaseline-real-exec-rbi-10000251` = **12.8% (5/39)** real-exec（RBI scope 10000251, 39 EXEC scalar_exact 用例, conc=3, `--today 20260806` pinned, `--with-query` + `maxc-sidecar-k11.mjs`, 0 AGA-burst, 0 infra）。judge 上限（dual-score, execution-blind）= **48.7% (19/39)**；**差距 = 35.9pp (14/39) judge 假通过**——judge 语义上通过但其实跑出来的值错误的用例（judge 的通过中 73.7% 是假通过）。**real-exec ≤ judge-only** 如预期；差距量化了该 ticket 集要度量的 judge 宽松。注意：这是一个**与 k11-v2 不同的用例集**（39 RBI EXEC 对 168 k11-v2 mixed）——12.8% 不能与 k11-v2 的 61.9% judge-only 比较，只能与同用例集的 48.7% dual-score 上限比较。较低的绝对数字反映 real-exec 严格更难（值必须匹配，不仅仅是语义）+ 34% 非 SQL 工具调用发出率（模型对基于事件的问题发出 RBI 工具调用格式 `load_event_definition`——real-exec + judge 双失败，从差距中排除）。**⚠ 更正（2026-09-04, resolution 后复审）**：dual-score 方法论无效。Nl2sqlEngine 通过执行反馈自校正 SQL——`context.ts:348` 把 `this.odps = withQuery ? CtxOdpsAdapter : StandInOdps` 接入引擎的 gen loop（`engine.ts` `run()` 在 critic_fail/RECOVERABLE 执行错误上重试）。所以 `--with-query` **改变了 SQL 生成**（real-exec 在真实 ODPS 错误上自校正；judge-only 用 `StandInOdps` 永远 `done` → 没有执行错误自校正）。48.7% 是 judge 在 real-exec 运行的**自校正后** SQL 上的结果，不是一个独立的 judge-only 上限（首次尝试 SQL）——"不需要独立的 judge-only 运行" 已撤回。证据：real-exec 产物中 117 次尝试有 11 次 `generated_sql` 为 null（6 个用例——引擎耗尽 `MAX_FEEDBACK_RETRIES`），`--with-query` 关闭时不可能。**仍然成立的**：real-exec 12.8% (5/39，在引擎最终自校正 SQL 上——有效)；**同次运行内 judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)**——judge 通过了引擎的最终 SQL 但执行值错误（同次运行内同一最终 SQL；按 SQL 的 judge 宽松，有效，不需要独立运行）。一个独立的 judge-only 基线 `rebaseline-judge-only-rbi-10000251`（`--with-query` 关闭）正在运行以求真实上限；跨运行差距带有自校正混淆（不同 SQL）。见 `experiment-audit-log.md`（2026-09-04 更正）。复现：`MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml node --import tsx/esm packages/eval/eval-cli/src/bin.ts --cases packages/eval/eval/cases/rbi-10000251-exec --output .tmp/eval-results/ --pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today 20260806 --scope-id 10000251 --with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs --run-id rebaseline-real-exec-rbi-10000251`。见 `experiment-audit-log.md`（2026-09-04 GA-EVAL-REAL-EXEC 条目）。

> **2026-09-05 (GA-EVAL-SQLGEN-PROMPT-FIX)：prompt 修复落地**——`packages/data/nl2sql-engine/src/prompt.ts` `BuildPromptArgs.contextPrefetched` 标志（默认 false = 逐字节相同；true = 引擎 responder 预取上下文 prompt，丢弃可调用 `# 工具集` 目录）。Additive——harness responder（`--responder harness`，使用 preset phase-gate，不是 `Nl2sqlEngine`）不受影响；补充 CL-23 的 `looksLikeToolCall`。重新基线：**非 SQL 工具调用发出在两种模式下都被消除**（real-exec 16.2%→0%, judge-only 22.2%→0%——准则 #1 达成）。**通过率分化**：judge-only **从 48.7% 升至 56.4%**（准则 #2 达成——judge 通过了模型现在生成的更多语义上合理的 SQL，而不是工具调用）而 real-exec **从 12.8% 跌至 7.7%**（准则 #2 未达成——生成的 SQL 对事件用例执行出错误值：模型不知道确切的事件表 `ieu_ods.ods_10000251_all_view`，生成错误的表/占位符；+2 回退 041/046；0 新通过）。ticket 的假设（非 SQL 发出在拖低 real-exec）对 real-exec **被证伪**——真实瓶颈是 SQL 正确性/错误值，不是非 SQL 发出（引擎 responder 不预取 `eventDef` → `# 事件定义` 对事件问题渲染 `（未加载）` → 模型缺少事件 schema）。两个变化都在 n=39 噪声内（MDE~20pp）但定性模式（judge-only 上升, real-exec 下降, 0 非 SQL）确认了 judge 宽松机制。见 `experiment-audit-log.md`（2026-09-05 GA-EVAL-SQLGEN-PROMPT-FIX 条目）。

**`76.8% → 88.1%` 是协议 + 代码 delta，不是模型 delta。** 两行都是 qwen3.7-max——自 2026-08-30 以来它是每次记录运行的既成模型（它曾是 CLI 的静默默认，被 CL-8 移除）。模型比较是 `exp4-arm-a` 对 `exp2-arm-a` 在恒定代码、协议和日期下：**+16.1%**，在全部 8 个意图、4 个复杂度级别和 4 个类别上零回退。

按类别，对当前 pass^k 基线（`rebaseline-passk-168-clean`, 2026-09-04；括号内为先前的 merge）：

| Category | Cases | Pass | Rate | (prior merge) |
|---|---|---|---|---|
| Original | 80 | 54 | 67.5% | (48/60.0%) |
| Alias | 40 | 20 | 50.0% | (16/40.0%) |
| Voice EXEC | 30 | 19 | 63.3% | (14/46.7%) |
| Voice DELIVERY | 18 | 11 | 61.1% | (10/55.6%) |
| **Total** | **168** | **104** | **61.9%** | (88/52.4%) |

> best-of-k 历史 per-category（`exp4-arm-a`）：Original 86.3% / Alias 87.5% / Voice EXEC 93.3% / Voice DELIVERY 88.9% = 88.1%。pass^k 按 per-category 严格更低（all-3-must-pass 对 any-of-3）。对 qwen-plus 模型比较的 +16.1pp 仍然成立（语义变化对两臂同等影响）。

更早的基线：`10320fe2`（CL-11~14）——124/168 = 73.8% @ pass@1。

完整分析，包括 per-intent/per-complexity 分解和延迟权衡（+48.9% 每用例均值）：`wayfinder/data-agent/research/model1-baseline-analysis.md`。

> **注意——`judge-only` 行。** 那些运行没有附加 SQL 执行器（每次尝试的 `query_result` 为 null），所以对 EXEC 用例，`execution_match` 来自 SQL judge 的*语义*评估，而非真实查询结果。把 judge-only 数字当作**上限**：judge 能通过语义上合理但会返回错误数字的 SQL。judge 的通过率目前未度量。
>
> 25 个 DELIVERY 用例按设计不带 `sql_judge` 判决——它们有 `result_value: null` 和 `match_mode: null`，所以 `runner.ts:242` 完全跳过执行块，`executionMatch` 保持其初始化值 `true`（`runner.ts:241`）；这些用例仅由 `delivery_match` 评分。（本说明的一个更早版本声称那 75 次尝试被一条宽松判决规则"计为通过"——那是错的，并且对不可验证执行的 `executionMatch = false` 加固对这些运行中的**零**次尝试有影响，因为 sql-judge 默认启用。）
>
> **为什么 `--with-query` 在 k11-v2 上不是即插即用。** `expected.result_value` 从来不是从执行 SQL 派生的——没有用例带 `expected.sql`，且 P11e 在仅重写问题措辞时明确*保留*了从 pre-P11e 用例集继承的期望值，所以其出处不可恢复。57 个 `scalar_exact` 目标中有 34 个是手挑的整数（`1500000`, `2800`, `120000`, `5200`, `35000`, `0.15`），而 `k11v2_001` 的 1.5M 与覆盖表实际 SUM（13.6B）差约 4 个数量级。在真实执行器下，无论 SQL 正确与否，这 57 个用例都会失败。86 个 `row_count_range` 用例是结构性断言（`[1,3]`, `[5,7]`, `[25,30]`）且大致会存活。注意对配对 A/B 实验的副作用：统一失败的用例贡献**零不一致对**，所以在此启用执行器是用统计功效换取验证严谨性。见 `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md`。

### 质量目标

| Metric | Current (pass@3 pass^k) | Short-term | Mid-term | Long-term |
|---|---|---|---|---|
| Overall | **61.9%** (`rebaseline-passk-168-clean`) | 60%+ | 70%+ | 85%+ |
| Original | 67.5% (`rebaseline-passk-168-clean`) | 65%+ | 75%+ | 88%+ |

> 目标值在 **pass^k 语义下提出**（2026-09-03），待 PM 签字。理由：pass^k 按设计比 best-of-k 低约 21–36pp（all-3-must-pass 对 any-of-3），所以目标相对于 52.4% 的 pass^k 现状设定得有雄心——镜像旧 best-of-k 目标的雄心（75/80/90 → 60/70/85 pass^k）。长期 85%+ 在更严格的语义下接近 best-of-k 的 88.1%（= 真正的高一致性）。旧的 best-of-k 时代目标（Overall 75/80/90, Original 78/85/90）被取代。

> **pass^k 现已 LIVE**（`runner.ts` `passKVerdict` 2026-09-03 落地）。当前基线是 **61.9%** pass^k（`rebaseline-passk-168-clean`, 2026-09-04；更早的 52.4% hybrid merge 被取代）（对 best-of-k 88.1% = −35.7pp，按设计）。上面的目标已**在 pass^k 语义下重设（提议，待 PM 签字）**——GA-EVAL-REBASELINE item 3。回放估计约为 47.6%；live 确定的 52.4% 在 n=168 MDE（≈5.4–10.1pp）之内。见 `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md`。

### 类别定义

- **Original**：80 个核心 K11 业务问题（指标查找、聚合、过滤）
- **Alias**：40 个使用业务术语别名的用例（测试检索增强质量）
- **Voice EXEC**：30 个期望 SQL 执行结果的语音风格问题（scalar_exact / row_count_range）
- **Voice DELIVERY**：18 个正确响应是澄清或拒绝的用例（llm_judge 评分）

## 用法

### 运行 eval（标准，启用 sql-judge）

responder LLM **没有默认值**——provider 和 model 必须显式给出（CL-8 移除了静默的 `aga`/`qwen3.7-max` fallback，以防实验结果被错误归因到一个未记录的模型）。当二者之一缺失时 CLI 大声失败并报 `eval-cli: no responder provider/model configured`。

**`qwen3.7-max` 是推荐模型**（GA-MODEL1）：在恒定协议下比 `qwen-plus` 高 +16.1%，在任何 intent/complexity/category 切片上无回退。代价是每用例约 +49% 延迟。

```bash
# The API key is read from ~/.dsh/.credentials.yaml (the credential seam),
# NOT from process.env — see Environment below.
EVAL_LLM_PROVIDER=aga EVAL_LLM_MODEL=qwen3.7-max \
node --import tsx/esm packages/eval/eval-cli/src/bin.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 3 --concurrency 3 --skip-health-gate
```

> **运维须知——负载下的并发（2026-09-03 学到）**：在机器负载下（并发 IDE / `pnpm dsh web` / 其他重型 node 进程），`--concurrency 4` 会触发 **AGA 空响应突发**——AGA endpoint 返回空流，使受影响用例的 pass^k 失败。一次 168 用例的 conc=4 运行以此方式丢失了 63/168 用例（原始 33.9% 对比纠正后的 52.4%）。**对完整运行优先用 `--concurrency 2` 或 `3`**，或确保机器无负载（暂停 `pnpm dsh web`）。`--concurrency 1` 最干净但不可行（168 用例约 16h）。见 `wayfinder/data-agent/research/experiment-audit-log.md`（2026-09-03 条目）。

精确复现当前 pass^k 基线：`--run-id rebaseline-passk-168-clean --today 20260903`（conc=3；--today pinned 以匹配先前协议——见 audit-log 2026-09-04）。

### 比较两次运行

```bash
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B>
```

输出类别级通过率 delta 和用例级翻转（gained/lost）。Run ID 可以是前缀（例如 `9788424c` 匹配 `9788424c-a167-4a19-9c72-e27ae7455f58`）。

### CLI 选项

| Flag | 默认 | 说明 |
|---|---|---|
| `--cases <dir>` | *(必填)* | 用例目录 |
| `--provider <name>` | *(必填)* | responder + SQL judge 的 LLM provider（env: `EVAL_LLM_PROVIDER`，无默认） |
| `--model <name>` | *(必填)* | responder + SQL judge 的 LLM 模型（env: `EVAL_LLM_MODEL`，无默认） |
| `--schema <dir>` | `examples/k11-semantic-layer/` | 语义层定义 |
| `--output <dir>` | `eval-results/` | 结果 JSON 的输出目录 |
| `--pass-k <n>` | 3 | 每用例的 pass@K 尝试 |
| `--case <id>` | — | 运行单个用例 |
| `--concurrency <n>` | 1 | 并行用例执行 |
| `--run-id <id>` | *(自动 UUID)* | 显式 run ID |
| `--today <YYYYMMDD>` | *(系统日期)* | 用于时间参数提取的参考日期 |
| `--no-sql-judge` | *(关)* | 禁用 SQL 语义 judge（不推荐） |
| `--skip-health-gate` | *(关)* | 跳过 health gate 预检 |
| `--with-query` | *(关)* | 挂载 query-maxcompute 以执行真实 SQL（需要 `--sidecar maxc-sidecar-k11.mjs` + `MAXC_CONFIG`；见环境变量） |
| `--responder <mode>` | `engine` | `engine`（NL2SQL 流水线）或 `harness`（完整 agent） |
| `--variant <A\|B\|C\|D>` | — | G1b 实验 variant（随 `--responder harness` 时必填） |

运行 `--help` 获取完整 flag 列表（`--sidecar`, `--scope-id`, `--no-query-expansion`）。

### 环境变量

| Variable | 必填 | 说明 |
|---|---|---|
| `DASHSCOPE_API_KEY` | 是 | 必须位于 `~/.dsh/.credentials.yaml`（文件权限 0600），**不是** `process.env`——`llm-dashscope` 每次请求通过 `ctx.credentials` 解析（内网安全优先）。CLI 预检该文件，若密钥缺失则退出。 |
| `EVAL_LLM_PROVIDER` | 是 | responder + SQL judge provider。无静默 vendor fallback——未设置时 fail-loud。被 `--provider` 覆盖。 |
| `EVAL_LLM_MODEL` | 是 | responder + SQL judge 模型。无静默 vendor fallback——未设置时 fail-loud。被 `--model` 覆盖。 |
| `MAXC_CONFIG` | 随 `--with-query` | maxc config yaml 路径（例如 `~/.maxc/config_ieu_cdm.yaml`——K11 在 `ieu_cdm` 项目中）。**必填**：默认的 `~/.maxc/config.yaml` 是海外（hdyl_data_sg_dev）。还需传 `--sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs`（默认的 `standin-sidecar.mjs` 是 mock；`maxc-sidecar-k11.mjs` → 真实 `maxc` CLI）。需要 PATH 上有 `maxc` CLI。 |
| `EXP2_ARM` | 否 | prompt 语言实验 arm（`B` = 全英文结构化 prompt，`E` = 英文 judge）。留空以使用标准中文 prompt。 |

## 记录结果

结果 JSON 记录 `run_id`、`timestamp`、`summary`、按用例的判决，以及——自 2026-09-03（GA-EVAL-REBASELINE item 4）起——一个 **`config` 字段**（`provider`/`model`/`pass_k`/`concurrency`/`sql_judge`/`verdict_semantics`/`responder`/`scope_id`/`today`/`query_expansion`/`with_query`/`skip_health_gate`），使一次运行的协议+语义可从产物本身检测。**token 用量尚未记录**（后续——需要一个 LLM-stream 拦截器；见 GA-EVAL-REBASELINE）。在 audit log 中记录仍是强制的——`config` 捕获协议，但 audit log 捕获叙述 + 污染/纠正历史。（`config` 字段由 GA-EVAL-REBASELINE item 4 添加。）

每次 eval 运行后，使用以下模板在 `wayfinder/data-agent/research/experiment-audit-log.md` 中记录结果：

```markdown

## YYYY-MM-DD: <ticket/change description>

### Setup

- **基线**: Run `<baseline_run_id>`
- **Cases**: <count> K11 cases
- **Model**: <provider>/<model>, <responder mode>, pass_k=<n>, concurrency=<n>, sql-judge enabled
- **变更**: <what changed>

### Data (verbatim)

<paste compare.ts output or manual category table>

### Verdict

<numbered analysis of results>

### Ticket Pointer

Resolves: [<ticket>](link)
```

## 模型经验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM adapter。

#### KV Cache 效果

eval 运行的 LLM 调用在一条独立的调用路径上执行，不会延长或失效 agent loop 的可复用请求前缀。

## 已知限制与延期工作

- eval 产物被 gitignore 且短暂——对消失基线的 `compare.ts` 当前无法执行（见 2026-09-06 说明）。
- judge-only 数字是上限：judge 宽松在同次运行内差距上度量得 35.9pp。
- token 用量尚未被 runner 记录。
