# PB-deferred: eval-runner-service fail-loud（runBatch 用时点）

**Type**: task (AFK)
**Phase**: misc
**Status**: ✅ resolved (2026-09-04) — 决策 A 已实现（runBatch guard `src/index.ts:434`）+ 2 runBatch 集成测试补 stub provider/model（见 [GA-CORDIS-CATALOG-FIX](GA-CORDIS-CATALOG-FIX.md) §3）
**Spawned from**: PB-COMPLY plugin-body audit, R8 finding `packages/eval/eval-runner-service/src/index.ts:382-383`

## Question

eval-runner 构造函数 `config.provider ?? 'aga'` / `config.model ?? 'qwen3.7-max'` 静默 vendor 默认——host 漏配 eval gateway 就静默跑 aga/qwen3.7-max，违背 sibling eval-cli 的 fail-loud 惯例。

**难点**：直接把 `??` 换成 constructor throw（本 session 试过）会破 7 处 mechanics 测试——它们 `new EvalRunnerService(ctx, {caseDir,...})` 不传 provider/model（测的是 casePaths/results 机制，不跑 LLM）。

## 决策点（推荐 A）

- **A（推荐）**：throw 移到 **runBatch**（provider/model 实际被 LLM call 消费之处），而非 constructor。mechanics 测试不调 runBatch → 不受影响；真跑 runBatch 且未配 → fail loud。需读 runBatch 找到 provider/model 消费点 + 加 `if (!this.provider || !this.model) throw new Error('...')`。验证 runBatch-with-stub 测试是否在 check 之前已 stub 掉 LLM seam（若是则不受影响）。
- **B**：给 mechanics 测试补 `provider:'test', model:'test'`（改测试）+ constructor throw。更贴 audit 原意但改测试面大。

## 为何留后续

正确修法（A）需读 runBatch 流程 + 验证 stub 测试不受影响，非纯加法；本 session 已 24 修，不宜再塞需测试改动的项。

## Resolution（2026-09-04）

**决策 A 已实现**：runBatch 处加 guard `if (!this.provider || !this.model) throw new Error('eval-runner-service runBatch: provider and model are required (R8: configure the eval LLM gateway in cordis.yml; no silent vendor default)')`（`src/index.ts:434-436`），constructor 不动。mechanics 测试（不调 runBatch）如预测不受影响。

**测试侧补全**（[GA-CORDIS-CATALOG-FIX](GA-CORDIS-CATALOG-FIX.md) §3）：2 个 runBatch 集成测试（describe "stubbed seams, real engine"）构造时补 `provider:'stub-provider', model:'stub-model'`——stub LLM（`makeStubLlm()` 的 `stream`）忽略参数，stub 值 inert，仅过 R8 guard 的 non-empty 检查；不弱化任何 assertion。eval-runner-service 8/8 通过。
