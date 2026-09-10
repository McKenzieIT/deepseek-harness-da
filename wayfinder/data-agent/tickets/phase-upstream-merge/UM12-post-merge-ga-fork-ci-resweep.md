# UM12 — post-merge GA-FORK-CI re-sweep（merge 后重基线 + 修 residual/new red gate）

**Type**: task
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: ~~UM11~~ → **UM10（已 resolved 2026-09-10）**。原写 `UM11` 与 UM11 的 `Blocked by: UM10 + UM12` 互锁成环；以 `UM-flow-2026-09-08.md` 的 `UM10 → UM12 → UM11` 为准 → **本票现 unblocked，是 Phase C 当前 frontier**
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

## 2026-09-10 update — UM10 线 A 交来的 pre-merge red set（本票的实际起点）

[UM10](UM10-verify-typecheck-lint-ci-gates.md) 线 A 在 resync base（tip `ecaa56c848`）上实跑了 `check:ci:static` 全 45 门 + full lint + `build:official`。**本票原设计是「merge 落 master 后重基线」，但现在已经有一份 pre-merge 实测红集**——先在 resync 分支上收掉大头，比等 merge 后再扫更省事（merge 只会让归因更难）。

**Blocked by 修订**：原写「UM11（merge 落 master 后启动）」。但 UM-flow 的实际顺序是 **UM10 → UM12 → UM11**（见 `UM-flow-2026-09-08.md` 的 mermaid + Phase C 叙述），本票 header 的 `Blocked by: UM11` 是旧框残留、且与 UM11 的 `Blocked by: UM10 + UM12` 构成环。**以 flow doc 为准：本票现已 unblocked（UM10 resolved），是 Phase C 的当前 frontier。**

### 已翻绿（UM10 线 A，commit `ecaa56c848`）

`19 passed/26 failed → 23 passed/22 failed`，无新增失败。修法均为 regen stale 生成物：`verify-client-catalog` / `verify-module-graph` / `verify-tool-catalog` / `verify-package-paths`（+ 组外 `verify-architecture-graph`）。其中 architecture-graph 与 slot-catalog 的 stale 是 **Phase-2 删 `packages/client/runtime` 造成的真回归**；module-graph/tool-catalog 的 stale 来自 449-commit re-sync。

### 剩余 22 门（UM10 已分类，本票逐门处置）

| 类别 | gate | UM10 判定 |
|---|---|---|
| GA-FORK-CI known master-red | `runtime closure` | `dsh-python-runtime-closure -> @deepseek-ai/dsh-phase-gate -> @deepseek-ai/dsh-scope-registry`——即票里原文「python/sdk-runtime deps」 |
| 同上 | `constraints` | `packages/bundle/data-agent/package.json` version 须匹配 root |
| 同上 | `export jsdoc` | 3 violations（原记 `fadeIn` @param） |
| 同上 | `translation pairing` | 归 parallel-dev-cleanup/R1，6/7 里「本红」那一门 |
| **merge-era（`6b7610d45a`），非 Phase-2** | `Cordis config` | `cordis.patch.yml` mount 了 `@deepseek-ai/dsh-result-cache/src/remote.ts`（UM4 从 apiproxy re-home 的 result-cache-gateway），但 bundle `package.json` 只声明 `dsh-result-cache-memory`，且 `tsconfig.base.json` 缺 `@deepseek-ai/dsh-result-cache/src/*` 映射。**注意包名易混**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`；`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`。另 `apps/cli/tests/profiles/acp/cordis.yml: root must be a Loader entry array` |
| 体量即证 pre-existing 债 | `client UI i18n` | 98 hard-coded UI strings |
| 同上 | `package dependencies` | 74 violations |
| 同上 | `package invariants` | peerDependency 政策（`dsh-invariants` 不得作 peerDep）+ empty install function（result-cache / ui-context-layer / ui-present-decomposition / bundle-data-agent） |
| 同上 | `type equivalence` | `docs/subsystems/tools.md:179` 的 `ToolExecutionInput` 少 `readonly scopeId?: string`（源已加，doc 未跟） |
| 待逐门归因 | `application entrypoints`、`cordis catalog`、`Cordis inspect catalog`、`config catalog`（含 `ctx.results.get` 缺 @param resultId/signal——JSDoc 文本 pre-existing，Phase-2 只是让 catalog 生成器能读到该文件了）、`doc graphs`、`markdown links`、`subsystem pages`、`tsconfig paths`（`dsh-sdk-jsonrpc-demo` 缺 alias）、`package README model experience`、`agent note format`、`doc budgets`、`documentation standard tests`、`documentation site checks` | — |

### lint 门另开票

`check:ci:lint:contracts-ready` 的 93 errors 不在上表——已毕业为 [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md)（oxlint typeAware 解不出 Cordis service handle 的假阳性，tsc = 0 反证）+ [UM-DATA-SRC-DTS-POLLUTION](UM-DATA-SRC-DTS-POLLUTION.md)（84 个生成物污染 src/，把 93 抬到 1980）。

### 诚实边界（继承 UM10）

上述 pre-existing 判定基于 `git blame` + touched/untouched 比对 + GA-FORK-CI 已记红项，**未**在 pre-merge 基点复跑同一 matrix 建立严格 baseline。本票若要逐门归因到「谁弄红的」，需先补这个 baseline。

## Resolution
（待落地后填：post-merge red set diff + re-base/重做的 a-series patch + fork 专属红修复 + 终态 6/7 or 7/7）
