---
type: grilling
status: open
blocked_by: []
---

# CL-25: open_ended case set 期望行为不自洽（CL-20 毕业）

**Branch**: `fix/cl25-open-ended-case-consistency`  <!-- 待建；CLAUDE.md:64 要求每票声明分支 -->

## 事实（2026-09-05，CL-20 实施中发现）

`packages/eval/eval/cases/k11-v2` 的 26 个 `query_intent: open_ended` case，
期望行为的边界**在词法上自相矛盾**——同词根、期望相反：

| 词根 | 期望 SQL（`match_mode` 非空） | 期望 REFUSE（`delivery_match: llm_judge`） |
|---|---|---|
| **平衡** | `076` 服务器之间有没有不**平衡**的情况 | `079` 卡牌**平衡**性怎么样 |
| **怎么样** | `073` 游戏收入最近表现**怎么样** | `079` / `voice_017` / `voice_020` / `voice_022` / `voice_046` |

CL-20 实测证明这不是可调参的问题：激进 triage prompt 拦住全部目标但**误伤 `076`
（pass→fail 真回归）**；保守 prompt 救回 `076` 但放过 `079`/`voice_048`。
**调 prompt 只平移边界，放不对位置** → 非 temperature=0 / 多数投票可解（那些治方差）。

分布同样极度倾斜：**23/26 期望 REFUSE，仅 `073`/`076`/`077` 期望 SQL**。

## 根因：`open_ended` 混合了 ≥5 种互不相同的拒绝理由

| 类 | 拒绝理由 | case | 能否从**问题文本**判断？ |
|---|---|---|---|
| **A** | 字段缺失（schema gap） | `019` `049`（无情感极性字段）、`voice_020`（无版本号字段）、`voice_046`（竞品数据不在范围） | ❌ **不能**——`019`「昨天的负面舆情条数有多少」问法完全具体，只因表里没有情感列才拒 |
| **B** | 实体未指明 | `voice_013`（哪个活动）、`voice_018`（哪个武将）、`voice_022`（哪个区服） | ⚠️ 部分 |
| **C** | 标准未定义（主观） | `074` `075` `078` `079` `080` `voice_015` `voice_033` `voice_036` `voice_039` `voice_041` `voice_043` | ✅ 能（但边界即上表的矛盾所在） |
| **D** | 超出能力（交付物类型） | `voice_044` 周报、`voice_045` 预测、`voice_047` 策略、`voice_048` 总结 | ✅ 能 —— **CL-20 已交付此类门禁** |
| **E** | 指标未指明 | `voice_042`（哪些关键指标） | ✅ 能 |

让单个分类器同时做 5 种判断 → 边界必然不稳。且 A 类**原理上**无法由问题文本判断。

## Question（需决策）

1. **`076` 到底该期望什么？** 「服务器之间有没有不平衡的情况」与 `079`「卡牌平衡性怎么样」
   在语义上是同一类（都要求一个未定义的"平衡"标准）。是 `076` 该改为 REFUSE，
   还是 `079` 该改为 SQL？抑或二者都对、区别在于 `076` 隐含了明确的对比维度（服务器之间）？
   —— 这一条决定了 C 类边界是否**存在**可实现的判据。
2. **`073` vs 5 个「怎么样」的区别是什么？** `073`「收入表现怎么样」期望 SQL，
   `voice_017`「玩家反馈怎么样」期望 REFUSE。若区别是「收入有明确指标、反馈无字段」，
   那 `voice_017` 属 A 类（字段缺失）而非 C 类——需重新分类而非重划边界。
3. **是否给 case YAML 的 `dimensions` 增加 `refusal_reason` 字段**（枚举 A–E）？
   收益：eval 报告可按拒绝理由分类统计，engine 侧可分别设计判据并分别度量；
   代价：168 个 case 需标注（仅 26 个 open_ended 实际需要）。
4. **A 类是否应该退出 DELIVERY 而进 EXEC-with-graceful-degradation？**
   `019`「昨天负面舆情条数」当前若模型生成 SQL 就判负；但它是**合法的取数请求**，
   只是数据缺字段。这是否更应该测「模型能否发现字段缺失并说明」而非「模型能否拒绝」？
5. **DELIVERY 目标值重设**：CL-20 的 D5 定了 ≥80%，但在边界不自洽的 case set 上
   该数字无意义。定齐分类后按类分别设目标（如 D 类 100%、C 类 待定）？

## 背景

- 来源：[CL-20](CL20-delivery-agent-behavior-type2.md) Resolution（2026-09-05）。
- CL-20 已交付 D 类门禁（deliverable-kind triage，`engine.ts` `triageQuestion`），
  实测误伤 0/3、门禁触发 7 个全部正确。**本票不重做 D 类。**
- 当前 DELIVERY 基线（本 session 从 `rebaseline-passk-168-clean.json` 机械重导）：
  **16/25 = 64.0%**（pass^k，k=3）。注意 README:43 的「Voice DELIVERY 18」只是 voice 子集，
  另 7 个数字 DELIVERY case 并进了 README 的「Original 80」。
- 相关先例：`GA-GRILL2` D3（`TREND_PATTERN` 关键词 recall 85% 天花板 → `GA-I18N-R1`
  转向 LLM intent 分类）；CL-7（BM25 分数跨查询不可比）。

## 验收

- `076`/`079`/`073`/`voice_017` 四个冲突 case 的期望行为有**明确且可陈述的判据**
  （不是逐案裁定，而是一条能推广到新 case 的规则）。
- 26 个 open_ended case 按 A–E 重新分类，冲突消除（同判据下无同词根反例）。
- 若决定加 `refusal_reason` 字段：schema + 26 case 标注 + eval 报告按类 breakdown。
- DELIVERY 目标值按类重设，写入 `packages/eval/eval-cli/README.md`。

## 关键文件

- case set：`packages/eval/eval/cases/k11-v2/*.yaml`（26 个 open_ended）
- case schema：`packages/eval/eval/src/`（`dimensions` 定义处）
- 门禁实现（勿动 D 类）：`packages/data/nl2sql-engine/src/engine.ts` `triageQuestion`
- DELIVERY judge：`packages/eval/eval-cli/src/context.ts:243-255`；门槛 `packages/eval/eval/src/judge.ts:40`
- 目标值：`packages/eval/eval-cli/README.md`
