# D2c keep/regress baseline：确定性预取召回 + 歧义 synthetic 测量

> D2c（keep (b) retrieve-tool escape-hatch vs regress (a) pipeline-only）evals-driven 决策的**基线测量**。本测量是**文档/方法论**，**不驱动决策**——决策已基于非对称论证定为 keep (b) + regress 延后到真数据（见 [D2c ticket](../tickets/phase-misc/D2c-retrieve-tool-keep-regress.md) Resolution）。此基线**实证佐证** keep 论证，并沉淀方法论供 [D2c-revisit](../tickets/phase-misc/D2c-revisit-regress-reeval.md) 复用。

## 0. 背景

**决策规则**：确定性预取召回 ≥85-90% **且** 歧义 <15% → regress (a) pipeline-only（砍 escape-hatch）；否则 keep (b)。非对称：regress 删能力需强证据；keep 叠加/可逆（P5 锁定"evals 驱动可逆决策"）。

**约束**（决定本测量形态）：full-agent pass_k 路径被 P11c（open）+ G1b（open/unclaimed）阻塞；无生产 case 集（da-fresh `EvalCase` 砍了 rbi `sql`/`sql_steps`，gold=result_value/answer，无 gold 表）；reverse-bi 不在 repo；默认 embedder=FakeHash（≈BM25-only；真向量 hybrid 测不了——T2 实证 AGA 无 embeddings）。故本会话跑 **retrieval-layer synthetic 基线**（`HybridRetriever` 纯逻辑可独立跑），非 full-agent pass_k。决策层级论证见 ticket；本基线只实证佐证 + 沉淀方法论。

## 1. 方法论

**Harness**：`../prototypes/d2c-retrieve-baseline/`（`.mjs` 自包含，忠实复刻 shipped 逻辑——`tokenize`/`hashVec`/`InferenceError`/`BM25Okapi`(k1=1.5,b=0.75)/`rrfFuse`(k=60)/`cosine`/`buildCorpus`(`FIELD_WEIGHTS{id:3,desc:1,metric:4}`)/`HybridRetriever` + `FakeHash`/`Broken`/`FakeReranker`）。shipped 包 33/33 spec 验逻辑；harness 仅重跑同算法 over synthetic corpus。`.mjs` 免 pnpm/tsconfig entangle（env 已知 host-typecheck gap：P5b tsconfig.host refs DEFER + nl2sql-engine 并发 critic-dedup）。

**Corpus**（30 项，`RetrievalCorpusItem{id,description,metrics}`）：3 真 RBI fixture（`dws_pay_order_di` 表 / `dim_charm_info` 维表 / `role.online` 事件——见 F4）+ 27 synthetic game-data（收入/付费/在线/活跃/留存/会话/道具/角色/社交/公会/聊天/首充/VIP/LTV/登录/登出/服务器/负载/bug/广告）。含**故意近重**（`game_revenue` vs `revenue_summary` vs `pay_order`；`dau` vs `active_user_summary`；`ltv` vs `pay_ltv`）造歧义。

**Cases**（25，da-fresh NL 问题 + gold 表标注 + 歧义 tag + intent + mode）：
- **gold** = 问题所需 corpus id(s)（多表 case 多 gold，如 c17 付费用户占比→[pay_order,dau]）。
- **ambiguity** = **问题级** intrinsic 多数据源可解释（如"收入"→game_revenue/pay_order/payment_channel/summary；"人气"→活跃/在线/登录）。**与召回独立**（歧义是问题属性，非检索结果）。
- stratify by G1 七意图（metric_lookup 8 / trend 4 / comparison 3 / ranking 4 / distribution 2 / proportion 2 / cohort 2）+ linear 18 / iterative 7。
- 8/25=32% ambiguous（**故意歧义偏重的 stress set，非 RBI 161 真分布**）。

**Recall 度量**（topK=5，`search_data_sources` 默认）：strict=ALL gold∈top-5（agent 拿到全部所需表）/ loose=ANY gold∈top-5 / coverage=avg|gold∩top5|/|gold|。

**三 embedder 配置**：① DEFAULT HYBRID（BM25+FakeHash+RRF，P5b 生产默认）② BM25-ONLY（`InferenceError`→降级）③ DEFAULT+FakeReranker（post-RRF peer）。

## 2. 结果

| 配置 | strict | loose | coverage | ambiguity | strict(clear) | strict(ambig) |
|---|---|---|---|---|---|---|
| DEFAULT HYBRID (BM25+FakeHash+RRF) | 17/25=68.0% | 23/25=92.0% | 80.7% | 8/25=32.0% | 12/17=70.6% | 5/8=62.5% |
| BM25-ONLY (InferenceError 降级) | 21/25=84.0% | 24/25=96.0% | 90.7% | 32.0% | 16/17=94.1% | 5/8=62.5% |
| DEFAULT+FakeReranker | 16/25=64.0% | 22/25=88.0% | 76.7% | 32.0% | 12/17=70.6% | 4/8=50.0% |

## 3. 关键发现

**F1 — FakeHash hybrid 反而劣于 BM25-only**（68% < 84% strict）。FakeHash 把 CJK bigram sha256→256 桶，碰撞噪声；vec cosine 是哈希碰撞噪声非语义。RRF 把 BM25 ranking 与噪声 ranking 融合，噪声稀释 BM25 信号，把部分 gold 挤出 top-5（如 c4"本周新增用户数" hybrid MISS、BM25-only OK）。**含义**：生产默认（FakeHash）甚至不如纯 BM25；hybrid 要真有意义须真 embedder（bge-m3/Qwen3，用户自部署 sidecar，T2 实证 AGA 无 embeddings）。这本身佐证 keep+defer——默认弱、真 embedder 升级才是 hybrid 价值所在；而升级前 escape-hatch 是唯一能补 BM25-only 缺口（见 F3）的路径。

**F2 — FakeReranker 有害**（64% < 68% < 84%）。FakeReranker=`fakeRecall`（query-token overlap 比例）+ noise floor 0.1 → 把 <10% overlap 的候选 drop。对 implicit case（c21"玩家消费了多少"——"消费"与"付费"零 token overlap）gold 被 drop → MISS。**含义**：弱 lexical reranker 对 implicit/歧义 case 主动有害；真 cross-encoder reranker（TEI/infinity，用户自部署）语义不同。**默认 reranker 档（FakeReranker）不应激活**——D2c-impl 若 ship retrieve-tool 不应默认挂 FakeReranker。

**F3 — synonym/implicit miss 是 keep (b) 的硬证据**。c11"对比不同游戏的人气"→gold `dws_dau_di`，**全配置 MISS**。"人气"与活跃/在线/登录零 lexical overlap（人气≠活跃≠在线），BM25 无法 link。c21"玩家消费了多少"→"消费"≠"付费"零 overlap。这类 synonym/implicit gap 恰是 escape-hatch（agent 主动 retrieve "人气→活跃"）或真 embedder（语义知 人气≈活跃）能补、BM25-only 补不了的。**实证 keep (b) 论证**。

**F4 — 事件 params_fields 未索引**（`buildCorpus` 只取 id+description+metrics 键）。`role.online` 事件的 params（`amount=充值金额`）不进 corpus text → 该事件只靠"玩家上线"索引，"充值"维度不可检索。P5b 已记此限制（richer field weights 留 P6b ctx.schema）。**D2c-revisit 须在真 ctx.schema corpus（含 params_fields）上复测**。

**F5 — 零分 floor 的 stable-sort 噪声**。BM25 idf clamp≥0 + 零 overlap doc 评 0 分；零分 doc 在 BM25-only 路径按 stable sort 保 corpus 顺序（无显式 tiebreak）、在 RRF fuse 路径按 name 升序 tiebreak。故部分"hit"是 **floor 侥幸**（如 c21 在 BM25-only/hybrid 的 hit——`dws_pay_order_di` 零分但处 corpus index 0，stable sort 保其入 top5），非真检索；reranker 的 MISS 反而更"诚实"（正确看到零 overlap）。**含义**：本基线 strict/loose 数字有 floor 噪声，**不可作生产召回估计**——D2c-revisit 须处理零分 floor（非零分才计 hit，或 score 阈值）。

**F6 — 歧义 case 召回系统性更低**（strict ambig 50-62.5% vs clear 70.6-94.1%）。歧义是召回缺口主要来源，与 [retrieval-consumer-model.md](retrieval-consumer-model.md) 处方一致（歧义 NL 是 escape-hatch 价值所在）。

## 4. 这些数字为什么不驱动决策

1. **synthetic**：30 项 corpus + 25 case 手造，非 RBI 161 真分布；ambiguity 32% 故意 stress，非生产代表。
2. **BM25-only/FakeHash**：无真 embedder（T2 AGA 无）；测的是 lexical，非真 hybrid 语义召回。
3. **小 N + floor 噪声**：25 case、零分 stable-sort 侥幸（F5），CI 极宽。
4. **非对称负担**：regress 删能力需强证据；上述弱证据（synthetic+BM25-only+floor 噪声）无法负责任触发 regress。仅当真 RBI case + 真 embedder + 合理 floor 处理（D2c-revisit）测得 ≥85-90% strict + <15% ambiguity，才可 regress。

## 5. 它确实支持的（实证佐证 keep+defer）

- 默认（FakeHash hybrid）弱（F1），真 embedder 升级才是 hybrid 价值——升级前 escape-hatch 是补缺口路径。
- synonym/implicit miss（F3 人气/消费）是 BM25-only 补不了的——escape-hatch 用武之地。
- 歧义 case 系统性低召回（F6）——歧义正是 escape-hatch 目标。
- BM25-only strict 84%（stress set，borderline，未过 85-90% 门槛）+ 32% ambiguity（stress，远过 15%）——**即使在我造的偏重 set 上也未达 regress 门槛** → 与 keep 一致。

## 6. D2c-revisit 方法论复用

[D2c-revisit](../tickets/phase-misc/D2c-revisit-regress-reeval.md)（regress 重访，blocked by G1b 真 case 集 + 可选真 embedder）应：
- **corpus**：真 RBI 语义层 531 entries（经 P6b ctx.schema，含 params_fields——修 F4）。
- **cases**：RBI 161 真 case，gold 表从 RBI 原 SQL 派生（da-fresh EvalCase 砍了 SQL，须回 reverse-bi 源取）；按 G1 七意图+线性/迭代分层 ~30 子集（与 G1b case 集对齐/复用）；ambiguity 逐 case 标注。
- **embedder**：① BM25-only（默认 baseline）② 真 embedder（用户自部署 InfinityEmbedder sidecar 跑 bge-m3/Qwen3）③ 真 reranker（TEI/infinity）——测真 hybrid 升级潜力。
- **recall**：strict/loose/coverage 三报；**处理零分 floor**（F5：非零分才计 hit 或 score 阈值，免 stable-sort 侥幸）。
- **ambiguity**：问题级 tag（独立于召回）；报 clear/ambig 召回 split。
- **决策**：真数据测得 strict≥85-90% + ambiguity<15% → regress (a)；否则 keep (b)。负担须由真数据满足。

## 7. real-RBI 确认（2026-08-21，post-commit）

reverse-bi（`~/workspace/reverse-bi`，只读源）可达后，重跑基线于**真 RBI** scope 10000147（1966-event corpus，37 case，31 有 gold）——`prototypes/d2c-retrieve-baseline/run_real_rbi.py`（python port of hybrid.mjs + 解析 reverse-bi eval-cases/rbi-semantic）。**real 数据 decisively 确认 keep (b)**：

| 配置 | strict | loose | ambiguity |
|---|---|---|---|
| DEFAULT HYBRID (BM25+FakeHash+RRF) | 10/31=**32.3%** | 32.3% | 8/37=21.6% |
| BM25-ONLY (降级) | 13/31=41.9% | 41.9% | 21.6% |
| DEFAULT+FakeReranker | 8/31=25.8% | 25.8% | 21.6% |

**default prefetch recall 32.3% << 85-90% regress bar；ambiguity 21.6% > 15% bar → 双判据远未达 → keep (b) decisively confirmed（非 borderline，无 flip）**。比 synthetic（84%）远低——synthetic 的受控小语料 + 手造 gold/ambiguity 偏松；real RBI 的 1966-event 英文 id 语料 + Chinese 问题 + params 未索引 暴露真缺口。

**findings（real 数据强化 §3）**：
- **F4 是主因**：events 的语义内容（角色id/战力/充值元宝/付费…）在 `params_fields`，shipped `FIELD_WEIGHTS{id,desc,metric}` **不索引** → Chinese 问题（"角色"/"付费"/"充值"）匹配不上 English event id（role.online/recharge）+ 短 description（"玩家上线"）。例："昨天日活跃角色数"→gold role.online→top5=[summerholiday.bath,summerholiday.repeattower]（"活跃"误匹 "summerholiday"）；"昨天付费的角色"→gold recharge→top5=[anniversary23pay.gacha,...]。**hit 发生的条件**：问题含 English event 名（gr003 "tower.challenge" 直匹）或 description 关键词重叠（"商店购买"→shop.buy 名/描述含 shop+buy）。
- F1（FakeHash 劣于 BM25-only）：32.3%<41.9%，real 数据复证。
- F2（FakeReranker 有害）：25.8%<32.3%，复证。
- F3（synonym/implicit miss）：massive——角色/付费/充值/留存 等 Chinese 业务词与 English event id 零 lexical overlap。
- F6（歧义 recall 低）：ambiguous-with-gold 50% vs clear 22.2%（注：real RBI 歧义 case 多为 clarify 无 gold，with-gold 歧义仅 4 个，小样本）。

**决策影响**：real 数据**强化** keep (b)——不是"安全默认 keep"，而是"default prefetch 在真 RBI 上 32% 严重不足 → escape-hatch (b) + real-embedder 升级 + params 索引（P6b ctx.schema richer fields）皆必需"。regress 门槛远未达 → committed 决策不动（无 amend-flip）。

**对 D2c-revisit**：source 改 reverse-bi（eval-cases/ + rbi-semantic），不再依赖 G1b 建 case 集。D2c-revisit 测**升级后**的 default——real embedder（InfinityEmbedder sidecar）+ params_fields 索引（修 F4）+ 可选 synonyms/terminology bridging——看 recall 能否升到 ≥85-90%（regress 的真实门槛测试）。本 32.3% 是 shipped-logic 无升级 baseline。

## 核验透明度

- **算法**：verbatim 复刻 shipped `packages/{embedder,retrieval}/`（`tokenize`/`hashVec`/`InferenceError`/`BM25Okapi`/`rrfFuse`/`cosine`/`buildCorpus`/`HybridRetriever`/`FakeHash`/`FakeReranker`），shipped 33/33 spec 验逻辑；harness 仅重跑同算法 over synthetic corpus。
- **corpus**：3 真 RBI fixture（`packages/data/semantic-layer/tests/fixtures/`）+ 27 synthetic（手造，RBI 形状）。
- **cases**：25，手造（gold/ambiguity tag 人工标注——主观，D2c-revisit 须用 RBI 真 SQL 派生 gold）。
- **运行**：`node run.mjs` EXIT=0（无网络，纯计算）。
- **局限**：见 §4。
