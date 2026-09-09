# G8 — 判官的读出与量表（原名 `G8-pairwise-judge`）

**Type**: grilling（HITL）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R8](R8-pairwise-judge-papers.md)（已 resolved）；决策 1 与 4 建议等 [R20](R20-judge-readout-probes.md) 探针 b/c 的数字
**Blocks**: T7-judge-readout-impl（原 `T7-pairwise-judge-impl`）
**Mode**: HITL（`/grilling` + `/domain-modeling`）
**Branch**: `grilling/G8-judge-readout-scale`
**依据**: [R8 Resolution](R8-pairwise-judge-papers.md#resolution2026-09-10) + [`../research/pairwise-judge-papers.md`](../research/pairwise-judge-papers.md) §7

> **改名理由**：map 原将本票记作 `G8-pairwise-judge`。[R8](R8-pairwise-judge-papers.md) 的一手证据把 pairwise 降为本方向**最弱**的支线（换 pairwise 引入 transitivity 与 tie 两类新不一致；GSR 的 pairwise 优势落在 1σ 内），而真正要裁的是**读出形状**与**量表**。

## Question

R8 已把方向 8 收敛到五个必须由人裁的问题。**论文管不了它们**（见下「论文已裁掉的」），所以这是决策而非调研。

1. **读出形状**：`overall_semantics` 单闸门（四个机械维度降级为诊断信息、不进读出），还是 GSR 式 typed graph（gate / reduce / readout）？
   - R8 实测：四维在决策上只充当推翻票，「不进读出」在当前 1495 条向量上是**零损失**变更（`overall=1` 被判 FAIL 的有 0 条）。
   - 但判官一旦拿到参考答案，四维行为会变 ⇒ **改动顺序本身是决策的一部分**。
2. **参考答案的形态**：`expected.sql` 文本、执行结果集，还是两者？（**与 [G1b](G1b-ground-truth-lifecycle.md) 的 provenance 决议耦合 —— 若 G1b 已定，本条直接引用，不重裁。**）
3. **量表**：换 0-4（RADAR / SARA 兼容、两篇论文独立指向更细量表）还是保留二值 + gating？
   - 换量表会让 1495 条历史向量不可比 —— **但那批已因 G1 v3 的 D4/D6 全体失效，所以现在是免费的换锚时机。**
4. **准则顺序与调用结构**：维持五维一次调用，还是逐准则单独调用？后者 ×5 成本，且**改变被测对象本身**。（[R20](R20-judge-readout-probes.md) 探针 b/c 正是为这条供数。）
5. ~~证据落盘~~ —— **建议不由本票裁**：judge 的 `schema_context` / prompt 变体 / 量表版本是否入 artifact（现状 80 份结果文件 **0 份**记录），与 G1 D3 的 artifact 决议同类，应并入 **[T1](T1-exec-grader-impl.md) 的 artifact schema**。本票只需确认这一移交。

## 论文已裁掉的（不要重新 grill）

R8 的一手证据已经关掉四条讨论，进本票时当既成事实：

1. **「五维 flat mean + 0.6」不可辩护** —— 理由不是论文（GSR 从未测 unweighted mean、也没测阈值化聚合），是本仓实测：判官说「答不了用户问题」的 246 次里 **128 次（52.03%）仍然通过**。
2. **判官必须拿到参考答案** —— `2608.17938` Arm 2 是唯一直接测过「无参考」代价的实验：ICC `0.888 → 0.628`、分数**通胀 +0.074**、只能靠答案核对的题判别力掉到 `30–36%`。且本仓 39 个 case 的 `expected.sql` 正被 loader 丢弃 ⇒ **与 [T11](T11-loader-provenance-strip.md) 是同一块工作，不是新方向。**
3. **二值量表是错的方向** —— 两条独立证据同向：`2602.02219` Table 4（`n=2` 是偏置最高的档，原文「coarser binary rubric therefore tends to increase bias」）与 TrustJudge（5→100 分持续降低 Conflict Ratio）。
4. **pairwise 不是免费替代** —— 见上「改名理由」。

## 一条 grilling 时必须摆上桌的张力

R8 §4.2 查出：本仓两份 prompt 副本的准则顺序完全相同，且 `overall_semantics` **恒在末位** —— 而它正是唯一起约束作用的那一维。`2602.02219` 测出准则顺序能把一个准则的均值移动最多 **0.80 分（1-5 量表的 20%）**，60 个 (judge, criterion) 检验里 **56 个显著**，下游 top-1 在 **16–39%** 的 prompt 上翻转。

⇒ **「唯一起约束作用的那一维恒处末位」是一个从未被测量、却可能移动全部历史数字的自由度。** 决策 1 与 3 若在 R20 探针 b 之前拍定，可能是在一个未被察觉的偏置上做决定。

## 不在本票范围

- 跑探针（[R20](R20-judge-readout-probes.md)）。
- 实现（T7）。
- 逐维对执行真值的校准（R14；其前置已改，须在 T11 之后、在重建的 EXECUTION 语料上做）。
- 参考答案的 provenance 生命周期（[G1b](G1b-ground-truth-lifecycle.md)）。
