# PB-deferred: admin Config zod↔schemastery 冲突

**Type**: task (AFK)
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03) — blocked on zod/schemastery disambiguation
**Spawned from**: PB-COMPLY plugin-body audit, R6 finding `packages/data/admin/src/index.ts:137`

## Question

`admin` 用 `import { z } from 'zod'` 做**内部** schema（`UserSchema` 等，含 `z.infer`——schemastery 无此 API），但 Cordis 插件 `Config` 必须是 **schemastery** schema 才能从 cordis.yml 校验/解析。当前 `admin` 的 `Config` 是 plain `interface`（R6 违规：`seedAdminId`/`seedAdminPassword`/`seedTenantId` 未校验）。

不能直接 `import z from '@deepseek-ai/schemastery'`——与 zod 的 `z` 重名（TS duplicate-identifier）。

## 决策点（三选一，推荐 A）

- **A（推荐）**：rename zod `import { z as zod } from 'zod'`（~19 处 `z.`→`zod.`，含 `z.infer`→`zod.infer`），加 `import z from '@deepseek-ai/schemastery'`，加 `export const Config: z<Config> = z.object({ seedAdminId: z.string().optional(), seedAdminPassword: z.string().optional(), seedTenantId: z.string().optional() })`。最贴 repo 惯例（peer audit/scope-registry/phase-gate 都用 schemastery `z`）。
- **B**：admin 内部 schema 也迁 schemastery（drop zod）——但 `z.infer` 要换 schemastery 等价（`z.output<typeof X>`），面更大、风险高。
- **C**：保持现状（interface Config 不校验）——接受 R6 违规。

## 为何留后续

低危（3 个 optional first-boot 种子字段，未校验只影响 cordis.yml 笔误的早发现）+ A 涉及 ~19 处 rename（非纯加法，需谨慎 + 跑 admin specs 防回归），不适合塞进已 24 修的批量合规 pass。建议单独 session 走 A。
