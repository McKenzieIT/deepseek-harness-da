# GA-EVAL-REBASELINE — pass^k 语义落地后重建 eval 基线

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-MODEL1](GA-MODEL1-qwen37max-default.md) 调查发现（2026-09-03）· [基线分析](../../research/model1-baseline-analysis.md)
**Blocked by**: ~~`runner.ts` pass^k 改动落地（当前未提交）~~ — ✅ 已解决（pass^k 改动已落地+提交 2026-09-03）。剩余：item 4 token usage follow-up + 下个 session 的 [GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md)（uniform clean conc=4 / executor baseline；**前置 `pnpm build`**，见 Resolution）
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

- [x] pass^k 语义下重跑 168 cases（qwen3.7-max，`--pass-k 3 --concurrency 4 --provider aga --model qwen3.7-max --skip-health-gate`，SQL semantic judge on）— **DEFINITIVE 52.4% (88/168)**；产物 `eval-results/rebaseline-passk-168-merged.json`；详见 [audit-log 2026-09-03 definitive](../../research/experiment-audit-log.md)
- [x] per-category breakdown：Original 48/80=60.0% · Alias 16/40=40.0% · Voice EXEC 14/30=46.7% · Voice DELIVERY 10/18=55.6%
- [x] 语义对照表（pass^k vs best-of-k，**不可直接相减**）：pass^k 52.4% vs best-of-k 73.8%(`10320fe2`)/88.1%(`exp4-arm-a`) = -21.4/-35.7pp（pass^k 严格更低，by design）；vs 30-case preliminary 63.3%（subset 偏易）；vs ticket 背景重放估计 47.6%(exp4-arm-a)（live 52.4% 在 n=168 MDE≈5.4-10.1pp 噪声内一致）

### 3. 重设目标值

- [x] eval-cli README Quality Targets 的 short/mid/long-term 在新语义下重设 — **PROPOSED（pending PM sign-off）**：Overall 60/70/85%、Original 65/75/88%（pass@3 pass^k）；rationale：pass^k 比 best-of-k 低 21-36pp by design，targets 相对 52.4% current 定 ambitious，long-term 85%+ 接近 best-of-k 88.1% under pass^k = 高一致性
- [x] 移除 GA-MODEL1 的「目标值系 best-of-k」标注 — README caveat 从"pending change"改为"pass^k is LIVE + targets re-set (proposed)"；baseline 表加 pass^k 52.4% current 行 + per-category 表换 pass^k；audit-log 路径 typo 修正（semantic-layer→data-agent）

### 4. 防复发（本票的真正价值）

- [x] **结果 JSON 落盘 run 配置** — `RunResult.config` 字段已落地（2026-09-03，subagent TDD + 独立 code review MERGE-READY，42/42 tests green）。`RunConfig` 12 字段：provider/model/pass_k/concurrency/sql_judge/verdict_semantics/responder/scope_id/today/query_expansion/with_query/skip_health_gate。改 `types.ts`(+63)/`runner.ts`(+7, conditional spread, additive/optional)/`index.ts`(+1 export)/`main.ts`(+21, engine+harness)/`eval-runner-service`(+23)；新 spec `runner-config.spec.ts`(4 tests)。**正是本次 63-case 污染没法从产物检出的缺口——现在 `config` 字段让 run 协议/语义/并发可从 artifact 直接读**。
- [ ] **token usage 采集** — **FLAGGED follow-up**：LLM 层已暴露 usage（`BlockAssembler.usage` @ `llm/src/assembler.ts:185` + DashScope adapter terminal `usage` StreamChunk @ `llm-dashscope/src/translate.ts:203`），但 thread 进 `RunResult.usage` 需改 3+ 公开 collaborator 接口（`AgentResponse`/`JudgeResult`/`SqlJudgeResult` + `LlmSqlSemanticJudge` callback）。**更简路径（design hint，code review 提出）**：LLM-stream interceptor（tee 包 `ctx.llm.stream` 捕获所有 usage chunk）+ `runBatch` 接 `usageSink` option——不动 collaborator 接口。本 session 未做（不强行 risky refactor）。
- [x] 考虑 verdict 语义写入产物 — `verdict_semantics: 'pass^k'` 已在 `RunConfig`（passKVerdict live；bestOfKVerdict removed）。

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

**DEFINITIVE 168-case pass^k 结果（2026-09-03，supersedes 上面的 30-case preliminary 63.3%）**：pass_rate = **52.4%**（88 correct / 168；Original 60.0% / Alias 40.0% / Voice EXEC 46.7% / Voice DELIVERY 55.6%）。产物 `eval-results/rebaseline-passk-168-merged.json`（105 genuine cases from initial run + 63 contaminated cases rerun clean → merge）。详见 [audit-log definitive entry](../../research/experiment-audit-log.md)。

**Contamination + 修法（IMPORTANT）**：initial conc=4 run 被**反复 AGA 空响应 burst** 污染（concurrency=4 + IDE + `pnpm dsh web` + MCP runner pod crash 的机器过载）→ 63/168 (38%) case 有空 attempt → raw 33.9%（被 infra 压低，非模型质量）。**不是 credentials-seam bug**（seam mount 全程 verified：`context.ts:boot()` + `main.ts` judge ctx + `LocalCredentialProvider static override name='credentials'` at `credentials-local/src/index.ts:208`；105 case 出真 SQL，550 empty 是 AGA stream empty 非 MISSING_CREDENTIAL）。63 contaminated case 在 AGA 恢复后用 conc=4 重跑干净（`rebaseline-contam-rerun`，0 no-content，31/63=49.2%）→ 与 105 genuine merge → definitive 52.4%。pass^k per-case concurrency-无关，故 conc=4 重跑 verdict 合法。**教训**：conc=4 under load 易触发 AGA empty burst；conc=1 不可行（~16h）；未来用 conc=2-3 或确保机器空载，且需 item 4 的 `config` 字段让污染可从产物检出。

**item 3 + item 4 已完成（2026-09-03，本 session 第二段）**：
- **item 3**：README Quality Targets 重设为 pass^k PROPOSED（Overall 60/70/85%、Original 65/75/88%，pending PM sign-off）；baseline 表 + per-category 表 + caveat 全更新到 pass^k current；audit-log 路径 typo 修正。
- **item 4（防复发，本票真正价值）**：`RunResult.config` 字段落地（subagent TDD + 独立 code review MERGE-READY，42/42 tests green）。12 字段捕获 run 协议/语义/并发/模型——正是本次 63-case 污染没法从产物检出的缺口。token usage flagged follow-up（LLM-stream interceptor design hint，未强行 refactor）。

**⚠️ BUILD 要求（下一个 session 跑 live eval 前必做）**：`packages/eval/eval-runner` 的 `exports` → `lib/index.js`（gitignored + stale，item 4 源码改后未 rebuild）。unit spec 走 `src/` 故全过，但 live `dsh-eval` CLI 走 `lib/` → 不会 stamp `config`。**下一个 session 跑任何 live eval 前，先 `pnpm build`（或 `pnpm --filter @deepseek-ai/dsh-eval-runner build`）**，否则 item 4 的 `config` 字段在 live run 里不生效。

**下一个 session（用户指定）**：[GA-EVAL-CLEAN-RERUN](GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) — ① `pnpm build`；② 单次 uniform clean conc=4（或 conc=3 若 conc=4 re-degrade）168-case pass^k → 单一干净 artifact（替换 52.4% merge）；③ `--with-query` executor real-execution baseline（real `execution_match`，非 judge-only upper bound；需 MaxCompute creds）；④ 两个 baseline 都自带 `config` 字段（item 4）。record 到 audit-log + README。

**仍遗留**：
- adapter.ts/harness-responder 的 debug log（`console.error('[ADAPTER-DBG]...')`）待清理。
- item 4 token usage（interceptor design，见上）。
