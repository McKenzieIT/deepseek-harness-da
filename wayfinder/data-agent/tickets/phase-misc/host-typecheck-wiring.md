# host-typecheck-wiring — critic-dedup 收尾 + nl2sql-engine tsconfig.host ref + phase-gate PromptAssembly

**Type**: task
**Phase**: misc (cross-phase / build hygiene)
**Status**: Unblocked（P11b resolved 2026-08-20——host typecheck 先验 gap 发现）
**Surfaced by**: [P11b eval harness 生产硬化](../phase-4/P11b-eval-harness-hardening.md)（host typecheck 跑出先验 gap）+ map Not-yet-specified「critic dedup candidate」（毕业）
**Scope**: 修 `pnpm run typecheck` 的 2 个先验 gap + 收尾未提交的 critic-dedup WIP，让 host typecheck 全绿。**非 wayfinder 决策——build hygiene wiring**。

**Question**: P13b/P7b session 已结束，但其包的 host-typecheck wiring gap（+ 一个未提交的 critic-dedup WIP）留作技术债。本票收尾：定 WIP 去/留 + 加 nl2sql-engine reference + 修 PromptAssembly，让 host typecheck clean。

**Sub-tasks**:

1. **critic-dedup WIP 去/留**：工作树有未提交的重构——`D packages/data/phase-gate/src/critic.ts`（删 152 行）+ phase-gate 改 `import { critiqueSql, extractSqlCandidate } from '@deepseek-ai/dsh-nl2sql-engine'`（spec 注释「critic dedup (P13b Q2): sqlSyntaxGate moved to nl2sql-engine」）+ `M phase-gate/{package.json,src/index.ts,src/phase-gate.ts,tests/phase-gate.spec.ts,tsconfig.json}` + `M pnpm-lock.yaml` + `M P5b/P6b/P7b tickets`。这是 map Not-yet-specified「critic dedup candidate」的进行中实现（一个已结束 session 留下）。**验证 WIP 正确**（phase-gate delegate to `nl2sql-engine.critiqueSql`/`sqlSyntaxGate` per Q2 boundary；guard-data 从 session tool results 组装传 `CriticCtx`；`sqlSyntaxGate` 不再 set `last_sql`，phase-gate `generationGate` 经 `extractSqlCandidate` 设）→ commit；若 broken → revert + 重开 critic-dedup 票。
2. **nl2sql-engine tsconfig.host reference**：加 `{ "path": "./packages/data/nl2sql-engine" }` 到 `tsconfig.host.json` references（同 P11b eval 的修法——nl2sql-engine tests 在 host include `packages/*/*/tests/**/*.ts` 但 src 未被 reference → TS6307）。解 TS6307。critic-dedup WIP 使 phase-gate 现 import nl2sql-engine → 此 reference 是 WIP 编译前提。
3. **phase-gate PromptAssembly**：`packages/data/phase-gate/tests/phase-gate.spec.ts` `import { PromptAssembly } from '@deepseek-ai/dsh-tools'` 但 dsh-tools 不导出 → TS2614。查 PromptAssembly 应从哪来（dsh-tools 应 export？phase-gate 从别处 import？stale import 删？）→ 修 TS2614。须小调查（P7b 的 import intent）。

**验**: `pnpm run typecheck` 全绿 + `pnpm run test`（phase-gate + nl2sql-engine + eval）+ `pnpm run lint`（staged + full）0 error。

**关联**: P13b（nl2sql-engine 未 reference——P13b 未加 tsconfig.host ref）；P7b（phase-gate PromptAssembly + critic-dedup WIP）；P11b（surfaced host typecheck gap，commit 2890812409 的 tsconfig.host eval reference 失效 cache 暴露此先验问题）。map Not-yet-specified「critic dedup candidate」毕业→本票。
