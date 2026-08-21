# D2f — activate corpus enrichment (bundle mount + cache-invalidation hook)

**Type**: task（build/wiring：activate D2e 的 dormant enrichment）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Resolved（2026-08-21，wayfinder D2f build session——cache-invalidation wiring + live-activation verify；bundle mount 由并发 session commit 433a9440d3 落地；Resolution 见下）。
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

## Resolution（resolved 2026-08-21，wayfinder D2f build session——cache-invalidation wiring + live-activation verify）

**Bundle mount（激活 ctx.schema）= 并发 session 已 commit**：`cordis.patch.yml` 的 `semantic-layer` uncomment + `@deepseek-ai/dsh-semantic-layer` 作 bundle dep 入 pnpm-lock——非本 session 落地，而是并发 session 作 ticket B `ctx.schema bundle mount` commit **433a9440d3**（"uncomment semantic-layer + dsh-semantic-layer dep"）。核 HEAD 当前态（2026-08-21）：`cordis.patch.yml` 行 105-106 semantic-layer **已 uncomment**（`    - id: semantic-layer` + `      name: '@deepseek-ai/dsh-semantic-layer'`）+ pnpm-lock bundle importer 行 1256 有 `dsh-semantic-layer` link + bundle package.json 已列 dep → boot 挂 `ctx.schema` → tool-search execute 软回退探测到 → 建 enriched Bm25Linker。D2f **未改** cordis.patch.yml / pnpm-lock（已 at HEAD；勿重复 stage）。enrichment 由 dormant 转 live（floor 抬 41.9%→54.8/58.1，D2e-audited）。

**Cache-invalidation wiring（D2e code-review deferred 项 = 本 session unique 贡献）**：D2e shipped 的 `enrichedLinkers WeakMap<SchemaCorpusSource, Bm25Linker>` 按 Service 实例缓存、永不在 mid-session writes 刷新 → event 编辑后 linker stale 至 reboot。**选型 = (b) Service-owned corpus-version counter（no static dep），grilled via domain-modeling**：
- **(a) registerInvalidationHook 跨包静态依赖**（破 D2e no-static-dep——tool-search package.json + pnpm-lock tool-search importer 须加 semantic-layer 依赖；并发敏感 surface；且 hook 给 path、cache 按 Service instance——path-vs-instance key mismatch 须额外桥接）→ 否决。
- **(b) stat-mtime/content-hash key**（briefing 原 framing）→ stat-mtime 在 Linux 对 file **content** edit 不可靠（dir mtime 不随内容变）/ per-file stat 1966 events 每 query 开销大 → 否决。
- **(b′) Service-owned corpus-version counter**（采用）：`io.ts` 加 module-level per-path `Map<string,number>` counter，`invalidateCaches(semanticLayer)` bump 它（chokepoint 覆盖 ALL writers：writeEventYaml/writeTable/updateTableMeta/syncWriteDefinitions）；`SemanticLayerService.corpusVersion(): number` 读 `getCorpusVersion(this.semanticRoot)`；tool-search `SchemaCorpusSource` 加 optional `corpusVersion?(): number`，`enrichedLinkers` → `WeakMap<SchemaCorpusSource, {linker, version}>`，`getEnrichedLinker` 在 `schema.corpusVersion?.() ?? 0` ≠ cached version 时 rebuild。**no static dep**（structural cast，同 D2e `loadRetrievalCorpus` 模式）；reliable（counter 在 invalidateCaches chokepoint bump，覆盖 writeEventYaml 等 all writers）；cheap（每 query 一次 structural method call + number 比较，无 stat）；batch-efficient（一次 write burst 后一次 rebuild，非 per-write）；path-scoped（layer A write 不刷 layer B）；table writes 亦 bump counter → over-invalidate（corpus = events+terminology，table 不影响——correct，rare；rebuild 一次/burst）。preserve WeakMap GC（仍按 Service keyed）。additive/reversible（revert version-check → D2e build-once 行为）。

**TDD red-green（production code）**：
- `io.ts` `getCorpusVersion` counter（corpus.spec Test A：`invalidateCaches(pa)` bump `getCorpusVersion(pa)`，path-independent；RED `getCorpusVersion is not a function` → GREEN）。
- `SemanticLayerService.corpusVersion()`（corpus.spec Test B：real Service——`{reflect:{provide:()=>{}}}` mock ctx 足 `super(ctx,'schema')` 需 `ctx.reflect.provide`——corpusVersion() reflects `invalidateCaches(semanticRoot)` bump；RED `svc.corpusVersion is not a function` → GREEN）。
- tool-search version-check rebuild（search-data-sources.spec S10：mock schema {loadRetrievalCorpus, corpusVersion}，execute（cache v1）→ bump version+corpus（new event）→ execute（rebuild, new event retrievable）；RED stale cached linker misses new event → GREEN rebuild sees it）。

**Live-activation verify（measurement → audit-log）**：tsx probe `prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts` over REAL RBI scope 10000147，经 SHIPPED tool-search execute（getEnrichedLinker + D2f version-check）+ shipped io（loadRetrievalCorpus/getCorpusVersion/loadEvents）+ shipped Bm25Linker：
- enriched corpus size 1966；role.online base description `玩家上线` → enriched packs params_fields（roleId 角色id, fforce 战力, coinList.gold 充值元宝, ...）+ terminology slang（日活, DAU, 留存）——slang "日活" packed? true | params "角色id" packed? true（enrichment live，shipped corpus.ts 忠实产 enriched corpus）。
- A/B "充值" → recharge top-1 enriched（score 19.899）；base recharge? yes（recharge base desc 含 充值——hit 是 enriched-BOOSTED 非 enriched-only；enrichment pack 充值 ~4× → higher tf → higher score）。
- single-slang "日活" → role.online NOT retrievable（packed role.online doc 极长 ~40 fields → BM25 length-norm 稀释 + 活 匹配 activity events；与 D2e length-norm finding 一致——非 activation 失败）。
- verdict CONFIRMED：enriched non-empty (1966) + slang+params packed + 充值→recharge top-1。
- 详 [experiment-audit-log](../../research/experiment-audit-log.md) D2f 条目（verbatim + fidelity caveat：smoke-level activation confirm，非 31-case re-measure；floor 54.8/58.1 D2e-audited via probe_hypotheses.py RBI-YAML-simulated；本 probe 用 SHIPPED TS corpus.ts over real RBI——同 corpus.ts 逻辑 → floor holds by construction；ctx.schema shell 是唯一 mock，real bundle boot 未跑——Service.corpusVersion() 由 Test B 直接 TDD-verify）。

**不 regress / 不 flip**：本票只激活 + wire cache-invalidation（enrichment live，floor 抬至 54.8/58.1）；**不**测 regress 门槛（54.8%<85-90%，flip 须 real embedder = [D2c-revisit](D2c-revisit-regress-reeval.md)）；**不**上 real embedder（user-ops-blocked）。additive/reversible：re-comment `semantic-layer`（回退 bundle mount，concurrent 433a9440d3 已 land）+ revert version-check（回退 D2e build-once）→ dormant。escape-hatch（[D2c-impl](D2c-impl-retrieve-tool-shipping.md)）仍必需（54.8%<good）——cheap floor 完整：BM25-only prefetch + enriched corpus（live）+ escape-hatch。

**验证**：semantic-layer 20 spec green（15 corpus incl Test A/B + 5 scenarios）；tool-search 10 spec green（S1-S10 incl S10 version-check）；两包 per-pkg `tsc --noEmit` EXIT=0（tsconfig.base.json，避 tsconfig.host 并发；仿 D2e/P5b note）。**无 concurrent 文件触碰**（io.ts/index.ts/corpus.spec/tool-search index/S10/probe = 本 session D2 域文件，非并发域；audit-log 经 byte-faithful cat-file-HEAD pipeline stage 仅 +D2f hunk——D2g preserved；map.md 经同 pipeline；cordis.patch.yml/pnpm-lock 未碰——已 at HEAD via 433a9440d3）。

**证据**：`probe_hypotheses.py`（D2e, RBI-YAML-simulated, python port of corpus.ts——不在本 repo prototypes/，在 reverse-bi 只读源；run `cd ~/workspace/reverse-bi && uv run python`）+ 本 session `prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts`（TS, SHIPPED corpus.ts 直跑 over real RBI；run `cd <repo> && pnpm exec tsx <path>`）。独立读 `packages/data/semantic-layer/src/{corpus,io,index}.ts`（D2e enrichment + invalidateCaches/registerInvalidationHook 签名 + ctx.schema.loadRetrievalCorpus）+ `packages/data/tool-search-data-sources/src/index.ts`（D2e schema 软回退 + getEnrichedLinker/SchemaCorpusSource/enrichedLinkers WeakMap）+ `packages/bundle/data-agent/cordis.patch.yml`（semantic-layer 行 HEAD 态）+ `vendor/cordis/src/service.ts`（Service ctor 需 `ctx.reflect.provide` → Test B mock ctx）+ `tsconfig.base.json` paths（dsh-semantic-layer 未 mapped → probe 用相对 import）。

**map 更新**：Decisions 加 D2f 条目（cache-invalidation wiring live；bundle mount by concurrent 433a9440d3）。

**Follow-ups**：
- [D2c-revisit](D2c-revisit-regress-reeval.md)（real embedder regress 重测——可在 now-live enriched corpus 上测；corpus prerequisite 已解 + cache-invalidation wired，但 real embedder 未部署，仍 blocked）。
- [D2g](D2g-corpus-recall-larger-caseset-retest.md) verdict (A) 毕业 future build 票（term-only selectable + topK→20）——非本 session 阻塞（D2g resolution + map 已文档化；若创建 D2h，加 map.md pointer）。
