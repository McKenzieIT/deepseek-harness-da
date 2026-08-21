# D2h — corpus term-only selectable + raise default prefetch topK toward 20

**Type**: task（build/config：D2g verdict (A) 毕业——让 term-only 可配 + 默认 prefetch topK 抬向 20）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Unblocked（D2g resolved 2026-08-21 verdict (A) term-only 稳健高召回；D2f resolved 2026-08-21 corpus live + cache-invalidation wired——可在 live enriched corpus 上调）。
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
