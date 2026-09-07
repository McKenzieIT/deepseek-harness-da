# @deepseek-ai/dsh-patrol-mode

[English](README.md) | 中文

DeepSeek Harness data agent 语义层的自主巡检循环。迭代地找出最薄弱的 asset（通过 `evidenceQuery` 的健康度/缺口分析），逐个诊断，提出修复，请求用户显式确认，并在每轮确认编辑后触发一次 eval 批次。

## 概述

一个函数插件（`apply(ctx)`），在 `ctx.patrol` 上挂载 `PatrolService`。该服务持有一个长运行的巡检循环，以管理 session 为作用域，并在轮次之间处理「顺便」中断。

巡检循环：

1. 通过 `ctx.get('evidenceQuery')`（`coverageQuery` / `assetHealth` / `gapAnalysis` / `evalResultQuery`）找出最薄弱的 asset。
2. 对每个薄弱 asset（最多 `maxEditsPerRound` 个）：
   1. 通过管理 session + evidence query 诊断。
   2. 提出修复并发出 `patrol/confirm-request`。
   3. 等待用户确认（超时 `confirmTimeoutMs` → 拒绝 + 暂停）。
   4. 若确认：执行编辑（见「已知限制」）。
3. 编辑后：对已处理的 asset 触发一次 eval 批次（C3）。
4. 发出 `patrol/round-complete`（驱动 C2 批次渲染）。
5. 等待下一轮或继续。

## 配置

`PatrolConfig` 传入 `start(opts)`：

- `maxEditsPerRound`（默认 `3`，常量 `DEFAULT_MAX_EDITS_PER_ROUND`）：每轮确认 N 次编辑后暂停。
- `confirmTimeoutMs`（默认 `60000`，常量 `DEFAULT_CONFIRM_TIMEOUT_MS`）：用户必须在此窗口内确认，否则编辑被拒绝且巡检暂停。
- `scope`（默认 `''`）：可选的领域过滤，限制巡检范围到 asset 子集。

> 安全约定：每次编辑都需要用户显式确认。不得静默执行。

## 事件

所有事件都是并行广播（`@mode parallel`）：

- `patrol/started(config)`：循环已启动。
- `patrol/stopped()`：循环已停止（干净拆除）。
- `patrol/round-start(roundNumber)`：新一轮开始。
- `patrol/round-complete(summary)`：一轮完成（驱动 C2 批次渲染）。
- `patrol/confirm-request(edit)`：就一项提议编辑请求用户确认。
- `patrol/edit-executed(edit)`：一项已确认编辑已审计（仅审计；见「已知限制」）。
- `patrol/confirm-timeout(edit)`：用户未在 `confirmTimeoutMs` 内响应。
- `patrol/btw-received(message)`：巡检中途收到一条「顺便」用户消息。
- `patrol/paused(reason)`：巡检暂停（无薄弱 asset、达到最大编辑数或确认超时）。

## 验证

```sh
tsc -b packages/data/patrol-mode/tsconfig.json   # typecheck
pnpm vitest run packages/data/patrol-mode        # specs
pnpm verify-package-invariants                   # invariant companion resolves
```

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效应

本包的贡献对可复用的请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知限制与延后工作

- **`executeEdit` 是未实现的 no-op 桩（W11 TODO）。** `PatrolService.executeEdit` 当前仅审计已确认编辑（`patrol/edit-executed`）并返回 `true`，**并未将**编辑应用到管理 session 的 edit API。按当前交付，已确认编辑被静默地不予执行；轮次计数器仍会自增 `editsExecuted`，轮后 eval 仍会针对从未被修改的 asset 触发。在使本包的改进循环可用之前，需要将 `executeEdit` 接到管理 session 的 edit API（或让这个桩诚实地声明其不做应用）。不要依赖 patrol-mode 真正修改 asset。
- **`triggerEval` 的 eval-runner seam 未类型化。** `triggerEval` 通过内联 cast（`{ runBatch(opts?: object): Promise<unknown> }`）读取 `ctx.get('evalRunner')`；声明包（`@deepseek-ai/dsh-eval-runner-service`）被声明为对等依赖（peer dependency），但 `ctx.evalRunner` 的 Context 增强并未作为类型增强被导入，因此该访问保持松散类型。导入该 seam 的类型增强以获得类型化的 `ctx.evalRunner` 访问，此项已延后。
- **无 schemastery `Config` schema。** `PatrolConfig` 是一个普通 `interface`，可调项（`maxEditsPerRound`、`confirmTimeoutMs`、`scope`）是模块常量 / `start(opts)` 参数，而非经过校验的 `cordis.yml` Config 字段。添加 `z<Config>` schemastery schema 并穿入 `apply(ctx, config)` 已延后（它会增加依赖并改变插件签名）。
- **重复的 `inject` 声明。** `PatrolService` 同时带有 `static inject` 和模块级 `export const inject`（相同值）。去重（保留其一）已延后；它对 DI 敏感，需要针对 Cordis loader 的挂载路径在 Service 与函数插件组合下验证。
- **`requestConfirm` 的 abort 监听器。** 注册在共享巡检信号上的 abort 监听器在正常的确认/超时 resolve 路径上未被移除（仅在 abort 时移除）。在 `clearPendingConfirm` 中移除该监听器是延后的润色工作。
