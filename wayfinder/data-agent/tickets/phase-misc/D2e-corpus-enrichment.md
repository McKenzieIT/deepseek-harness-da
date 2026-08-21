# D2e — corpus-enrichment build（index params_fields + terminology，not domain）

**Type**: prototype（build：enrich retrieval corpus feed）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Unblocked（graduated from [D2d](D2d-retrieval-quality-reframe.md) re-frame 2026-08-21；未被任何会话 claim）
**Graduated from**: [D2d](D2d-retrieval-quality-reframe.md)（resolved 2026-08-21）——栈第 (ii) 层 corpus-feed gap 的 build 方向毕业成票。

**Question**: 把 retrieval corpus feed 从薄 `{id,description,metrics}` enriched 到索引 `params_fields` + `terminology` slang（**不**索引 `domain`——probe 证有害），抬 default prefetch recall floor（BM25-only 41.9%→~58%）。

**fed by（D2d probe 证据）**：real RBI scope 10000147（31 gold cases, BM25-only）——base 41.9% / +params_fields 54.8%(+12.9pp) / +terminology 48.4% strict·51.6% loose(+6.5pp) / params+term 58.1% strict·61.3% loose(best) / +domain **HURTS**(54.8%<58.1%)。仅 1/1966 event 有 `metrics` 键 → 现 corpus 几全 = id×3 + 短 desc×1，语义内容（角色/战力/元宝/付费）全在 `params_fields` 未索引；`terminology.yaml` 现成 slang→events 桥（日活→role.online、充值/付费→recharge…）15/1966 event 覆盖，未用。详见 [D2d Resolution](D2d-retrieval-quality-reframe.md)。

**Design**：
- **corpus mapping**：P6b `ctx.schema` `EventDefinition`（已 ship，含 `params_fields`）→ retrieval-inproc `RetrievalCorpusItem`。`RetrievalCorpusItem` 现只有 `{id,description,metrics,payload}`——enrichment 把 `params_fields`（field name + description）+ `terminology` slang 映射进 `description`（或新 field + `FIELD_WEIGHTS` 加权重）。[probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py) 把内容 pack 进 `description` 模拟"enrich feed"，faithful（测了 variant 效果）。
- **不索引 domain**（probe 证粗 Chinese domain 名 inflate false-positive，丢 item.add/shop.buy）。
- **tokenizer-fidelity**：测于 **actual `Bm25Linker` default**（unigram+bigram tokenizer），非 §7 的 `HybridRetriever` port（bigram-only）——两 BM25 路径 tokenizer 不同（mount retrieval-inproc 换 prefetch tokenizer，hidden inconsistency）；须 reconcile 或文档。probe_hypotheses.py 用 HybridRetriever port；D2e 须 port Bm25Linker tokenizer 重测或对齐两 tokenizer。
- **methodology 复用** [probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py)（variant-testing：params/term/domain/topK 各变体；real RBI scope 10000147；可扩展多 scope）。
- **findings 文档化**：domain 有害（排除）+ terminology 覆盖窄（15/1966，只桥高频业务概念——日活/充值/留存/新增；长尾 event 靠 params_fields；terminology 可扩展作 future data-quality）。

**Scope/边界**：本票只 enrich corpus feed（抬 floor 至 ~58%）；**不**测 regress 门槛（58%<85-90%，flip 须 real embedder——[D2c-revisit](D2c-revisit-regress-reeval.md) job）；**不**上 real embedder（user-ops-blocked，D2c-revisit）。additive/reversible。

**Blocked by**: 无（P6b `ctx.schema` substrate 已 ship；corpus mapping gap 在 retrieval-inproc/tool-search-data-sources，additive）。

**关联**: [D2d](D2d-retrieval-quality-reframe.md)（re-frame，产本票）；[D2c-revisit](D2c-revisit-regress-reeval.md)（blocked-by 本票——regress 测须先有 enriched corpus）；P6b（ctx.schema substrate）；P5b（retrieval-inproc `RetrievalCorpusItem`）；[probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py)（methodology）。
