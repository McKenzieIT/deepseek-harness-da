---
type: grilling
status: open
blocked_by: []
---

# CL-27: CL-20 门禁对每个查询无条件多调一次 LLM —— 代价是否可接受

**Branch**: `chore/cl27-triage-call-cost`  <!-- 待建；CLAUDE.md:64 要求每票声明分支 -->

## 事实（2026-09-05，CL-20 落地后）

CL-20 的 capability triage（`engine.ts` `triageQuestion`）在 `run()` 里**无条件**执行，
位置在生成重试循环之前：

```
engine.run()
  → BM25 检索
  → capability triage   ← 新增，1 次 LLM 调用，对所有查询都跑
  → while (attempt <= MAX_FEEDBACK_RETRIES)  生成 1-3 次
```

**代价分布不对称**：

| 查询类型 | 占比（k11-v2） | 调用数变化 |
|---|---|---|
| 被门禁拦下（report/forecast/recommendation） | 实测 7/168 ≈ 4% | **减少** —— 1 次 triage 取代 1-3 次生成 |
| 未被拦（其余全部，含 143 个 EXEC） | ≈ 96% | **+1 次**（生成路径从 1-3 次变 2-4 次） |

即 **96% 的查询为 4% 的查询付一次额外 LLM 往返**。

## 为什么值得单独决策

1. **R10 的结论是 token 效率为系统强项、P0 是 prompt caching**
   （`research/r10-token-attention-cache-optimization.md:16`、`:75` ~1,720-2,665 tokens/call）。
   本改动方向与之相反——增加调用数。triage prompt 本身很短（~300 token），
   token 成本增量不大，但**调用次数**是延迟的主因。
2. **AGA 网关延迟 ~6-17s/次**（`eval-cli/README.md` 运维注记）。对用户可见的取数 agent，
   每个问题在生成开始前多等一个往返，是产品级体感问题，不只是成本问题。
3. **延迟当前测不出来。** CL-20 用 n=1 单 case 对比基线（每 attempt 均摊），差值从
   **-41.8s 到 +30.3s**、中位 +2.9s —— 完全埋在噪声里（与 CL-22 实测的 LLM 非确定性量级一致）。
   **不能据此声称有或没有回归**，需全量聚合或专门的延迟测量。

## Question（需决策）

1. **是否需要条件化触发？** 候选：
   - (a) **保持无条件**——简单、行为一致、可预测；接受 +1 往返。
   - (b) **廉价前置筛**：仅当问题**不含**任何具体指标/时间词时才跑 triage
     （复用已有的 `detectTrendIntent` / `extractTimeParams` 的命中作为「够具体」信号，
     零新词表——但注意这两者本身是关键词实现，`GA-GRILL2` D3 实测 recall 85%）。
   - (c) **合并进生成调用**：不单独调，改为要求生成 prompt 首行先输出一个分类 token，
     解析后再决定是否走 decline —— 零额外调用，但要动 `prompt.ts`
     （与 `fix/ga-eval-sqlgen-prompt-fix` 的 `contextPrefetched` 冲突面，且 EXP2 证明
     动 prompt 结构有 -41pp 级风险）。
   - (d) **只在 agent 多轮场景跑一次并缓存**（同 session 同问题不重复 triage）。
2. **延迟预算是多少？** 有没有一个「用户等待上限」的既有口径？若无，是否需要先定？
3. **triage 是否该与 `pass_k` 交互？** 当前 pass^k 下每个 attempt 都会重跑 `run()`，
   即 k=3 时 triage 被调 **3 次**（同一问题、同一答案）。这是纯浪费——
   是否应在 runner 层对同一 case 缓存 triage 结果？（这条与 (d) 同源，但 eval 侧收益立竿见影：
   168 case × k=3 → 每轮省 336 次调用。）

## 背景

- CL-20 选择 engine 前置门禁而非 prompt 层，理由之一正是「不进重试环、零 LLM 浪费」——
  该理由对**被拦下的**查询成立，对未被拦的不成立（本票即处理这个反面）。
- 未在 CL-20 内解决的原因：先把「判据能不能立住」验完（那才是主要风险），
  代价优化留作独立决策；且改动期间全量 eval 正在用 tsx 跑工作树。

## 验收

- 决策记录：(a)/(b)/(c)/(d) 之一，含理由。
- 若选条件化：实测确认 7 个应拦 case 仍被拦、0 误伤（复用 CL-20 的 `cl20-v3-*` 探测集）。
- Q3（pass^k 下 triage 重复调用）无论主决策如何都应处理——若确认为纯浪费则单独修。
- 延迟：给出全量 run 的聚合延迟对比（而非 n=1），或明确记录「延迟影响未测」。

## 关键文件

- 门禁：`packages/data/nl2sql-engine/src/engine.ts`（`triageQuestion` + `run()` 内调用点）
- 可复用的「够具体」信号：`packages/data/nl2sql-engine/src/granularity.ts:25` `detectTrendIntent`、
  `packages/data/nl2sql-engine/src/metric-engine.ts` `extractTimeParams`
- pass_k 循环：`packages/eval/eval-runner/src/runner.ts`（`passKVerdict` 附近）
- token 效率基准：`wayfinder/semantic-layer/research/r10-token-attention-cache-optimization.md`
