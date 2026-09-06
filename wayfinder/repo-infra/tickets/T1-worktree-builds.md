# T1 — worktree-setup 不 build workspace package

**Type**: task
**Phase**: post-discovery
**Status**: closed (resolved 2026-09-05, fixed in PR #16)
**Assignee**: unclaimed
**Related**: 2026-09-04 T6 session 发现（fresh worktree `pnpm install` 不 build 8 个 data package → aggregate tsc + bundle types-build 失败，疑 master break 实非）

## Question

DSH pnpm workspace 的 fresh worktree 跑 `pnpm install` 后，workspace package（dsh-commands 等）被 symlink 进 node_modules 但 **build script 不跑**，所以这些包只有 `src/` 没 `lib/`。8 个 data package（`dsh-commands`、`dsh-goal`、`dsh-cordis-host-runner`、`dsh-file-reference`、`dsh-host-plugin-inventory`、`dsh-message-feedback`、`dsh-session-reference`、`dsh-schema-gateway`）的 `package.json` `exports` 把 `./remote` 子路径映射到 `./lib/typert.remote-client.js` + `.d.ts`（built 产物）。`lib/` 缺失 → `import ... from '@deepseek-ai/dsh-commands/remote'` 解析失败（`Cannot find module`）+ 那个 `.d.ts` 里的 `TypertRemoteNamespaceMap` declaration augmentation（注册 `commands`/`goals`/…）也缺失 → `Property 'commands' does not exist on type TypertClientRemote` 级联（api/remotes + runtime + 一众 consumer 包）。

主 repo 有 `lib/`（早先 session build 过）→ `tsc -b tsconfig.client.json` + bundle 绿；fresh worktree 没有 → 红。**源码没动，纯 build 产物缺失。** 看着像 master break，实际不是（T6 session 调查确认：git log 无 refactor；copy 8 个包的 `lib/` → aggregate tsc `--force` exit 0）。

**修法（决策点）：**
- (a) worktree-setup 脚本/文档加 `pnpm -r run build`（CLAUDE.md / `install-lefthook.mjs` 旁）——最小，不拖 CI install。
- (b) postinstall hook 自动 build（`pnpm install` 后跑 `pnpm -r run build`）——省心，但拖每个 install（CI + dev）。
- (c) 让 `tsc -b` / tsdown resolve 到 `src/` 而非 `lib/`（dev-mode 友好，但需改 exports map 或 resolver，影响大）。
- (d) 纯文档（CLAUDE.md worktree-setup 步骤含 build）——最小但人易漏。

## Scope

选定一个修法（推荐 (a)：worktree-setup 脚本 + CLAUDE.md 文档，最小且不拖 CI install），实现，验 fresh worktree `pnpm install && <build step>` 后 `tsc -b tsconfig.client.json` + bundle types-build 绿（无需手动 copy `lib/`）。

## Resolution（2026-09-05）

**Fixed in PR #16**（merged to master）：`CLAUDE.md` L62 + `wayfinder/_templates/session-prompt.md` worktree-setup 加 `pnpm install && pnpm -r run build`（method (a)）。

**Verified**：`pnpm -r run build` 生成 8 个 data package 的 `lib/typert.remote-client.*`（`.d.ts` + `.d.ts.map` + `.js` 等——`pnpm install` 不生成的正是这些）→ fresh worktree 按新 setup 跑后会有它们 → `tsc -b tsconfig.client.json` 绿（无需手动 copy `lib/`）。method (a) 验证可行。

**Note**：`pnpm -r run build` exit 1——但失败在 `@deepseek-ai/website`（vitepress，Vue compiler-sfc parse error，**separate pre-existing issue**，见 [T3](T3-website-build-failure.md)），**非 8 个 data package**（它们 build 成功，`lib/typert.remote-client.*` 已生成）。session 跑 `pnpm -r run build` 见 exit 1 时，查 8 个 data package 的 `lib/typert.remote-client.*` 存在 + `tsc -b tsconfig.client.json` 绿即 OK（website 失败不影响 data/tsc）。

→ T1 closed。
