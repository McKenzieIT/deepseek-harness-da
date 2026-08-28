# `@deepseek-ai/dsh-tool-search-data-sources`

[English](README.md) | 中文

Model-facing `search_data_sources` tool：data agent `UNDERSTANDING` 阶段的 **BM25 schema-linking over semantic layer**。agent 调用它来查找哪些数据源（DWS 表 / event ODS 表）匹配自然语言问题，然后再写 SQL。

这是 **P13b 延期子项** — data-agent 工作中的第一个 model-facing tool 注册 — 因此也为之后所有 data-agent tool（`load_table_definition` / `load_event_definition` / `query_data` / `critique_sql` / `evaluate_sql_quality` / `present_*`）grounded 了 [`@deepseek-ai/dsh-tools`](../../core/tools) tool-registration API（`defineTool` + `ctx.tools.register`）。

## 状态：soft-fallback retrieval

按 **P13b grilling Q1**，base linker 是 [`@deepseek-ai/dsh-nl2sql-engine`](../nl2sql-engine) 导出的本地 `Bm25Linker` — 与 engine 使用的相同构建块。`ctx.nl2sql` 仅暴露 `getConventions`（无 retrieval 方法），因此该 tool 直接调用 `Bm25Linker` 作为 Q1 thin default。已发布的 `execute` soft-probe 四个 additive swap 路径（均为 additive，均不改变本 tool 契约）：

- **P5b `ctx.retrieval`**（已发布）— 当 `ctx.retrieval` seam 已注册（bundle 挂载 `dsh-retrieval-inproc`）时，使用 async hybrid provider 替代 sync 本地 `Bm25Linker`。
- **D2e `ctx.schema` enriched corpus**（已发布）— 当语义层 `ctx.schema` provider 挂载时，基于 schema 语料库构建并缓存 enriched `Bm25Linker`（events 的 params_fields + terminology slang 打包进索引 description），并有 **D2f `corpusVersion()` 缓存失效** 在 session 中途写入后重建 linker，而非重启前一直 stale。
- **Graph expansion**（已发布）— `applyGraphExpansionAndJoins` 通过 `ctx.schema.getRelationGraph()` 添加 1-hop `joins`/`derived_from` 邻居并输出 join constraint 字符串，无 graph 时 soft-fallback 到原始 candidates。
- **P15a LLM query expansion**（已发布）— `expandQuery` 通过 `ctx.llm` 改写问题以提升 BM25 召回（config: `queryExpansion`/`expansionProvider`/`expansionModel`），无 LLM 挂载或任何错误时优雅降级为原始 query。

未挂载 `ctx.schema`/`ctx.retrieval` provider 时，语料库为空 Q1 thin default；空语料库返回无候选，这是诚实的"可调用但未连线"状态，不是挂载错误（preset 自身注释：未注册的白名单 tool 只是不可调用）。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash)（生产级 tool 示例）：

```ts ignore-check
export const name = 'tool-search-data-sources'
export const inject = ['tools']
export const Config: z<Config> = z.object({
  topK: z.number().default(20),
  queryExpansion: z.boolean().default(true),
  expansionProvider: z.string().default('aga'),
  expansionModel: z.string().default('qwen-flash'),
})

export function apply(ctx: Context, config: Config = {}): void {
  const linker = new Bm25Linker([]) // Q1 thin default; swapped to ctx.schema (D2e) / ctx.retrieval (P5b) when mounted
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

| 字段                | 类型      | 默认值       | 说明                                                          |
| ------------------- | --------- | ------------ | ------------------------------------------------------------- |
| `topK`              | `number`  | `20`         | 调用省略 `top_k` 时的默认候选数量（D2h: 5→20）。              |
| `queryExpansion`    | `boolean` | `true`       | 在 BM25 检索前启用 LLM 查询扩展（P15a）。                    |
| `expansionProvider` | `string`  | `aga`        | 查询扩展的 LLM provider 路由（P15a）。                       |
| `expansionModel`    | `string`  | `qwen-flash` | 查询扩展的 LLM 模型 id（P15a）。                             |

数据源语料库 **不是** 配置字段：未挂载 `ctx.schema`/`ctx.retrieval` provider 时为空 Q1 thin default，挂载时从 `ctx.schema`（D2e enriched corpus）或 `ctx.retrieval`（P5b）获取。

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

`search_data_sources` tool schema（name、description、`query` 和 `top_k` 参数、以及 `candidates` 输出数组）在 plugin 挂载后自动流入 system-prompt assembly，因此模型将其与 `UNDERSTANDING` 阶段白名单的其余部分一同发现。当模型调用它时，`execute` 返回一个规范 `{ candidates: [...] }` JSON 值，`output.render` 将其投影为面向模型的文本：每个排序数据源一行编号列表（`1. <id> (score <score>) - <description>`），或语料库为空时（未挂载 schema/retrieval provider 的 Q1 thin default）单行 `No matching data sources found.`。

#### Token effect

tool 结果中渲染的 `candidates` 文本是此 tool 唯一的逐调用 token 计费；`search_data_sources` schema 搭乘 system prompt 而非 turn payload。空 Q1 语料库时结果为一短行，`ctx.schema`（D2e）或 `ctx.retrieval`（P5b）填充语料库后结果随 `top_k`（默认 20）扩展。

#### KV Cache effect

Tool 结果仅追加：`candidates` 文本跟随可复用请求前缀，不使先前缓存条目失效。tool schema 是跨 turn 稳定 system-prompt 前缀的一部分，故注册或调用此 tool 不添加前缀抖动。

## Known Limitations and Deferred Work

- **无 provider 挂载时空语料库（Q1 thin default）** — 未挂载 `ctx.schema`（D2e）或 `ctx.retrieval`（P5b）时，base `Bm25Linker` 语料库为空；空语料库返回无候选（诚实的"可调用但未连线"状态）。挂载任一 provider 即填充语料库。
- **无 `ctx.nl2sql` retrieval 方法** — `ctx.nl2sql` 仅暴露 `getConventions`，因此 base path 直接调用 `Bm25Linker` 而非经由 seam；`ctx.retrieval`/`ctx.schema` swap 路径绕过此点。
- **向量存储后端延期** — sqlite-vec / Qdrant 向量存储 substrate 尚未连线；`ctx.retrieval` 路径当前在该 provider 挂载时解析为进程内 hybrid retriever（`dsh-retrieval-inproc`）。
