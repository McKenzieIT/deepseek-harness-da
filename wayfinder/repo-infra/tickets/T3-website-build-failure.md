# T3 — website (vitepress) build 失败

**Type**: task（或 research——需先定 root cause）
**Phase**: post-discovery
**Status**: closed (resolved 2026-09-06, fixed in PR #22)
**Assignee**: unclaimed
**Related**: 2026-09-05 T1 验证发现（`pnpm -r run build` exit 1 on `@deepseek-ai/website`）

## Question

`pnpm -r run build` 在 `@deepseek-ai/website`（vitepress docs site）build 失败：`@vue/compiler-sfc` parse$1 → createDescriptor → transformMain → `Failed`（Vue compiler-sfc parse error）。exit 1。

这使 `pnpm -r run build`（T1 fix 的命令）整体 exit 1，尽管 8 个 data package（T1 关注的）build 成功。session 见 exit 1 可能困惑（以为 build 全失败，实际只 website 失败，data/tsc OK）。

**需查 root cause**：
- (a) website 的某个 Vue 文件 broken（parse error in source）——pre-existing on master？
- (b) node / `@vue/compiler-sfc` 版本 mismatch（worktree 的 vue 版本 vs website 期望）？
- (c) concurrent WIP on website？

**修法（决策点）**：
- (a) 修 broken Vue 文件（若 parse error in source）。
- (b) 对齐 vue 版本（若 mismatch）。
- (c) 或 T1 fix 的 `pnpm -r run build` 排除 website（`pnpm --filter "!@deepseek-ai/website" run build`）——workaround，非 root fix。

## Scope

undefined
