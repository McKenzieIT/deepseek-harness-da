---
type: task
status: open
blocked_by: []
---

# CL-26: eval-runner-service 缺 decline 合成分支 —— ③ 自驱循环的证据系统性失真

**Branch**: `fix/cl26-runner-service-decline-synthesis`  <!-- 待建；CLAUDE.md:64 要求每票声明分支 -->

## 事实（2026-09-05，CL-20 实施中核出）

reply 管道有**两份实现**，只有一份接了 decline 合成器：

| | `eval-cli/src/context.ts` | `eval-runner-service/src/index.ts` |
|---|---|---|
| `declineKind` 分支 | ✅ `:397`（CL-23 + CL-20） | ❌ **零**（`grep -c declineKind` = 0） |
| decline 时的 reply | grounded 三段式合成（【点名缺失】/【列举可得】/【引导重问】） | `:290` `` `Declined: ${result.reason}` `` |
| 消费者 | `dsh-eval` CLI（人跑 eval） | **`trigger_eval` tool → ③ 自驱循环**（管理 agent 跑 eval） |

`Declined: ...` 是内部诊断串，**DELIVERY judge 打 0 分** —— `context.ts:400-401` 的注释本身就是这么写的，
CL-11 的 reply 管道修复正是为了消除它（DELIVERY 1/14 → 11/14）。

**后果**：`eval-runner-service` 走的是 CL-11 修复之前的老路。CL-11 / CL-23 / CL-20 三票的
reply 侧成果对它**全部不可见**，所以：

1. **管理 agent 看到的 DELIVERY pass_rate 系统性低于 CLI 报的数**，且低的原因是**管道缺陷**而非语义层质量。
2. ③ 自驱循环（W6a `goal-eval-policy`）用 `delta.improved === 0` 计「无改进」、N=3 后 force-block。
   若 DELIVERY 类恒定被压低，则**管理 agent 对自己的改进效果读数失真**——它可能因为一个与
   语义层无关的管道 bug 而判定自己没有进展。
3. 这与 map 已记录的「③ 自驱循环无此问题：`eval-runner-service` 用 `passK: 3`，与 README 一致，
   管理 agent 经 `<eval_evidence>` 看到的是同一把尺」**矛盾** —— 那句话只核了 `pass_k`，没核 reply 管道。
   **同一把尺的前提不成立。**

挂载证据：`packages/bundle/data-agent/cordis.patch.yml:196`（`eval-runner-service` 是
`ctx.evalRunner` 的唯一实现）；消费方 `packages/data/tool-trigger-eval/src/index.ts:191-222`。

## 与 W16 / W17 同族

这是**第四例**「同一管道两份实现、只接了一份」：

| 票 | 服务端有 | 客户端/另一份没接 |
|---|---|---|
| W16 | evidence-query 8 个 `@Remote` | `./remote` 导出 + api/remotes 装配 |
| W17 | `ManagementSessionService` | `ContextLayerOverlay` 的 4 个交互 prop |
| **CL-26** | `context.ts` 的 grounded 合成 | `eval-runner-service` 的 decline 分支 |

值得在修本票时一并问：**为什么会有两份 reply 管道？** 若无必要差异，正解可能是抽出共享
函数而非在第二处复制粘贴第三次（复制粘贴正是本缺口的成因）。

## Question（需决策）

1. **抽共享还是复制？** `context.ts:397-436` 的合成逻辑（含 `hasCandidates` 无候选回退）
   是否抽成 `packages/eval/eval/src/` 的共享函数，两处同调？还是在 `eval-runner-service` 复制一份？
   —— 倾向抽共享（这是第四例复制导致的缺口）。但两处的 LLM adapter 接口不同
   （`CtxLlmAdapter.completeText` vs `.complete`），需先统一或加薄适配。
2. **`schemaContext` 从哪来？** 合成需要候选 schema 才能 grounding。`eval-runner-service`
   是否有等价的 `buildSchemaContext`？若无，无候选回退分支是否足够？
3. **修完是否要重跑 ③ 的基线？** 若管理 agent 的历史 eval run 都带这个缺陷，
   `evidence-query` 里的存量 run 是否需标记为「管道缺陷期」以免 delta 对比跨越修复点？

## 附带：`declineKind` 命名已不准确

CL-20 把门禁收窄为「交付物类型」判定后，`declineKind: 'open_ended_question'`
（`engine.ts:151`）名不符实——它判的是 report/forecast/recommendation，不是「开放性」。
建议随本票一并重命名为 `'beyond_single_query'`（调用点：`engine.ts` 门禁、
`context.ts:397`、`tests/open-ended-triage.spec.ts`）。**未在 CL-20 内改的原因**：
改动期间全量 eval 正在用 tsx 跑工作树，改则结果对不上任何 commit（map Notes 已记录过这个坑）。

## 验收

- `eval-runner-service` 的 decline 路径产出与 `eval-cli` **同质**的 grounded 回复（不再是 `Declined: ...`）。
- 若抽共享：两处同调一个函数，且有测试断言二者输出一致（防第五次分叉）。
- ③ 路径上跑一次 `trigger_eval`，确认 DELIVERY 类 case 的 reply 不再是内部诊断串。
- map Notes 里「③ 自驱循环无此问题…同一把尺」那句按实际情况更正。

## 关键文件

- 缺口处：`packages/eval/eval-runner-service/src/index.ts:288-294`
- 参照实现：`packages/eval/eval-cli/src/context.ts:397-436`（CL-23 + CL-20 分支）
- 挂载：`packages/bundle/data-agent/cordis.patch.yml:196`
- 消费方：`packages/data/tool-trigger-eval/src/index.ts:191-222`
- ③ 策略：`packages/data/goal-eval-policy/src/`（`delta.improved` 消费者）
- judge 门槛：`packages/eval/eval/src/judge.ts:40`（`JUDGE_PASS_THRESHOLD = 0.6`）
