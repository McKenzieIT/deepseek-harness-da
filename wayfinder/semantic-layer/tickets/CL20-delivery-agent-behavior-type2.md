---
type: grilling
status: closed
assignee: cl20-session-2026-09-06-followup
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

> **E8 更正（2026-09-06）：`contextPrefetched` 已进 origin/master**（`git grep -c contextPrefetched origin/master -- .../prompt.ts` = **3**）。
> 上文「不在 master 上」是 2026-09-05 落笔时的事实，现已过时。三点后果：
> 1. **本票选择不改 `prompt.ts`（D2）的判断反而更划算** —— 若当初改了，现在要和已落地的 `contextPrefetched` 手工合。
> 2. `context.ts` 有一处需手工合：master 在同文件加了 `promptBuilder: (args) => buildPrompt({...args, contextPrefetched: true})`，
>    本票改的是 `:397` 的 `declineKind` 分支条件 —— **同文件不同位置，非同行冲突**。
> 3. ⚠️ **本票的全量 eval（`cl20-full-n1`）因此失效为验收证据**：`contextPrefetched` 把 engine responder 的可调用
>    `# 工具集` 目录删掉，按 GA-EVAL-SQLGEN-PROMPT-FIX 自测将 tool-call 发射从 16-22% 打到 **0%**；
>    而 tool-call 正是本票 9 个 fail case 中 **6/27 个 attempt** 的形态 → rebase 后模型行为改变，**须重跑**。
>    该 run 保留为 pre-rebase 历史记录（见 experiment-audit-log 2026-09-06 条目）。

---

## Resolution（2026-09-05）—— 关闭-部分：交付「超出能力」门禁，主观边界证伪为 case-set 问题

### 五项决策（grilling 锁定）

| ID | 决策 | 理由 |
|---|---|---|
| D1 | 范围重述为「让拒绝确定性触发」，非「教模型拒绝」 | 证据 E4：模型已在拒绝（9 散文 attempt 中 7 个过 judge），§5 已工作；4/9 失败是 pass^k 把「2/3 拒对」判负 |
| D2 | 检测层 = `engine.ts` 前置门禁（`while` 循环之前） | 零 LLM 浪费（不进重试环）；复用 CL-23 合成器只需加一个 `declineKind` 分支；不碰 `prompt.ts`（避 E8 合并冲突） |
| D3 | 检测逻辑 = LLM 分类器（**非**关键词规则） | 见下「D3 修订」 |
| D4 | 合成通道 = 复用 CL-23 grounded 合成器 | `context.ts:397` 条件扩为 `\|\| 'open_ended_question'`；三段式已验证（voice_017 1/3→3/3） |
| D5 | 验收 = 三轮中位数 DELIVERY ≥80% | 见下「验收未达成」 |

### D3 修订（实施中证伪，两次）

**第一版「能否用 SQL 回答」被证伪 —— 边界不自洽，非方差问题。**

| 词根 | 期望 SQL | 期望 REFUSE |
|---|---|---|
| **平衡** | `076` 服务器之间有没有不**平衡**的情况 | `079` 卡牌**平衡**性怎么样 |
| **怎么样** | `073` 收入表现**怎么样** | `079` / `voice_017` / `020` / `022` / `046` |

实测（n=1，导航用）：激进 prompt 拦住全部 6 个目标但**误伤 `076`（pass→fail 真回归）**；
保守 prompt 救回 `076` 但放过 `079`/`voice_048`。**调 prompt 只是平移边界，放不对位置**
→ 故非 temperature=0 或多数投票可解（那些治方差）。

根因：`query_intent: open_ended` 把**≥5 种拒绝理由**混为一类，其中「字段缺失」类
（`019`「昨天负面舆情条数有多少」问法完全具体，只因表无情感列才拒）**无法从问题文本判断**。
且 26 个 open_ended 中 **23 个期望 REFUSE，仅 `073`/`076`/`077` 期望 SQL**，先验极度倾斜。

**关键词规则方案被否（普适性，用户提出）**：
- `TREND_PATTERN`（`granularity.ts:13`）是同构实现，`GA-GRILL2` D3 实测 **zh recall=85%**，
  为突破该天花板专门开了 `GA-I18N-R1`，方向写明「需探索 **LLM intent 分类**」→ 加规则是重走已撞墙的路。
- 词表随业务域线性增长（游戏 平衡性/健康 → 电商 转化好不好/库存健康 → 金融 风险高不高），
  且 `GA-GRILL2` D3 强制**中英双语词表**，成本 ×2。

**BM25 分数阈值方案被否**：CL-7 已确立分数跨查询不可比（`ALIAS_BOOST=2.0` vs BM25 30–40）。

**最终实现 = 门禁只判「交付物类型」（deliverable kind）**，不判模糊性/主观性：
report / forecast / recommendation vs 数据值。「帮我出个周报」在**任何**业务域都不是一条 SQL，
故判据跨域泛化且**零词表**；且它完全不碰那条不自洽的边界。
欠指定（under-specification）留给模型自己的 §5 诚实拒绝（E4 已证其产物能过 judge）。

### 落地

| commit | 内容 |
|---|---|
| `d6b376d296` | `declineKind` union 扩展 + 前置门禁 + `context.ts` 合成通道扩展 + 12 测试 |
| `4c2a1c7764` | 门禁收窄为 deliverable-kind（撤销模糊性判定）+ 测试重写 |

- `engine.ts:151` `declineKind?: 'tool_call_emitted' \| 'open_ended_question'`（CL-23 单成员 union 的扩展点）
- `engine.ts` `triageQuestion(question)` —— 单次 LLM 调用，仅 question 入参（不需候选，故与检索质量解耦）
- `context.ts:397` 条件扩展，复用 CL-23 三段式 grounded 合成
- `tests/open-ended-triage.spec.ts` 12 测试（5 拦截 + 5 放行 + 2 范围守卫，含「门禁不判模糊性」的显式守卫）
- 128 nl2sql-engine 测试 + 339 eval 测试全绿；tsc clean；lint 0

### 实测（n=1 每 case，**导航用，不可作决策依据** —— CL-22 分层协议）

run id `cl20-v3-<case>`：

| 指标 | 结果 |
|---|---|
| **误伤（期望 SQL 却被门禁拦）** | **0/3** —— `073`/`076`/`077` 全部放行 ✅ |
| 门禁触发 | 7 个，**全部**是期望 REFUSE 的：`voice_033/036/041/044/045/047/048` |
| 探测 12 case 通过 | 10/12 |

未过 2 个：`079`（主观 —— 本门禁**刻意不管**，设计如此）、`076`（未被门禁碰，是模型自己出 PROSE，
即那条不自洽边界的现场表现）。

### 验收未达成（D5 的 ≥80% 三轮中位数）

**未跑三轮中位数。** 原因与 map Notes 已记录的教训一致（并发开发使基线不可复现），
且本票的正确结论是：**DELIVERY ≥80% 无法由引擎侧达成**，因为 23/26 open_ended 的
期望行为里，主观判断类（C 类）的边界在 case set 内自相矛盾（`076` vs `079`）。
本票交付 D 类（超出能力）——零回归、跨业务泛化；C 类需先修 case set。

→ **毕业新票 CL-25**（复审 26 个 open_ended case 的期望行为 + 拆分 5 类拒绝理由）。
DELIVERY 目标值待 CL-25 定齐 case set 后重设。

---

## 全量 eval 结果（2026-09-06，`cl20-full-n1`）—— **pre-rebase，非验收证据**

完整记录见 [experiment-audit-log 2026-09-06 条目](../research/experiment-audit-log.md)。摘要：

| 同协议（k=1）可比项 | 本次 | CL-22 k=1 中位数 | delta |
|---|---|---|---|
| Overall | 77.4%（130/168） | 73.2%（极差 ±2.4pp，最大 76.8%） | **+4.2pp**（高于历史观测最大值） |
| **Voice DELIVERY（18 子集）** | **94.4%（17/18）** | **77.8%（14/18）** | **+16.6pp** |
| DELIVERY 全 25 | 80.0%（20/25） | —（历史无此切法） | — |

> ### ⚠️ 更正（2026-09-06 晚）：本节原写「门禁误伤 = 0」，**该结论是错的，已作废**
>
> **⚠️⚠️ 本更正本身也已被直接测量推翻** —— 见本票后半的
> 「2026-09-06 夜 · 门禁直接测量：推翻「052 误伤」结论」一节。
> 下面这段的推断链（EMPTY + 低延迟 ⇒ 门禁触发）不成立，`052` 不是门禁误伤。
> 保留原文以记录推断为何失败。
>
> 原判断只查了「9 个 EXEC 空 SQL」，**漏查 `compare.ts` 报出的 Lost 全集**；且对 `052` 只重跑一次
> 就下了「非门禁所致」的结论。补做 5 次观测后事实相反：
>
> | run | SQL | latency | verdict |
> |---|---|---|---|
> | `cl20-full-n1` | EMPTY | 26,576ms | wrong |
> | `cl20-fp052` | SQL | 41,980ms | correct |
> | `cl20-det052-r1` | EMPTY | 35,587ms | wrong |
> | `cl20-det052-r2` | EMPTY | 39,519ms | wrong |
> | `cl20-det052-r3` | SQL | 42,398ms | correct |
>
> **3/5 门禁触发 → `052` 是真实的、间歇性的门禁误伤。** 判别依据：三次 EMPTY 延迟
> （26.6/35.6/39.5s）一致低于两次出 SQL（42.0/42.4s），与门禁在生成前短路吻合（参照：
> 确认门禁触发的 7 case 中位 29.7s、正常出 SQL 中位 50.1s）。trace 未持久化，故判别为**推断性**。
>
> **根因已定位**：`052` = 「最近7天**每天的**商店销售额」，明确的数据请求（`query_intent: trend`、
> `match_mode: row_count_range`）。triage prompt 把 `a compiled/periodic report or summary
> ("weekly report", "summarise the month")` 列为 `beyond_single_query` 样例 ——
> **「7天每天的」与「周报」词法紧邻**，模型约 60% 判成后者。
>
> **含义（重要）**：收窄后的 deliverable-kind 门禁**仍有边界问题，只是位置搬了** ——
> 从「主观 vs 客观」搬到「多日明细 vs 周期报告」。误伤率 ≈ 1/143 EXEC（0.7%）但**间歇性**。
> → **门禁在当前形态下不可进 PR**，须先修 prompt 样例冲突再重验。

其余 4 个 Lost（`019`/`069`/`078`/`voice_034`）**门禁均未触发**（出 SQL 或 PROSE），
系基线 k=3 全中 vs 本次 k=1 单抽样的采样差异，非门禁所致。

门禁在 DELIVERY 侧触发 11 个，其中 10 个 correct（仅 `080` wrong）。

**为何不作验收证据**：见上方 E8 更正第 3 点（`contextPrefetched` 已落地，模型不再发射 tool-call，
须在 rebase 后重跑）。

---

## 2026-09-06 夜 · 门禁直接测量：推翻「052 误伤」结论

前序两轮结论（先「误伤 0」、后「052 是真实间歇误伤」）**都建立在同一条推断链上**：
trace 未持久化 → 用 `generated_sql` 为空 + 延迟偏低 ⇒ 判定门禁触发。
本轮**不再推断，直接测量**。

### 工具：`packages/eval/eval-cli/bin/probe-triage.ts`（本 session 新增）

读**引擎自己的 trace**（`step === 'capability_triage'`）判定门禁是否触发，
每题跑 N 次。只有 triage 那一次调用走网络（generation 用固定 SQL 短路），故每 rep = 1 次 LLM 调用。

**为何该探针等价于管道内的门禁行为**（三条，均由本 session 核过代码）：
1. `engine.run({ question })` 收到的是**原始问题** —— query expansion 只包住 retrieval linker
   （`context.ts:355-359`：`retrieve: (_q, opts) => baseLinker.retrieve(expandedQuestion, opts)`），
   不改 `question` 本身；
2. `triageQuestion(question)` **只吃 question**，不吃候选表/schema → 探针用 fixture 数据源
   不可能改变判定；
3. 门禁在 `while` 生成循环**之前**（D2），故触发与否与检索/生成质量无关。

### 数据（n=5/题，145 次 LLM 调用，prompt 为**当前分支未改动**的版本）

| case | 问题 | 期望 | 实测 |
|---|---|---|---|
| `052` | 最近7天每天的商店销售额 | 放行 | **放行 5/5** |
| `073` | 游戏收入最近表现怎么样 | 放行 | 放行 5/5 |
| `076` | 服务器之间有没有不平衡的情况 | 放行 | 放行 5/5 |
| `077` | 玩家留存有什么问题吗 | 放行 | 放行 5/5 |
| `DAILY_dau` | 最近30天每天的活跃用户数 | 放行 | 放行 5/5 |
| `DAILY_month` | 这个月每天的充值金额 | 放行 | 放行 5/5 |
| `DAILY_week` | 上周每天的订单量 | 放行 | 放行 5/5 |
| `DAILY_item` | 各个渠道昨天的新增用户数 | 放行 | 放行 5/5 |
| `voice_033/036/044/045/047/048` | 建议/报告/预测/总结 | 拦截 | **拦截 5/5** |
| `voice_041` | 最近数据有什么异常吗 | （票体称拦截） | **放行 0/5 —— 票体记载有误** |

后 4 个 `DAILY_*` 不是 k11-v2 case，是 `052` 同形态的改写题 —— 单一 case 无法说明
修复是否泛化，故专门造了「跨月逐日」「这个月+逐日」「上周+逐日」「逐项非逐日」四种，
其中两种词法上比 `052` 更贴近「周报/月报」。**全部 5/5 放行。**

### 两处票体记载被更正

1. **`052` 不是门禁误伤。** 用被指控的那版 prompt 实测 5/5 放行。前序判据（EMPTY + 低延迟）
   **无法区分两条 decline 路径**：CL-23 的 tool-call decline（`declineKind:
   'tool_call_emitted'`）同样产出 `generated_sql: null`，而 pre-rebase run 里 tool-call
   恰是高频形态（E4：9 个 fail case 的 27 个 attempt 中 6 个）。AGA empty-response burst
   （`packages/eval/eval-cli/README.md:93` 记录过一次 conc=4 丢 63/168）是第三种同形态。
   三者在产物里长得一样。
2. **`voice_041` 不在门禁的拦截集内**（0/5）。它的拒绝来自模型自己的 §5 诚实拒绝 ——
   E4 已证该形态能过 judge（9 散文 attempt 中 7 个过），故**不需要**门禁管它。

### 按票体要求实施的 prompt 重写：实测为净负，已回退

D「修 prompt 样例冲突」照做了一版：把判据从「周期报告」改写为「叙述性编排」，
并显式声明「粒度/时间跨度不构成 beyond_single_query」。为让 `voice_041` 按票体要求触发，
加了一条「未点名度量对象的综合发现」子句。**实测该子句把 `077` 打到触发 5/5、`076` 打到 2/5** ——
两者都期望 SQL，触发即必败。

即：**这版重写没有修好任何东西**（原 prompt 在全部 8 个放行题上已 5/5），
**只引入了一个比被指控的缺陷更严重的真实误伤**（`077` 5/5 vs `052` 声称的 3/5）。
→ **prompt 回退为字节一致**，重写的教训写进 `triageQuestion` doc comment
+ 探针 case 表注释，防再犯。

### 对 PR 门槛的影响

「门禁在当前形态下不可进 PR」的依据（已知未修的间歇性误伤）**不成立** ——
该误伤经直接测量不存在。门禁在 8 个放行题上 40/40 放行、6 个拦截题上 30/30 拦截。

**遗留（诚实记录）**：本轮只测了门禁的**分类判定**，n=5，且全部为中文题。
`GA-GRILL2` D3 / `GA-I18N-R1` 的英文侧问题不在本轮覆盖内。

## 收尾状态（2026-09-06）

- 代码在 `fix/cl20-delivery-agent-behavior`（`d6b376d296` + `4c2a1c7764`），**未合并**。
  按 `docs/da-pr-workflow.md`，触及 `packages/*/src` 必须走 PR（CI 有 "No production src on
  master (direct-push guard)"）。
- ~~**待办**：① **修 triage prompt 的样例冲突**（`"weekly report"` 样例误伤「最近7天每天的…」，
  见上方 2026-09-06 晚更正；3/5 误伤率不可接受）→ ② rebase 到 origin/master（落后约 60 commits，
  `context.ts` 一处手工合）→ ③ 重跑测试 → ④ **在 rebase 后代码上重跑全量**（这才是验收数字，
  须专门核 `052` 及同形态「N天每天的X」类 case）→ ⑤ 开 PR。~~

### 2026-09-06 夜 · 上述五项待办的实际结果

| # | 待办 | 结果 |
|---|---|---|
| ① | 修 prompt 样例冲突 | **前提被推翻，prompt 未改**（字节一致）。照做的重写实测把 `077` 打成 5/5 误伤 → 回退。见「门禁直接测量」节 |
| ② | rebase 到 origin/master | **完成**（落后 78 commits，非 60）。`context.ts` 冲突只有 import 一行（master 的 `buildPrompt` + `BuildPromptArgs` 是超集，取 master）；`:397` 的 `declineKind` 分支**自动合并成功**，无需手工合 |
| ③ | 重跑测试 | **完成**：`tsc --noEmit` clean、nl2sql-engine **132** 绿（其中本 spec 14）、eval **339** 绿 |
| ④ | rebase 后重跑全量 | 见下方 `cl20-postrebase-n1` 记录 |
| ⑤ | 开 PR | **完成**：[PR #37](https://github.com/McKenzieIT/deepseek-harness-da/pull/37)（base `master`，3 个 code commit，4 文件）。CI 状态见票尾 |

顺带项（CL-26 附带）：`declineKind` `'open_ended_question'` → `'beyond_single_query'`，
3 处调用点全改（`engine.ts` union + 返回、`context.ts:406`、spec）。
- ~~**status 保持 `in_progress`**：…门禁存在**已知未修缺陷**（间歇性误伤明确数据请求）…~~
  **该阻塞理由已消失**（2026-09-06 夜）：所谓「已知未修缺陷」经直接测量不存在。
- wayfinder 文档部分（本票 + CL-25/26/27 + map + audit-log）按同一工作流允许直推 master，已先行合入。

## 全量 eval 结果（2026-09-06 夜，`cl20-postrebase-n1`）—— post-rebase，**本票的验收数字**

完整记录见 [experiment-audit-log 2026-09-06（夜）条目](../research/experiment-audit-log.md)。
commit `5c84a903af`，k=1，conc=3，`today=20260906`，工作树干净且 run 期间未改 `packages/*/src`。

> **基线可用性更正**：session prompt 要求「与 `rebaseline-passk-168-clean` 比 + 标注 12pp 协议差」。
> 该产物**磁盘上不存在**（8 个 worktree 的 `eval-results/` 全查 + `find` 全仓零命中；
> `eval-results/*.json` 在 `.gitignore:61`）。改用两个**同协议 k=1** 基线，反而不引入协议噪声。

| 口径 | `10320fe2`（**无门禁**，k=1） | `cl20-full-n1`（门禁，pre-rebase） | `cl20-postrebase-n1`（门禁，post-rebase） |
|---|---|---|---|
| Overall | 73.8%（124/168） | 77.4%（130/168） | **75.6%（127/168）** |
| Voice DELIVERY（18） | 66.7%（12/18） | 94.4%（17/18） | **72.2%（13/18）** |
| **DELIVERY 全 25** | **52.0%（13/25）** | 80.0%（20/25） | **64.0%（16/25）** |

**两个方向要分开读**：

1. **vs 无门禁基线 = 门禁的净效果：overall +1.8pp、DELIVERY 全 25 52.0%→64.0%（+12pp）、
   voice DELIVERY +5.6pp、EXEC 侧零回归。** 即门禁本身**没有引入任何回归**且有可观增益。
2. **vs pre-rebase = rebase 的影响：DELIVERY 全 25 回吐 16pp。**
   该 delta **只能归因于 rebase** —— 本分支相对 pre-rebase 状态的**运行时 diff 只有一个
   字符串改名**（`declineKind`，3 处），其余全是注释/测试/新探针。
   机制：`contextPrefetched` 把 tool-call 发射打到 0%，而 tool-call 正是 CL-23 grounded
   三段式的**入口条件**（`context.ts:406` 的 `'tool_call_emitted'`）→ 通道失效。
   → 毕业 **[CL-28](CL28-contextprefetched-decline-synthesis-entrypoint.md)**。

### 门禁误伤 = 0（穷举 + 直接测量，非延迟推断）

前序两轮靠「空 SQL + 低延迟 ⇒ 门禁触发」推断，本轮改为读引擎 trace。**方法为穷举，不再只看空 SQL**：

- 全 run **48** 个非 SQL 输出逐个分类。**门禁触发时 `generated_sql` 恒为 `null`，绝不可能是 PROSE**
  （门禁返回不带 `sql`；PROSE 走 `context.ts:398` 的模型自述通道）→ 其中 25 个 PROSE
  **结构上不可能**是门禁所致。
- 余下 NULL 中，期望数值（无 `delivery_match: llm_judge`）的**只有 `040`**
  「最近一周每天的PVP对战场次变化」—— 正是要求专查的「N天每天的X」形态 → **实测门禁 0/5 不触发**。
- 丢失的 5 个 DELIVERY case 亦逐个测：`voice_013` 0/3、`voice_017` 1/3、`voice_039` 0/3、
  `voice_041` 0/3、`voice_042` 0/3、`077` 0/3 → 门禁均非其失败原因。
- **`052` 反证**：本次 NULL/wrong(26.6s) → **SQL/correct(42.4s)** 自行翻正。门禁与
  `contextPrefetched` 完全解耦 → 若曾由门禁造成，rebase 不可能修好它。

### status → `closed`

D1-D5 决策完结且不再变；门禁已实现、零回归、误伤经直接测量为 0；测试与全量 run 齐备并记入 audit-log。
剩余全部是**别的票**的范围：CL-25（case set 不自洽）、CL-26（另一 runner 无 decline 处理）、
CL-27（门禁调用成本）、CL-28（合成入口被掐）。

**D5（DELIVERY ≥80% 三轮中位数）明确未达成**（本次 64.0%，n=1），且本票不再追它 ——
两条独立压低因素分别归 CL-25 与 CL-28，目标值待 CL-25 定齐 case set 后重设。
**关票不等于达标**，这一点写在此处以免 map 读者误读。
