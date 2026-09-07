# UM12 — post-merge GA-FORK-CI re-sweep（merge 后重基线 + 修 residual/new red gate）

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM11（merge 落 master 后启动）
**Blocks**: —
**Related**: [GA-FORK-CI-green](../phase-misc/GA-FORK-CI-green.md)（5 项 pre-existing red 的总账）、[repo-infra T7–T12](../../../repo-infra/map.md)（red gate 逐项票：T7 verify-export-jsdoc / T9 built-package-invariants / T10 publint / T11 test:coverage / T12 windows-native）、[UM10](UM10-verify-typecheck-lint-ci-gates.md)（验非回归）、[UM11](UM11-pr-merge-post-cleanup.md)；a-series 并行 session（PR #88/#89/#90 + #67/#68/#69/#79）

## 背景

PR #87 CI 的 5 项红 gate（`all checks passed` 聚合 + `node 24 / static` / `coverage` / `snapshots and artifacts` / `windows node 24 / native complete`）全为 pre-existing master-red（GA-FORK-CI-green #2 + repo-infra/T12），由 a-series 并行 session 在 **current master** 上直接修。

UM merge（2270 commits）会**重基线**这些 gate：
- **可能自动解**（upstream 2270 hardening 吸收根因）：`static` 的 gen-config-catalog / verify-runtime-closure（upstream 重构 Remote controllers + subagent 迁移，closure 在 upstream 侧干净）；`coverage` 的 cordis-lib / `dsh-commands/remote` 解析（upstream build 流程 + apiproxy 删除 [UM4]）；`snapshots` 的 built-package-invariants（examples lib/bin.js——upstream CI build 流程）。
- **不会自动解**（fork 专属）：`static` 的 export-jsdoc `fadeIn` @param（`ui-context-layer/graph-animations.ts:58`，来自并发 client fix `c26eada21b`）；`snapshots` 的 publint（fork data-agent 包 `./src/*` + `./client` CJS/ESM）；`coverage` 的 Windows pwsh/console（`fix/cb1b-pwsh-pty-evaluation` ahead=2）。
- **会漂移**：apiproxy 删除 + session format v2 + Remote controllers 是结构性大改 → merge 后 red gate 的具体失败 sub-check 会变；a-series 在 current master 上的 fix patch 可能**不再 apply**（merge 把代码挪了）→ 需 re-base 到 merged master 重做。

UM10（verify）只验非回归，**不主动修 residual red**。本票补这个 gap。

## Scope

1. UM11 merge 落 master 后，`git pull` merged master，建 fresh probe worktree 跑全 GA-FORK-CI gate matrix（`pnpm run check:ci:static` + `check:ci:consumers` + `test:coverage` + `test:snapshot` + 本地复现 `node 24/*`；或开一个 probe PR 看 `gh pr checks`）。
2. **diff post-merge red set vs pre-merge（PR #87）red set**：
   - **auto-fixed（现绿）**：确认 + 关对应 a-series T7–T12 sub-item。
   - **仍红（a-series fix 被 merge 漂移）**：re-base a-series patch 到 merged master；若代码挪太多 → 重实现。
   - **fork 专属红**（fadeIn jsdoc / data-agent publint / pwsh）：直接修（upstream 不关）。
   - **merge 引入的新红**（冲突解决 regression）：立即修（这才是真回归——UM10 应已抓，UM12 是 fix sweep）。
3. **与 a-series 协调**：若 a-series session merge 后仍活，其 T7–T12 patch re-base 到 merged master；UM12 owns umbrella，a-series owns per-ticket 执行。
4. **目标**：GA-FORK-CI 至少**非回归**（6/7 绿，translation-pairing 本红不算——归 parallel-dev-cleanup/R1）；理想吸收 upstream hardening 把更多 gate 推绿。

## Resolution
（待 post-merge 落地后填：post-merge red set diff + re-base/重做的 a-series patch + fork 专属红修复 + 终态 6/7 or 7/7）
