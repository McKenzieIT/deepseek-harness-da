# D2c — retrieve-tool escape-hatch keep/regress

**Type**: grilling
**Phase**: misc (cross-phase)
**Status**: Unblocked（P11b resolved 2026-08-20——eval harness 就绪）
**Graduated from**: map Not-yet-specified「D2 (c) keep/regress」（P11b eval 就绪 → 可跑召回/歧义数据驱动决策）

**Question**: P5 retrieval 的 **(b) retrieve-tool escape-hatch**（pipeline-internal 默认 + additive retrieve-tool 让 agent 主动检索）保留，还是回归 **(a) pipeline-only**？

**fed by**: P11b 生产 eval harness（`packages/eval/eval/`）跑召回/歧义数据。须先有 case 集（含需主动检索的歧义 case）+ 跑 pass_k eval（agent 经 dsh-llm-replay 确定性）。

**决策规则**: 确定性预取召回 ≥85-90% + 歧义 <15% → 回归 (a) pipeline-only（更简，少一个 model-facing tool）；否则保留 (b) retrieve-tool escape-hatch。fed by 召回率 + 歧义率 eval 数据。

**关联**: P5 resolved（D2 (c) guided agentic hybrid keep/regress 可逆）；P11b resolved（eval harness 就绪解锁此决策）；G1b（实验执行票）消费 eval 库可同跑此 case 集。
