# `@deepseek-ai/dsh-tool-retrieve`

[English](README.md) | 中文

Model-facing `retrieve` tool：data agent 的**按需检索 escape-hatch**。pipeline 在 `UNDERSTANDING` 阶段预取数据源候选（`search_data_sources`）；`retrieve` 是当 agent 检测到预取遗漏（一个歧义问题，或预取未桥接的业务同义词）时调用的 additive escape-hatch。返回带 `id`、`score` 和 `description` 的排序数据源候选。

这是 **D2c-impl** 发布 — D2c "keep (b)" 决策所承诺的 escape-hatch（按 retrieval-consumer-model 处方 (c) *guided-agentic-hybrid*：(a) 确定性预取是默认路径；(b) `retrieve` 是 additive escape-hatch 插件，NOT a parallel default）。它镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)（第一个 model-facing tool，P13b）的 [`@deepseek-ai/dsh-tools`](../../core/tools) 注册形态（`defineTool` + `ctx.tools.register`）+ D2e schema soft-fallback + 缓存的 enriched `Bm25Linker`。

## 状态：已发布但 DORMANT（opt-in，dormant-until-mount）

该 tool **package** 已发布（挂载时通过 `defineTool` + `ctx.tools.register` 注册 `retrieve`），但挂载它的 preset 行（`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`，`tool-retrieve`）被**注释** — 因此默认启动 NOT mount 它，`retrieve` tool 未注册，agent 以**pipeline-only**运行（当前状态，无回归）。这镜像 D2e dormant-until-mount + P5b opt-in-seam 模式。

Activation（一个独立的、后续的 gate — P7b / follow-up）是三个协调步骤：

1. **取消注释** `tool-retrieve` preset 行。
2. **将 `retrieve` 加入 phase-gate tool 白名单**（phase-gate guard 拒绝非白名单 tool，因此仅注册该 package 并不能使其可调用）。
3. **落地 persona**（P7b），教模型*"优先使用 `search_data_sources` 已呈现的上下文；仅当 gap 明显时才调用 `retrieve`，并带 refined query"* — 以避免 double-retrieval 冗余（agent 重新抓取 pipeline 已呈现的内容）。

发布是**additive/reversible**（D2c 不对称论证 — keep 便宜 + 可逆；regress 需 ≥85-90% strict + <15% ambiguity，只有真实 embedder 才能达到）：若 [D2c-revisit](../../../wayfinder/data-agent/tickets/phase-misc/D2c-revisit-regress-reeval.md) 回归则 unmount / unship。

## Soft-fallback 链（镜像 `search_data_sources`）

`retrieve` 使用与 `search_data_sources` **相同**的 soft-fallback 链，因此其 recall == `search_data_sources` 的 recall（相同 linker，相同语料库）：

1. **`ctx.get('retrieval')`**（P5b seam）— 当用户挂载 `dsh-retrieval-inproc` + 真实 embedder 时，使用 async hybrid provider（`BM25 + vector + RRF`，`InferenceError` → BM25-only degrade）。`inject` 保持 `['tools']`（NOT `'retrieval'`）以便 tool 在无 retrieval provider 时也能加载；`ctx.get('retrieval')` 是安全探针（无 provider 注册时返回 `undefined`）。
2. **`ctx.get('schema')`**（D2e）— 当 semantic-layer service 挂载时，构建缓存的 enriched `Bm25Linker`（params_fields + 术语 slang 打包进 `description`；NOT domain — 见 D2e），按 `ctx.schema`（`WeakMap` 缓存）构建一次并使用。
3. **Empty `Bm25Linker`** — Q1-thin 默认值：可调用但未连线（无语料库 → 无候选），不是挂载错误。

**无 FakeHash，无默认 FakeReranker**（D2d 约束）：soft-fallback 保持默认 BM25-only（~41.9% 真实默认；挂载 FakeHash 会回归 prefetch 41.9%→32.3%，自找的 — D2d re-frame）。reranker peer 保持可注入，供用户自部署的真实 cross-encoder。hybrid plane 等待真实 embedder（D2c-revisit）。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)：

```ts ignore-check
export const name = 'tool-retrieve'
export const inject = ['tools']
export const Config: z<Config> = z.object({ topK: z.number().default(20) })

export function retrieve(linker: RetrievalLinker, query: string, topK: number): RetrieveHit[] {
  const hits = linker.retrieve(query, { topK, mode: 'bm25-only' })
  return hits.map(h => ({ id: h.id, score: h.score, /* +description? */ mode: h.mode }))
}

export function apply(ctx: Context, config: Config = {}): void {
  const defaultTopK = config.topK ?? 20
  const linker: RetrievalLinker = new Bm25Linker([])   // Q1-thin default
  ctx.tools.register(defineTool({
    name: 'retrieve',
    description: 'Retrieve relevant data-source context on demand — the escape-hatch …',
    parameters: { query: { type: 'string', required: true }, top_k: { type: 'number' } },
    output: { schema: { /* candidates[] */ }, render: (_args, value) => [...] },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('retrieve aborted before linking')
      const topK = args.top_k ?? defaultTopK
      const retrieval = ctx.get('retrieval') as RetrievalService | undefined
      if (retrieval !== undefined) { /* async hybrid */ }
      const schemaProbe = ctx.get('schema') as { loadRetrievalCorpus?: unknown } | undefined
      if (schemaProbe !== undefined && typeof schemaProbe.loadRetrievalCorpus === 'function') {
        /* cached enriched Bm25Linker */
      }
      return { candidates: retrieve(linker, args.query, topK) }
    },
  }))
}
```

注册基于 effect（disposing plugin fiber 即注销 tool）。`execute` 返回一个规范 JSON 值（`{ candidates: [...] }`）；`output.render` 将其转为 model-facing 文本（排序列表，或 `No matching data sources found.`）。

## 配置

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `topK` | `number` | `20` | 调用省略 `top_k` 时的默认候选数量（与 `search_data_sources` 对齐；D2h 由 5 提升至 20）。agent 在重新搜索 gap 时可传更高的 `top_k`。 |

## 验证

```sh
(cd packages/data/tool-retrieve && tsc --noEmit)
pnpm vitest run packages/data/tool-retrieve
```

12 specs (R1–R12) 覆盖 BM25 linking、`top_k` cap、空 thin-default、注册、`ctx.retrieval` soft-fallback (R8)、`ctx.schema` enriched soft-fallback (R9)、abort guard (R10)、config `topK` default (R11)，以及 D2h 5→20 默认提升 (R12) — 镜像 `tool-search-data-sources` 的 S1–S9 + 三个 retrieve-specific 测试。

## Model Experience

### The `retrieve` tool call

#### What the model sees

`retrieve` tool schema（name、description、`query` 和 `top_k` 参数、以及 `candidates` 输出数组）在 plugin 挂载后自动流入 system-prompt assembly（preset 行默认注释 — 见 Status），因此挂载该 tool 的 bundle 的模型将其与 phase 白名单的其余部分一同发现。当模型调用它时，`execute` 返回一个规范 `{ candidates: [...] }` JSON 值，`output.render` 将其投影为 model-facing 文本：每个排序数据源一行编号列表（`1. <id> (score <score>) - <description>`），或语料库为空时（`ctx.schema` 挂载前的 Q1 thin default）单行 `No matching data sources found.`。

#### Token effect

tool 结果中渲染的 `candidates` 文本是此 tool 唯一的逐调用 token 计费；`retrieve` schema 搭乘 system prompt 而非 turn payload。空 Q1 语料库时结果为一短行，`ctx.schema` 挂载 enriched 语料库后结果随 `top_k`（默认 20）扩展。

#### KV Cache effect

Tool 结果仅追加：`candidates` 文本跟随可复用请求前缀，不使先前缓存条目失效。tool schema 是跨 turn 稳定 system-prompt 前缀的一部分，故注册或调用此 tool 不添加前缀抖动。

## Known Limitations and Deferred Work

- **挂载前 Dormant** — preset `tool-retrieve` 行被注释；默认启动不注册该 tool（pipeline-only，无回归）。Activation = 取消注释 preset 行 + 将 `retrieve` 加入 phase-gate 白名单 + 落地教何时调用它的 P7b persona（见 Status）。该 package + 其测试 + typecheck 现已发布；activation gate 是后续工作。
- **Recall == `search_data_sources`** — `retrieve` 命中与 `search_data_sources` 相同的 BM25 语料库 + linker，故无需新测量：D2e 审计的 floor（`ctx.schema` 挂载 enriched 语料库后 54.8% strict / 58.1% loose；空 thin-default 上 41.9%）同样适用于 `retrieve`。两者仍 << 85-90% regress bar — escape-hatch 的意义在于此（一个便宜的下限，而非 regress-gate 通过）。
- **无真实 embedder** — hybrid plane 留给用户自部署的真实 embedder（D2c-revisit）。FakeHash 刻意 NOT mounted（D2d：自回归）；FakeReranker NOT defaulted（D2d F2：对 implicit 场景有害）。
- **无专用语料库** — `retrieve` 检索 prefetch 使用的同一数据源语料库。更广的上下文语料库（SQL 示例、DDL）是未来的数据质量扩展，非本次发布。
- **Persona 未在此落地** — "优先 prefetch；仅当 gap 明显时才调用 `retrieve`" 的指引是 P7b 交付物，未与此 tool 打包。没有它，挂载 `retrieve` 有 double-retrieval 冗余风险 — dormant-by-default 发布避免该回归。
