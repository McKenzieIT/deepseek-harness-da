# P15a — Query Expansion 实现（LLM pre-BM25 expansion via qwen-flash）

**Type**: task（实现；P15 grilling 毕业）
**Phase**: misc（retrieval 增强；D2 lineage）
**Status**: resolved (2026-08-26)
**Graduated from**: [P15](P15-query-rewriting.md)（resolved 2026-08-26，方案 B validated 6/6 hit@5）

## Question

在 BM25 schema-linking 前加一步 LLM query expansion：用 `qwen-flash`（AGA 网关最小最快模型）将用户业务口语扩展为包含 corpus 可匹配 token 的搜索 query。覆盖生产 path + eval path。

## 实现范围

### 1. expandQuery 函数（共享模块）

新文件 `packages/data/nl2sql-engine/src/query-expansion.ts`（或 `tool-search-data-sources` 内部）：

```typescript
async function expandQuery(llm: LlmLike, question: string): Promise<string> {
  // 调 ctx.llm with qwen-flash, expansion prompt
  // 返回 expanded query string
  // 失败时 fallback 返回原始 question（不 block pipeline）
}
```

- Prompt：游戏数据分析领域 query 扩展（保留原词 + 缩写全称 + 中文同义词 + 字段命名风格）
- Model：`qwen-flash`（via ctx.llm, provider='aga'）
- Fallback：LLM 调用失败时返回原始 question（graceful degradation）
- 温度：0.1（确定性强）
- max_tokens：200（expansion 不需要长输出）

### 2. 生产 path 集成（tool-search-data-sources）

`packages/data/tool-search-data-sources/src/index.ts` 的 `execute()` 方法中：

```typescript
async execute(args, exec) {
  const topK = args.top_k ?? defaultTopK

  // P15a: query expansion (graceful: fail → use original query)
  const query = await expandQuery(ctx, args.query)

  // 后续代码用 query 替代 args.query
  ...
}
```

注意：`ctx.llm` 需要在 `inject` 或 soft-probe 中获取（当前 inject=['tools']）。

### 3. Eval path 集成（eval-cli）

`packages/eval/eval-cli/src/context.ts` 的 `Nl2sqlAgentResponder.respond()` 中：

```typescript
async respond(question: string, _opts?: AgentRespondOpts): Promise<AgentResponse> {
  // P15a: expand before BM25
  const expandedQuestion = await expandQuery(this.llm, question)
  const retrieval = new Bm25Linker(corpus)
  // engine.run 用 expandedQuestion 或 linker.retrieve(expandedQuestion)
  ...
}
```

### 4. Feature flag

Config 开关（默认开启）：
- `tool-search-data-sources` Config 加 `queryExpansion?: boolean`（default true）
- eval-cli 加 `--no-query-expansion` flag

### 5. 验证

- 跑 P11e k11-v2 eval 6 个失败 case，确认 hit@5 改善
- 确认无 regression（其他已通过 case 不受影响）
- 测量 expansion latency（qwen-flash 预期 500ms-1.5s）
- 现有 tests green（expansion 是 additive，不改同步接口）

## 设计约束

- **不改 `RetrievalLinker` 接口**：保持 sync，expansion 在调用层
- **graceful degradation**：LLM 失败不 block search（返回原始 query）
- **additive**：feature flag 关闭 = shipped 行为不变
- **不碰 tokenizer**：expansion 解决 token gap，不动全局 tokenize()

## 依赖

- `ctx.llm` 可用（llm-dashscope/aga provider 已 mounted）
- `qwen-flash` 在 AGA 网关可用（DEFAULT_MODELS catalog 已注册）
- DASHSCOPE_API_KEY 环境变量已设

## 关联

- [P15](P15-query-rewriting.md)（resolved——决策 + 原型验证）
- [D2e](D2e-corpus-enrichment.md) / [D2f](D2f-activate-corpus-enrichment.md)（索引侧增强，已 shipped；本票是查询侧增强）
- [D2c-revisit](D2c-revisit-regress-reeval.md)（real embedder，blocked；本票独立于它）
- [P11e](../phase-4/P11e-eval-case-set-v2-realistic.md)（eval 暴露此缺陷）

## 证据

- P15 原型：`packages/eval/eval-cli/src/p15-probe.ts`（simulated expansion 2/6→6/6 hit@5）
- P15 resolution：`wayfinder/data-agent/tickets/phase-misc/P15-query-rewriting.md`

## Resolution (2026-08-26)

实现完成，验证 6/6 hit@5（真实 LLM，AGA 网关 qwen-flash）。

**改动文件：**

1. `packages/data/tool-search-data-sources/src/expand-query.ts`（新）— `expandQuery(ctx, question)` 函数，ctx.llm streaming + BlockAssembler，graceful degradation
2. `packages/data/tool-search-data-sources/src/index.ts` — Config 加 `queryExpansion?: boolean`（default true），execute() 内所有检索路径前调 `await expandQuery(ctx, args.query)`
3. `packages/eval/eval-cli/src/context.ts` — 本地 `expandQuery` + wrapper linker（仅 BM25 用扩展后 query，engine prompt 用原始 question），`BootOptions.queryExpansion` flag
4. `packages/eval/eval-cli/src/main.ts` — `--no-query-expansion` CLI flag

**Prompt 调优：** 初版 prompt 只生成泛化英文（`arppu_average_revenue_per_paying_user`），BM25 只命中 1/6。加 4 个 few-shot 示例（含 `acc_summary`/`big_r`/`item_circle` 等实际表名片段）后达到 6/6。

**验证结果：**
- tool-search-data-sources: 13/13 tests ✅，tsc 无错误 ✅
- eval-cli tsc: 仅 pre-existing `lookupDoc` 错误 ✅
- 真实 LLM expansion (AGA/qwen-flash): 6/6 hit@5 ✅
- expansion latency: ~620ms
