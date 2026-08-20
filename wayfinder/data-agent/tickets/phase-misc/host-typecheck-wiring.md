# host-typecheck-wiring — critic-dedup 收尾 + nl2sql-engine tsconfig.host ref + phase-gate PromptAssembly

**Type**: task
**Phase**: misc (cross-phase / build hygiene)
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved（2026-08-20——见下 Resolution；3 sub-task 全 done/verified/defer-as-appropriate；map/README backfill deferred，concurrent P5b 在 shared tracker）
**Surfaced by**: [P11b eval harness 生产硬化](../phase-4/P11b-eval-harness-hardening.md)（host typecheck 跑出先验 gap）+ map Not-yet-specified「critic dedup candidate」（毕业）
**Scope**: 修 `pnpm run typecheck` 的 2 个先验 gap + 收尾未提交的 critic-dedup WIP，让 host typecheck 全绿。**非 wayfinder 决策——build hygiene wiring**。

**Question**: P13b/P7b session 已结束，但其包的 host-typecheck wiring gap（+ 一个未提交的 critic-dedup WIP）留作技术债。本票收尾：定 WIP 去/留 + 加 nl2sql-engine reference + 修 PromptAssembly，让 host typecheck clean。

**Sub-tasks**:

1. **critic-dedup WIP 去/留** —— **DONE（并发 session `d09640f5d7` "P7b re-open" 已 pop `stash@{0}` + commit WIP + B1-B14 fixes，2026-08-20）**。原 WIP 内容：`D phase-gate/src/critic.ts` + phase-gate 改 import `@deepseek-ai/dsh-nl2sql-engine` + B1-B14 fixes。**code-review（subagent 2026-08-20）**：核心 dedup 正确（import 路径 + 签名匹配 + last_sql 经 extractSqlCandidate 设 + CriticCtx 组装对）→ commit OK。**待新 session 验 d09640f5d7 是否已处理 code-review 3 major**：(a) M1 pnpm-lock（d09640f5d7 stat 未见 pnpm-lock——须 `pnpm install` 更 lock）；(b) M2 nl2sql-engine critiqueSql 去 `candidateTables.size>0` guard 改 fail-open 语义（medium，可 defer）；(c) M3 phase-gate index.ts 删 critic export（grep 确认无外部 consumer）。无 critical/major-WIP-bug。
2. **data 包 tsconfig.host references**（扩——不只 nl2sql-engine）：host typecheck 现报 **3 个 data 包 TS6307**（tests 在 host include `packages/*/*/tests/**/*.ts` 但 src 未被 tsconfig.host.json references）—— 加 references：`{ "path": "./packages/data/nl2sql-engine" }` + `{ "path": "./packages/data/semantic-layer" }` + `{ "path": "./packages/data/tool-search-data-sources" }`（同 P11b eval 的修法）。critic-dedup WIP 使 phase-gate 现 import nl2sl-engine → nl2sl-engine reference 是 WIP 编译前提；semantic-layer + tool-search-data-sources 是 P6b/P13b follow-up 新包同 gap。
3. **phase-gate PromptAssembly**：`packages/data/phase-gate/tests/phase-gate.spec.ts` `import { PromptAssembly } from '@deepseek-ai/dsh-tools'` 但 dsh-tools 不导出 → TS2614。查 PromptAssembly 应从哪来（dsh-tools 应 export？phase-gate 从别处 import？stale import 删？）→ 修 TS2614。须小调查（P7b 的 import intent）。

**验**: `pnpm run typecheck` 全绿 + `pnpm run test`（phase-gate + nl2sql-engine + eval）+ `pnpm run lint`（staged + full）0 error。

**关联**: P13b（nl2sql-engine 未 reference——P13b 未加 tsconfig.host ref）；P7b（phase-gate PromptAssembly + critic-dedup WIP）；P11b（surfaced host typecheck gap，commit 2890812409 的 tsconfig.host eval reference 失效 cache 暴露此先验问题）。map Not-yet-specified「critic dedup candidate」毕业→本票。

## Resolution（resolved 2026-08-20）

实际 landed WIP commit = `105fbeaccc`（HEAD 祖先；票中 `d09640f5d7` 为 pre-amend dangling hash，同内容 8 文件）。

**Sub-task 1（验 critic-dedup WIP）**：
- **M1 pnpm-lock ✓**：lock 已 current。P6b（`88524504f8`）install 在 WIP commit 之后跑，已带入 phase-gate→nl2sql-engine workspace link（symlink `phase-gate/node_modules/@deepseek-ai/dsh-nl2sql-engine → ../../../nl2sql-engine` 存在；`pnpm run typecheck` install preamble "Already up to date" + supply-chain verified）。无补 lock。
- **M2 candidateTables guard → DEFER（非 restore）**：`candidateTables.size > 0` guard **从未**在 nl2sql-engine/critic.ts 存在（`git log` 唯一 commit `37231abea0` P13b 即无 guard；guard 仅在 phase-gate 原 critic.ts P7b）。S7/S8 锁定 nl2sql-engine **故意** fail-closed-on-empty（S8 "月球场景"无 BM25 候选→candidateTables 空→moon_landing∉∅→error→fail→retry→decline；S7 9/9 含同型 case）。restore guard（fail-open）实测破 S7(8/9)+S8（r.decline undefined），revert 后 10/10 绿。故 defer：nl2sql-engine 故意 fail-closed（P13b 设计）；phase-gate 原 fail-open 仅在 forcedLoad best-effort 退化路径丢失（forcedLoad 正常 populate 候选→guard no-op→无差异），fail-closed 更安全（拒未 grounded SQL pre-execution）+ 合 nl2sql-engine 测试意图。critic.ts + scenarios.spec.ts revert 至 HEAD 零 diff。phase-gate 若生产需 fail-open-on-empty 另开 follow-up（pre-check candidate_tables 空），非本 build-hygiene 票。
- **M3 critic export removal ✓**：全仓 `from '@deepseek-ai/dsh-phase-gate'` import **0 处**（mcp grep + bash grep 双验；mcp grep 此环境不可靠，bash grep 权威）；index.ts 注释文档化 dedup 边界（"critic logic + GateResult/CriticCtx live in nl2sql-engine; phase-gate delegates; No re-export"）。无外部 consumer，无 re-export proxy 需。
- **核心 dedup ✓**：phase-gate.ts `import { extractSqlCandidate, sqlSyntaxGate, type CriticCtx } from '@deepseek-ai/dsh-nl2sql-engine'` + nl2sql index.ts 导出三者，签名匹配；last_sql 经 extractSqlCandidate 设（generationGate）；CriticCtx 组装对（candidateTables/eventParams/partitionCols from state）。code-review subagent 2026-08-20 VERIFIED 一致。

**Sub-task 2（3 data tsconfig.host references）✓**：tsconfig.host.json `references` phase-gate 后加 `{ "./packages/data/nl2sql-engine" }` + `{ "./packages/data/semantic-layer" }` + `{ "./packages/data/tool-search-data-sources" }`（additive，仿 P11b eval 修法）。`tsc -b tsconfig.host.json --force`：3 data 包 0 错（TS6307 全消；nl2sql-engine 原经 phase-gate tsconfig 传递引用已覆盖，直加为 uniform + 未来保险）。

**Sub-task 3（PromptAssembly TS2614）✓ 已由并发 WIP B12 解**：spec 现 `import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'`（line 13，B12 改源 dsh-tools→dsh-system-prompt；dsh-system-prompt 导出 PromptAssembly，phase-gate.ts 同源 import）。typecheck 无 TS2614（仅 TS6307，已由 sub-task 2 解）。semantic-layer TS6133（deepEqual unused）等次要先验错未现（typecheck 仅 TS6307）。无额外动作。

**验**：
- `tsc -b tsconfig.host.json --force`：commit-tree 3 data 包 0 错。唯一残留 7 TS6307 全在 `packages/embedder/*`（embedder/embedder-fakehash/embedder-http）+ `packages/retrieval/retrieval-inproc` = **P5b 并发 untracked WIP**（P5b map Decisions note 明示 "tsconfig.host refs DEFER（并发正改），P5b bar 经 per-pkg tsc+paths 满足"；P5b 解锁时未加 host refs）。非本票 scope；P5b 解锁后或 follow-up 加 embedder/retrieval refs。
- scoped vitest（phase-gate 14 + nl2sql-engine 10 + semantic-layer 5 + tool-search-data-sources 8 + eval 201）= **238/238 全绿**（nl2sql-engine S7/S8 经 revert critic.ts 后 10/10，证 restore guard 曾破此二 case）。
- pre-commit（staged oxlint + whitespace + vendor-manifest-guard）**不跑 tsc**——本 commit 不被 P5b WIP 阻（critic.ts revert 后 0 .ts staged，lint-staged job no-op pass via `--no-error-on-unmatched-pattern`）。
- full `pnpm run typecheck`/`pnpm run lint`：build:lib:host 跑 `tsc -b tsconfig.host.json` 拉 P5b untracked embedder/retrieval 测试 glob → TS6307 → 短路，非本票可控（P5b 解锁后清）；pre-push 跑 full typecheck 同样撞 P5b WIP。

**map/README backfill DEFERRED**：并发 P5b session 正编辑 shared tracker（map.md/README.md，~6min 前写 backfill；frontier "unblocked" 行 contested——P5b 删 P5b、本票删 host-typecheck-wiring，同一行；shared .git index 致 P5b commit 可能 sweep staged hunks）。为不 disrupt P5b / 不 race / 不 sweep，map Decisions 行 + frontier README 行延后至 P5b session settles 后清 pass 回填（re-read HEAD → 加 host-typecheck-wiring Decisions line + phase-misc/README 行 → resolved + frontier 删 host-typecheck-wiring）。本 commit = tsconfig.host 3 refs + 本 ticket Resolved only（surgically staged via `git apply --cached`，避 .agents/notes 改 + P5b untracked embedder/retrieval + P5b tsconfig.host concurrent hunks）。
