# D2c — retrieve-tool escape-hatch keep/regress

**Type**: grilling
**Phase**: misc (cross-phase)
**Status**: Resolved（2026-08-21；keep (b) escape-hatch，regress-to-(a) 延后到真 eval 数据——见 Resolution）
**Graduated from**: map Not-yet-specified「D2 (c) keep/regress」（P11b eval 就绪 → 可跑召回/歧义数据驱动决策）

**Question**: P5 retrieval 的 **(b) retrieve-tool escape-hatch**（pipeline-internal 默认 + additive retrieve-tool 让 agent 主动检索）保留，还是回归 **(a) pipeline-only**？

**fed by**: P11b 生产 eval harness（`packages/eval/eval/`）跑召回/歧义数据。须先有 case 集（含需主动检索的歧义 case）+ 跑 pass_k eval（agent 经 dsh-llm-replay 确定性）。

**决策规则**: 确定性预取召回 ≥85-90% + 歧义 <15% → 回归 (a) pipeline-only（更简，少一个 model-facing tool）；否则保留 (b) retrieve-tool escape-hatch。fed by 召回率 + 歧义率 eval 数据。

**关联**: P5 resolved（D2 (c) guided agentic hybrid keep/regress 可逆）；P11b resolved（eval harness 就绪解锁此决策）；G1b（实验执行票）消费 eval 库可同跑此 case 集。

## Resolution（resolved 2026-08-21，wayfinder grilling session）

**决策**：**KEEP (b) retrieve-tool escape-hatch**——da 方向保留 (b)（pipeline-internal 预取默认 + additive retrieve-tool escape-hatch，per P5 (c) guided agentic hybrid）；**regress-to-(a) pipeline-only 延后**到真 eval 数据。

**理由（grilling，子决策逐条确认）**：
1. **决策非对称**：regress 删能力需强证据（召回≥85-90%+歧义<15%）；keep 叠加/廉价/可逆（P5"evals 驱动可逆决策"）。安全默认 keep。
2. **本会话无法负责任触发 regress**：full-agent pass_k 被 P11c（open）+ G1b（open/unclaimed）阻塞；无生产 case 集（da-fresh EvalCase 砍 gold 表/SQL，仅 8 synthetic fixture）；reverse-bi 不在 repo；默认 embedder=FakeHash（≈BM25-only，真 hybrid 测不了——T2 AGA 无 embeddings）。retrieval-layer synthetic 测量弱证据（synthetic+BM25-only+零分 floor 噪声），不满足 regress 负担。
3. **measurement level**：规则目标=prefetch（retrieval 层），非端到端正确率（后者=G1b orchestration A/B/C/D 问题）；retrieval 层直接测（HybridRetriever 纯逻辑可独立跑）是正确层级 + 可行，但弱证据不驱动决策。
4. **baseline scope**：跑完整 synthetic 基线作文档/方法论，不驱动决策。
5. **regress 真数据载体属后续 build**：G1b 真 RBI case 集 + 可选真 embedder（用户自部署 sidecar，T2 AGA 无 embeddings）非本会话可得——本会话无法满足 regress 负担的结论不变（G1b 状态随并发会话演变，不改变此点）。
6. **follow-up**：立 D2c-impl（ship retrieve-tool）+ D2c-revisit（regress 重访）。
7. **map 雾**：D2 (c) sharpened——keep 默认；regress re-eval 毕业成 D2c-revisit 票（不入雾）。

**基线（实证佐证 keep，不驱动决策）**：[research/d2c-keep-regress-baseline.md](../../research/d2c-keep-regress-baseline.md) + [prototypes/d2c-retrieve-baseline/](../../prototypes/d2c-retrieve-baseline/)。25 case / 30 corpus，BM25-only strict 84% / loose 96% / ambiguity 32%（stress set）。关键发现：F1 FakeHash hybrid 劣于 BM25-only（68%<84%，默认弱）；F2 FakeReranker 有害（64%，不默认挂）；F3 synonym/implicit miss（人气/消费零 lexical overlap，全配置 MISS——escape-hatch 用武之地）；F5 零分 floor stable-sort 噪声（不可作生产召回估计）；F6 歧义 case 召回系统性低（50-62.5% vs clear 70.6-94.1%）。偏重 stress set 亦未达 regress 门槛（84%<85-90% strict、32%>15% ambiguity）。

**real-RBI 确认（2026-08-21，post-commit）**：reverse-bi（~/workspace/reverse-bi，只读源）可达后重跑真 RBI scope 10000147（1966-event corpus，37 case，31 有 gold）——DEFAULT HYBRID strict **32.3%** / BM25-only 41.9% / ambiguity 21.6%。**default recall 32.3% <<85-90% bar + ambiguity 21.6% >15% → 双判据远未达 → keep (b) decisively confirmed（非 borderline，无 flip）**。主因 F4：events 语义内容在 params_fields，shipped FIELD_WEIGHTS 不索引 → Chinese 问题匹配不上 English event id + 短 description。real 数据强化 keep（非"安全默认"而是"default 32% 严重不足→escape-hatch+real-embedder+params 索引皆必需"）。见 [research §7](../../research/d2c-keep-regress-baseline.md)。

**Follow-ups**：
- [D2c-impl](D2c-impl-retrieve-tool-shipping.md)（prototype/task）：ship retrieve-tool escape-hatch（additive，`defineTool`+`ctx.tools.register` grounded by P13b `search_data_sources`，persona 教"何时调 retrieve vs 信任预取"，bundle opt-in，**不默认挂 FakeReranker** per F2）。unblocked。
- [D2c-revisit](D2c-revisit-regress-reeval.md)（grilling）：regress 重访——真 eval 数据复测，达 ≥85-90% strict + <15% ambiguity → regress (a)（若 D2c-impl 已 ship 则 unship）；否则 keep。blocked by G1b。方法论复用见 baseline §6。

**map 更新**：Decisions 加 D2c 条目；Not-yet-specified「D2 (c) keep/regress」毕业线更新——D2c resolved（keep (b) 默认），regress re-eval 毕业成 D2c-revisit 票。
