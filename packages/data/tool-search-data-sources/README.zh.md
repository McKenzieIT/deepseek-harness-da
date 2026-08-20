# `@deepseek-ai/dsh-tool-search-data-sources`

[English](README.md) | 中文

Model-facing `search_data_sources` tool：data agent `UNDERSTANDING` 阶段的 **BM25 schema-linking over semantic layer**。agent 调用它来查找哪些数据源（DWS 表 / event ODS 表）匹配自然语言问题，然后再写 SQL。

这是 **P13b 延期子项** — data-agent 工作中的第一个 model-facing tool 注册 — 因此也为之后所有 data-agent tool（`load_table_definition` / `load_event_definition` / `query_data` / `critique_sql` / `evaluate_sql_quality` / `present_*`）grounded 了 [`@deepseek-ai/dsh-tools`](../../core/tools) tool-registration API（`defineTool` + `ctx.tools.register`）。

## 状态：Q1 thin default

按 **P13b grilling Q1**，BM25 linker 是 [`@deepseek-ai/dsh-nl2sql-engine`](../nl2sql-engine) 导出的本地 `Bm25Linker` — 与 engine 使用的相同构建块。`ctx.nl2sql` 仅暴露 `getConventions`（无 retrieval 方法），因此该 tool 直接调用 `Bm25Linker`。语料库 **在 P6b `ctx.schema` substrate 发布前为空**；空语料库返回无候选，这是诚实的"可调用但未连线"状态，不是挂载错误（preset 自身注释：未注册的白名单 tool 只是不可调用）。

后续两个 additive swap 保持本 tool 契约不变：

- **P5b** 发布 `ctx.retrieval` → engine 的 `RetrievalLinker` 切换到它；本 tool 可随之调用 `ctx.retrieval` 替代本地 `Bm25Linker`。
- **P6b** 发布 `ctx.schema` → 语料库从 `ctx.schema.discover` 获取，替代空默认值。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash)（生产级 tool 示例）：

```ts ignore-check
export const name = 'tool-search-data-sources'
export const inject = ['tools']
export const Config: z<Config> = z.object({ topK: z.number().default(5) })

export function apply(ctx: Context, config: Config = {}): void {
  const linker = new Bm25Linker([]) // Q1 thin default; swap to ctx.schema.discover (P6b)
  ctx.tools.register(defineTool({
    name: 'search_data_sources',
    description: '...',
    parameters: { query: {...}, top_k: {...} },
    output: { schema: {...}, render: (_args, value) => [...] },
    async execute(args, exec) { return { candidates: searchDataSources(linker, args.query, ...) } },
  }))
}
```

注册是基于 effect 的（disposing plugin fiber 即注销 tool）；schema 自动流入 system-prompt assembly。`execute` 返回一个规范 JSON 值（`{ candidates: [...] }`）；`output.render` 将其转为 model-facing 文本。参见 [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md)。

## 配置

| 字段   | 类型     | 默认值 | 说明                                                      |
| ------ | -------- | ------ | --------------------------------------------------------- |
| `topK` | `number` | `5`    | 调用省略 `top_k` 时的默认候选数量。                       |

数据源语料库 **不是** 配置字段：当前为空 thin default，P6b 发布时切换到 `ctx.schema.discover`。

## 验证

```sh
tsc -b packages/data/tool-search-data-sources/tsconfig.json   # typecheck
pnpm vitest run packages/data/tool-search-data-sources         # spec
pnpm verify-cordis-config                                      # preset mount resolves
```

Preset 行（`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`，`tool-search-data-sources`）在本包发布后取消注释；phase-gate guard 的 `UNDERSTANDING` 白名单已命名 `search_data_sources`，注册后即可在该阶段调用。

## Model Experience

### The `search_data_sources` tool call

#### What the model sees

`search_data_sources` tool schema（name、description、`query` 和 `top_k` 参数、以及 `candidates` 输出数组）在 plugin 挂载后自动流入 system-prompt assembly，因此模型将其与 `UNDERSTANDING` 阶段白名单的其余部分一同发现。当模型调用它时，`execute` 返回一个规范 `{ candidates: [...] }` JSON 值，`output.render` 将其投影为面向模型的文本：每个排序数据源一行编号列表（`1. <id> (score <score>) - <description>`），或语料库为空时（P6b 发布前的 Q1 thin default）单行 `No matching data sources found.`。

#### Token effect

tool 结果中渲染的 `candidates` 文本是此 tool 唯一的逐调用 token 计费；`search_data_sources` schema 搭乘 system prompt 而非 turn payload。空 Q1 语料库时结果为一短行，`ctx.schema.discover`（P6b）填充语料库后结果随 `top_k`（默认 5）扩展。

#### KV Cache effect

Tool 结果仅追加：`candidates` 文本跟随可复用请求前缀，不使先前缓存条目失效。tool schema 是跨 turn 稳定 system-prompt 前缀的一部分，故注册或调用此 tool 不添加前缀抖动。

## Known Limitations and Deferred Work

- **空语料库（Q1 thin default）** — 数据源语料库在 P6b `ctx.schema` substrate 发布并连线 `ctx.schema.discover` 作为语料库来源前为空。空语料库返回无候选（诚实的"可调用但未连线"状态）。
- **P5b 向量 swap** — 本地 `Bm25Linker` 在 P5b 发布时可能被 `ctx.retrieval`（真实 embedder + 向量存储）替换；本 tool 契约不变。
- **P6b schema swap** — 语料库来源在 P6b 连线时从空默认值切换到 `ctx.schema.discover`；additive，无契约变更。
- **无 `ctx.nl2sql` retrieval 方法** — `ctx.nl2sql` 仅暴露 `getConventions`，因此本 tool 直接调用 `Bm25Linker` 而非经由 seam。
