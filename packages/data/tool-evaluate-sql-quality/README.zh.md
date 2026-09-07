# `@deepseek-ai/dsh-tool-evaluate-sql-quality`

[English](README.md) | 中文

面向模型的 `evaluate_sql_quality`：**基于 folded-regex critic 的发现 + 基础启发式规则给出 0-100 的 SQL 质量分数**，用于 data agent 的 `GENERATION` 阶段。agent 在调用 `critique_sql_tool` 的同时调用本工具为一条 SQL 候选打分。phase-gate 的 `captureToolData` 从返回的 `score` 中捕获 `last_quality`；GENERATION gate（P-DA2，在 `critic_tools_registered` 时再次收紧）要求 `last_quality >= 60`（`PipelineConfig.quality_score_floor`）才能进入 EXECUTION。

这是 **(b) 根因修复**，与 `critique_sql_tool` 配对：模型在 `query_data` 之前对自己的 SQL 调用这两个工具；在 `TABLE_NOT_FOUND` 之后，修正 SQL + 重新调用 `critique_sql_tool`（重新 critique → `last_sql` 更新 → F2 通过）+ 重新调用 `evaluate_sql_quality`（→ `last_quality` 更新）。

它在注册形态和 `criticCtx` 注入设计（结构性的 `CriticCtxProvider` 接口 + `ctx.get('criticCtx')` 软探测）上与 [`@deepseek-ai/dsh-tool-critique-sql`](../tool-critique-sql) 保持一致。

## 状态：已注册 + 可调用

该工具由 data-agent preset 注册（`tool-evaluate-sql-quality` 行，已取消注释），并在 phase-gate 的 `GENERATION` 白名单中具名。它探测 `ctx.get('criticCtx')`，即 phase-gate 注册的同一个 `CriticCtxService`。

Phase 1：分数来自 folded-regex critic 的发现（`critiqueSql`）：每条 error 扣 30 分，每条 warning 扣 5 分，截断到 [0, 100]。一条干净的 SQL 得 100 分；1 条 error 得 70 分（高于 60 分下限）；2 条 error 得 35 分（低于下限）。完整的 rbi 100 分规则推导表是后续 Phase 2 的改进。

## 配置

无需配置项。critic 守卫上下文由 phase-gate 的 per-agent 状态（`criticCtx` service）所有，而非本工具。

## 验证

```sh
tsc -b packages/data/tool-evaluate-sql-quality/tsconfig.json
pnpm vitest run packages/data/tool-evaluate-sql-quality
pnpm verify-cordis-config
```

## 模型体验

通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM adapter 间接体现。

#### KV Cache 影响

本包的贡献以仅追加方式写入可复用请求前缀，不会使既有缓存条目失效。

## 已知限制与延后工作

- **Phase 1 分数仅来自 folded-regex 的发现**：分数来自 folded-regex critic（`critiqueSql`）+ 基础启发式规则（必须存在 SELECT）。完整的 rbi 100 分规则推导表是后续 Phase 2 的改进；Phase 1 先解除 gate 分数下限的阻塞。
- **无依据时 fail-closed（未决的约定决策）**：当 `ctx.get('criticCtx')` 为 undefined（phase-gate 未挂载）或 `forAgent` 返回 undefined（agent 尚无采集到的状态）时，使用 `EMPTY_CRITIC_CTX` 兜底（空候选表）。候选表为空时 critic 的表规则对每个 FROM 表都报错，因此一条正常 SQL 得分为 0 并阻塞该路径，这与最初文档所述的「fail-open」行为相反。预期约定（fail-open 透传 vs. fail-closed 强制）未决；真正的 fail-open 修复（在没有守卫数据时跳过表/分区/json 规则的透传判定）被推迟。保守的 Phase 1 按现状发布该行为并在此记录。这与 `@deepseek-ai/dsh-tool-critique-sql` 中同样的未决决策一致。
