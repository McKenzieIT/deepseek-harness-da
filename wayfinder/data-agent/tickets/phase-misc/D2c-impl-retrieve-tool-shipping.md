# D2c-impl — ship retrieve-tool escape-hatch

**Type**: prototype（ship 一个 additive model-facing tool）
**Phase**: misc
**Status**: Unblocked（P7b + P5b + dsh-tools API grounded by P13b `search_data_sources`）
**Graduated from**: [D2c](D2c-retrieve-tool-keep-regress.md)（resolved 2026-08-21，决策=keep (b)）——ship the retrieve-tool escape-hatch that "keep" commits to.

**Question**: 把 (b) retrieve-tool escape-hatch 落地为真 model-facing tool（additive），不 regress。

**Design**：
- model-facing `retrieve(query, top_k?)` tool via `defineTool` + `ctx.tools.register`（grounded by P13b `search_data_sources` 注册先例——首个 model-facing tool 范式）。
- 内部调 `ctx.retrieval.retrieve`（P5b seam，opt-in 激活 retrieval-inproc hybrid）——软回退同 `search_data_sources`（`ctx.get('retrieval')` 安全探测，无则同步 `Bm25Linker`）。
- persona 教"优先信任预取上下文，仅当缺口明显才调 retrieve"（per [retrieval-consumer-model.md](../../research/retrieval-consumer-model.md) 处方 + P7b preset）——避免双路径冗余（agent 重复取流水线已取的上下文）。
- bundle wiring opt-in（类 P5b retrieval/embedder 行注释——默认 boot 无 retrieve-tool = pipeline-only 现状无回归；激活即 ship）。
- **不默认挂 FakeReranker**（per baseline F2——FakeReranker 对 implicit case 有害，64%<84%）；reranker peer 留 injectable，真 cross-encoder（TEI/infinity，用户自部署）时挂。
- **不挂 FakeHash（D2d re-frame 约束，2026-08-21）**：retrieve-tool 软回退 `Bm25Linker`（`ctx.get('retrieval')` 探测，无则同步 Bm25Linker），**不** uncomment `embedder-fakehash`+`retrieval-inproc` bundle 行激活 hybrid——FakeHash hybrid 严格劣于 BM25-only（[D2d](D2d-retrieval-quality-reframe.md) probe real-scale 复证 F1），挂它会 regress prefetch 41.9%→32.3%（self-inflicted）。真 embedder 来（[D2c-revisit](D2c-revisit-regress-reeval.md)）再 uncomment retrieval-inproc + real embedder。即 retrieve-tool 默认走 BM25-only 软回退，hybrid plane 留真 embedder。
- retrieve-tool shipping 是 additive/reversible（与 D2c 决策非对称论证一致——可未来 unship 若 D2c-revisit regress）。

**Blocked by**: 无（P7b phase-gate/preset resolved、P5b retrieval seam resolved、P13b `search_data_sources` 注册先例 + dsh-tools API grounded）。

**关联**: [D2c](D2c-retrieve-tool-keep-regress.md) resolved（keep (b)）；P5b（retrieval seam + 软回退）；P13b（`search_data_sources` 注册先例 + dsh-tools API）；P7b（persona/preset）；[D2c-revisit](D2c-revisit-regress-reeval.md)（regress 重访，若 regress 须 unship 此 tool）；[D2e](D2e-corpus-enrichment.md) resolved（enriched corpus shipped dormant——cheap floor 第 (ii) 块；本票 escape-hatch = 第 (iii) 块软回退；两者合 = BM25-only prefetch + enriched corpus + escape-hatch，无 real embedder 的 cheap floor）；[D2f](D2f-activate-corpus-enrichment.md)（激活 enrichment runtime——建议本票之后）；[D2g](D2g-corpus-recall-larger-caseset-retest.md)（更大 case 集重测 term-only/topK——research follow-up，可并行 /research subagent）。
