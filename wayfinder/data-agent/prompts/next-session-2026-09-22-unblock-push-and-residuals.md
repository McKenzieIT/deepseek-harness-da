# Next session — unblock push (dsh-root) + §3 merge push/PR + client seam-6 + README item 2

> **承接** 2026-09-21 AFK execution session。§3 merge 36 冲突全解 + 3 commit on `upstream/resync-2026-09-18`（dsh-s3-resync），6 parallel commit + README fix on master。host tsc green。**唯一阻塞**：pre-push typecheck 在 pre-existing dsh-root tsdown bootstrapping bug 上 fail。

## 0. Preflight

```sh
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git rev-parse HEAD                   # 期望 aebc1f9126（README fix）或其后
git rev-list --count origin/master..master  # 期望 13（7 既有 + 6 本 session）
cd /Users/mckenzie/workspace/dsh-s3-resync
git rev-parse HEAD                   # 期望 50ef1d6f5e
git rev-parse --abbrev-ref HEAD      # 期望 upstream/resync-2026-09-18
git status --short                   # 期望 clean
```

## 1. Unblock push — 修 dsh-root tsdown bootstrapping（UM12/UM16 域，但 unblock 所有 push）

**根因**：根 `tsdown.config.ts` entry `lib/types/{index,invariant,startup}.js` 在 fresh worktree 不存在。typert plugin（`packages/typert/generator/src/tsdown-plugin.ts`）的 `writeBundle` 生成它们，但 tsdown entry 解析发生在 plugin 之前 → `Cannot find entry`。

**修法方向（动手前自己复核）**：
- (A) 让 typert plugin 在 `buildStart` hook（entry 解析后、build 前）生成 `lib/types/` —— 读 `tsdown-plugin.ts` 现有 hook 结构，看 `writeBundle` 的生成逻辑能否提到 `buildStart`。
- (B) 加一个前置 gen 步骤（如 `prebuild: gen-root-types`）在 `build:lib:host` 的 `tsc -b` 与 `tsdown` 之间。
- (C) 改根 tsdown entry 为可选/延迟解析。

**验证**：`pnpm run typecheck` exit 0（tsc + tsdown 全绿）→ pre-push typecheck 不再阻 push。

**这条修完前不要推任何东西**——13 master + 3 merge 全被它挡着。

## 2. Push + PR

dsh-root 修完后：
- **§3 merge commits**（从 dsh-s3-resync 推，如果 dsh-s3-resync 的 typecheck 现在也绿了）：`git push origin upstream/resync-2026-09-18` → PR to master → `gh pr merge --merge`。PR 描述写明：36 out-of-seam 冲突 + 4 seam co-adaptation + 2 seam 前 session 解掉 + tsconfig.base.json 门效应 + pnpm install 强制 + 5 条 dry-run/RISK-MAP 都没有的发现。
- **master commits**（13 个）：`git push origin master` → PR → merge。PR 描述写明：3 gate coverage defect + repo fix + §2 knownRed + §4 Q3 + UM4 instrumentation + README gate。

## 3. Client-side seam-6 co-adaptation（face.ts:55）

`packages/client/ui-sidebar-files/src/client/face.ts:55` 仍调 `remote.workspaceFiles.list(sessionId, path, signal)`，upstream 改成期望 `WorkspaceFileScope`（lookup-registered by sessionId，`packages/api/workspace-files/src/index.ts:337`）。还有 `packages/client/ui-sidebar-textpreview/src/client/rpc.ts:85` 同款。需把 sessionId 经 `workspaceFileScope` lookup 转 scope 再传。跑 client build（`build:lib:client`）+ `read-all.spec.ts`/`scope.spec.ts`/`provider.client.spec.ts`。

## 4. UM-FORK-README-GENERATOR-RESIDUALS item 2

generator anchor threading latent bug（2-3h）：`insertAnchorsBeforeHeadings`（ZH flow）加 fence-aware 扫描器（围栏内 `## ` 不当 heading）+ 幂等 slug（插入前查已存在）+ fixture 回归测试 + TOC/Summary 顺序。读 ticket 执行。

## 铁律（不变）

1. 仅 `mcp__local__*` 工具；从不 `--no-verify`；commit `-F` + 显式路径；永不 `git add -A`。
2. 每个 SHA / 行号动手前用工具复核。
3. `edit_file` BLOCKED on `map.md` → node Buffer byte-splice；核 U+FFFD=13 + 字节守恒。
4. 推非 master ref 从有 green typecheck 的 worktree 推（dsh-root 修完后 dsh-s3-resync 应绿）。
5. 测试用显式 spec 路径；`--dir` 跑全仓；`--reporter=basic` 在 vitest 4 不存在。
