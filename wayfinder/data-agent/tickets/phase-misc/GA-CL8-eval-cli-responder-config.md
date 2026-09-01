# GA-CL8-eval-cli — eval-cli responder LLM config (CL8 site)

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved (round 5, commit `842787c730` — 2026-09-01)
**Parent**: [GA-CL-batch](GA-CL-batch.md) CL8 (now ✅ 3/3 — enrichment sites `3f658a96df` + eval-cli site `842787c730`)

## Task

CL8（通用性审计）要消除三层 LLM 默认的静默 Qwen/DashScope (`aga`/`qwen3.7-max`/`qwen-flash`) fallback。enrichment 两站（`semantic-layer/src/llm-wiring-plugin.ts` + `tool-search-data-sources/src/expand-query.ts`）已在 `3f658a96df` 做了 fail-loud + `ENRICHMENT_LLM_*` env 契约。**eval-cli/main.ts 站点原 defer，round 5 做满**（本票承接 → resolved）。

## Why deferred (round 1-2)

1. **语义错配**：eval-cli 的 `--provider`/`--model` 喂给 **eval responder + SQL judge**（被测模型），不是 enrichment LLM。不能共用 `ENRICHMENT_LLM_*` 契约。
2. **breaks committed 冒烟测试**：fail-loud 会打挂 `main.spec.ts` "loads and runs with fake key"（假定静默默认）。该测试 WIP-modified（路径 k11→k11-v2），CL-batch 不能动 WIP（staging 约束）。

## Resolution (round 5, commit `842787c730`)

无并发 session 后（WIP 是 static 遗留），用户授权带 `main.spec.ts` 的 WIP 路径 hunk（k11→k11-v2，合理路径修正，匹配 `k11-cases.spec.ts` round 3），staging 死结解除。

- ✅ `main.ts`: `--provider`/`--model` defaults 去掉（无静默 `aga`/`qwen3.7-max`）+ `resolveResponderLlmConfig` 用 **responder 专用** `EVAL_LLM_PROVIDER`/`EVAL_LLM_MODEL` env（不用 `ENRICHMENT_LLM_*`）+ fail-loud `'eval-cli: no responder provider/model configured'`（message 区别 enrichment）。
- ✅ `main.spec.ts` (WIP): "loads and runs" 测试 +`EVAL_LLM_*` env（保留 WIP k11-v2 路径 hunk）。
- ✅ `cli-llm-config.spec.ts` (new): 5 测试（no-input+env→throw, env-populated→used, override, partial provider-only/model-only→throw）。

**Caveat（不在本票/CL8 scope）**：`main.ts` line ~272 `await import('@deepseek-ai/dsh-llm-dashscope')`（dashscope hard import）+ `DASHSCOPE_API_KEY` gate **仍在**——那是 **GA-GT2** (engine-abstraction) 的 hard-import/hard-exit 重构范畴。CL8 只做 defaults + fail-loud，不做 hard-import 解耦。剔除 llm-dashscope 的 eval-cli 能力缺失要等 GA-GT2。

## Verification (round 5)

- `cd packages/eval/eval-cli && npx tsc --noEmit` → main.ts 0 errors（context.ts WIP ~30 pre-existing，不碰）。
- eval-cli vitest 10 passed（main.spec 5 + cli-llm-config 5）。
- `npx tsc -b tsconfig.host.json` 全库 0 errors（query-maxcompute TS7016 round 5 同 commit 修了 via `maxc-args.d.mts`）。
- staged oxlint 0 errors。

## Context pointers

- round 5 commit: `842787c730`（CL8 eval-cli 3/3 + maxc-args.d.mts）。
- CL-batch Resolution: [GA-CL-batch.md](GA-CL-batch.md) Round 5 段。
- skeptic review: `.tmp/cl-batch/skeptic.md`。
- main.ts provider/model 用途: `main.ts` (responder `HarnessAgentResponder` + SQL judge)。
- resolver env 契约（enrichment 版，不复用）: `resolveEnrichmentLlmConfig` in llm-wiring-plugin.ts + expand-query.ts。
- dashscope hard import（GA-GT2 scope）: [GA-GT2-engine-abstraction.md](GA-GT2-engine-abstraction.md)。
