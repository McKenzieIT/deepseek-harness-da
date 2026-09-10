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

## 2026-09-10 Phase C 并行 session（4 subagent 并行 + 主 session 串行落地）

### 实测结果：`23 passed / 22 failed` → **`26 passed / 19 failed`**，`comm` 比对**零新增失败**

```
run-gates: 26 passed, 19 failed, 0 skipped in 127.06s.
comm -13 baseline after  →  空集（无新增失败）
comm -23 baseline after  →  Cordis config / cordis catalog / doc budgets（3 门翻绿）
```

4 个 commit，每门单独 verify 后单独 commit（可二分）：

| commit | 门 | 实测 |
|---|---|---|
| `40449bfa93` | **（install 步骤，非门）** | 见下「最严重发现」 |
| `025db697ab` | `Cordis config` | `verify-cordis-config: 144 config files passed.` → 归 [UM4](UM4-apiproxy-rehome-results-rpc-remote.md) Scope 2 收口 |
| `8487091704` | `doc budgets` | PASS（删 `scripts/doc-budgets.manifest.json` 的 `examples/AGENTS.md` 陈旧条目，upstream 已随 `examples/` 删除同步删掉，merge 留了 fork 侧的） |
| `68e6ea6562` | `cordis catalog` | PASS（删 `gen-cordis-catalog.ts:195,196` 引用已删 `packages/client/runtime` 的 `SERVICE_WALK_EXEMPTIONS` + regen `api-catalog.ts`） |

### ⚠ 最严重发现：**CI 的 install 步骤在本分支上原本就是失败的**

`ecaa56c848` 上跑 `pnpm install --frozen-lockfile`（每个 CI job 的第一步）：

```
[ERR_PNPM_OUTDATED_LOCKFILE] pnpm-lock.yaml is not up to date with
  packages/client/result-cache/package.json
* 1 dependencies were removed: @deepseek-ai/dsh-client-runtime@workspace:^
```

Phase-2（`eb9e4cf05c`）删了 `packages/client/runtime` 并从 manifest 摘了依赖，**但没重生成 lockfile**；`pnpm-lock.yaml` 里 `packages/client/runtime` 的整个 importer 块还在。

**这意味着**：在 CI 里 install 就失败，**一门 gate 都跑不起来**。所以 UM10 记的 `23 passed / 22 failed`（以及本票上表全部数字）**是纯本地测量** —— 测量环境里 `node_modules` 已经存在。**本票的「非回归可 PR」目标在这条落地前根本无法达成**，且没有任何票记录过它。

已修：`40449bfa93`，`pnpm install --lockfile-only` 重生成，实测 `--frozen-lockfile` 现报 `Already up to date`。

### ⚠ 第二个混杂因子：`core.symlinks=false` 让本地 gate 读数不可信

`~/.gitconfig` 设了 `core.symlinks=false` → 被跟踪的 symlink 落成「内容是目标路径」的小文件。resync 树 **10 个**、master 树 **6 个**全部损坏（两树均无 local override）。例：`packages/CLAUDE.md` 是 9 字节的 `AGENTS.md`，真身 6166 字节。

**已确证只波及 1 门**（`Cordis config` 的第三个错误，详见 UM4 Resolution）。已排除对 `translation pairing`（那条坏链在 manifest 的 `excluded` 段）、`doc budgets`、`markdown links` 的影响 —— 这些门读到的是 9–19 字节小文件，行宽/链接/预算类检查会**通过**而非致红。`snapshots/**` 的 4 个坏链会影响 snapshot 车道，但 snapshot 不在 `ci-static` 组内。

本 session 已修全部 10 个（工作树操作，**零 tracked 改动**，`git status --short --untracked-files=no` 为空）。修法见 UM4 Resolution。**这不是仓库改动，不该 commit；每次新 checkout 都要重做。**

### 逐门分诊：13 门「待逐门归因」已全部归因（S3 subagent 实跑，`git status` 全程守住 84 行未变）

**13 门全红，无一门在单独重跑时翻绿** —— 基线的 22/45 对这个子集成立。三个主根因解释其中 9 门：

| 根因 | 说明 | 波及门 |
|---|---|---|
| **RC-Z 僵尸复活** | merge 没应用 upstream 的两个包删除 → 见新票 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) | `config catalog`（唯一 offender）、`tsconfig paths`（唯一 offender）、`application entrypoints`(3/13)、`subsystem pages`(1/6)、`package README model experience`(2/3) |
| **RC-P2 Phase-2 残留** | 手写注册表仍指向已删的 `packages/client/runtime` | `cordis catalog`（**已修**）、`package README model experience`(1/3) |
| **RC-M merge 期错位** | merge 搬动了 fork 的 note 生命周期目录 / 留下 fork 侧陈旧 manifest | `agent note format`（19 个 `R100` 改名把 `Status: proposed` 带进了 `rejected/`）、`doc budgets`（**已修**）、`markdown links`(3/14) |

### 订正本票自己上表的两处错误（均已实测）

1. **`config catalog` 的归因写错了**。上表把它记成「`ctx.results.get` 缺 @param resultId/signal」—— 那是 **`Cordis inspect catalog`** 的诊断。`config catalog` 的唯一失败是 `agent-spine-demo` 的 `personaPrefix`/`personaSuffix` schema-vs-type 不一致，与 JSDoc 无关。
2. **「`gen-*.ts --check` 形式 ⇒ regen 可解」这个推断对 4 门是错的**。`cordis catalog`/`Cordis inspect catalog`/`config catalog`/`doc graphs` 都在**预检阶段 throw**（partition exemption / JSDoc 完整性 / schema-type 一致 / service-role 完整），**在生成和 diff 之前**，所以 `pnpm run gen-*` 会抛同样的错，regen 不是替代品，必须先改源。`tsconfig paths` 同理（它要求手写条目）。**这 13 门里没有一门是纯 `regen` 桶。**

   反过来还有一层：`cordis catalog` 的 throw **掩盖了真实的 staleness**。删掉陈旧 exemption 后生成器才跑到底，报出 `api-catalog.ts` 需要补 5 个 `TYPE_API` 条目（`Session`/`SessionProjectionHints`/`SessionSummary`/`SessionSurface`/…，来自 449-commit re-sync）。所以 regen **最终确实需要**，但只能在源改之后 —— 分诊时「不需要 regen」的推断被实跑推翻。

### 组外 gate（盲区清单，独立复核，与 UM15 的 meta-gate 设计对接）

50 个 `verify-*` 里有 6 个不被 `scripts/run-gates.ts` 引用。其中**真盲区 2 个**：

- **`verify-architecture-graph`** —— 已知那个。删包必让它 stale，无门可抓。
- **`verify-cordis-api`** —— **新发现，且是一条已回归的成文不变量**：`.agents/notes/archived/process/2026-07-21-doc-sync-through-gate-scheduler.md:16` 明文断言「`docSyncLeafGates` includes `verify-cordis-api`」，而 `cordis-api` 这个字符串今天在 `run-gates.ts` 里**根本不存在**。那篇 note 的 §10 描述的正是这类漂移 —— 它要修的 bug 又回来了，且 note 现在是假的。

另 `verify-npm-install-layout` 是**半个洞**：只在 `.github/workflows/release.yml:87` 跑，PR 上永不跑。其余 3 个（`verify-third-party-notices`、`verify-doc-site-fragments`、`verify-no-production-src-on-master`）有别处覆盖，属有意的组外。

### 本 session 未落地的待办（S3 已给精确 patch，按 value÷risk 排序）

**[2026-09-10 更新：L1 已落，余 5 门 + 2 笔]** 本 session 落完 L1(`documentation site checks` → green)后,6 门短list剩 5 门未落,均带精确 patch 但判**下 session 做**:

| id | 门 | 改动 | 为何下 session |
|---|---|---|---|
| L8 | `doc graphs` | `gen-doc-graphs.ts` 的 `SERVICE_ROLES` 加 `resultGateway`(~8 行)+ regen | 需 regen `gen-doc-graphs`(写操作),源在 `packages/data/result-cache/src/remote.ts:48`(同为 `6b7610d45a` 的 UM4 re-home 产物),需与 UM4 线协调 |
| L4 | `Cordis inspect catalog` | 5 处 JSDoc,2 文件(~14 行) | 纯写,中等量;`result-cache`/`ui-context-layer` |
| L6 | `application entrypoints` | 12 条 allowlist,1 文件 | **必须等僵尸包删除后**(`UM-MERGE-INTEGRITY`),否则会把 3 条僵尸行错误 allowlist 掉 |
| L7 | `markdown links` | 14 条→**L1 后剩 1 条** | 唯一剩的 1 条是 `ui-settings-models/README:37 → src/client/slot-contract.ts`,而该文件被 merge 丢了 → 依赖 `UM-MERGE-INTEGRITY` 的结论 |
| L9 | `agent note format` | **S3 记 19,实测 15** | **订正**:实际 `rejected/simplification/2026-09-03-*.md` 是 15 个;`proposed/simplification/` 目录已不存在 → `git mv` 目标需先重建目录;且 `proposed:` 语法额外要求 `## Proposal`/`## Acceptance criteria`/`## Risks` 三标题,未核,可能触发第二波。风险比 S3 估的高 |

`subsystem pages`(5/6)与 `documentation standard tests` 判 `big-debt`,另开票(D3/D4)。

**Round 3 cherry-pick(a99d206835)未做** —— `fix/lint-noop-assertion-unused-disable` 那 2 行 lint fix 仍在 resync HEAD(`tool-update-table-config/src/index.ts:250` 多余 assertion + `eval-cli/tests/compare.spec.ts:1` unused disable)。可独立 cherry-pick,但属 `UM-LINT-TYPEAWARE-CORDIS`(grilling,等 93 基线清完再和人过 A/B/C),不归 UM12,留作下 session。

### 本 session 终态（已核）

- `check:ci:static`: **23 passed/22 failed → 27 passed/18 failed**(两轮独立复核,`comm` 比对零新增失败)。4 门翻绿:`Cordis config`、`cordis catalog`、`doc budgets`、`documentation site checks`。
- resync 工作树 `git status` **完全干净(0 行)** —— 此前多 session 一直带 84 个 untracked,本 session 首次清掉。
- 6 个 commit 在 resync:`40449bfa93`/`025db697ab`/`8487091704`/`68e6ea6562`/`6514ade8fc`/`a469c899bd`。

### 诚实边界（继承并收窄）

- 上述 red set 仍是**本地测量**。lockfile 修好后 CI 才第一次可能真正跑起来 —— **CI 上的真实 red set 至今无人见过**。
- 「pre-existing vs 谁弄红的」这条：只有 `documentation standard tests` 一门做到了**正面确证**（断言在 fork parent `558e6f4f66` 里已存在）。其余的 pre-existing 判定基于 blame 日期早于 2026-09-07 + offender 包不在 `upstream/master`，**没有在 pre-merge 基点复跑同一 matrix**。本票原有的这条边界仍然开着。

## Resolution
（未 resolved。本轮把 22 → 19 且零新增，13 门全部归因，但 ① CI 从未真正跑过这套 gate ② [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 硬阻塞 UM11 ③ 尚有 6 门有精确 patch 未落地。）
