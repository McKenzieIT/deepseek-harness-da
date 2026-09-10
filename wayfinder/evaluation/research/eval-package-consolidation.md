# R24 — eval 包级合并可行性

日期：2026-09-08  ·  票：[R24-eval-package-consolidation](../tickets/R24-eval-package-consolidation.md)  ·  喂给 [G1](../tickets/G1-exec-grader-seam.md) 的 D2

## 判定

**有条件可行，但"去重实现"与"搬动包边界"应拆成两件事**：前者消除根因且外部消费者零改动，后者才触及 5 个仓外消费者。无循环依赖。

## 1. 重复清单（已验证到行）

`packages/eval/` 不是"四个包有点散"，而是**一套 eval 引擎存在两份**：

| 能力 | 实现 A | 实现 B | 生产路径用哪个 |
|---|---|---|---|
| 批量运行 | `packages/eval/eval/src/runner.ts:99` — `runBatch(cases, opts): BatchResult` | `packages/eval/eval-runner/src/runner.ts:49` — `runBatch(casePaths, collaborators, options): RunResult` | **B** |
| health gate | `packages/eval/eval/src/health-gate.ts` | `packages/eval/eval-runner/src/health_gate.ts:66` | **B** |
| 结果比较 | `packages/eval/eval/src/match_modes.ts:51`（被单测覆盖） | `packages/eval/eval-runner/src/runner.ts:358`（私有包装器，转调 A） | **B 包装 A** |
| `CtxQueryExecutor` / `LlmJudgeExecutor` / `CtxLlmAdapter` / `Nl2sqlAgentResponder` | `packages/eval/eval-cli/src/context.ts`（注释自称 forked from eval-runner-service） | `packages/eval/eval-runner-service/src/index.ts` | 各自一份 |
| 失败分类（`infrastructure`/`timeout`/`patience`） | `packages/eval/eval/src/classify_failure.ts` | — | **无人调用** |

两份 adapter 已**行为分叉**，不是纯复制：

- `CtxQueryExecutor`：`eval-cli` 接受 `state === 'done' || 'completed'`（`context.ts:239`），`eval-runner-service` 只接受 `'completed'`（`index.ts:200`）。
- `CtxLlmAdapter`：`eval-cli` 版含 `completeWithReasoning` 与 reasoning-text 提取（thinking 模型），service 版无。
- `Nl2sqlAgentResponder`：`eval-cli` 版含 event-definition 预取、query expansion、event detection，service 版精简。

## 2. 包边界移动的爆炸半径（已验证）

`dsh-eval-runner` 在 `packages/eval/` 之外的引用：

- `packages/data/tool-trigger-eval/src/index.ts:17`（`RunResult`/`RunSummary`/`DeltaReport` 类型）+ `tests/trigger-eval.spec.ts:3` + `package.json` 依赖
- `packages/goal/goal-eval-policy/package.json`（依赖；运行时经 `ctx.get('evalRunner')` duck-typing，`src/index.ts:168`）
- `python/sdk-runtime/package.json:149`
- `scripts/live-verify-w1-w5.ts:19-21`（并直连 `dsh-eval` 的 `loadCases`）

`dsh-eval-runner-service` 之外引用：`packages/data/patrol-mode/package.json`。服务注册点：`eval-runner-service/src/index.ts:508-510` 挂 `ctx.evalRunner`，由 `tool-trigger-eval`（`:202-229`）与 `goal-eval-policy`（`:168-187`）消费。

## 3. 合并需同步更新的工程面

`package.json` exports（四包同构 `.` / `./invariant` / `./src/*`）、各包 `tsconfig.json` 的 project references、`tsconfig.base.json:301` 的 `packages/eval/*/src` 路径映射、`knip.json:395-418`（`eval` 与 `eval-runner-service` 有独立段）、`tsdown.config.ts:19` 的 workspace 通配、以及 `test:coverage` 的 per-file 100% 门——当前"因无人调用而无测试"的代码一旦并入在用包，会进入覆盖率统计。

## 4. 与 benchmark-agnostic 目标的关系

不冲突，且铺路：`eval-runner` 的 `runBatch` 接受通用 `Collaborators`，不含具体 benchmark 或 harness 逻辑；`dsh-eval` 是纯库。环境特定的部分集中在 `eval-cli` 与 `eval-runner-service`。把核心并到一处会让 benchmark / harness / environment 的界线更清楚。

## 5. 未能确定

- **死导出的完整清单**需要跑 `knip`（本轮未跑）。已知 `classify_failure` / `multi_turn` 的 `driveSession` 无非测试调用点，但 `dsh-eval` 27 个导出中还有多少属于死面未逐一确认。
- 受影响的测试与 snapshot 清单未逐个枚举。
- 挂载 `eval-runner-service` 的 `cordis.yml` 未穷举。
