# Next-session prompt — GA-AUDIT1-followup ④ cleanup (continuation)

## 任务
接手 dsh-data-agent（/Users/mckenzie/workspace/deepseek-harness-da）的 GA-AUDIT1-followup ④ smell cleanup 续作。上一 session（2026-09-04）已处理 14 条 ④（4 fix batches + 2 docs/nit commits），deferred 7 → ②。剩余 ~21 ④ + 11 ② + 5 ③ + 2 ① + 3 deferred 已索引在 residual ticket。先读 residual ticket，按包挑一个 batch 做。

## 背景文件（先读）
- `wayfinder/data-agent/tickets/phase-misc/GA-AUDIT1-followup-residual.md` — 上一 session 的 handoff：进度（4 commits）+ 剩余项 per-package 明细 + re-verify 提示 + 断连对策
- `wayfinder/data-agent/tickets/phase-misc/GA-AUDIT1-followup-findings.md` — 原始 73 deferred 分类（52 修 + 6 验证已不适用 + deferred）
- `.tmp/adversarial-review/d-*-findings.json` + `confirmed{,-2,-3,-4}.json` — 126 confirmed findings 原始（file:line + category + severity + description + suggestedFix）
- `wayfinder/data-agent/map.md` — Decisions-so-far 的 GA-AUDIT1-followup + residual 两行（line ~214-215）

## 已处理（上一 session，别重复）
- 4 fix commits: `82c59266ae`（semantic-layer sl-5/sl-10）、`c807d36a11`（nl2sql 7/-11/-8/-3/-4）、`24a0fd884b`（erc-3/-5/-6）、`33d025b472`（qe-6/-7/-14/-15）
- 2 docs/nit commits: `1243f43218`（residual ticket + sl-3 grilling + map）、`1c73f9233a`（erc-3 stale-comment nit）
- subagent review APPROVED + full-tree typecheck 0 + 496 specs green

## 遗留 deferred → ②（别 inline 做）
- **sl-3** → grilling 票 `GA-GRILL-derived-from-lineage-direction`（getDerived 方向性决策，需 HITL grill A/B/C）
- **qe-2/-3/-5/-8/-11**（5 sidecar/concurrency，需 mock-sidecar 测试基建——query-maxcompute 无现存 sidecar-lifecycle test；建 fake-MCP-sidecar harness 是前置 task）
- **qe-13**（跨包 conventions loader dedup，maxcompute+postgres → shared createConventionsLoader in dsh-query）
- **usl-9**（gated on grilling `GA-GRILL-search-asset-id-normalization` + SchemaExplorer GA-WIRING-impl WIP）
- **di-10/di-11**（phase-gate.ts 有未提交 PB-COMPLY WIP——WIP-entangled；di-11 还是多 agent 语义）

## 建议下一步（按包挑一个 batch）
1. **ui-context-layer (4)** — ucl-7（domain chip 配色 local vs global index）/ -8（narration-gate ?? cast）/ -9（ContextLayerGraph render().then no .catch）/ -10（graph-animations fadeIn rAF leak）。单包、无 WIP、TDD-able。**推荐起点**。
2. **③ eval-core dead/cosmetic (5)** — eval-core-4/-5（删 unused eval-core runtime 栈——小型 consolidation 决策：删 vs 接成唯一 eval 引擎）/ -6/-8/-9（纯 dead-branch/cosmetic：infra_retry 'permanent'、computeSummary dead counters、checkResponder auth-heuristic divergence）。快赢、低风险。
3. **eval-cli-exp smell (3)** — ece-13（resolveRunFile unsorted）/ -14（expandQuery bare catch）/ -15（LEVEL_CONFIGS ?? {}）。**先 re-verify**——eval-cli 有并发 GA-EVAL-MANIFEST-impl（bin/eval.ts→src/bin.ts、+src/index.ts/invariant.ts），compare.ts/context.ts/harness.ts 可能动了。
4. **小批 ld-4 + dtd-7 + crs-3 (3)** — llm-dashscope translate.ts reasoning_content inline / tool-discover-alt-labels presentationMeta regex / seed-event-external-refs --with-llm unread。跨 3 包、local、无 WIP。
5. **ui-present-misc (3)** — upm-2（isLatestTurn dup）/ -9（parseFloat vs Number）/ -10（extractText dup）。**先 re-verify**——TableCard.tsx 被并发 R4 chart-types（`b2860731d5`/`2abfd47bd1`）+ post-ship（`4f11d43762`）动过，行号/代码可能变了。

## 每条 finding 的处理流程（TDD + 断连对策）
- **先 re-verify**：读 `file:line` 确认 finding 仍真实（代码可能被并发提交移过——ui-present-table R4 chart-types、eval-cli GA-EVAL-MANIFEST-impl、phase-gate PB-COMPLY 都动过代码）。真则修、假（已修/已移）则标"已不适用"。
- **TDD**：logic fix → 先写 RED test（failing on current）→ watch fail → minimal GREEN → REFACTOR；refactor（behavior-preserving）→ pin current behavior（inline snapshot 或 existing tests）then extract，`git diff | grep marker` 确认持久化（refactor edit 丢失=假绿）；doc fix → oxlint + typecheck 足够。
- **每文件** `pnpm exec oxlint <file>` + 相关 spec；**批量后** `pnpm run typecheck`（**前台**，不 background——disconnect 杀后台 shell）。
- **批量后** subagent 双核对（code-review + test 两并行 subagent——上一 session 的 review subagent 抓过 erc-3 stale comment + nl2sql-4 byte-identity via diff）。
- **vitest 全绿后仍跑 typecheck**——esbuild 跳过 type，typecheck 抓过 import-vs-re-export 的 ReferenceError。
- **commit 时只 add 本 session 改的文件**（WIP 别误 commit：phase-gate、SchemaExplorer、eval-cli bin/index/invariant、scope-registry index.*、simplification notes、experiment-audit-log 等）。

## 关键教训（上一 session 踩过）
- 本地 MCP runner 反复断连（`runner_gone`，每 1-3 分钟）→ 丢 mid-call edit + 杀后台 shell → 假绿。对策：refactor edit 后立即 `git diff <file> | grep <marker>` 确认持久化；typecheck/spec **前台**；GREEN-test fix（RED→GREEN）自验证（丢失=RED，不假绿）。
- 两个"smell"在 caller check 时发现是 ②（sl-3: getDerived 双向 expansion，callers ontology.ts+tool-search-data-sources 双向用 recall；qe-2/-3/-5/-8/-11: 需 mock-sidecar 基建）→ 别盲目 inline，跨包/需基建的 defer。
- vitest 跑从 root（`pnpm exec vitest run packages/.../tests/`），**不 cd 进包**（cd 会拾根 vitest workspace config 的 include pattern，导致 "No test files found"）。

## 工具
用 mcp__local__* 工具（read_file/write_file/edit_file/grep/glob/bash/list_dir/stat），路径全在 /Users/mckenzie/workspace/deepseek-harness-da 下。built-in Read/Write/Edit/Bash/Grep/Glob 被屏蔽。

## 起点
先读 `GA-AUDIT1-followup-residual.md`，用自己的话复述进度+剩余+下一步优先级，确认理解对了，然后挑一个 batch（推荐 ui-context-layer 4 或 ③ eval-core 5），按上面流程做。
