# D2c-impl — ship retrieve-tool escape-hatch

**Type**: prototype（ship 一个 additive model-facing tool）
**Phase**: misc
**Status**: Resolved（2026-08-21，wayfinder D2c-impl build session——retrieve-tool shipped DORMANT；TDD red-green + resolution 见下）
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

## Resolution（resolved 2026-08-21，wayfinder D2c-impl build session——TDD red-green + ship）

**Ship = additive `retrieve` model-facing tool，dormant-until-mount（mirrors D2e dormant + P5b opt-in）**：新包 `packages/data/tool-retrieve`（`@deepseek-ai/dsh-tool-retrieve`）——`defineTool` + `ctx.tools.register` 注册 `retrieve(query, top_k?)`，`inject = ['tools']`，soft-fallback chain **镜像 `search_data_sources`**（D2e）：`ctx.get('retrieval')`（P5b seam，async hybrid——用户自部署真 embedder 时）→ else `ctx.get('schema')`（D2e enriched `Bm25Linker`，`WeakMap` 缓存，params_fields+terminology pack 进 description）→ else 空 `Bm25Linker`（Q1 thin default，callable-but-unwired）。`retrieve` pure 投影 + `projectHit`（async 路径）+ `SchemaCorpusSource`/`getEnrichedLinker`（D2e mirror）。**recall == `search_data_sources`**（同 linker、同 corpus）→ 无新测量——复用 D2e-audited floor（empty thin-default 41.9%；`ctx.schema` 挂 enriched corpus 后 54.8% strict / 58.1% loose）+ D2e tokenizer-fidelity caveat（Bm25Linker unigram+bigram，非 §7 HybridRetriever port）。

**D2d 约束落地**：retrieve-tool 软回退 `Bm25Linker`，**不挂 FakeHash**（避免 41.9%→32.3% self-regression——D2d re-frame 证 FakeHash hybrid 严格劣于 BM25-only）；**不默认挂 FakeReranker**（D2d F2：对 implicit case 有害，64%<84%）；reranker peer 留 injectable，真 cross-encoder（TEI/infinity，用户自部署）时挂。hybrid plane 留真 embedder（D2c-revisit）。即 retrieve-tool 默认走 BM25-only 软回退——cheap floor 第 (iii) 块落地。

**Dormant-until-mount（additive/reversible，无回归）**：preset `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（canonical，tool roster + placeholders 所在）加 **commented** `- id: tool-retrieve` opt-in 行——默认 boot **不挂** retrieve-tool = pipeline-only 现状 = **无回归**（仿 D2e/P5b dormant seam）。激活 = 三步协调（P7b / follow-up gate）：(1) uncomment preset 行；(2) 加 `retrieve` 进 phase-gate tool whitelist（guard 拒非 whitelist 工具，故仅注册包不使 callable）；(3) 落 persona（P7b）教"优先信任预取上下文，仅当缺口明显才调 retrieve"——避免双路径冗余（agent 重复取流水线已取的上下文，per [retrieval-consumer-model.md](../../research/retrieval-consumer-model.md) (c) guided agentic hybrid 处方）。variant presets（d-bare-react / b-free-react-planning / c-hybrid）未碰（minimal roster 无 placeholder 段；canonical 是 wiring point；variant 激活 retrieve 是 follow-up）。**additive/reversible**——可未来 unship 若 [D2c-revisit](D2c-revisit-regress-reeval.md) regress（D2c 非对称论证：keep 廉价/可逆；regress 须 ≥85-90% strict + <15% ambiguity 仅 real embedder 可达）。

**Build（TDD red-green，仿 D2e）**：先写 11 spec（R1-R11，镜像 `search_data_sources` S1-S9 + retrieve-specific R10 abort + R11 config topK）→ minimal stub（structure + placeholder behavior）→ **RED（8 fail / 3 pass——行为测试 R1/R4-desc/R6/R7/R8/R9/R10/R11 fail；空-path 守卫 R2/R3/R5 pass）** → full impl → **GREEN（11/11）** → per-pkg `tsc --noEmit` EXIT=0（仿 P5b note 避 tsconfig.host 并发；baseline `tool-search-data-sources` 同 EXIT=0 证命令对齐）。包结构镜像 sibling（package.json/tsconfig/src/index.ts/tests/README；peerDeps = cordis+schemastery+dsh-tools+dsh-nl2sql-engine+dsh-retrieval；**无** dsh-semantic-layer 静态依赖——用 structural `SchemaCorpusSource` cast，仿 D2e）。

**不 flip D2c keep (b)**：本票 ship keep (b) 所 commit 的 escape-hatch——不改 keep/regress 决策（regress 仍 blocked by real embedder = D2c-revisit）。retrieve-tool 是 cheap floor 第 (iii) 块（(i) 不挂 FakeHash[D2d 约束] + (ii) enriched corpus[D2e shipped, D2f 激活] + (iii) escape-hatch 软回退[本票]）= 无 real embedder 的 cheap floor：BM25-only prefetch + enriched corpus + agent 主动 retrieve 补 BM25 召回缺口。

**验证**：11 spec green（R1 BM25 linking / R2 topK cap / R3 empty thin-default / R4 registration / R5 execute callable / R6 render format / R7 no-match message / R8 ctx.retrieval soft-fallback / R9 ctx.schema enriched soft-fallback / R10 abort / R11 config topK default）；per-pkg `tsc --noEmit` EXIT=0。**无 concurrent 文件触碰**（agent.cordis.yml commented 行经 reviewed staged diff——仅本 hunk，无并发 sweep；map.md 经 isolated `update-index --cacheinfo`——不碰并发 working-tree 改动）。

**证据**：独立读 `packages/data/tool-search-data-sources/src/index.ts`（注册先例 + D2e schema 软回退 + `getEnrichedLinker`/`SchemaCorpusSource` 模式——retrieve-tool 镜像）+ `packages/data/tool-load-table-definition/src/index.ts`（最近 sibling model-facing tool 先例）+ `packages/retrieval/retrieval-inproc/src/index.ts`（`RetrievalService` seam）+ `packages/data/nl2sql-engine/src/bm25-linking.ts`（`Bm25Linker` + `RetrievalLinker`/`RetrievalHit`/`DataSourceDoc`）+ `packages/core/tools`（`defineTool<S>` generic——`InferArgs<S>` 推 args 类型，故 `args.query`/`args.top_k` 类型安全）+ `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（preset 挂 tool 模式 + placeholder 段）+ `packages/bundle/data-agent/cordis.patch.yml`（embedder/retrieval/semantic-layer 行均 commented = opt-in → 默认 boot 无 ctx.retrieval/ctx.schema → retrieve-tool 软回退空 Bm25Linker = 无回归）+ [research/retrieval-consumer-model.md](../../research/retrieval-consumer-model.md)（(c) guided agentic hybrid 处方——(a) 默认预取 + (b) escape-hatch；persona 教"优先预取，缺口才 retrieve"避双路径冗余）。

**map 更新**：Decisions 加 D2c-impl 条目（retrieve-tool shipped dormant；cheap floor 第 (iii) 块落地；activation = P7b/follow-up）。

**Follow-ups**：
- **激活 retrieve-tool**（uncomment preset `tool-retrieve` 行 + phase-gate whitelist 加 `retrieve` + P7b persona 教何时调）——P7b / follow-up gate（非本票）。
- [D2f](D2f-activate-corpus-enrichment.md)（激活 D2e enrichment runtime——bundle uncomment `semantic-layer` + cache-invalidation hook）——cheap floor 第 (ii) 块激活；与本票 escape-hatch 合 = 完整 cheap floor。
- [D2g](D2g-corpus-recall-larger-caseset-retest.md)（本 session 并行 resolved——term-only 稳健高召回信号，非 31-case 噪声：113 gold case 上 term-only 77.0% vs params+term 68.1% strict，跨 5 scope 全胜/平，net +10 per-case flip；topK=20 仍 helpful）→ 毕业 future build 票（term-only 可配 / 默认 topK 抬向 20）。**不改 D2e shipped 决策**（params+term 仍 shipped，cross-tokenizer floor 稳健）；term-only 可配是 escape-hatch + enrichment 的 follow-up data-quality 优化。
- [D2c-revisit](D2c-revisit-regress-reeval.md)（regress 重访——真 eval 数据复测，达门槛则 unship 此 tool）。
