# dsh-data-agent 深度代码审计报告 — 2026-08-23

> 方法：6 维度并行深度 review（correctness / security / architecture / resilience / contracts / coverage）→ 逐 finding 对抗性验证（skeptical refutation）→ 交叉合成。
> 规模：55 agents, 2040 tool uses, ~59min, ~2.5M tokens。
> 结果：48 findings → **22 confirmed**, 26 refuted as false-positive。

---

## Executive Summary

phase-gate 与 query-tool 之间存在一个 **critical** 级字段名/词汇表不匹配 bug（`.outcome` vs `.state`，`'done'` vs `'completed'`），导致所有查询执行——包括失败和轮询中的——被静默视为成功并推进到 INTERPRETATION 阶段。此外存在若干 medium 级安全/健壮性问题（error body null 解析、poll 循环无重试、critic 多语句校验逻辑缺陷）。整体架构 additive-only 原则保持良好，Cordis 生命周期使用正确，但生产加固（guard chain、orphan reaper、cache 并发）仍为已知 deferred 项。

---

## Confirmed Findings — Critical & High

### CORR-1 [CRITICAL] — phase-gate 读取不存在的 `.outcome` 字段，静默将所有查询视为成功

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/phase-gate/src/phase-gate.ts:377` |
| **影响** | 所有 query_data 执行结果（含 failed/pending）被默认为 `'done'` → 永远 advance 到 INTERPRETATION |
| **根因** | phase-gate `captureToolData` 读 `value.outcome`，但 query-tool 返回 `{ state: 'completed'|'pending'|'failed' }`。字段名不匹配 + 值词汇表不匹配（`done/running/failed` vs `completed/pending/failed`）|
| **验证置信度** | HIGH — adversarial agent 确认无中间件转换 tool 返回值 |

**修复建议**：
```typescript
const state = (value as { state?: string })?.state
s.last_query_outcome = state === 'completed' ? 'done'
  : state === 'pending' ? 'running'
  : state === 'failed' ? 'failed'
  : 'done'
```

**测试也有此 bug**：phase-gate 测试直接 mock `{ outcome: 'done' }` 对齐了错误代码而非真实 tool 输出。

---

## Confirmed Findings — Medium

### CORR-4 [LOW adjusted, originally MEDIUM] — pollToSettlement 无重试，单次网络抖动杀死整个查询

| 属性 | 值 |
|---|---|
| **文件** | `packages/query/query-tool/src/index.ts:173` |
| **影响** | 轮询期间任何一次 `getProgress()` 网络错误 → 整个查询中止 + ODPS instance 孤立（无 cancel） |
| **缓解** | dsh-tools 框架 catch → 结构化 `isError:true` tool result（非进程崩溃）；RetryGuard/OrphanReaper 为已知 deferred A1-split |

### CORR-5 [MEDIUM] — hasPartitionFilter 对多语句 SQL 只检查第一条

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/nl2sql-engine/src/critic.ts:130` |
| **影响** | 多语句 SQL 中只要任一条有分区过滤，整体返回 `true`，遗漏无分区全表扫描的后续语句 |
| **缓解** | 当前 MaxCompute 实践为单语句执行，多语句场景稀少；但 critic 作为安全网应覆盖 |

### SEC-1 [MEDIUM] — llm-dashscope `parseErrorBody` 对 null body 的 JSON.parse 抛 TypeError

| 属性 | 值 |
|---|---|
| **文件** | `packages/llm/llm-dashscope/src/index.ts` (parseErrorBody/requestIdOf) |
| **影响** | 当 AGA 返回无 body 的错误响应时，`JSON.parse(null)` → TypeError → 被 `stream()` catch 误判为 TRANSPORT 错误（非 API 错误）|
| **修复** | 加 `typeof v === 'object' && v !== null` 守卫或 `parsed?.request_id` |

### RES-1 [MEDIUM] — stall watchdog timer 未在 agent dispose 时清理

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/phase-gate/src/phase-gate.ts` (stall watchdog) |
| **影响** | 若 agent session 被外部 dispose 且 watchdog timer 仍在跑，timer fire 时访问已清理的 state → 潜在 NPE |
| **缓解** | Cordis ctx.on dispose 应自动清理，但需验证 setTimeout 是否被 scope 管理 |

### RES-2 [MEDIUM] — semantic-layer enrichment 失败时 corpus 可能处于半更新状态

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/semantic-layer/src/enrichment.ts` |
| **影响** | LLM enrichment 批量处理中途失败 → 部分 event 已 enriched、部分未 → corpus 状态不一致 |
| **缓解** | cache invalidation counter (D2f) 会在下次加载时触发 rebuild，但当前 session 内可能用到半成品 |

### ARCH-1 [MEDIUM] — preset-autojoin `agent/created` hook 与 agent 初始化的竞态

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/preset-autojoin/src/index.ts` |
| **影响** | `agent/created` 事件触发时 preset join，但 agent 可能尚未完成 installModelSelection → join 的 persona/tools 可能被后续 agent setup 覆盖 |
| **缓解** | Cordis serial event dispatch 保证顺序，但需验证 dsh-agent-presets join 是否在 agent publish 之前完成 |

### COV-1 [MEDIUM] — phase-gate 测试未覆盖真实 query_data tool 返回值格式

| 属性 | 值 |
|---|---|
| **文件** | `packages/data/phase-gate/tests/phase-gate.spec.ts` |
| **影响** | 测试 mock 对齐了 buggy code（`{ outcome: 'done' }`）而非真实 tool 返回（`{ state: 'completed' }`），CORR-1 因此未被捕获 |

---

## Confirmed Findings — Low (Summary)

| ID | Title | File | Note |
|---|---|---|---|
| CORR-2 | budget counter 不区分 user-turn vs agent-turn | phase-gate.ts | 已知 harness 缺 question-start seam（P7b deferred） |
| CORR-3 | critic regex 对 CTE/subquery 中的 SELECT 误匹配 | critic.ts | 正则 critic 的固有局限，非 sqlglot |
| SEC-2 | audit SQLite path 未验证目录存在 | store.ts | 首次写入时若目录不存在可能静默失败 |
| RES-3 | maxc sidecar spawn 无 restart-on-crash | query-maxcompute index.ts | deferred A1-split |
| RES-4 | 无 connection pool/keepalive 管理 | llm-dashscope index.ts | AGA SDK 内部管理 |
| CON-1 | QueryEngine abstract 未强制子类实现 getProgress | query/src/index.ts | TS abstract 已约束 |
| CON-2 | SemanticLayer YAML schema 无 runtime validation | io.ts | Schemastery mount-time 校验兜底 |
| COV-2 | 无并发 agent 测试 | phase-gate tests | per-agent state keyed 隔离 |
| COV-3 | enrichment 测试未覆盖 LLM 超时/partial | enrichment tests | llm-wiring-integration 覆盖 happy path |

---

## Cross-Cutting Patterns

1. **Producer-Consumer 词汇表不对齐**：CORR-1 暴露的 `.outcome`/`.state` + `'done'`/`'completed'` 不匹配是最严重实例。query 子系统用一套词汇，phase-gate 用另一套，无共享 enum/type 桥接。
2. **正则 critic 的固有天花板**：CORR-5、CORR-3 都源于用正则解析 SQL 的局限。已知 sqlglot 被 deferred，但正则 critic 越加越多验证逻辑时边界 case 会指数增长。
3. **Deferred 加固项聚集**：RetryGuard/OrphanReaper/stall-dispose/CostGuard 全部 deferred to A1-split，当前原型在 happy path 工作良好但对网络/LLM 故障的抵抗力弱。
4. **测试与实现 co-drift**：测试 mock 对齐实现代码的接口假设（而非消费端的真实输出），导致契约 bug 无法被测试捕获。

---

## Top 5 Prioritized Actions

| # | Action | Severity | Effort |
|---|---|---|---|
| 1 | **修 CORR-1**：phase-gate `captureToolData` 读 `.state` + 词汇映射 | CRITICAL | 15 min |
| 2 | **修 COV-1**：phase-gate 测试用真实 `QueryDataResult` 形状 mock | MEDIUM | 30 min |
| 3 | **修 SEC-1**：llm-dashscope `parseErrorBody` null 守卫 | MEDIUM | 10 min |
| 4 | **评估 CORR-5**：决定是否在 extractSqlCandidate 层拒绝多语句或修 hasPartitionFilter | MEDIUM | 1 hr |
| 5 | **引入共享 QueryOutcome enum**：在 `packages/query/query/src/types.ts` 定义，phase-gate + query-tool 共用 | DESIGN | 1 hr |

---

## 审计元数据

- 审计日期：2026-08-23
- 方法：automated 6-dimension parallel review + adversarial refutation workflow
- 覆盖范围：packages/data/*, packages/query/*, packages/llm/llm-dashscope, packages/embedder/*, packages/retrieval/*, bundle/data-agent, agent-presets/data-agent
- 工具：55 Claude subagents, 2040 tool calls, 2.49M tokens
- 发现分布：Correctness 5, Security 4, Architecture 4, Resilience 4, Contracts 3, Coverage 4 (confirmed subset)
