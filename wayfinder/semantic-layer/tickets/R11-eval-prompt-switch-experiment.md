---
type: research
status: open
blocked_by: []
---

# R11: eval 切换 buildEvalPrompt 实验

## Question

CL-19 根因分析发现 `buildEvalPrompt`（`prompt.ts:159-200`）已存在——无 tool catalog、无 agent persona、纯 SQL 生成——但 eval-cli 的 `Nl2sqlAgentResponder` 未使用它。需实验验证：将 eval promptBuilder 切换为 `buildEvalPrompt` 后，对 eval 结果的影响如何？

核心权衡：
- **收益假设**：消除 TOOL_CATALOG 触发的 tool-call 发射（CL-19 根因），对开放/模糊问题产生更合理的行为（纯 SQL 生成 or 直接报告候选不足）
- **风险假设**：改变评测标的——从测试 agent 行为（含 tool 理解、多阶段 SOP）变为测试纯 SQL 生成质量；`buildEvalPrompt` 缺少 §5 诚实拒绝规则、§3 复合判断门、§6 完整八规则（仅保留核心 8 条），可能影响复杂 case 质量

## 实验设计

### 变量

- **控制组**：当前 `buildPrompt`（含 TOOL_CATALOG + agent persona + 完整 SOP），即 CL-15 标准基线 run `10320fe2`
- **实验组**：`buildEvalPrompt`（无 TOOL_CATALOG，纯 SQL 生成 prompt）

### 实施

在 `context.ts` `Nl2sqlAgentResponder` 构造 engine 时：

```typescript
const engine = new Nl2sqlEngine({
  ...deps,
  promptBuilder: buildEvalPrompt,  // 替换 buildPrompt / buildPromptEN
})
```

注意 `buildEvalPrompt` 的 `BuildEvalPromptArgs` 与 `BuildPromptArgs` 签名不完全相同（缺 `eventDef`、`phase`、`today`），需确认 engine 传参兼容性或做适配。

### 观测指标

1. **Overall pass_rate**：与控制组（73.8%）对比
2. **分类别 delta**：Original / Alias / Voice EXEC / Voice DELIVERY 各自变化
3. **Case-level flips**：gained/lost 明细 + 归因（tool-call 消除 vs SOP 缺失导致退化）
4. **DELIVERY 特别关注**：voice_017/voice_042 是否因无 tool-call 发射而改善
5. **复杂 case 关注**：多表 join / 复合问题 / metric 路由——这些依赖 §3 SOP 的 case 是否退化

### 判断标准

- 若 overall ≥ 控制组 且 DELIVERY 显著改善：buildEvalPrompt 作为 eval 默认 prompt 的候选
- 若 overall 下降但 DELIVERY 改善：需权衡，可能仅对 DELIVERY case 使用
- 若 overall 和 DELIVERY 均下降：不采用，维持 CL-23 (a)+(b) 修复路径

## 验收

- 完成 full 168 case eval run（buildEvalPrompt）
- compare.ts 与控制组对比，记录到 `experiment-audit-log.md`
- 结论：是否采用 / 部分采用 / 不采用 + 理由

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
