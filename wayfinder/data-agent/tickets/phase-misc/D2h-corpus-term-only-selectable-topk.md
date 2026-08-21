# D2h — corpus term-only selectable + raise default prefetch topK toward 20

**Type**: task（build/config：D2g verdict (A) 毕业——让 term-only 可配 + 默认 prefetch topK 抬向 20）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Resolved（2026-08-21，wayfinder D2h build session——term-only selectable variant + topK 5→20 shipped; TDD + live-probe verified; Resolution 见下）。
**Graduated from**: [D2g](D2g-corpus-recall-larger-caseset-retest.md)（resolved 2026-08-21）——D2g 113-gold 重测证 term-only 稳健（77.0% strict vs params+term 68.1%，+8.9pp，跨 5 scope 全胜/平，topK=20 仍 helpful all variants，best term@topK=20=85.0%）；D2g 不改 D2e shipped（params+term 仍 shipped，cross-tokenizer floor 稳健），但 verdict (A) 毕业 future build 票让 term-only 可配 + topK 抬向 20。

**Question**: 让 corpus 的 term-only 变体**可配**（当前 shipped = params+term pack-into-description ×1，D2e measured-best；term-only 在 real default 上 64.5%/113-gold 77.0% 但 §7 port 48.4%——D2g 证 real-default 稳健，值得可配）+ 把默认 prefetch topK 从 5 抬向 20（D2g 证 topK=20 helps ALL variants：base 62.8→77.9 / term 77.0→85.0 / params+term 68.1→81.4），抬 cheap floor 朝 85-90% regress bar，**不 regress**。

**fed by（D2g/D2e 证据）**：[experiment-audit-log](../../research/experiment-audit-log.md) D2g 条目——
- real Bm25Linker default，113 gold（5 scope = 4217 events / 205 cases / 113 with-derivable-gold）：base 41.9%(10000147)/62.8%@topK20；params+term 54.8%(10000147)/68.1%(agg) strict·58.1%/71.7% loose；**term-only 77.0% strict / 79.6% loose（+8.9pp/+7.9pp vs params+term）**，跨 5 scope 全胜/平；topK sweep：gap 持续（+8.9pp@5→+3.6pp@20，never reverses）；**best = term@topK=20 = 85.0% strict / 87.6% loose**。
- term-only gains = CJK-synonym bridges（道具产出→item.add / 道具消耗→item.use / 商城购买→shop.buy / 创角→game.role.create / 死亡→game.role.die）—— params+term 的 param-field text dilute slang bridge via BM25 tf-saturation + length norm（同 D2e ×3-weighting-hurts-loose 机制）。
- D2e shipped params+term（pack ×1，cross-tokenizer floor 稳健）；term-only 仅 real-default 重测稳健，§7 bigram-only port 未在 113 case 重测（lower-priority open question）。

**Design**：
- **term-only 可配**：`packages/data/semantic-layer/src/corpus.ts` `buildRetrievalCorpus` 加 variant 选项（`params+term`[default, shipped = pack params_fields + terminology slang] / `term-only`[pack 仅 terminology slang，不 pack params_fields] / `params-only`?[可选]）；`io.ts` `loadRetrievalCorpus` 透传 variant；`SemanticLayerConfig` 加 `corpusVariant` 字段（default `params+term`[保 shipped 行为]）。additive（default 不变 = shipped params+term；opt-in term-only）。**grill**：variant 选项粒度（三选一 vs term-only boolean toggle）+ config 位置（SemanticLayerConfig vs bundle `cordis.patch.yml` semantic-layer config）+ cache 交互（D2f corpusVersion 已 wire——variant 是 mount-time config 非 mid-session 内容变；切 variant = 重挂 Service（新 instance → 新 WeakMap key → fresh enrichedLinker）——若要 mid-session 切 variant 须把 variant 作 cache key 一部分；倾向 mount-time config（variant 是部署选择非 per-query），grill 确认）。
- **默认 topK 抬向 20**：`packages/data/tool-search-data-sources/src/index.ts` `Config.topK` default 5→20（+ retrieve-tool [D2c-impl] 同步 default；D2g 证 topK=20 helps all）。**grill**：抬到 20 vs 渐进（10→20）vs per-preset 可配 + 对 latency/cost 影响（topK=20 召回高但 candidate 多→下游 NL→SQL 处理多）+ 是否 variant-specific（term-only@20 best = 85.0%）。
- **激活后 verify**：re-run D2g probe（`d2g_larger_caseset.py`，reverse-bi 只读源；run `cd ~/workspace/reverse-bi && uv run python`）on live corpus（D2f wired，`ctx.schema.loadRetrievalCorpus()` now live）证 term-only@topK=20 ~85.0/87.6 + params+term@20 ~81.4；或 boot data-agent 跑 `search_data_sources` 证 topK=20 + variant 切换生效。结果入 [experiment-audit-log](../../research/experiment-audit-log.md) D2h 条目（per AGENTS.md 审计规则 + fidelity caveat：live ctx.schema corpus vs D2g RBI-YAML-simulated）。

**Scope/边界**：本票只让 term-only 可配 + topK 抬向 20（抬 cheap floor 朝 85-90%）；**不**测 regress 门槛（85.0%@topK=20 仍 < 85-90% bar 边缘，flip 须 real embedder = [D2c-revisit](D2c-revisit-regress-reeval.md)）；**不**上 real embedder（user-ops-blocked）。additive/reversible（default = shipped params+term + topK=5 可回退）。**不**改 D2e shipped params+term 默认（term-only 是 opt-in，default 不变）。

**Blocked by**: 无（D2g resolved；D2f resolved——live corpus + cache-invalidation wired）。建议序于 D2f 之后。

**关联**: [D2g](D2g-corpus-recall-larger-caseset-retest.md)（产本票——term-only 稳健 verdict (A) 毕业）；[D2e](D2e-corpus-enrichment.md)（shipped params+term，本票加 term-only variant 不改默认）；[D2f](D2f-activate-corpus-enrichment.md)（激活 corpus live + cache-invalidation wired——variant/topK 改在 live corpus 上生效）；[D2c-impl](D2c-impl-retrieve-tool-shipping.md)（retrieve-tool——topK default 同步）；[D2c-revisit](D2c-revisit-regress-reeval.md)（real embedder regress——85.0%@topK=20 仍 < bar，flip 须 real embedder）；[experiment-audit-log](../../research/experiment-audit-log.md)（D2g 证据 + 本票 verify 去处）。

## Resolution（resolved 2026-08-21，wayfinder D2h build session——term-only selectable + topK 5→20）

**Build（term-only selectable variant）**：D2g verdict (A) 毕业——让 term-only 可配，不改 D2e shipped 默认（params+term 仍 default）。**variant 粒度 = 两值 enum `CorpusVariant = 'params+term' | 'term-only'`**（grilled 确认，非三选一非 boolean toggle）：
- **为什么不 ship params-only**：D2g 实测 params-only=63.7% strict，**严格劣于 params+term=68.1%**（暴露最差 variant 诱误配）；且 params-only ≈ params+term-on-no-slang（slang 缺失时 slang 加 0 → 退化同结果）→ 无独立运行态需求。两值 enum 覆盖 D2g verdict (A) 毕业的"更高召回 term-only 选项"+ 保 shipped 默认；params-only 作 future 非破坏 enum 扩展（D2g 已测，lower-priority）。
- **config 位置 = `SemanticLayerConfig.corpusVariant` mount-time zod field**（grilled 确认，非 bundle `cordis.patch.yml`）：D2f 先例不碰 cordis.patch.yml（已 at HEAD via 433a9440d3）+ variant 是部署选择非 per-query → mount-time config 自然 home（与 semanticRoot/scopeId 同级）。zod `z.union(['params+term','term-only'] as const).default('params+term')`（schemastery 习语——`z.enum` 是 zod-only 非 schemastery；仿 `packages/core/tools/src/index.ts:791` mode field）保类型安全 + default 保 shipped 行为。bundle row 可经既有 plumbing 传 corpusVariant（无需我改 cordis.patch.yml——default kicks in）。
- **cache 交互 = variant NOT in corpusVersion cache key**（grilled 确认）：D2f corpusVersion 跟踪 mid-session content edits（writeEventYaml 等），NOT config。variant 是 mount-time——切 variant = 重挂 Service（新 instance → 新 WeakMap key → fresh enrichedLinker），同 semanticRoot 切换语义。无 mid-session variant 切换需求 → 不须把 variant 作 cache key 一部分。tool-search `enrichedLinkers WeakMap<Service,{linker,version}>` 按 Service instance keyed → 两 variant = 两 Service = 两独立 cached linker（probe 实证无 cross-contamination）。

**plumbing**：`corpus.ts` `buildRetrievalCorpus(events, terminology, variant='params+term')` 加 variant opts（`if (variant !== 'term-only') pack paramsText`——term-only = desc+slang 不 pack params_fields；params+term = desc+params+slang shipped）+ 导出 `CorpusVariant` type；`io.ts` `loadRetrievalCorpus(semanticLayer, variant='params+term')` 透传 → `buildRetrievalCorpus(events, terminology, variant)`；`index.ts` `SemanticLayerConfig.corpusVariant?` + `Service.corpusVariant` getter + `loadRetrievalCorpus()` 读 `this.corpusVariant` 传 io + re-export `CorpusVariant`。variant 经 Service.loadRetrievalCorpus() 内部读 config（tool-search `SchemaCorpusSource.loadRetrievalCorpus()` 无参 structural cast 不须知 variant）。

**Build（默认 prefetch topK 5→20）**：D2g 证 topK=20 helps ALL variants（base 62.8→77.9 / term 77.0→85.0 / params+term 68.1→81.4），20 是 sweet spot（10→20 大跳，20→30 边际）。`tool-search-data-sources` + `tool-retrieve` `Config.topK` default 5→20（zod + `defaultTopK = config.topK ?? 20` + tool/param description "Defaults to 20."）——parity 两工具。overrideable（config field 保，preset 可覆盖）；D2g 数据 decisive（20 严格优于 10 跨 all variants，无 gradual 基础）。latency/cost：topK=20 召回多 candidate → 下游 NL→SQL 处理多，但 UNDERSTANDING-phase prefetch 召回是目的 + bounded（20 vs 5）+ overrideable。

**TDD red-green（production code）**：
- `corpus.ts` variant（corpus.spec：term-only packs desc+slang NOT params_fields；default=params+term packs all——RED 3rd-arg-ignored packs params → GREEN branching）。
- `io.ts` variant 透传（corpus.spec：`loadRetrievalCorpus(layer,'term-only')` packs slang NOT params；default packs params——RED → GREEN）。
- `Service` corpusVariant config（corpus.spec：`Service{corpusVariant:'term-only'}` → loadRetrievalCorpus packs slang NOT params + `svc.corpusVariant='term-only'`；default Service packs params + `corpusVariant='params+term'`——RED → GREEN）。
- topK default（search S11 + retrieve R12：25 candidates no top_k → expect 20——RED get 5 → GREEN default 20）。
- semantic-layer 24/24（19 corpus incl 4 D2h + 5 scenarios）+ tool-search 11/11（incl S11）+ tool-retrieve 12/12（incl R12）spec green；三包 per-pkg `tsc --noEmit` EXIT=0（tsconfig.json，避 tsconfig.host 并发）。

**Live-verify（measurement → audit-log）**：tsx probe `prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts` over REAL RBI 10000147 经 real SemanticLayerService（config→Service→io→corpus.ts）+ shipped tool-search execute（getEnrichedLinker）：
- [1] default (params+term) Service：role.online enriched packs params（角色id 等 ~40 fields）+ slang（日活/DAU/留存）；`corpusVariant=params+term`（shipped 行为保）。
- [2] term-only Service：role.online enriched = `玩家上线 日活 DAU 留存`（desc+slang ONLY，NO params）；`corpusVariant=term-only`；variant switched corpus? true。
- [3] topK=20 default (no top_k)：充值 query → params+term **20** candidates / term-only **20** candidates（cap 20，pre-D2h would be ≤5 → 5→20 wired）；params+term top-1=recharge (19.899) / term-only top-1=recharge (19.445)。
- [4] D2g bridge live signal：`商城购买` → term-only top-1=**shop.buy**（D2g-expected bridge event）vs params+term top-1=leagueguild.rndshopbuy（≠ shop.buy）——**live 实证 D2g verdict (A) 机制**：term-only slang bridge 商城购买→shop.buy ranks shop.buy higher；params+term 的 param-field text dilute via BM25 length-norm → shop.buy 排低。（`道具产出`/`创角` bridges 在 10000147 scope 不 resolve——item.add/game.role.create 可能不在该 scope 或 slang 缺；D2g bridges 跨 5 scope，10000147 仅 15 events-with-slang。）
- verdict CONFIRMED：default packs params+slang + term-only drops params keeps slang + variant switches corpus。
- 详 [experiment-audit-log](../../research/experiment-audit-log.md) D2h 条目（verbatim + fidelity caveat：smoke-level build-confirm wiring + 1 live bridge signal，非 113-case re-measure；recall 数 term-only 77.0% / term@topK=20 85.0% / params+term 68.1% / 81.4% D2g-audited via faithful python port = corpus.ts logic → holds by construction；本 probe 用 SHIPPED TS corpus.ts variant branching 直跑 over real RBI）。

**不 regress / 不 flip**：本票只让 term-only 可配 + topK 5→20（抬 cheap floor 朝 85-90% bar——term@topK=20=85.0% strict 仍 < bar 边缘）；**不**测 regress 门槛（flip 须 real embedder=[D2c-revisit](D2c-revisit-regress-reeval.md)，仍 blocked by real embedder 部署）；**不**上 real embedder。additive/reversible：variant default=params+term（保 D2e shipped）+ topK default 改回 5 即回退。**不**改 D2e shipped params+term 默认（term-only opt-in）。retrieve-tool 仍 dormant（D2h 只同步其 topK default 常量，不激活——激活=P7b 域，勿碰）。

**验证**：semantic-layer 24/24 + tool-search 11/11 + tool-retrieve 12/12 spec green；三包 per-pkg tsc EXIT=0。**无 concurrent 文件触碰**（corpus.ts/io.ts/index.ts + 三 spec + probe = 本 session D2 域文件，非并发域；audit-log/map.md 经 byte-faithful cat-file-HEAD pipeline stage 仅 +D2h hunk——D2g/D2f preserved；cordis.patch.yml/pnpm-lock/phase-gate/preset 未碰）。

**证据**：本 session `prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts`（TS，SHIPPED corpus.ts variant branching 直跑 over real RBI；run `cd <repo> && pnpm exec tsx <path>`）+ D2g `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py`（python faithful port of corpus.ts，113-gold recall——run `cd ~/workspace/reverse-bi && uv run python <path>`）。独立读 `packages/data/semantic-layer/src/{corpus,io,index}.ts` + `packages/data/tool-{search-data-sources,retrieve}/src/index.ts` + schemastery `z.union` 习语（`packages/core/tools/src/index.ts:791`）。

**map 更新**：Decisions 加 D2h 条目（term-only selectable + topK 5→20 shipped）。

**Follow-ups**：
- [D2c-revisit](D2c-revisit-regress-reeval.md)（real embedder regress 重测——可在 now-live + term-only-selectable enriched corpus 上测；85.0%@topK=20 仍 < 85-90% bar，flip 须 real embedder，仍 blocked）。
- params-only variant（future 非破坏 enum 扩展——D2g 测 63.7% strictly worse + degenerate；lower-priority，deployment need 触发时加）。
- retrieve-tool 激活（P7b 域——uncomment preset + phase-gate whitelist + persona；D2h 只同步 topK default，不激活）。
