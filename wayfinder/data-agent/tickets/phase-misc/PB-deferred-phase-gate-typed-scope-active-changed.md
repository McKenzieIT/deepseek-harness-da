# PB-deferred: phase-gate typed `scopes/active-changed` ctx.on

**Type**: task (AFK)
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03) — blocked on type-resolution
**Spawned from**: PB-COMPLY plugin-body audit, R9 finding `packages/data/phase-gate/src/phase-gate.ts:982`

## Question

phase-gate 用 `;(ctx as unknown as { on(event: string, cb: () => void): void }).on('scopes/active-changed', …)` 字符串 cast 绕过类型合并——丢 `scopeId` payload + 绕过 declaration merging。事件**已声明**于 `packages/data/scope-registry`（`(scopeId: string | undefined) => void`），cast 是 stale tech debt（代码注释"cast until the Events interface ships"）。

**难点**：`import type {} from '@deepseek-ai/dsh-scope-registry'` 落到 `scope-registry/src/index.ts`（其 `lib/types/index.d.ts` 未构建）→ TS6059/TS6307 rootDir 违例。本 session 试过 + 回退（cast 恢复）。

## 决策点（task）

1. 把 `@deepseek-ai/dsh-scope-registry` 加为 phase-gate **devDependency**（workspace 链接）。
2. 确保 scope-registry 的 `lib/types/index.d.ts` 被构建（`pnpm run build` 或保证 build:lib 覆盖 data 包）——使 `import type {}` 解析到 `.d.ts` 而非 src。
3. 去掉 cast：`ctx.on('scopes/active-changed', () => { …reset prior-turn inheritance… })`（callback 少参 OK，类型自动从 declaration merging 来）。
4. 删注释"cast until … ships"。

## 为何留后续

需动 `package.json`（devDep）+ 依赖构建顺序，属 build-config 改动非纯代码修；且 cast 是文档化过渡（运行 OK，事件正确 emit/consume），不紧迫。
