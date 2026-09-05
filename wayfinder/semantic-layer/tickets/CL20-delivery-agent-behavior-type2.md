---
type: grilling
status: in_progress
assignee: cl20-session-2026-09-05
blocked_by: []
---

# CL-20: DELIVERY Type-2 agent 行为（开放问题错误生成 SQL）

**Branch**: `fix/cl20-delivery-agent-behavior`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

> **Type 更正（2026-09-05 认领时）**：原标 `task`（wayfinder 语义=无可决策的手工工作），但票体明确「需决策 + 实施」并列 3 个互斥候选（prompt / critic / judge 校准），决策属性是主体 → 改标 `grilling`（HITL）。实施随决策落地。

## Question

CL-16 部分关闭后的剩余：DELIVERY 77.8%（14/18）< 85%。剩余 DELIV-FAIL 中 **Type-2**（`075`/`079`/`voice_048` 等）：agent 对开放/主观问题（"哪些玩法需要优化"/"卡牌平衡性怎么样"/"运营数据总结一下"）**错误生成 SQL 而非拒绝+引导**。`expected.answer` 明确要拒绝+引导，agent 给 SQL → DELIVERY judge 判负。

需决策 + 实施：如何让 agent 对 open-ended L4 问题**先拒绝+引导**（而非直出 SQL）？候选：
1. **prompt**（`prompt.ts`）：generation prompt 增"open-ended/主观 → 先拒"规则；
2. **critic**（`critic.ts`）：加规则——问题 intent=open_ended 且无明确指标 → 拒绝；
3. **judge 校准**：放宽 DELIVERY judge 接受"探索性 SQL + 解释"（但会降 DELIVERY 标准，慎用）。

## 背景

- CL-16 partial（pipeline 已尽；Type-1→CL-19；Type-2 本票）。
- DELIVERY judge 已校准（接受结构化拒绝打高分），问题在 agent 不产出拒绝。
- engine 核心 git 干净；验证需 eval（`scripts/run-eval.sh`）。

## 验收

- DELIVERY ≥85%（voice DELIVERY 18 + 迁移的 original DELIVERY cases）。
- Type-2 case（075/079/voice_048 等）翻转。
- 全量 eval + compare + experiment-log。

## 关键文件

- engine prompt：`packages/data/nl2sql-engine/src/prompt.ts`
- critic：`packages/data/nl2sql-engine/src/critic.ts`
- reply 管道：`packages/eval/eval-cli/src/context.ts`
- eval wrapper：`scripts/run-eval.sh`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`

## 2026-09-04 pass^k 协议澄清（阈值**不需要**重设）

先前一度以为「pass^k 落地使全部基线失效，78%/80%/85% 阈值全须重设」。
[离线重打分](../research/passk-rescore-2026-09-03.md) + 协议核查后**更正**：

**基线不是一个数，它取决于 `passK`：**

| 协议 | 168-case 结果 | 来源 |
|---|---|---|
| **k=1**（`scripts/run-eval.sh` 的显式默认，注释写明 "baseline-matching flags: `--pass-k 1`"） | **73.8%** / 73.2% / 70.8% / 76.8% | CL-15、CL-22 全部基线 |
| k=3 + pass^k（全中才算过） | 52.4%（单个拼接 run） | `rebaseline-passk-168-merged`, `cfbb710b50` |
| k=3 + best-of-k（旧规则） | 89.3% | 同一份数据重打分 |

**关键**：pass^k 与 best-of-k 在 k=1 时**数学恒等**（26 个 k=1 run 的 delta 全为 +0.0pp）。
所以 `run-eval.sh` 今天跑出来仍是 ~73%——**CL-15 的标准基线没有失效，可复现**。
52.4% 的跌幅来自 **k 从 1 改成 3**，不是来自判定规则。

**两者测的是不同问题**：k=1 问「能不能做对」，k=3+pass^k 问「是不是**稳定**做对」。
注意 CL-22 的「≥3 run 取中位数」与 pass_k=3 **方向相反**——前者把抖动当噪声抹平，
后者把抖动当失败惩罚。二者都用「3」但含义对立，不可混用。

**结论：本票的验收阈值按 `run-eval.sh`（k=1）+ CL-22 的 ≥3 run 中位数口径，原样有效，
无需重设，也无需重跑基线。** 若将来决定把验收切到 k=3+pass^k（更严的可靠性口径），
则须整体重设阈值并重建基线——那是一次独立的口径变更决策，不在本票范围。

## 2026-09-04 更正:上一段结论错误 —— 阈值**确实**已重设(按 pass^k)

上一段(「阈值不需要重设」)**是错的,已作废**。三处事实纠正:

1. **k=1 不是标准,是偏离。** CLI 默认就是 `--pass-k 3`(`main.ts:72`,help:
   "Pass@K attempts per case [default: 3]"),`DEFAULT_PASS_K = 3`,且
   **SPEC §6.5 / D9 Q2 明确规定 pass^k、k=3**("Three is D9's number")。
   `run-eval.sh` 的 `--pass-k 1` 是为"对齐旧基线"临时加的——循环论证
   (基线是 k=1 因为 wrapper 是 k=1)。**已修复:该 flag 已移除**,恢复 k=3。
2. **切换已经发生。** 当前基线是 `rebaseline-passk-168-clean` = **61.9%**
   (pass@3 pass^k,conc=3,零污染,commit `56c74aebae`)。
   `packages/eval/eval-cli/README.md` 已声明 "pass^k semantics is LIVE",
   且**目标值已按 pass^k 重设**:Overall **60%/70%/85%**、
   Original **65%/75%/88%**(标注 proposed, pending PM sign-off),
   旧的 best-of-k 目标(75/80/90)已标 superseded。
3. **"pass^k 方差更大"的反对理由不成立(方向搞反了)。** 实测 exp4-arm-a:
   k=1 三个 attempt slot 的 pass rate 为 71.4/73.8/75.6%(极差 **4.2pp**),
   pass^k bootstrap 2000× 的 90% 区间 **5.4pp** —— **量级相当**。
   pass^k 会把 p≈0.5 的边界 case 推向稳定失败(p³≈0.125),反而更一致。

**真正的数字:每 case 通过次数分布 20/20/33/95 → 53/168 = 31.5% 的 case 不确定
(3 次里通过 1 或 2 次)。** k=1 把这 31.5% 完全藏起来,随机给它们记分,于是报
71-76%,而真正可靠通过的只有 95/168 = 56.5%。对一个用户要信任其数字的取数 agent,
"三次里对一次"比"一直错"更危险——后者可发现,前者会被当成正确答案用。

**本票验收口径:以 README 的 pass^k 目标为准**(不要另发明数字),
基线 = `rebaseline-passk-168-clean` 61.9%,并按 CL-22 的 ≥3 run 中位数执行。
`pass_k=3` 管单 run 内抖动、`≥3 run 中位数` 管 run 间抖动,二者正交可叠加。

---

## 2026-09-05 认领时证据核查 —— **票体前提大幅失准，需重述问题**

以下每个数字均由本 session 从产物机械重导（非 subagent 转述、非引用既有文档）。
方法：`rebaseline-passk-168-clean.json`（当前 README 声明的标准基线，pass^k / k=3 /
conc=3 / judge-only / qwen3.7-max / `today=20260903` / commit `56c74aebae`）逐 case
逐 attempt 解析 + `packages/eval/eval/cases/k11-v2/*.yaml` 逐文件 grep。

### E1. DELIVERY 的分母是 25，不是 18

`grep -l 'delivery_match: *"*llm_judge' packages/eval/eval/cases/k11-v2/*.yaml | wc -l` = **25**（168 文件中）。

25 个 id：`019 049 074 075 078 079 080` + `voice_013 015 017 018 020 022 033 034 036 039 041 042 043 044 045 046 047 048`。

README:43 的「Voice DELIVERY 18」只是 **voice 子集**；另 7 个数字 DELIVERY case 被并进
README 的「Original 80」里。交叉校验通过（这是确认我的分桶与 README 口径一致的关键）：
我算出 ORIGINAL_EXEC 49/73 + 数字 DELIVERY 5/7 = **54/80 = 67.5%** ≡ README:38 的 Original；
voice DELIVERY **11/18 = 61.1%** ≡ README:43。故两套口径不矛盾，只是切法不同。

### E2. 当前 DELIVERY（全 25）= **16/25 = 64.0%**

| 分类（本 session 切法） | pass | n | pass_rate |
|---|---|---|---|
| ORIGINAL_EXEC | 49 | 73 | 67.1% |
| ALIAS | 20 | 40 | 50.0% |
| VOICE_EXEC | 19 | 30 | 63.3% |
| **DELIVERY（全 25）** | **16** | **25** | **64.0%** |
| TOTAL | 104 | 168 | 61.9% ≡ artifact summary |

票体开头的「DELIVERY 77.8%（14/18）」是 **k=1 时代的 voice 子集数**，在当前 pass^k
基线下已不成立，且分母也不对。**验收基线应为 64.0%（16/25）。**

### E3. 9 个 fail：`079 080 voice_017 voice_033 voice_036 voice_039 voice_041 voice_042 voice_048`

**`075` 已经 3/3 correct** —— 票体把它列为待翻转的 Type-2 代表案例，该前提**已过时**。

### E4. 决定性发现：模型**已经在拒绝**，且 judge **已经在给它高分**

对上述 9 case 的 27 个 attempt，按 `generated_sql` 形态分类（判据：SQL 关键字正则 /
CL-23 `looksLikeToolCall` 同款前缀正则 / 其余非空即散文）：

| 形态 | attempt 数 | 其中 `delivery_match=True` |
|---|---|---|
| SQL | 10 | 1（`080` k1） |
| **散文拒绝（PROSE）** | **9** | **7** |
| TOOLCALL | 6 | 1（`080` k2） |
| EMPTY | 2 | 0 |

**9 个散文 attempt 里 7 个通过 judge。** 模型产出的正是票体想要的东西，例如 `voice_041` k3：
> 这个问题过于宽泛和模糊，我无法直接为您查询"最近数据的异常"。**为什么不能答**：1. 缺乏具体分析对象…2. 缺乏异常判断基准…

即 `prompt.ts:135-136` 的 **§5 诚实拒绝 已经在工作**，且其产物能过 judge（judge 门槛
`JUDGE_PASS_THRESHOLD = 0.6`，`packages/eval/eval/src/judge.ts:40`；judge rule 3 明确
奖励 decline/clarification，`packages/eval/eval-cli/src/context.ts:247`）。

### E5. 因此 9 个 fail 的真实机制**不是**「不会拒绝」，主要是「拒绝不稳定」

| 簇 | case | 3 attempt 形态 | 本票是否该管 |
|---|---|---|---|
| **不稳定**（拒对 2/3，1 次漂成 SQL）→ pass^k 全中制判负 | `voice_033` `voice_036` `voice_041` `080` | 2 通过 + 1 漂 | **是（主体，4 case）** |
| **真 Type-2**（3/3 直出 SQL，从不拒绝） | `079` `voice_048` | SQL×3 | **是（2 case）** |
| 混合 | `voice_039` | toolcall + 乱码 + 好拒绝 | 是（部分） |
| Type-1 tool-call | `voice_017` | toolcall×2 + empty | **CL-23**（已落地 `ccdd150a97`；CL-24 实测已 3/3） |
| 伪回复/前言 | `voice_042` | toolcall + empty + 前言 | **CL-24** |

**票体的单一 Type-2 叙事覆盖不了 4/9。** 主导失败模式是 pass^k 把「2/3 次拒对」
判成 fail —— 这与 CL-20 立票时（k=1，best-of-k，2/3 即算过）根本不同：
**是协议切换把这 4 个 case 从 pass 变成 fail 的，不是 agent 行为变差了。**

### E6. 候选 2（critic 加规则）**架构上不成立**

- critic 看不到问题：`critiqueSql(sql, ctx)`（`packages/data/nl2sql-engine/src/critic.ts:290`），
  `CriticCtx`（`packages/data/nl2sql-engine/src/types.ts:140-147`）只有
  `candidateTables` / `eventParams` / `partitionCols` / `declaredJoinPairs` —— **无 question 字段**。
- 即使塞进去，`passed:false` 的语义是**重试生成**（`engine.ts:309-312`），不是拒绝；
  重试耗尽落到 `engine.ts:356` 的通用 `自修 2 次仍失败`，reply 层给
  `Declined: ...`（`context.ts:438`）—— 该文本 judge 打 0（`context.ts:400-401` 注释亦如此说）。
- 故「critic 拒绝」若照字面实施，会**烧 3 次 LLM 调用后把拒绝理由丢掉**。

### E7. 已存在但未被本票利用的两条通道

1. **散文直通**：`context.ts:389` —— `!sqlIsPresent && sql.length > 20 && !looksLikeToolCall(sql)`
   → `reply = sql`。这是模型自己的散文拒绝能到达 judge 的原因（E4 的 7 个通过全走这条）。
2. **CL-23 的 grounded 拒绝合成器**：`context.ts:397-436`，产出【点名缺失】/【列举可得】/
   【引导重问】三段式，已验证对 `voice_017` 由 1/3 翻到 3/3。**它今天只被
   `declineKind === 'tool_call_emitted'` 这一个条件触发**（`engine.ts:151` 的
   `declineKind?: 'tool_call_emitted'` 是单成员 union —— 即天然的扩展点）。
   `EngineRunResult`（`engine.ts:144-155`）**无 answer/reply 字段**，非 SQL 答案只能走 decline 通道。

### E8. 合并顺序风险：`prompt.ts` 正被并发 session 改

`contextPrefetched` 参数（GA-EVAL-SQLGEN-PROMPT-FIX，data-agent map）**不在 master 上**，
只在 `fix/ga-eval-sqlgen-prompt-fix` 分支：
`git grep -c contextPrefetched master -- .../prompt.ts` = 0；同命令对该分支 = 3。
本票若改 `prompt.ts`（候选 1），与该分支**必然文本冲突**，且那边刚测出该 prompt 改动
在 real-exec 上 **-2 case 回归**（041/046）、结论「假设证伪」，另有未决 grilling 票
GA-EVAL-SQLGEN-FOLLOWUP。→ 需先定合并顺序，勿两头同时改同一文件。
