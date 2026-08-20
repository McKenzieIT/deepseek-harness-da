# host-typecheck-wiring — critic-dedup 收尾 + nl2sql-engine tsconfig.host ref + phase-gate PromptAssembly

**Type**: task
**Phase**: misc (cross-phase / build hygiene)
**Status**: Unblocked（P11b resolved 2026-08-20——host typecheck 先验 gap 发现）
**Surfaced by**: [P11b eval harness 生产硬化](../phase-4/P11b-eval-harness-hardening.md)（host typecheck 跑出先验 gap）+ map Not-yet-specified「critic dedup candidate」（毕业）
**Scope**: 修 `pnpm run typecheck` 的 2 个先验 gap + 收尾未提交的 critic-dedup WIP，让 host typecheck 全绿。**非 wayfinder 决策——build hygiene wiring**。

**Question**: P13b/P7b session 已结束，但其包的 host-typecheck wiring gap（+ 一个未提交的 critic-dedup WIP）留作技术债。本票收尾：定 WIP 去/留 + 加 nl2sql-engine reference + 修 PromptAssembly，让 host typecheck clean。

**Sub-tasks**:

1. **critic-dedup WIP 去/留** —— **DONE（并发 session `d09640f5d7` "P7b re-open" 已 pop `stash@{0}` + commit WIP + B1-B14 fixes，2026-08-20）**。原 WIP 内容：`D phase-gate/src/critic.ts` + phase-gate 改 import `@deepseek-ai/dsh-nl2sql-engine` + B1-B14 fixes。**code-review（subagent 2026-08-20）**：核心 dedup 正确（import 路径 + 签名匹配 + last_sql 经 extractSqlCandidate 设 + CriticCtx 组装对）→ commit OK。**待新 session 验 d09640f5d7 是否已处理 code-review 3 major**：(a) M1 pnpm-lock（d09640f5d7 stat 未见 pnpm-lock——须 `pnpm install` 更 lock）；(b) M2 nl2sql-engine critiqueSql 去 `candidateTables.size>0` guard 改 fail-open 语义（medium，可 defer）；(c) M3 phase-gate index.ts 删 critic export（grep 确认无外部 consumer）。无 critical/major-WIP-bug。
2. **data 包 tsconfig.host references**（扩——不只 nl2sql-engine）：host typecheck 现报 **3 个 data 包 TS6307**（tests 在 host include `packages/*/*/tests/**/*.ts` 但 src 未被 tsconfig.host.json references）—— 加 references：`{ "path": "./packages/data/nl2sql-engine" }` + `{ "path": "./packages/data/semantic-layer" }` + `{ "path": "./packages/data/tool-search-data-sources" }`（同 P11b eval 的修法）。critic-dedup WIP 使 phase-gate 现 import nl2sl-engine → nl2sl-engine reference 是 WIP 编译前提；semantic-layer + tool-search-data-sources 是 P6b/P13b follow-up 新包同 gap。
3. **phase-gate PromptAssembly**：`packages/data/phase-gate/tests/phase-gate.spec.ts` `import { PromptAssembly } from '@deepseek-ai/dsh-tools'` 但 dsh-tools 不导出 → TS2614。查 PromptAssembly 应从哪来（dsh-tools 应 export？phase-gate 从别处 import？stale import 删？）→ 修 TS2614。须小调查（P7b 的 import intent）。

**验**: `pnpm run typecheck` 全绿 + `pnpm run test`（phase-gate + nl2sql-engine + eval）+ `pnpm run lint`（staged + full）0 error。

**关联**: P13b（nl2sql-engine 未 reference——P13b 未加 tsconfig.host ref）；P7b（phase-gate PromptAssembly + critic-dedup WIP）；P11b（surfaced host typecheck gap，commit 2890812409 的 tsconfig.host eval reference 失效 cache 暴露此先验问题）。map Not-yet-specified「critic dedup candidate」毕业→本票。
