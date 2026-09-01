# GA-CL8-eval-cli — eval-cli responder LLM config (CL8 deferred site)

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-CL-batch](GA-CL-batch.md) CL8 (partial — enrichment sites done in commit `3f658a96df`; this site deferred)

## Task

CL8（通用性审计）要消除三层 LLM 默认的静默 Qwen/DashScope (`aga`/`qwen3.7-max`/`qwen-flash`) fallback。enrichment 两站（`semantic-layer/src/llm-wiring-plugin.ts` + `tool-search-data-sources/src/expand-query.ts`）已在 CL-batch 做了 fail-loud + `ENRICHMENT_LLM_*` env 契约。**eval-cli/main.ts 站点被 defer**，本票承接。

## Why deferred (not done in CL-batch)

1. **语义错配**：eval-cli 的 `--provider`/`--model`（`main.ts:65-66`）喂给的是 **eval responder + SQL judge**（被测模型 —— 见 `main.ts:252` `HarnessAgentResponder` + `274`/`301` judge），**不是 enrichment LLM**。CL-batch 的 Agent 5 把它复用 `ENRICHMENT_LLM_*` env 是语义错 —— responder 与 enrichment 是不同关注点（eval 一个模型时，enrichment 可能用另一个）。不能共用 `ENRICHMENT_LLM_*` 契约。
2. **breaks committed 冒烟测试**：fail-loud eval-cli 会打挂 `packages/eval/eval-cli/tests/main.spec.ts` 的 "loads and runs with fake key (dry-run to LLM boundary)" 测试（它假定静默 `aga`/`qwen3.7-max` 默认，只传 fake `DASHSCOPE_API_KEY`）。该测试是 **WIP-modified**（上一 session 把 case 路径 `k11`→`k11-v2`），CL-batch 不能动 WIP（否则会把 WIP 路径 hunk 带进 commit，违反 staging 约束）。

## What to do (WIP 落地后)

1. 给 eval-cli 设计 **responder 专用 config** —— `EVAL_LLM_PROVIDER`/`EVAL_LLM_MODEL` env（或复用既有 DASHSCOPE 契约风格），**不要**复用 `ENRICHMENT_LLM_*`（那是 enrichment 专用）。
2. `--provider`/`--model` CLI 默认改空 + 从 responder env 解析 + fail-loud（message 如 `eval-cli: no responder provider/model configured`，区别于 enrichment 的 `enrichment-llm-wiring: ...`）。
3. 更新 `main.spec.ts` "loads and runs with fake key" 测试：在 env 里提供 responder provider/model（test 值），让它仍 reach LLM boundary + exit 0。注意该测试当前 WIP 改了 case 路径（`k11-v2`/`k11v2_059`），更新时保留 WIP 的路径改动，只加 env。
4. 验证：`cd packages/eval/eval-cli && npx tsc --noEmit` 绿；`npx vitest run packages/eval/eval-cli/tests/main.spec.ts` 绿；staged oxlint 绿。

## Context pointers

- CL-batch commit: `3f658a96df`（enrichment 两站 done；eval-cli reverted to committed `aga`/`qwen3.7-max` defaults）
- CL-batch Resolution: [GA-CL-batch.md](GA-CL-batch.md) `## Resolution (2026-09-01)` CL8 行
- skeptic review: `.tmp/cl-batch/skeptic.md`
- main.ts provider/model 用途: `main.ts:252` (responder), `274`/`301` (SQL judge)
- resolver env 契约（enrichment 版，供参考但不复用）: `semantic-layer/src/llm-wiring-plugin.ts` + `tool-search-data-sources/src/expand-query.ts` 的 `resolveEnrichmentLlmConfig`
