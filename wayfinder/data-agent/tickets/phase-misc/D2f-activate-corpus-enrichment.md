# D2f — activate corpus enrichment (bundle mount + cache-invalidation hook)

**Type**: task（build/wiring：activate D2e 的 dormant enrichment）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Unblocked（D2e resolved 2026-08-21；本票 = 让 shipped enrichment 真正在 runtime 生效）——建议序于 [D2c-impl](D2c-impl-retrieve-tool-shipping.md) 之后（cheap floor 第三块 escape-hatch 先 ship，再激活 corpus；两者合 = cheap floor）。
**Graduated from**: [D2e](D2e-corpus-enrichment.md)（resolved 2026-08-21）——D2e shipped enrichment dormant-until-`ctx.schema`-mount；本票落地激活。

**Question**: 把 D2e shipped 的 enriched corpus 在 runtime 真正激活（当前 dormant——bundle `semantic-layer` 行 commented → `ctx.schema` 未挂 → tool 用空 Bm25Linker，floor 仍 41.9%），并 wire cache-invalidation（review deferred 项），不 regress。

**fed by（D2e 证据）**：D2e 测得 enriched corpus（params_fields + terminology slang，pack-into-description ×1）在 real Bm25Linker default 上抬 floor 41.9%→54.8% strict / 58.1% loose（[experiment-audit-log](../../research/experiment-audit-log.md) D2e 条目）。shipped 代码（`packages/data/semantic-layer/src/corpus.ts` + `ctx.schema.loadRetrievalCorpus()` + `tool-search-data-sources` execute 软回退）已就位，但 dormant——bundle 未 uncomment `semantic-layer`。

**Design**：
- **bundle uncomment**：`packages/bundle/data-agent/cordis.patch.yml` 的 `semantic-layer` 行（2026-08-21 核：行 105-106，当前 `#` 注释）uncomment + 填 `name: '@deepseek-ai/dsh-semantic-layer'` → boot 挂 `ctx.schema` → tool-search execute 软回退探测到 → 建 cached enriched Bm25Linker → floor 抬至 ~54.8/58.1。⚠️ cordis.patch.yml 是并发敏感文件——改前核 working-tree 当前态（并发会话可能已动）+ pathspec-only commit；勿抓并发改动。
- **cache-invalidation hook**（[D2e code-review](D2e-corpus-enrichment.md) deferred 项）：tool-search 的 enriched-linker `WeakMap` 缓存不随 mid-session Tier-2 writes（`writeEventYaml`/`updateTableMeta` 触发 `invalidateCaches`）刷新。激活时须 wire 一个 invalidation hook——tool-search 注册 `registerInvalidationHook` from semantic-layer → 清 `enrichedLinkers` 缓存（需 tool-search 加 semantic-layer tsconfig path 静态依赖）；**或**按 stat-mtime/content-hash key 缓存使 event 编辑刷新（无静态依赖但每次 query stat）。选型可 grill。
- **激活后 verify**：re-run probe-style measurement on the LIVE runtime corpus（非 RBI YAML 直读）确认 floor ~54.8/58.1；或 boot 一个 data-agent session 跑 `search_data_sources` 确认 enriched corpus 生效（非空 + 命中）。结果入 [experiment-audit-log](../../research/experiment-audit-log.md)。

**Scope/边界**：本票只激活 + wire cache-invalidation（让 D2e 真生效）；**不**测 regress 门槛（54.8%<85-90%，flip 须 real embedder=[D2c-revisit](D2c-revisit-regress-reeval.md)）；**不**上 real embedder。additive/reversible（re-comment `semantic-layer` 即回退 dormant）。

**Blocked by**: 无（D2e shipped；semantic-layer package 已 ship P6b）。建议序于 D2c-impl 之后。

**关联**: [D2e](D2e-corpus-enrichment.md)（shipped enrichment，本票激活）；[D2c-revisit](D2c-revisit-regress-reeval.md)（real embedder regress 重测——可在激活后的 live enriched corpus 上测，corpus prerequisite 已解）；[experiment-audit-log](../../research/experiment-audit-log.md)（D2e 测量证据 + 本票激活后 verify 结果去处）。
