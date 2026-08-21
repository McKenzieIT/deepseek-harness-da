# D2c-revisit — regress-to-(a) 重访（真 eval 数据，升级后 retrieval）

**Type**: grilling
**Phase**: misc
**Status**: Blocked by real embedder 部署（用户自部署 sidecar，map 雾「intranet 重 embedder 部署形态」）+ params_fields 索引升级（P6b ctx.schema richer field weights / retrieval follow-up——修 F4）。**reverse-bi 可达**（~/workspace/reverse-bi：eval-cases/ + libs/rbi-semantic）→ case 集/corpus 数据不再阻塞（已用于 shipped-logic baseline，见下）。
**Graduated from**: [D2c](D2c-retrieve-tool-keep-regress.md)（resolved 2026-08-21，决策=keep (b)、regress 延后到真 eval 数据）——regress re-eval 的 deferred 条件毕业成票。

**Question**: 用升级后 retrieval（real embedder + params 索引 + 可选 synonyms/terminology）在真 RBI 上重测确定性预取召回 + 歧义，达 ≥85-90% strict + <15% ambiguity → regress (a) pipeline-only（砍 retrieve-tool——若 [D2c-impl](D2c-impl-retrieve-tool-shipping.md) 已 ship 则 unship）；否则 keep (b)。

**已跑 shipped-logic baseline（2026-08-21，[research §7](../../research/d2c-keep-regress-baseline.md)）**：reverse-bi scope 10000147（1966-event corpus，37 case，31 有 gold），DEFAULT HYBRID strict **32.3%** / BM25-only 41.9% / ambiguity 21.6%——**双判据远未达 regress 门槛（32.3%<<85-90%、21.6%>15%）→ keep (b) decisively confirmed**。主因 F4：events 语义内容在 params_fields，shipped FIELD_WEIGHTS{id,desc,metric} 不索引 → Chinese 问题匹配不上 English event id + 短 description。本 32.3% 是 shipped-logic 无升级 baseline；D2c-revisit 测**升级后**能否达门槛。

**〔D2d re-frame correction 2026-08-21〕**：见 [D2d](D2d-retrieval-quality-reframe.md) + [research §8](../../research/d2c-keep-regress-baseline.md)——上述 32.3% 是 **opt-in FakeHash-hybrid** 非 真默认（真默认=BM25-only ~41.9%，bundle `cordis.patch.yml` embedder+retrieval commented → `search_data_sources` 软回退 `Bm25Linker`）；"主因 F4"是 **one-of-several 非 main cause**（terminology 第二 bridge §7 未隔离；problem=3 层 gap 栈：FakeHash self-harm + 薄 corpus-feed + synonym 语义 gap）；cheap-fix ceiling（params+term，BM25-only）=58.1% strict 仍 <85-90%。**keep (b) 决策在 corrected basis 重确认（不改）**——测升级后 default 门槛不变（须 real embedder + enriched corpus）；blocked-by 显式加 [D2e](D2e-corpus-enrichment.md) corpus-enrichment build（params+term 索引，不 domain）+ tokenizer-fidelity（测 actual `Bm25Linker` default unigram+bigram，非 §7 的 HybridRetriever port bigram-only）。

**Design（方法论复用 [research §6](../../research/d2c-keep-regress-baseline.md) + §7）**：
- **corpus**：reverse-bi `resources/semantic-layer/<scope>/events/**/*.yaml`（~1966/scope）经 P6b `ctx.schema`，**含 params_fields**（修 F4——events 语义内容角色/付费/充值在 params，须索引）+ domains + 可选 synonyms/terminology bridging。
- **cases**：reverse-bi `eval-cases/<scope>/eval_*.yaml`（37-49/scope，5 scope）；gold 从 `expected.sql` 的 `event='X'` 派生（da-fresh EvalCase 砍了 sql，但 reverse-bi 原 EvalCase v3 有 sql）；ambiguity = `dimensions.ambiguity_type`（schema-tagged，objective）；stratify by `query_intent`(7) + `sql_complexity`(L1-L4)。
- **embedder**：① BM25-only（默认 baseline——已测 32.3%）② 真 embedder（用户自部署 `InfinityEmbedder` sidecar 跑 bge-m3/Qwen3-Embedding）③ 真 reranker（TEI/infinity）——测真 hybrid 升级（baseline F1 证 FakeHash 默认弱）。
- **recall**：strict/loose/coverage 三报；**处理零分 floor**（§5 F5：非零分才计 hit，免 stable-sort 侥幸）。
- **ambiguity**：`dimensions.ambiguity_type != 'none'`（schema-tagged，objective，已用）。
- **决策**：升级后真数据测得 strict≥85-90% + ambiguity<15% → regress (a)；否则 keep (b)。负担须由真数据满足（per D2c 非对称论证）。

**Blocked by**: real embedder 部署（用户 ops，map 雾「intranet 重 embedder 部署形态」）+ [D2e-corpus-enrichment](D2e-corpus-enrichment.md)（**resolved 2026-08-21——corpus prerequisite met**：enriched corpus shipped[params_fields+terminology 进 description，不 domain；real-default floor 54.8% strict / 58.1% loose measured on Bm25Linker；dormant until bundle uncomment `semantic-layer`]；D2d re-frame 毕业）。reverse-bi 数据可达（不阻）。

**关联**: [D2c](D2c-retrieve-tool-keep-regress.md) resolved（keep (b) decisively confirmed by real data §7，regress 延后至此）；[D2c-impl](D2c-impl-retrieve-tool-shipping.md)（若已 ship retrieve-tool，regress 须 unship）；reverse-bi（~/workspace/reverse-bi，只读源：eval-cases/ + libs/rbi-semantic）；P6b（ctx.schema richer fields 修 F4）；T2（AGA 无 embeddings → 真 embedder 须用户自部署 sidecar）；[D2e](D2e-corpus-enrichment.md) resolved（enriched corpus shipped——corpus prerequisite **met**；real-default floor 54.8%/58.1% measured on Bm25Linker）；[D2f](D2f-activate-corpus-enrichment.md)（激活 enrichment runtime——使 live enriched corpus 可在本票 re-eval 上测）；[D2g](D2g-corpus-recall-larger-caseset-retest.md)（更大 case 集重测——本票 re-eval 的 case 集可复用其更大集降小样本噪声）；[experiment-audit-log](../../research/experiment-audit-log.md)（D2c/D2d/D2e 测量证据 + 本票 re-eval 结果去处）。

## Re-verification（2026-08-21 session）

**Verdict**: real embedder **未部署** → 条件 B → D2c-revisit **仍 blocked**（本 session 未 claim）。步骤 0 穷尽核验 9 面（非预设）：

- bundle `cordis.patch.yml`：`embedder`+`retrieval` 行仍注释（并发 WT 修改仅新增 `scope-registry`，未解开；注释 embedder 行指向 `dsh-embedder-fakehash` 非真实 provider）。
- `packages/embedder`：`embedder-http`（真实 InfinityEmbedder provider）仅作为已发布代码存在——代码 ≠ 部署。
- `~/.dsh/.credentials.yaml` 存在但无 embedder 相关键；`~/.dsh/settings.yaml` 无 embedder 引用；`~/.dsh/data/`（scopes.yaml）不存在。
- localhost 无 embedder 进程（:7997 无监听）；无 embedder 环境变量。
- `d2g_larger_caseset.py` 探针无 real-embedder 代码路径（唯一 embedder 引用是第 60 行注释）。
- reverse-bi：bge-m3/infinity 引用仅存于计划文档 + drill runbook（`RBI_EMBED_URL=http://127.0.0.1:7997/...` 需手动启 sidecar）+ pyproject 注释「非生产环境默认不启动向量模型」。

**Operative blocker = real embedder only**：本票 `Status` 行所列「params_fields 索引升级（P6b）」已由 [D2e](D2e-corpus-enrichment.md) pack-into-description 解决；case 集已由 [D2g](D2g-corpus-recall-larger-caseset-retest.md) 113-gold 建成；corpus 已由 [D2e]/[D2f](D2f-activate-corpus-enrichment.md) enriched + live；term-only 可配 + topK=20 已由 [D2h](D2h-corpus-term-only-selectable-topk.md) 落地。

**D2 状态**：cheap floor 三部曲 live + maxed——term-only@topK=20 = 85.0% strict（D2g/D2h-audited），卡 85-90% regress bar 边缘。flip keep→regress 须 real-embedder hybrid 跨门槛 = D2d 三层栈第 iii 层唯一 lever。map 内无其他 unblocked D2 build 票（params-only D2g 证伪；§7 bigram-only port 仅 HybridRetriever re-enable 才相关；retrieve-tool 激活 = P7b 并发域）。

**并发隐患（未触碰，未改 audit-log）**：working-tree `research/experiment-audit-log.md` 对 HEAD 删 238 行/0 增——并发会话未提交删除 D2g/D2f/D2h audit 条目（committed HEAD 仍完好，section 在第 142/259/319 行）。任一 commit 前须调和（从 HEAD 恢复或确认有意）。

**下一 session unblock 路径**：real embedder 可达（用户部署 InfinityEmbedder/bge-m3 sidecar + bundle `embedder`/`retrieval` 行接线真实 endpoint）→ claim 本票 → 跑 113-gold real-embedder hybrid 重测（复用 `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py` + 加 real-embedder path，经 P5b `ctx.retrieval` seam 或 probe 直调 embedder endpoint）→ 数据裁决 keep vs regress（≥85-90% strict + <15% ambiguity → regress (a) pipeline-only；否则 keep (b) re-confirmed）→ 结果 verbatim 入 `research/experiment-audit-log.md` D2c-revisit 条目（fidelity caveat：live runtime vs D2g RBI-YAML-simulated port；real-embedder hybrid vs BM25-only；term-only vs params+term）。
