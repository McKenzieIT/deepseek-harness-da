# D2d — retrieval-quality 问题 re-frame（what IS the problem + how to fix）

**Type**: grilling
**Phase**: misc（cross-phase；D2 lineage continuation）
**Status**: Resolved（2026-08-21，wayfinder grilling session；re-frame 决策见 Resolution）
**Graduated from**: map Not-yet-specified「retrieval-quality 问题 re-discussion」（commit 5da277b0d2 加，fed by D2c real-RBI baseline §7）——把该雾指针毕业成票。

**Question**: D2c real-RBI 基线测得 default prefetch strict recall **32.3%**（FakeHash hybrid）/ **41.9%**（BM25-only）on scope 10000147，远低 85-90% regress 门槛。§7/D2c 把它框成「**F4 = params_fields 未索引是主因** → escape-hatch + real-embedder + params 索引皆必需」。**本票重新讨论：问题到底是什么（单因 vs gap 栈）、根因、可不可修、怎么修、是否改 D2c 的 keep 决策**——非 [D2c-revisit](D2c-revisit-regress-reeval.md)（那是 regress re-eval with 升级 retrieval，测门槛；本票 re-frame 问题本身 + 产 D2c-revisit 的 prerequisite input）。

**fed by（本会话独立调查证据，非预设结论）**：独立读 retrieval 代码（`packages/retrieval/retrieval-inproc/src/hybrid.ts` `FIELD_WEIGHTS{id:3,desc:1,metric:4}` + `RetrievalCorpusItem{id,description,metrics}` 不含 params_fields；`packages/data/tool-search-data-sources/src/index.ts`；`packages/embedder/embedder-fakehash/src/index.ts`）+ reverse-bi 真 corpus/cases（`resources/semantic-layer/10000147/events/**` 1966-event + `terminology.yaml` + `domains.yaml` + `eval-cases/10000147/eval_*.yaml` 37 case）+ 重跑/扩展 baseline（`prototypes/d2c-retrieve-baseline/probe_hypotheses.py`，BM25-only 下测 params/terminology/domain/topK 各假设）。

§7/D2c framing 经独立调查 found **incomplete + partly misleading** on 3 counts：

1. **「32.3% = production default」非当前态**：data-agent bundle `packages/bundle/data-agent/cordis.patch.yml` 的 `embedder`(FakeHash)+`retrieval`(inproc) 两行 **commented**（注："an unmounted seam keeps search_data_sources on its Bm25Linker default (no behavior change)"；"Left commented pending D2c keep/regress"）→ 当前 default boot 跑 `search_data_sources` 软回退到本地 `Bm25Linker`（BM25-only）≈41.9%，**非 32.3%**。32.3% 是 opt-in FakeHash-hybrid 态。**更糟**：mount FakeHash（D2c-impl retrieve-tool 须注册 `ctx.retrieval` 才不走软回退时挂）会 **regress** prefetch 41.9%→32.3%——self-inflicted regression。

2. **「F4 主因」只是数个 co-equal gap 之一**：probe on real RBI（scope 10000147, 31 gold cases, BM25-only）—

   | variant | strict | loose | Δ vs base |
   |---|---|---|---|
   | base（id+desc+metrics，仅 1 event 有 metrics） | 41.9% | 41.9% | — |
   | +params_fields（field name+desc） | 54.8% | 54.8% | +12.9pp（F4 确证） |
   | +terminology slang（日活→role.online、充值/付费→recharge…） | 48.4% | 51.6% | +6.5pp（**第二 bridge §7 未隔离**——reverse-bi `terminology.yaml` 现成未用；15/1966 event 有 term bridge，覆盖高频业务概念） |
   | params+term（best） | 58.1% | 61.3% | +16-19pp |
   | +domain（Chinese domain 名） | 54.8% | 58.1% | **HURTS**（coarse 名 inflate false-pos，丢 item.add/shop.buy） |
   | topK=20 | 51.6% | 51.6% | modest（部分 gold 排名低非缺席） |
   | FakeHash-hybrid（任一 variant） | **严格劣于 BM25-only**（e.g. all: hybrid 41.9% < bm25-only 54.8%） | | F1 real-scale 复证 |

3. **问题是 gap 栈，各 gap 独立可修、不同 lever/owner**：
   - **(i) FakeHash-as-default self-harm** [config defect]——挂 FakeHash 使 hybrid 劣于 BM25-only；mount 它 regress 默认。cheap 修：**不挂 FakeHash 为生产默认**；BM25-only 作 prefetch floor（retrieve-tool 软回退 Bm25Linker 保 41.9%，或 retrieval-inproc 默认 BM25-only-degrade）；hybrid plane 留真 embedder。
   - **(ii) corpus feed 太薄** [data gap，via P6b `ctx.schema`→retrieval corpus mapping]——索引 params_fields(+12.9pp)+terminology(+6.5pp)，**不**索引 domain；floor 升 ~58%。P6b substrate（`EventDefinition.params_fields`）已 ship，gap 在 corpus mapping。
   - **(iii) CJK synonym 语义 gap** [needs real embedder]——enriched 58% 仍 <85-90%；人气≈活跃、消费≈付费 lexical 不可桥；剩 ~27pp 需 semantic embedding。**D2c-revisit job**。
   - (iv) topK 调参（modest）；(v) **measurement fidelity caveat**：§7 baseline port 了 `HybridRetriever`(bigram tokenizer)，非实际 default prefetch 的 `Bm25Linker`(unigram+bigram tokenizer)；exact % 或微差，qualitative 栈结论稳。

- **cheap-fix ceiling = BM25-only + params + terminology = 58.1% strict**，仍 <<85-90% regress bar → **D2c keep (b) 不动**（cheap lexical fix 满足不了 regress 非对称负担：≥85-90% strict + <15% ambiguity）；fixes 抬 floor + 作 D2c-revisit real-embedder 测的 prerequisite/input，**非 flip 决策**。

**关联（只读参考，勿混）**：
- [D2c](D2c-retrieve-tool-keep-regress.md) resolved（keep (b)；本票 re-frame 其 baseline 暴露的问题，不改其决策）。
- [D2c-revisit](D2c-revisit-regress-reeval.md)（regress re-eval with 升级 retrieval——测门槛；**不同问题**；本票 re-frame 问题本身 + 产其 corpus/prerequisite input：params+terminology 索引、不挂 FakeHash）。
- [D2c-impl](D2c-impl-retrieve-tool-shipping.md)（ship retrieve-tool escape-hatch——bundle wiring 决策受本票 "不挂 FakeHash" 方向影响：retrieve-tool 可软回退 Bm25Linker 保 41.9%，不必 mount FakeHash regress prefetch）。
- P5b（retrieval/embedder bundle opt-in commented，BM25-only 当前 default）、P6b（`ctx.schema` richer fields——params 索引 substrate 已 ship，corpus mapping gap 落此）。

## Resolution（resolved 2026-08-21，wayfinder grilling session——一问一答每问给推荐，shared understanding 后定夺）

**Re-frame（决策）**：retrieval-quality 问题**非** §7 单因 F4，是 **3 层 co-equal 独立可修 gap 栈 + mislabel**：
- **(i) FakeHash-as-default self-harm**[config]——FakeHash hybrid 在全部 6 corpus variant 严格劣于 BM25-only（real-scale 复证 F1）；**真 default = BM25-only ~41.9%**（bundle `cordis.patch.yml` 的 embedder+retrieval **commented** → `search_data_sources` 软回退本地 `Bm25Linker`），**非 32.3%**（32.3% 是 opt-in FakeHash-hybrid 态）；**挂 FakeHash 会 regress prefetch 41.9%→32.3%**（self-inflicted）。
- **(ii) 薄 corpus-feed**[data，via P6b `ctx.schema`→retrieval corpus mapping]——`RetrievalCorpusItem{id,description,metrics}` 不索引 `params_fields`(+12.9pp)/`terminology`(+6.5pp)；`domain` **有害**（粗名 inflate false-pos，丢 item.add/shop.buy）；cheap-fix ceiling = BM25-only + params + terminology = **58.1% strict / 61.3% loose**。
- **(iii) CJK synonym 语义 gap**[needs real embedder]——人气≈活跃、消费≈付费 lexical 不可桥；enriched 58% 仍 <85-90%；剩 ~27pp 需 semantic embedding（**D2c-revisit job**）。
- (iv) topK 调参 modest（topK=20→51.6%）；(v) **measurement-fidelity caveat**：§7 baseline port 了 `HybridRetriever`(embedder `tokenize.ts`=bigram-only)，非实际 default prefetch 的 `Bm25Linker`(unigram+bigram)——两 BM25 路径 tokenizer 不同，mount retrieval-inproc 换 prefetch tokenizer（hidden inconsistency）；exact % 或微差，qualitative 栈结论稳。

**D2c keep (b) 在 corrected basis 重确认（不改决策，修 premise）**：D2c"32% 严重不足 → escape-hatch + real-embedder + params索引 **皆必需**"的 premise 基于 FakeHash-hybrid 数（32.3%，opt-in，非真 default）。**拆序**：cheap UNBLOCKED（params+terminology + 不挂 FakeHash）→ 58% floor（现在可做）；real-embedder（D2c-revisit，user-ops-blocked）→ semantic gap（剩 ~27pp）；escape-hatch 仍必需（58% < good）。58.1% < 85-90% regress bar + ambiguity 21.6% > 15% → regress (a) 非对称负担未满足 → **keep (b) 不动**（flip 须 real embedder）。

**Follow-ups（毕业 + 修记录）**：
1. **新 build 票 [D2e-corpus-enrichment](D2e-corpus-enrichment.md)**（prototype/task，unblocked）——索引 params_fields + terminology slang，**不**索引 domain；抬 BM25-only floor 41.9%→~58%，作 D2c-revisit prerequisite。含：tokenizer-fidelity（测于 actual Bm25Linker default 或 reconcile embedder-bigram vs Bm25Linker-unigram+bigram 分歧）+ 引用 [probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py) 作 variant-testing methodology + 文档化 domain 有害/terminology 覆盖窄(15/1966) findings。
2. **FakeHash-not-default 约束落 [D2c-impl](D2c-impl-retrieve-tool-shipping.md)**——retrieve-tool 软回退 Bm25Linker、**不**挂 FakeHash（避免 41.9%→32.3% self-regression）；真 embedder 来（D2c-revisit）再 uncomment retrieval-inproc + real embedder。
3. **更新 [D2c-revisit](D2c-revisit-regress-reeval.md)**——corrected premise（真 default=BM25-only 41.9% 非 32.3%；cheap-fix ceiling 58%）+ blocked-by 加 D2e corpus-enrichment + tokenizer-fidelity note（测 actual default 非 HybridRetriever port）。
4. **修 mislabel 记录**——[research §8](../../research/d2c-keep-regress-baseline.md)（add §8 纠正 §7：32.3%=opt-in FakeHash 非真 default；F4 one-of-several 非 main cause；problem=stack；cheap-fix ceiling 58%；keep 重确认 corrected basis）+ [D2c resolution](D2c-retrieve-tool-keep-regress.md) 加 correction 指针（指向 §8 + 本票）。

**证据**：[probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py)（real RBI scope 10000147, 31 gold cases；6 variant × {BM25-only,hybrid} + topK sweep；reproduces baseline 41.9%/32.3% exact）。独立读 `packages/retrieval/retrieval-inproc/src/hybrid.ts` + `packages/data/tool-search-data-sources/src/index.ts` + `packages/embedder/embedder-fakehash/src/index.ts` + `packages/bundle/data-agent/cordis.patch.yml` + reverse-bi `resources/semantic-layer/10000147/{events,terminology.yaml,domains.yaml}` + `eval-cases/10000147/`。

**map 更新**：Decisions 加 D2d 条目；Not-yet-specified「retrieval-quality 问题 re-discussion」雾指针毕业（→ D2d 票，resolved）移出雾。
