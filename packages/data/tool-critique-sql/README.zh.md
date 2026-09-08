# `@deepseek-ai/dsh-tool-critique-sql`

[English](README.md) | 中文

面向模型的 `critique_sql_tool`：**折叠正则 SQL critic（sqlSyntaxGate），基于 phase-gate 的 per-agent critic 上下文**，用于 data agent（智能体）的 `GENERATION` 阶段。agent 在调用 `query_data` 之前先调用它来评审一条 SQL 候选（表须在候选列表中 / 须带 ds 分区 / 禁止 SELECT * / event_params 字段经 GET_JSON_OBJECT 取值）。

本工具是 **(b) 根因修复** —— 它使 F2（同源门禁）可满足：工具返回 `{ confidence, findings, sql }`，其中 `sql` 为归一化后的评审 SQL。phase-gate 的 `captureToolData` 从 `confidence` 捕获 `last_critique`，并从 `sql` 捕获 `last_sql`。因此当模型对修正后的 SQL 再次评审（在 `TABLE_NOT_FOUND` 之后）时，`last_sql` 随之更新 → F2 放行修正后的 SQL → 执行 → 取得行。

它的注册形态（`defineTool` + `ctx.tools.register`）镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)，与 [`@deepseek-ai/dsh-tools`](../../core/tools) 对齐。

## 状态：已注册且可调用

该工具由 data-agent preset 注册（`tool-critique-sql` 行，已取消注释）并列入 phase-gate 的 `GENERATION` 白名单。它探测 `ctx.get('criticCtx')`：当 phase-gate 已挂载时返回 per-agent 的 `CriticCtx`（候选表、事件参数、分区列，从 `search_data_sources` / `load_*` 采集）；当未挂载 phase-gate（单元测试、未带该服务的 profile）时退回空集——由于没有候选表，critic 会把每个被引用的表标记为 `table_not_in_candidates`，于是置信度跌破 0.6 底线，评审阻断 `GENERATION`（fail-closed 而非 fail-open；预期的 fail-open 直通推迟实现，见已知局限）。

Phase 1：工具调用既有 nl2sql-engine 的 `critiqueSql`（折叠正则 critic）+ `extractSqlCandidate`，并返回由发现项派生的置信度（每条 error 计 -0.5，每条 warning 计 -0.15；门禁底线为 0.6）。完整的 3 层 critic（sqlglot AST + JSON-path + registry）是后续 Phase 2 的改进项。

## criticCtx 注入设计

critic 守卫上下文（`{candidateTables, eventParams, partitionCols}`）是 phase-gate 从 `search_data_sources` / `load_*` 采集（`captureToolData`）的 per-agent 状态。本工具通过 `ctx.get('criticCtx')` 读取它——即 phase-gate 注册（`packages/data/phase-gate`）的 `CriticCtxService`。§2.3（消费方）：工具定义一个结构性 `CriticCtxProvider` 接口 + 探测 `ctx.get`（软探测——未挂载 phase-gate 时为 `undefined`），从不导入 phase-gate Provider 包。Cordis 的 `Service[symbols.filter]` 检查对非隔离名称通过（`criticCtx` 不在 isolate map 中，故注册方的 isolate-realm ctx 与查询方的 parent-realm ctx 都解析为 `undefined` → `undefined === undefined` → 可见）。

## 注册形态

```ts ignore-check
export const name = 'tool-critique-sql'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'critique_sql_tool',
    description: '...',
    parameters: { sql: { type: 'string', required: true, ... }, question: { ... } },
    output: { schema: { ... }, render: (_args, value) => [...] },
    async execute(args, exec) {
      const provider = ctx.get('criticCtx') as CriticCtxProvider | undefined
      const agentId = exec.agent !== undefined ? String(exec.agent.id) : undefined
      const criticCtx = provider !== undefined && agentId !== undefined
        ? (provider.forAgent(agentId) ?? EMPTY_CRITIC_CTX)
        : EMPTY_CRITIC_CTX
      return critiqueSqlResult(args.sql, criticCtx)
    },
  }))
}
```

## 配置

无可调项。critic 守卫上下文由 phase-gate 的 per-agent 状态（`criticCtx` 服务）持有，而非本工具。

## 验证

```sh
tsc -b packages/data/tool-critique-sql/tsconfig.json
pnpm vitest run packages/data/tool-critique-sql
pnpm verify-cordis-config
```

## 模型体验

间接经由 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 效应

本包的贡献对可复用的请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知局限与推迟工作

- **无 grounding 路径阻断（fail-closed），而非 fail-open** —— 当未挂载 phase-gate 或 agent 没有采集到的 critic 状态时，工具退回空候选表；表规则随即把每个被引用的表标记为 `table_not_in_candidates`，使置信度跌破 0.6 底线并阻断 `GENERATION`。预期的 fail-open 直通（在守卫数据为空时跳过 table/partition/json 规则并返回通过裁决）推迟到后续阶段实现。将工具挂载在 phase-gating isolate group 内（使 `ctx.get('criticCtx')` 解析到 per-agent 状态）是受支持的配置；尚无真实入口路径测试覆盖该 isolate 解析。
- **仅 Phase 1 折叠正则 critic** —— 工具调用既有 nl2sql-engine 的 `critiqueSql`（折叠正则 `sqlSyntaxGate`）；完整的 3 层 critic（sqlglot AST + JSON-path + registry）是后续 Phase 2 的改进项。
