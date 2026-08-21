# D2e — corpus-enrichment build（index params_fields + terminology，not domain）

**Type**: prototype（build：enrich retrieval corpus feed）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Resolved（2026-08-21，wayfinder D2e build session；enrichment build + 证据见 Resolution；graduated from [D2d](D2d-retrieval-quality-reframe.md) re-frame 2026-08-21）
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

## Resolution（resolved 2026-08-21，wayfinder D2e build session——probe 扩展 + TDD build + ship）

**映射形态决策 = pack-into-description ×1（probe 实测最优，非仅安全默认）**：probe 在**真实 default 路径**（Bm25Linker）测两形态——pack-into-description（×1）= **54.8% strict / 58.1% loose**；加权（params+term×3，模拟 `FIELD_WEIGHTS` 加权 = BM25 token 重复）= 54.8% strict / **54.8% loose**（**加权使 loose 变差**：BM25 tf 饱和 + 长度归一化稀释 id/desc 信号）。**"加权或更高"假设被实测证伪**（strict 持平、loose 下降）。故 ship pack-into-description。enrichment 内容 = **params_fields（field name + field description）+ terminology slang**（D2d/ticket spec，跨两 tokenizer 稳健）；**不索引 domain**（probe 证粗 Chinese domain 名 inflate false-pos，丢 item.add/shop.buy）。

**D2d tokenizer-fidelity caveat 量化 reconcile**：§7/HybridRetriever port（embedder bigram-only + 含零分 floor 侥幸）params+term = 58.1%/61.3%；**真实 default Bm25Linker**（CJK unigram+bigram + Lucene idf `log(1+x)` + `score>0` 过滤 + `{name×3,desc×1,metric×1}`）= **54.8% strict / 58.1% loose**——§7 port **高估 ~3pp**（bigram-only + floor 侥幸）。定性栈结论稳（enrichment 把 floor 从 41.9% 抬到 ~55-58%）；**诚实 cheap-fix ceiling = BM25-only + params + term ≈ 54.8% strict / 58.1% loose on real default**（非精确 58.1% strict——那是 §7 port 数）。仍 <<85-90% regress bar → **D2c keep (b) 不动**（flip 须 real embedder = D2c-revisit）。

**term-only 反常（文档化，不 ship）**：真实 default 上 term-only=64.5%（高于 params+term 54.8%），但 §7 port 上仅 48.4%——**排名跨 tokenizer 翻转**，判为 31-case 小样本噪声非稳健信号；params+term 在两 tokenizer 都抬 floor（稳健），故 ship params+term（spec-faithful）。term-only + topK 调参（base topK=20→64.5%）作 future data-quality/更大 case 集 follow-up 记录，非本票。

**Build（additive/reversible，TDD red-green）**：
- **`packages/data/semantic-layer/src/corpus.ts`**（新，纯函数，无 fs/io 依赖）：`parseTerminology(raw) → event→[slangs]`（slang 多别名 split `/，、` + 去重保序 + lenient——missing/empty/malformed 返空 map 不抛）+ `buildRetrievalCorpus(events, terminology) → EventCorpusItem[]`（pack event desc + params_fields name+desc + terminology slang 进 `description`；**不索引 domain**；`payload` 载原 event）。输出 `EventCorpusItem{id,description,metrics,payload}` 结构兼容 `DataSourceDoc`/`RetrievalCorpusItem`（**无 retrieval 运行时依赖**）。忠实复刻 probe 的 `params+term` variant → shipped corpus text == 测的 54.8/58.1。
- **`io.ts`**：`loadRetrievalCorpus(semanticLayer)` reader——组合 `loadEvents` + `loadTerminology` + adapter `eventCorpusInput`（投影 `RawEvent`→`EventCorpusInput`，lenient：malformed 字段 omit 不抛）+ `parseTerminology` + `buildRetrievalCorpus`。
- **`ctx.schema` Service**（`index.ts`）：additive `loadRetrievalCorpus(): readonly EventCorpusItem[]`（delegate to io，pass `this.semanticRoot`，仿 `loadEventDefinition`）。semantic-layer 公开导出 corpus.ts + `loadRetrievalCorpus`。
- **`packages/data/tool-search-data-sources/src/index.ts`**（真实 default 路径 wiring，**镜像 P5b retrieval 软回退**）：execute 在 retrieval 软回退之后、空 linker 回退之前探测 `ctx.get('schema')`（structural cast `SchemaCorpusSource`，**无 semantic-layer 类型依赖/tsconfig 改动**——cordis `ctx.get` 对未知 key 返 `any`→cast；防御 `typeof loadRetrievalCorpus === 'function'`）；有则 `getEnrichedLinker(schema)`（`WeakMap` 缓存 enriched `Bm25Linker`，1966-event 语料仅 tokenize 一次）→ `searchDataSources(enrichedLinker, ...)`；无则空 `Bm25Linker`（现状，callable-but-unwired）。`inject` 保持 `['tools']`（非 `'schema'`）→ 工具无 schema provider 仍加载；retrieval 软回退优先（opt-in hybrid 路径不变），schema 软回退次之（default BM25-only 路径的 enrichment）。
- **probe 扩展**（`probe_hypotheses.py` `main_linker_fidelity`）：忠实复刻 shipped Bm25Linker（unigram+bigram tokenizer + `log(1+x)` idf + `score>0` + `{name×3,desc×1,metric×1}`）+ 加权 variant（`build_variant_weighted` params+term×3）+ tokenizer reconciliation——测真实 default floor、证伪加权、settle D2d caveat。

**Runtime 激活门槛（dormant-until-mount，additive/reversible）**：bundle `cordis.patch.yml` 的 `semantic-layer` 行仍 **commented**（核 working-tree + HEAD，2026-08-21，行 105-106）→ 当前 boot 不挂 `ctx.schema` → tool 用空 `Bm25Linker`（**现状，无回归**）；enrichment 在 `ctx.schema` 挂载时（bundle uncomment `semantic-layer`——单独/并发 bundle 步骤，非本票）激活，挂载后 floor 抬至 ~54.8/58.1（measured）。不挂则无行为变化；挂则 enriched；re-comment 即回退。

**不 flip D2c keep (b)**：本票只抬 cheap floor 至 ~54.8/58.1（仍 <85-90%）；不测 regress 门槛（flip 须 real embedder = D2c-revisit）；不上 real embedder（user-ops-blocked）。escape-hatch（[D2c-impl](D2c-impl-retrieve-tool-shipping.md)）仍必需（58% < good）——两者合 = cheap floor：BM25-only prefetch + enriched corpus + escape-hatch 软回退。

**验证**：semantic-layer 11 corpus + 5 scenarios spec green；tool-search 9 spec green（含新 S9 schema 软回退）；两包 per-pkg `tsc --noEmit` EXIT=0（tsconfig.host 并发改动回避——per-pkg tsc 满足，仿 P5b note）。**无 concurrent 文件触碰**（cordis.patch.yml / agent.cordis.yml / llm-dashscope / tsconfig.host / pnpm-lock / tool-load-* 均未碰；git status 仅本票 6 改 + 2 新文件）。

**证据**：`probe_hypotheses.py` `main_linker_fidelity`（real RBI scope 10000147, 31 gold cases, Bm25Linker faithful port + 加权 variant + tokenizer reconciliation——reproduces 41.9% base + 54.8/58.1 params+term on real default）。独立读 `packages/data/nl2sql-engine/src/bm25-linking.ts`（Bm25Linker tokenizer/idf/FIELD_WEIGHTS）+ `packages/retrieval/retrieval-inproc/src/hybrid.ts`（HybridRetriever port + RetrievalCorpusItem/FIELD_WEIGHTS）+ `packages/data/semantic-layer/src/{types,io,index}.ts`（EventDefinition.params_fields + ctx.schema）+ reverse-bi `resources/semantic-layer/10000147/{events/pay/recharge.yaml, terminology.yaml}`。

**map 更新**：Decisions 加 D2e 条目；[D2c-revisit](D2c-revisit-regress-reeval.md) corpus prerequisite 解（D2e resolved——enriched corpus shipped dormant；still blocked by real embedder）。

## Code review（post-resolution，2026-08-21——两并行 subagent：TS 生产代码 + probe/测试）

**Verdict**：SHIP / FIX-RECOMMENDED——无 critical/major；findings 皆 minor/latent（仅 bundle uncomment `semantic-layer` 激活后显现）。

**Fixes applied（incorporated into the commit）**：
- `loadRetrievalCorpus` leniency：独立 try/catch per loader（`loadEvents` / `loadTerminology`）——corrupt `terminology.yaml` → 空 glossary（不抛、不丢 events），unreadable `events/` → 空 events；镜像 lenient `loadEvents` per-file scan + `parseTerminology` guards。（原 docstring 的 "lenient, no throw" 声明曾不实——`loadTerminology` 的 `readYaml` 无 try/catch，corrupt glossary 会抛。）
- `isPlainObject` 收紧（`!Array.isArray`）；`paramsText` 跳过非 plain-object field value（镜像 probe `if not isinstance(fdef, dict): continue`）——shipped corpus 忠实 == 测的 54.8/58.1，即使 malformed `params_fields`（非 object 值不产生 stray field-name token）。
- probe reconciliation note：~3pp gap 明确 conflates 4 diffs（tokenizer + idf[log(1+x) vs max(0,log)] + score>0 floor filter + field weights[{id:3,desc:1,metric:4} vs {name:3,desc:1,metric×1}]；后 3 对 1966-event corpus 可忽略[1 event 有 metrics；idf 仅 >50%-df token 差]）——D2e 决策测于 faithful Bm25Linker port，独立于此 gap。

**Deferred（latent，激活时 wiring）**：enriched-linker `WeakMap` 缓存不 invalidate 于 mid-session Tier-2 writes（`writeEventYaml`/`updateTableMeta` 触发 `invalidateCaches` 但 tool-search 无 semantic-layer 静态依赖故未注册 hook）。recall 声明（54.8/58.1）对 boot-time corpus 成立；激活时（bundle uncomment `semantic-layer`）须 wire 一个 invalidation hook（或按 stat-mtime/content-hash key 缓存）使 event 编辑刷新 enriched linker。**非本票阻塞**（dormant——当前 bundle 未挂 semantic-layer）。

**测试新增（red→green）**：corrupt-terminology leniency test（events 仍索引、无 slang、不抛）+ malformed-params_fields skip test（非 object 值跳过、无 stray field-name）。**27 spec green**（13 corpus + 5 scenarios + 9 tool-search）；两包 per-pkg `tsc --noEmit` EXIT=0。
