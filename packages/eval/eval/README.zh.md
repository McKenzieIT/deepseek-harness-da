# @deepseek-ai/dsh-eval

[English](README.md) | 中文

Data-agent eval harness：da-fresh TypeScript 镜像 `reverse-bi` 的 `rbi-eval` 编排 **设计**（非其 Python 代码）— `MultiTurnSession`（固定脚本多轮状态机）+ pass_k（`run_multi_turn_case`，必须每次尝试通过）+ da (ii) 评分（**DELIVERY** 最终答案比对 + **EXECUTION** 结果集比对经 5 种 `match_mode`，无 sqlglot）基于 **注入的** 协作者。

**纯库**：不在 Cordis context 上注册任何内容，其协作者 — `Responder`（封装 `DeepSeekHarness.run()`）、`CaseSqlExecutor`（封装 `ctx.query.execute`）、`JudgeProvider`（封装 `llm-dashscope`/`ctx.llm`）— **注入**（D9：evaluator 从不构造被测 agent；host 拥有运行时生命周期，包括 wall-clock timeout 时的 close/respawn）。零 seam peerDependencies：库既不导入 `dsh-sdk-client`、`dsh-query`、`dsh-llm`，也不导入 `cordis`；它定义最小结构化"视图"接口（`RunResultView`、`QueryOutcomeView`），真实运行时形状满足这些接口。

## API

- **`runMultiTurnCase(case_, { runId, responder, passK?, executeSql?, provider?, deliveryOpts?, timeoutMs?, onTimeout? })`** — 驱动一个 case `pass_k` 次 + 应用 pass_k（verdict 是第一个未通过尝试的，非最后一个 — anti-flakiness）。
- **`driveSession(case_, { runId, responder, attempt?, … })`** — 一次脚本化对话；agent 失败不抛异常（`AuthenticationAbort` 传播 — 整个 run 结束）。
- **`submitTurn(session, replyText, { generatedSql, executeSql, provider, deliveryOpts })`** — 执行回复中的 SQL + 将 turn 交给 session；环境故障（基础设施/超时/耐心）时 session 不推进（该 turn 为 unjudged，不评分）。
- **`scoreDa(case_, { generatedSql, executionResult, finalResponse, provider, deliveryOpts? })`** — da (ii) 评分（DELIVERY + EXECUTION，无 sqlglot）。
- **`MultiTurnSession`** — 状态机（`nextInput()` / `submitResponse()`）。
- **`buildAgentResponder(harness)` / `extractReply(runResult)` / `validateRunResult(runResult)`** — `DeepSeekHarness` → `Responder` 适配器（H1 缓解：断言每个 run interval 恰好一条 `assistant/message`）。
- **`classifyExecutionFailure(error)` / `mapQueryOutcome(outcome)`** — 环境故障分类（镜像 rbi `l1.classify_execution_failure`）+ `QueryOutcome` → `ExecutionResult` 映射（pending → `patience` refuse）。
- **`judgeWithProvider(provider, prompt, opts?)` / `classifyError(err)`** — DELIVERY LLM-judge 含 retry/backoff（SPEC §5.5）+ `AuthenticationAbort`。
- **`checkResultMatch(expected, actualRows, matchMode)`** — 5 种 EXECUTION 匹配模式（1:1 rbi 镜像）。
- **`turnMatchesExpectation(actual, expected)`**（derailment，rbi `≥0.35`）/ **`deliveryFuzzyMatch(actual, expected, opts?)`**（DELIVERY；短 expected → token-containment — 强化 `gameX` vs `gameA` 误报）。
- **`EvalCaseSchema` / `loadCase(path)` / `loadCases(paths)`** — da-fresh case schema（zod）+ YAML/JSON loader。

## 确定性

`@deepseek-ai/dsh-llm-replay`（运行时 `cordis.yml` 插件，`DSH_SNAPSHOT_FILE` env）冻结 **agent** LLM — 被测系统 — 使 agent 的响应比特可复现。**judge** 是独立的 eval 侧 LLM 调用（`JudgeProvider`，连线到 `llm-dashscope`/`ctx.llm`），不受 agent replay 覆盖。按 P11b 决策 1，judge **接受方差**（temp 0 + `JUDGE_MAX_RETRIES=2` + exponential backoff）；完全比特可复现的 judge（独立 judge snapshot）延期。`pass_k=3` 是 anti-flakiness 机制；回归模式（agent 被 replay）下 judge 方差可能混淆 judge/agent 的不稳定性 — 已记录的已知权衡。

## Host 连线（本库不拥有的 seams）

Host 连线真实协作者并注入：

- **Agent** — `new DeepSeekHarness({ launch: { command, args, env: { DSH_SNAPSHOT_FILE: '…', …scrubbedParentEnv() } }, … })`；`responder = buildAgentResponder({ run: (msg, sid) => harness.run(msg, { sessionId: sid }) })`。运行时 `cordis.yml` 加载 `dsh-llm-replay`。`harness.close()` / `await using` 回收子进程；`onTimeout` 执行 close+respawn。
- **Execution** — `executeSql = async (sql) => mapQueryOutcome(await ctx.query.execute({ sql, scopeId }))`（host 可 `attach`+poll 以先解析 `pending`；`mapQueryOutcome` 对未解析的 pending 健壮 → `patience` refuse）。
- **Judge** — `provider = async (prompt) => { const { stream } = await ctx.llm.stream({ provider: 'dashscope', model, messages: [judgeSystemPrompt, …] }); …parse JSON → { score, rationale } }`（host 拥有 judge prompt + JSON parsing + `llm-dashscope` route；`judgeWithProvider` 添加 retry/backoff + `classifyError` + `AuthenticationAbort`）。

## Model Experience

无 — 这是测试 harness 库；它既不组装也不发送 provider 请求。模型在 spawned runtime（agent）或 eval 侧 judge LLM 中运行，两者都由 host 连线拥有。

#### KV Cache effect

无直接影响；agent 运行时和注入的 judge LLM 拥有所有模型可见请求。

## Batch Runner + Persistence (W3 — P11c)

证据引擎(随 W3 发布)在核心之上添加批量执行、持久化与 delta 分析:

- **`runBatch(cases, { runId, responder, executeSql?, provider?, passK?, maxInfraRetries?, onCaseComplete? })`** — 顺序驱动全量 case 集。每个 case 跑 `passK` 次。基础设施故障(所有尝试 errored、非超时)重试至 `maxInfraRetries`(默认 2)——这些不计入 pass_k(属基础设施故障,非模型表现)。
- **`classifyCaseOutcome(result)`** — 将 `MultiTurnCaseResult` 映射为 `correct` | `declined` | `wrong` | `unjudged` 之一(与 evidence-query 中的 `EvalResultRecord` 对齐)。
- **`persistBatchResult(result, dir)`** — 将 `BatchResult` 写为 JSONL(每个 case 一行)。文件名编码 `{timestamp}_{runId}.jsonl`。
- **`loadRunRecords(path)` / `listRunFiles(dir)`** — 读回持久化的结果。
- **`computeDelta(runA, runB)`** — 识别两次 run 之间逐 case 的 outcome 翻转(improved / regressed / unchanged / new / removed)。
- **`passAtK(records)`** — 全部 k 次尝试都通过的 case 占比。
- **`runHealthCheck({ responder?, executeSql?, timeoutMs? })`** — 预运行闸门,在消耗 eval 预算前对连通性或凭证问题快速失败(G1 Q9)。健康检查失败则中止运行且不产生结果。

## Host wiring — complete integration pattern

```typescript
import { runBatch, runHealthCheck, persistBatchResult, buildAgentResponder, mapQueryOutcome } from '@deepseek-ai/dsh-eval'

// 1. Health gate
const health = await runHealthCheck({ responder, executeSql })
if (!health.healthy) throw new Error(`Pre-run check failed: ${health.error}`)

// 2. Run batch
const result = await runBatch(cases, {
  runId: `run-${Date.now()}`,
  responder: buildAgentResponder({ run: (msg, sid) => harness.run(msg, { sessionId: sid }) }),
  executeSql: async (sql) => mapQueryOutcome(await ctx.query.execute({ sql, scopeId })),
  provider: judgeProvider,
  passK: 3,
  onCaseComplete: (r, i, total) => console.log(`[${i+1}/${total}] ${r.caseId}: ${r.outcome}`),
})

// 3. Persist
const path = persistBatchResult(result, './eval-results')

// 4. Delta (optional)
import { loadRunRecords, computeDelta } from '@deepseek-ai/dsh-eval'
const prev = loadRunRecords(previousRunPath)
const curr = loadRunRecords(path)
const delta = computeDelta(prev, curr)
console.log(`${delta.summary.improved} improved, ${delta.summary.regressed} regressed`)
```

## Host wiring (the seams this library does not own)

## Known Limitations and Deferred Work

- **已移除 SQL-hygiene 断言** — rbi L1 的 sqlglot 绑定 `field_coverage`/`limit_reasonable`/`partition_compliant` 已移除（G2 权衡）：结果集正确但 SQL "不整洁"（SELECT *、缺 LIMIT、缺分区谓词）的 agent 通过 da (ii)。
- **Judge 方差** — judge 不比特可复现（决策 1）；完全确定性回归的独立 judge snapshot 延期。
- **Live e2e 延期** — 本库用 stub 协作者做单元测试；live e2e（真实 runtime + 真实 `dsh-llm-replay` snapshot + 真实 `ctx.query.execute` + 真实 `llm-dashscope` judge）延期（with-key，self-skip）。
