# GA-EVAL-ATTACH-POLL — attach 轮询三次之间无间隔，异步 job 路径实际走不通

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md)（2026-09-06——修 MCP/wait 预算相撞时顺带发现；当时用 `MAXC_WAIT_SECONDS` 绕过，是创可贴）
**Blocked by**: 无
**Blocks**: 无（但让「慢查询走异步」这条设计好的路径在实践中不可用）

---

## Question

`Nl2sqlEngine.run` 在拿到 `running` 态后立刻连打三次 `attach`，**中间没有任何等待**：

```ts
if (out.state === 'running') {
  let polls = 0
  while (out.state === 'running' && polls < MAX_RUNNING_POLLS) {   // MAX_RUNNING_POLLS = 3
    polls += 1
    out = await this.odps.attach(out.instance_id ?? '')            // ← 无 sleep
  }
  if (out.state === 'running') return { ok: false, pending: true, ... }
}
```

`attach` 落到 `maxc job status <id>`，是立即返回当前状态、不阻塞的。所以三次轮询在**几百毫秒内**跑完 —— 一个刚被提升为异步的 job（它之所以被提升就是因为在 wait 窗口内没跑完）**几乎必然**三次都还是 running → 返回 `pending` → eval 记「The query is still running; no answer yet.」→ 该 attempt 没有答案。

也就是说：sidecar 精心设计的「wait 窗口到点就提升为异步 job，交给上层 attach 续取」这条路径，**在当前轮询策略下等于必然失败**。

## 怎么发现的 / 现在的绕法

[GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) 把模型指向 event ODS 视图后，`COUNT(DISTINCT role_id) FROM ieu_ods.ods_10000251_all_view` 实测 **68s**，第一次撞上这条路径。当时的修法是把 MCP `toolCallTimeoutMs` 与 sidecar 的 `maxc query run --wait <N>` 解耦（`MAXC_WAIT_SECONDS`，默认 60），并在 real-exec baseline 里设 `MAXC_WAIT_SECONDS=240` 把慢查询**留在同步窗口内**，从而根本不走异步路径。

那是绕过，不是修好：
- 同步窗口占住一个 MCP tool-call 槽 240s，并发度被硬占用；
- 真正跑 >240s 的查询仍然掉进这条必然失败的路径；
- 生产 agent loop（P7 phase-gate 路径）用的是同一个 `attach` 语义。

## 修法候选

- **(A) 轮询之间加退避**：如 1s → 2s → 4s（或按 `--wait` 的比例）。最小改动。要定 `MAX_RUNNING_POLLS` 是否同时提高——3 次即便有退避也只覆盖到 ~7s。
- **(B) 按 deadline 轮询而非按次数**：给一个总预算（如 120s），在预算内以退避轮询。语义更贴「等到答案或超时」，也让 `MAX_RUNNING_POLLS` 这个常量消失。
- **(C) 把 pending 冒泡给调用方，由 eval runner 决定等多久**：engine 不猜等待策略。更干净但要改 eval runner + 生产两侧的契约。

lean 是 **(B)**：现在这个常量表达的是「轮询几次」，而实际关心的是「愿意等多久」，两者在无间隔时退化成「几乎不等」。

## 工作清单

- [ ] 决定 (A)/(B)/(C)。注意 engine 是 `Nl2sqlEngine`，eval 与生产（P7 agent loop）共享其逻辑模块 → 改动要同时看两条路径。
- [ ] 加测试：scripted odps 返回 N 次 `running` 后 `done`，断言 engine 最终拿到 `done` 而非 `pending`（当前 N≥3 就必失败）。
- [ ] 修好后回去评估能否把 real-exec baseline 的 `MAXC_WAIT_SECONDS` 降回 60（让慢查询走异步、释放同步槽），并 re-measure 并发吞吐。
- [ ] 顺带确认 `attach` 失败（instance 不存在/被取消）时的行为——当前 `out.instance_id ?? ''` 会拿空串去 attach。

## 备注

- 代码：`packages/data/nl2sql-engine/src/engine.ts`（`MAX_RUNNING_POLLS`、`run()` 的 running 分支）；sidecar 侧 `packages/query/query-maxcompute/dev/maxc-sidecar.mjs`（`executeOp` 的 `--wait ${WAIT_SECONDS}` + `toOutcome` 的 async 提升分支）。
- MCP 侧超时是 `MaxComputeQueryEngine.toolCallTimeoutMs`（eval-cli boot 从 `MAXC_WAIT_SECONDS` 派生，+60s 余量）——那部分已修，见 commit `3229590eeb`。
