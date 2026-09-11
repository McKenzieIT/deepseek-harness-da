# UM10 — verify：typecheck + lint + check:ci:static + check:ci:consumers + data-agent surface

**Type**: task
**Phase**: upstream-merge
**Status**: resolved（2026-09-10）
**Assignee**: wayfinder-session 2026-09-10（Phase C 线 A：full-gate sweep）
**Blocked by**: UM16 + R-DA-CLIENT-RUNTIME-DECOMMISSION + R-DA-UI-PRESENTER-COMPOSITION + cordis regen（Phase B 完成后，在 synced+改造+build-green base 上验证）
**Blocks**: UM11
**Related**: [GA-FORK-CI-green](../phase-misc/GA-FORK-CI-green.md)、[UM-flow-2026-09-08](UM-flow-2026-09-08.md)（Phase C）

## Findings (2026-09-08 调查，已核)

- **tsc 已修**（`c28b928fa9`，落 `upstream/merge-2026-09-07`）：4 个 `Promise<Agent>` 错误（`tool-calls.spec.ts:790,816` 漏 `await` on async `agentLoop.create`）——handoff 摘要说"tsc 0 errors"是错的，从未提交，我修了。
- **tsdown（build:official）不绿**——根 entry 阻塞是 **upstream 共享 breakage**（base `d347e703` + latest `c389f96bf3` 都有，449 没修，upstream master CI 自 8/13 没绿）。**re-sync 修不了**，由 UM16 在 synced base 上 fork-local fix。详见 UM16 + UM13 + UM-flow-2026-09-08。
- 所以本票验证 **pivot 到 post-re-sync**（Phase C）：在 UM14 re-sync + UM16 build-green + R-DA 改造 + cordis regen 之后的 synced+改造 base 上做。

## Scope（post-re-sync，Phase C）

1. `pnpm run typecheck` 绿（tsc 已绿 `c28b928fa9`，post-re-sync 再验）。
2. `pnpm run lint` 绿。
3. `pnpm run build:official` 绿（= UM16 交付）。
4. `pnpm run check:ci:static` 不 regress。
5. `pnpm run check:ci:consumers` 不 regress（GA-FORK-CI 6/7 绿——translation-pairing 本就红，不 regress 即可）。
6. data-agent surface 测试：`packages/data/*` + `packages/client/ui-*`。
7. 修 re-sync（UM14）+ 改造（R-DA）引入的破损。

## Resolution

**[2026-09-10] RESOLVED — full-gate sweep run on the synced+refactored base；Phase-2 引入的破损全部找到并修掉（commit `ecaa56c848`）；residual 22 静态 gate 判定 pre-existing，移交 UM12。**

树：`/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，起点 tip `eb9e4cf05c`，node v24.15.0（非 v25）。

### 每门 gate 结果

| gate | 结果 |
|---|---|
| `tsc -b tsconfig.client.json --force` | **1 error → 0**。Phase-2 记录的「144→0」**少算一个**：`eb9e4cf05c` 自己引入了 `evidenceQueryBridge.client.spec.ts:29` TS2353——`satisfies EvalDeltaReport` 挂在**内层** `summary` 字面量上，而 `EvalDeltaReport` 是**外层**报告形状。`git blame` 确认该行出自 `eb9e4cf05c`。修法：`satisfies` 移到外层对象（与同目录 `evidence-sidebar.client.spec.tsx:85` 的 whole-report 写法一致）。 |
| `pnpm run build:official` | **GREEN（exit 0）**。**UM16 的 325 apiproxy-removal errors 已全清**——Phase-2 + Follow-on-3-B 消化掉，上面那 1 个 spec error 是唯一残留阻塞。**UM16 可关**。 |
| `pnpm run lint`（full oxlint，typeAware: true） | **RED：93 errors + 1 warning**（真实源码）。**非** Phase-2 回归——见下「lint 判定」。 |
| `pnpm run check:ci:static` | **19 passed/26 failed → 23 passed/22 failed**（本 session 修 4 门，另修组外 `verify-architecture-graph`，**无新增失败**）。 |

### 本 session 修掉的（5 门 gate 翻绿）

regen 5 个 stale 生成物（`gen-architecture-graph` / `gen-client-catalog` / `gen-module-graph` / `gen-tool-catalog`）：

- **Phase-2 直接造成的**（真回归，非 pre-existing）：
  - `docs/architecture-graph.md` 仍列已删的 `client-runtime` 包（UM-ARCH 在 `038d8b51ce` 验绿的权威图，被 Phase-2 删包搞 stale）。
  - `slot-catalog.ts:1220` 残留死引用 `packages/client/runtime/src/client/slots.ts` → 这就是 `verify-package-paths` 红的根因。
- **re-sync 造成的（非 Phase-2）**：`module-graph`（+424）/`tool-catalog`（+925）的巨大 diff 说明它们从 449-commit re-sync 起就 stale。
- **mojibake 检查**：6 个 regen 文件 U+FFFD 计数全 0（map「Out of scope」记录的静默损坏失败模式，tsc/lint/whitespace hook 都不报——故显式查）。删除行已逐条核：`architecture-graph.md` 的 -64 行全是 `pkg_client_runtime` mermaid 节点/边。

### lint 判定：93 errors 是 pre-existing 类，非 Phase-2 回归

1. **1980 → 93**：先前 full lint 报 1980 errors，其中 **1887 条是「关于」那 84 个 untracked 生成物自身**（`packages/data/{audit,evidence-query,semantic-layer}/src/*.d.ts`）。移开这 84 个文件后 → 93。CI 是 fresh checkout（没有这些文件），所以 **93 才是 CI-faithful 数字**。
2. **93 条里 71 条落在 Phase-2 从未碰过的文件**（比对 `git diff --name-only 2504169487~1 eb9e4cf05c` 的 138 文件）→ 结构性 pre-existing。
3. **余 22 条落在 4 个 touched 文件，但规则与形状和 untouched 文件完全同类**：主体是 `no-unsafe-*` 且诊断文字都是 "of an **`error` typed** value"——即 **oxlint 的 type-aware 解析不了 Cordis service handle**（`sessions.list`、`ctx.sessions.binding()`）。未被 Phase-2 碰过的 `ui-chat/src/client/apply.ts` 同一模式报 18 条，是同类 pre-existing 的证据。
4. **tsc 权威反证**：client tsc = 0。仓库里已有先例承认这一点——`eval-cli/tests/compare.spec.ts:1` 的 disable 注释写着 "node:fs not resolved by oxlint here (tsc passes)"。

→ 这是 oxlint-vs-tsc 的工具分歧，不是代码缺陷。**毕业为新票 [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md)**。

### 混杂因子已控制（confound control）

我在跑 static 前移开了那 84 个 untracked 生成物，这是我自己引入的变量。**两种状态各跑一次完整 static**：artifacts 在场 = 19 passed/26 failed；artifacts 移开 = 19 passed/26 failed，且 `comm` 比对**失败集合完全一致**。→ 这 84 个文件不是任何 static gate 失败的原因；26 红是真的。（跑完已还原到 prompt 记录的 84-untracked 状态。）

### Residual 22 门静态 gate —— 判定 pre-existing，移交 UM12

UM10 的判定标准是**非回归**，不是绝对全绿（[UM12](UM12-post-merge-ga-fork-ci-resweep.md) 明写：「UM10（verify）只验非回归，**不主动修 residual red**。本票补这个 gap」）。分类：

- **GA-FORK-CI 已记的 known master-red**：`runtime closure`（`dsh-python-runtime-closure -> @deepseek-ai/dsh-phase-gate -> @deepseek-ai/dsh-scope-registry`，票里原文即「python/sdk-runtime deps」）、`constraints`、`export jsdoc`、`translation pairing`。
- **merge-era（`6b7610d45a`）非 Phase-2**：`Cordis config` —— `packages/bundle/data-agent/cordis.patch.yml` mount 了 `@deepseek-ai/dsh-result-cache/src/remote.ts`（result-cache-gateway，UM4 从 apiproxy re-home），但 `packages/bundle/data-agent/package.json` 只声明了 `dsh-result-cache-memory`，且 `tsconfig.base.json` 无 `@deepseek-ai/dsh-result-cache/src/*` 映射。`git blame` 该 mount → `6b7610d45a`（upstream-merge 2026-09-07 commit），**不是** Phase-2 系列。注意包名易混：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`，`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`。
- **体量本身即证 pre-existing 债**：`client UI i18n`（98 hard-coded strings）、`package dependencies`（74 violations）、`package invariants`（peerDependency 政策 + empty install function）、`type equivalence`（`docs/subsystems/tools.md:179` 的 `ToolExecutionInput` 少 `scopeId`，源已加）。
- **其余**：`application entrypoints`、`cordis catalog`、`Cordis inspect catalog`、`config catalog`、`doc graphs`、`markdown links`、`subsystem pages`、`tsconfig paths`（`dsh-sdk-jsonrpc-demo` 缺 alias）、`package README model experience`、`agent note format`、`doc budgets`、`documentation standard tests`、`documentation site checks`。
- 顺手核过一条虚警：`ui-suggest-followups/src/client/FollowupChips.tsx` 里的 `dsh-client-runtime` 只是 JSDoc 出处注释（"Re-homed from the decommissioned…"），非活引用。

### 诚实边界

未在 pre-merge commit 上跑同一 gate matrix 建立严格 baseline（代价高）。上述 pre-existing 判定基于 `git blame` + touched/untouched 文件比对 + GA-FORK-CI 已记红项，证据强但**不等于**完整 baseline。若 UM12 要逐门归因，仍需在 merge 前基点复跑一次。

### 对 UM11（线 B push/PR）的结论

**不 push**。UM11 的 blocking 是 `UM10 + UM12`；UM10 现已 resolved，但 UM12 的 22 门 residual 全开 → **UM11 仍被 map 自身依赖挡住**，无需另行判断。resync tip 现为 `ecaa56c848`（unpushed），master tip `216a9661e1`（ahead origin 28，unpushed）。
