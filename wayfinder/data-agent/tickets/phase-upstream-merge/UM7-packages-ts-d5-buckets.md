# UM7 — packages/* 68 .ts 按 d5 桶处置（additive keep / coupled refactor / churn revert）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM3, UM4（3 logic-change 文件先归 UM3/UM4）
**Blocks**: UM10
**Related**: d5 审计（`.tmp/audit/d5-upstream-impact.md`，68 .ts 分桶：45 legit-extension / 8 coupled / 12 churn / 3 logic-change）

## 背景

d5 把 68 个 fork-modified upstream `.ts`/`.tsx` 分四桶：**LEGITIMATE-EXTENSION**（~45，additive 向后兼容，KEEP）/ **DATA-AGENT-COUPLED**（~8，改 upstream 逻辑服务 data-agent，移进 data-agent 包）/ **UNNECESSARY-DIVERGENCE**（~12，comment-only/test-only churn，REVERT）/ **UPSTREAM-LOGIC-CHANGE**（3，id-less 簇 + apiproxy presetSwitches——归 UM3/UM4）。

## Scope（additive-over-mutation 原则）

1. **KEEP ~45 legit-extension**：scopeId dormant 管线（`core/agent-loop/src/tool-calls.ts:82`、`core/agent/src/runtime-types.ts:31`、`core/tools/src/index.ts:326,:1408`、`core/tools/src/code-mode.ts`）、`ctx.effect` 泄漏修复（`core/agent-loop/src/index.ts:351-353` + `extensions/tool-cordis`，核 disposer 契约仍成立 on upstream）、credentials addressing 等。逐个核**仍能编译过 upstream**（周边被 projection registry / dsh-util-values 改动可能移位）。
2. **REFACTOR ~8 coupled**：data-agent 进程规则移出 root `AGENTS.md`（移进 data-agent 自有包）；CI 分离归 UM2；`credentials-local static override name`（d5 line 27 verify-then-decide）核 Cordis DI identity 是否 collide。
3. **REVERT ~12 churn**：comment-only / test-only 重组（`core/tools/src/index.ts:660,:1299` catch-block 注释、`lsp-stdio/instance.spec.ts`、`shell/*` test-only churn 等）——顺势回退降债。
4. **3 logic-change** 归 UM3（id-less 簇）+ UM4（apiproxy presetSwitches）。
5. UNNECESSARY-DIVERGENCE 顺势回退（d5 12 churn 文件）。

## Resolution
（待落地后填：每桶处置结果 + KEEP 文件编译验证 + REVERT 文件清单）
