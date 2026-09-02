# GA-GT2-nit-cleanup — GA-GT2-impl review NIT 批量清理

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-02 claude — nit-cleanup (subagent + review + test)  ·  **Resolved**: 2026-09-02
**Source**: [GA-GT2-impl review](GA-GT2-impl-engine-abstraction.md)（APPROVED_WITH_NITS，8 NIT 中 6 个机械项）
**Priority**: low
**Blocked by**: 无

## Question
批量修 GA-GT2-impl code review 的 6 个机械 NIT（doc/import/config，无决策、机械改）。

## Scope（6 项）
1. **maxcompute deep-import 一致性**：`packages/query/query-maxcompute/src/conventions.ts` + `src/index.ts` + `packages/query/query-tool/src/index.ts` 的 `@deepseek-ai/dsh-query/src/index.ts` 深路径 → bare `@deepseek-ai/dsh-query`（与 B4 query-postgres 一致；type-only，安全，不依赖 node_modules 符号链接）。验 `tsc -b packages/query/query-maxcompute` 0 错。
2. **dsh-query README**：`packages/query/query/README.md` 文档化新 `getConventions()` method（第 5 个 seam method，默认 throw、子类 override）+ conventions 类型面（`EngineConventions`/`ConventionFunction`/`ConventionCast`/`ConventionTemplate`）。
3. **nl2sql-engine README**：`packages/data/nl2sql-engine/README.md`(.zh.md) 更新 conventions 来源——从"maxcompute `loadConventions`"改为"`ctx.query.getConventions()` engine-injected"。
4. **query-tool JSDoc**：`packages/query/query-tool/src/index.ts` JSDoc 的 `maxc --wait`/`--max-rows` sidecar flag → 中性（"the engine sidecar's wait/max-rows flag"）。
5. **query-tool error message**：`packages/query/query-tool/src/index.ts` error 只举 `@deepseek-ai/dsh-query-maxcompute` → "a query provider"（或并列 postgres）。
6. **query-postgres metadata**：`packages/query/query-postgres/package.json` 的 `main`/`exports."."` 指向不存在的 `lib/index.js` → 对齐 `./lib/types/index.js` 或删 main（source-only 包不需要）。

## 不含（另途）
- **MAX_PT conventions.yaml 缺口** → **GA-GT2-eval**（168 cases）验证是否需补（eval 范畴）。
- **nl2sql-engine peerDep dual**（dsh-query + dsh-query-maxcompute）→ **合理 deviation**（eval 路径 `engine.ts` 仍 import `loadConventions` from maxcompute），已记 GA-GT2-impl Resolution，非 bug。

## 规则
- additive-only（doc/import/config 改动，无逻辑变更）。
- `git commit --no-verify`（lefthook pre-commit 对纠缠文件 stash/restore 冲突；--no-verify 规避）。
- mcp__local__* tools（built-in Read/Write/Edit/Bash/Glob/Grep 被禁），路径 /Users/mckenzie/workspace/deepseek-harness-da 下。
- 验：`pnpm tsc -b tsconfig.host.json` 0 新错 + `npx tsx scripts/run-oxlint.ts .`（受影响文件）0 新错 + 受影响包 vitest 无新回归。
- 一个 subagent 可批量做完（机械）。

## Key files
packages/query/query-maxcompute/src/{conventions,index}.ts、packages/query/query-tool/src/index.ts、packages/query/query/README.md、packages/data/nl2sql-engine/README.{md,zh.md}、packages/query/query-postgres/package.json

---

## Resolution (2026-09-02)

6 NIT 全部实施 + subagent 两阶段 review（spec + quality）APPROVED + consolidated 测试通过（NIT 文件 0 tsc/oxlint/vitest 回归；残留失败全在并行 E-DA5/B-DA5 WIP 文件，非本票）。

- NIT1: maxcompute deep-import → bare（query-maxcompute conventions.ts/index.ts + query-tool index.ts；与 B4 query-postgres 一致）
- NIT2: dsh-query README 文档化 getConventions()（第 5 seam method，默认 throw、子类 override）+ conventions 类型面
- NIT3: nl2sql-engine README（en+zh）conventions source → ctx.query.getConventions()（engine-injected），maxcompute loader = eval-only
- NIT4: query-tool JSDoc maxc --wait/--max-rows/maxc-backed sidecar → engine sidecar 中性
- NIT5: query-tool error msg → "a query provider such as ...maxcompute or ...postgres"
- NIT6: query-postgres package.json main/exports."."/files dead lib/index.js → lib/types/index.js（tsc 实产，非 dead）

**Follow-up（pre-existing，out-of-scope）**：query-postgres `files` 漏 `lib/types/conventions.js`（index.js imports it；npm publish 会破）→ 建议改 `files[0]` 为 `lib/types/**/*.js`（mirror dsh-query 包）。
