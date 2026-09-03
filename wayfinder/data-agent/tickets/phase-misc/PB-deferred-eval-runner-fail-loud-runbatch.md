# PB-deferred: eval-runner-service fail-loud（runBatch 用时点）

**Type**: task (AFK)
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03)
**Spawned from**: PB-COMPLY plugin-body audit, R8 finding `packages/eval/eval-runner-service/src/index.ts:382-383`

## Question

eval-runner 构造函数 `config.provider ?? 'aga'` / `config.model ?? 'qwen3.7-max'` 静默 vendor 默认——host 漏配 eval gateway 就静默跑 aga/qwen3.7-max，违背 sibling eval-cli 的 fail-loud 惯例。

**难点**：直接把 `??` 换成 constructor throw（本 session 试过）会破 7 处 mechanics 测试——它们 `new EvalRunnerService(ctx, {caseDir,...})` 不传 provider/model（测的是 casePaths/results 机制，不跑 LLM）。

## 决策点（推荐 A）

- **A（推荐）**：throw 移到 **runBatch**（provider/model 实际被 LLM call 消费之处），而非 constructor。mechanics 测试不调 runBatch → 不受影响；真跑 runBatch 且未配 → fail loud。需读 runBatch 找到 provider/model 消费点 + 加 `if (!this.provider || !this.model) throw new Error('...')`。验证 runBatch-with-stub 测试是否在 check 之前已 stub 掉 LLM seam（若是则不受影响）。
- **B**：给 mechanics 测试补 `provider:'test', model:'test'`（改测试）+ constructor throw。更贴 audit 原意但改测试面大。

## 为何留后续

正确修法（A）需读 runBatch 流程 + 验证 stub 测试不受影响，非纯加法；本 session 已 24 修，不宜再塞需测试改动的项。
