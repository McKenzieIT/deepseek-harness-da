# D2c-revisit — regress-to-(a) 重访（真 eval 数据）

**Type**: grilling
**Phase**: misc
**Status**: Blocked by G1b（真 RBI case 集——载体属后续 build；G1b 状态随并发会话演变）+ 可选真 embedder（用户自部署 sidecar，map Not-yet-specified「intranet 重 embedder 部署形态」）
**Graduated from**: [D2c](D2c-retrieve-tool-keep-regress.md)（resolved 2026-08-21，决策=keep (b)、regress 延后到真数据）——regress re-eval 的 deferred 条件毕业成票。

**Question**: 用真 eval 数据（G1b 真 RBI 161 case 集 + 可选真 embedder sidecar）重测确定性预取召回 + 歧义，达 ≥85-90% strict + <15% ambiguity → regress (a) pipeline-only（砍 retrieve-tool——若 [D2c-impl](D2c-impl-retrieve-tool-shipping.md) 已 ship 则 unship）；否则 keep (b)（不可逆锁定或再延）。

**Design（方法论复用 [research/d2c-keep-regress-baseline.md](../../research/d2c-keep-regress-baseline.md) §6）**：
- **corpus**：真 RBI 语义层 531 entries（经 P6b `ctx.schema`，**含 params_fields**——修 baseline F4 事件字段未索引）。
- **cases**：RBI 161 真 case，gold 表从 RBI 原 SQL 派生（da-fresh `EvalCase` 砍了 `sql`/`sql_steps`，须回 reverse-bi 源取）；按 G1 七意图 + 线性/迭代分层 ~30 子集（与 G1b case 集对齐/复用）；ambiguity 逐 case 标注（问题级，独立于召回）。
- **embedder**：① BM25-only（默认 baseline）② 真 embedder（用户自部署 `InfinityEmbedder` sidecar 跑 bge-m3/Qwen3-Embedding）③ 真 reranker（TEI/infinity）——测真 hybrid 升级潜力（baseline F1 证 FakeHash 默认弱、真 embedder 才是 hybrid 价值）。
- **recall**：strict(all-gold-in-topK) / loose(any) / coverage 三报；**处理零分 floor**（baseline F5：非零分才计 hit 或 score 阈值，免 stable-sort 侥幸）。
- **ambiguity**：问题级 tag（独立于召回）；报 clear/ambig 召回 split（baseline F6 证歧义召回系统性低）。
- **决策**：真数据测得 strict≥85-90% + ambiguity<15% → regress (a)；否则 keep (b)。负担须由真数据满足（per D2c 非对称论证——regress 删能力需强证据）。

**Blocked by**: G1b（真 RBI case 集——载体属后续 build；G1b 状态随并发会话演变）+ 可选真 embedder（用户自部署 sidecar，map 雾「intranet 重 embedder 部署形态」；BM25-only 真数据重访不强依赖真 embedder，真 embedder 为 hybrid 升级信号）。

**关联**: [D2c](D2c-retrieve-tool-keep-regress.md) resolved（keep (b)，regress 延后至此）；[D2c-impl](D2c-impl-retrieve-tool-shipping.md)（若已 ship retrieve-tool，regress 须 unship）；G1b（真 case 集载体，unclaimed）；P6b（`ctx.schema` 真 corpus）；T2（AGA 无 embeddings → 真 embedder 须用户自部署 sidecar）。
