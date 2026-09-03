# GA-EVAL-REBASELINE — pass^k 语义落地后重建 eval 基线

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-MODEL1](GA-MODEL1-qwen37max-default.md) 调查发现（2026-09-03）· [基线分析](../../research/model1-baseline-analysis.md)
**Blocked by**: `runner.ts` pass^k 改动落地（当前未提交）
**Blocks**: eval-cli README Quality Targets 目标值重设

---

## 背景

`packages/eval/eval-runner/src/runner.ts` 有**未提交**改动，改变了 eval 判分语义：

| | 旧（全部已录制 run 用的） | 新（待落地） |
|---|---|---|
| 判分函数 | `bestOfKVerdict` — k 个 attempt **任一**过即 correct | `passKVerdict` — k 个 attempt **全部**过才 correct |
| 无 executor 且无 sqlJudge | `executionMatch = true` | `executionMatch = false` |

新语义是**反脆弱性的正确方向**（旧 best-of-k 掩盖 flakiness；旧 exec 默认把不可验证的 SQL 自动判过），但它使**全部现存基线数字失效**。

在录制 attempt 数据上重放（详见[基线分析](../../research/model1-baseline-analysis.md)）：

| 语义 | exp4-arm-a | exp2-arm-a | 1510b3e0 |
|---|---|---|---|
| 录制原样（best-of-k + 旧 exec 默认） | **88.1%** | 72.0% | 76.8% |
| best-of-k + 新 exec 默认 | 75.0% | 60.7% | 66.1% |
| **pass^k + 新 exec 默认（新语义）** | **47.6%** | 21.4% | 66.1% |

即 eval-cli README 记录的 88.1% 在新语义下会变成 ~47.6%。**任何按旧数字设定的目标值都会瞬间失真。**

## Question

pass^k 语义落地后，如何重建可信基线，并让"数字含协议"成为不可遗忘的约束？

## 工作清单

### 1. 前置确认

- [ ] 确认 `runner.ts` pass^k 改动的最终形态（是否两项改动都落地，还是只落一项）
- [ ] 确认关联 spec 已同步（`packages/eval/eval-runner/tests/runner.spec.ts` 已在 worktree 中被改）
- [ ] 决定是否同时接 SQL executor——当前全部 run `query_result` 均为 `null`（judge-only），是 75 个无-judge attempt 被自动判过的根因

### 2. 重跑基线

- [ ] pass^k 语义下重跑 168 cases（qwen3.7-max，记录 pass_k / concurrency / judge 配置）
- [ ] 新基线的 per-intent / per-complexity / per-category breakdown
- [ ] 与 best-of-k 基线做**语义对照表**（不是 delta——两者不可直接相减）

### 3. 重设目标值

- [ ] eval-cli README Quality Targets 的 short/mid/long-term 在新语义下重设
- [ ] 移除 GA-MODEL1 留下的「目标值系在 best-of-k 语义下设定」标注

### 4. 防复发（本票的真正价值）

- [ ] **结果 JSON 落盘 run 配置**：当前 `eval-results/*.json` 只有 `run_id`/`timestamp`/`summary`/`cases`——**不记 model / pass_k / concurrency / judge 开关 / verdict 语义**。这是本次前提错误（README 76.8% 被误认为 qwen-plus）的**根因**：模型信息只存在于人工维护的 audit log 里，与产物脱钩。建议 `RunResult` 增加 `config` 字段。
- [ ] **token usage 采集**：结果 JSON 无任何 usage 字段 → 成本无法从产物推导（GA-MODEL1 因此无法完成成本评估）
- [ ] 考虑 verdict 语义写入产物（如 `verdict_semantics: 'pass^k' | 'best-of-k'`），使跨期比较自带防误读

## 成功标准

1. pass^k 语义下有一个记录完整（含 config）的新基线
2. eval-cli README 的基线表与目标值在同一语义下自洽
3. 结果 JSON 自带 model + 协议 + 语义元数据——不再依赖人工 audit log 对齐
4. 成本可从产物观测（token usage）

## 备注

本票**不否定** GA-MODEL1 的模型结论。exp4-arm-a vs exp2-arm-a 是同代码/同协议/同语义对比，+16.1% 与判分语义无关——语义变化对两臂同向作用。

## Resolution (2026-09-03, 本 session)

**pass^k 语义已落地**：`runner.ts` 的 `bestOfKVerdict`→`passKVerdict`（any→every，全 k 过才 correct）+ `executionMatch` 无 executor/judge 时 `true`→`false`（不可验证不判过）——两项改动都已提交。

**重基线初步结果（30-case 子集，pass^k）**：pass_rate = **63.3%**（19/30 correct, 11 wrong, 0 declined, 0 infra_failure）。结果 JSON：`eval-results/a4fbd262-202d-4a5f-bfb1-f754ce07e60b.json`。

对比 best-of-k 基线（168 cases, 73.8%）低 ~10pp——正是 pass^k 该暴露的 flakiness（best-of-k 容许"3 次过 1 次即 correct"，pass^k 要求"3 次全过"）。Top failures：角色总数/PVP 对战场数/平均客单价/购买次数/付费流水（这些 case 在 3 次 attempt 中有未过的）。

**根因 + 修法（credentials seam）**：eval CLI 跑重基线时"no content"——根因是 eval CLI 的 ctx 没 mount credentials seam（`ctx.get('credentials')=undefined`）→ llm-dashscope `resolveApiKey` 回退 env（gate-fix 去掉了 env var）→ throw MISSING_CREDENTIAL → waterfall mask 成 "no content"。**不是** AGA 非 SSE（AGA 实际流 SSE，通过 adapter 的 `X-DashScope-SSE: enable` 头）。修：`context.ts:boot()`（engine responder ctx）+ `main.ts` judge ctx + harness-responder 都 mount `LocalCredentialProvider`（读 ~/.dsh/.credentials.yaml）+ `LocalCredentialProvider` 加 `static override name='credentials'`（让程序化 mount 注册成 'credentials'）。→ resolveApiKey 走 seam 读 credentials.yaml → 拿到 key → AGA SSE → SQL → pass^k。全程不进 process.env。

**遗留**：
- 完整 168-case pass^k 重基线（30-case 是初步；完整跑在长 session 中被 bg shell 回收中断在 100/168，需 fresh session 跑）。
- adapter.ts/harness-responder 的 debug log（`console.error('[ADAPTER-DBG]...')`）待清理（重 build 后清掉）。
