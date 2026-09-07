# T13 — pnpm -r run build 在 eval-runner-service 失败（typert/generator 无 build script）

**Type**: task（或 research——需先定 root cause + 是否 intentional）
**Phase**: post-discovery
**Status**: closed (fixed 2026-09-07 via PR #80, merge commit `2802f3679`)
**Assignee**: unclaimed
**Branch**: fix/T7-eval-runner-service-build
**Related**: 2026-09-07 T2 session fresh-worktree `pnpm -r run build` 发现；[T1](T1-worktree-builds.md) note 的「pnpm -r run build exit 1，用 targeted bar（8 data package lib/ + tsc 绿即 OK）」模式

## Question

`pnpm -r run build` 在 `packages/eval/eval-runner-service` 失败：

- **首跑**：`Error: Cannot find module '.../packages/typert/generator/lib/types/tsdown-plugin.js'`（eval-runner-service 的 `tsdown.config.ts` 经 `@deepseek-ai/dsh-typert-generator/tsdown` export 导入该文件）。
- **typecheck（`build:lib:host`）后再跑**：`Error: No workspace packages found, please check your config`（tsdown `resolveWorkspace`）——错误在两次 run 间变化。

**根因（初步）**：`packages/typert/generator/package.json` **无 `scripts` 段（无 build script）**——其 `main`/`types`/`exports`（`./`、`./tsdown`、`./invariant`）全指向 `lib/` 下产物，但无 build script 生成 `lib/`。`pnpm -r run build` 跳过它（无 build script）→ `lib/types/tsdown-plugin.js` 永不存在 → eval-runner-service 的 tsdown 导入失败。

## Notes

- `pnpm run typecheck`（= `build:lib:host && tsc -b tsconfig.client.json`）**绿**——`build:lib:host` 经 `dsh-typert-generator` tsdown plugin 工作（可能从 `./src/*` export 源码解析，非 `./tsdown` lib），不依赖 typert/generator 的 lib/。
- **CI 不 gate `pnpm -r run build`**——CI workflows 用 `pnpm run build:official` / `build:lib:host` / per-dir build（`e2b-e2e.yml`/`e2e.yml`/`release.yml`/`release-vendor.yml`/`sandbox.yml`），**无 `pnpm -r run build`**（full recursive）。→ **非 CI/push gate failure**，仅 fresh-worktree 本地 build 体验问题。
- [T1](T1-worktree-builds.md) worktree-setup 教 `pnpm install && pnpm -r run build`——fresh worktree 跑它会 exit 1（eval-runner-service）。T1 note 的 targeted bar（8 data package `lib/typert.remote-client.*` + `tsc -b tsconfig.client.json` 绿）tolerate 此 exit 1。
- 非 T2 范围（eval/typert，非 client/theme）——T2 session 验证时 surfacing，未深入。

## Scope

定 root cause（typert/generator 无 build script 是 bug 还是 intentional）+ 决策 + 修 + 验 `pnpm -r run build` 行为。**低优先级**（tolerated，非 gate；fresh-worktree 体验问题）。

## 决策点

- (a) typert/generator 是否**应有** build script（生成 `lib/`，使 `./tsdown` export 可用 + `pnpm -r run build` 全绿）？OR 它是 **intentionally unbuilt**（lib/ 经 `dsh-typert-generator` plugin 机制在 consumer build 时生成，`./tsdown` export 是 release-time 用）？
- (b) 若应有 build script：加 `tsdown`（或 `tsc -b`）build script 生成 `lib/`（含 `lib/types/tsdown-plugin.js`）。验 `pnpm -r run build` 全绿 + `./tsdown` export 可 import + typecheck 仍绿。
- (c) 若 intentionally unbuilt：doc 化（为何无 build script + fresh worktree 该跑什么替代 `pnpm -r run build`——可能 `pnpm run build:official` 或 `build:lib:host`）。更新 T1 worktree-setup 指引。

## Resolution（2026-09-07）

**Status**: closed (fixed via PR #80, merge commit `2802f3679`).

**Root cause** (verified 2026-09-07):
- `packages/eval/eval-runner-service/package.json` had a stray `scripts.build = "tsdown"` — the only repo-wide per-package `build` script that points at `tsdown` with NO per-package `tsdown.config.ts`. Running `tsdown` in that dir resolves the ROOT `tsdown.config.ts` (upward), which (1) `import`s `./packages/typert/generator/lib/types/tsdown-plugin.js` (absent in a fresh worktree where `tsc -b tsconfig.host.json` never ran) → `Cannot find module`; and (2) resolves the root `workspace` glob from the wrong cwd → `No workspace packages found` (the error shifts between first run and post-`build:lib:host` run).
- `packages/typert/generator` having NO `scripts` section is **INTENTIONAL** by design — it is bootstrap-self-contained: its `lib/types/` (incl. `tsdown-plugin.js`) is built by `tsc -b tsconfig.host.json` via the project reference `{ "path": "./packages/typert/generator" }` (verified: no `scripts` key in `packages/typert/generator/package.json`; reference at `tsconfig.host.json:320`; root `tsdown.config.ts:2` `import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'`). The sanctioned build entrypoints (`build:official` / `build:lib:host`) run `tsc -b tsconfig.host.json` first, which produces `lib/types/tsdown-plugin.js`.
- T1's "8 data packages" (`dsh-commands` / `dsh-goal` / `dsh-cordis-host-runner` / `dsh-file-reference` / `dsh-host-plugin-inventory` / `dsh-message-feedback` / `dsh-session-reference` / `dsh-schema-gateway`) no longer exist in `packages/` — layout was reorganized (292 package dirs now; all 8 names verified MISSING). T1's `lib/typert.remote-client.*` concern is moot.

**Fix**:
- (2a) Dropped the broken `"build": "tsdown"` script from `packages/eval/eval-runner-service/package.json` (kept `"test": "vitest run"`). eval-runner-service is built via `build:lib:host`'s `tsc -b tsconfig.host.json` references + the root tsdown `packages/*/*` workspace glob (its `exports`/`main` → `lib/`, built as part of the host face — not by a per-package `build` script).
- (doc) Updated `CLAUDE.md` + `wayfinder/_templates/session-prompt.md` worktree-setup from `pnpm -r run build` → `pnpm run build:official` (the sanctioned full build = `tsx scripts/build.ts --profile official` = `build:lib:host && build:lib:client`), with a T7 cross-ref.
- T1 ticket appended a T7-update Note pointing fresh worktrees to `build:official`.

**Verify** (fresh worktree `dsh-T7`, branch `fix/T7-eval-runner-service-build`, HEAD off `origin/master` @ `76388e1`):
- `pnpm run build:official` exit 0; produces `packages/typert/generator/lib/types/tsdown-plugin.js` (6035 bytes).
- `pnpm run typecheck` exit 0.
- After 2a: `pnpm -r run build` exit 0 — eval-runner-service is now skipped (no `build` script); the broken `tsdown`-from-subpackage path is gone. `build:official` + `typecheck` re-verified green after the 2a change.

→ T7 closed.
