# UM-INVARIANT-COMPANION-CLEANUP — 删 67 个空 invariant companion + 清 peerDep（适配 upstream 新规则）

**Type**: task
**Phase**: upstream-merge
**Status**: resolved（2026-09-11 · commit 7ad3242d97 on upstream/resync-2026-09-08, resync tree, not pushed）
**Assignee**: —（已收口 2026-09-11）
**Blocked by**: 无（不阻塞 UM11 PR；本门作 known-red 进 PR 清单）
**Blocks**: 无
**Related**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md)（package-invariants 门的归因票）、[UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md)（同模式：非回归 fork drift 单开票）

## Question

删 67 个 fork 自有包里的空 `src/invariant.ts` companion + 清各自 `package.json` 的 `exports["./invariant"]` + 清 7 个包误把 `dsh-invariants` 作 peerDep。这是 fork 自有内容适配 upstream 新规则，非 merge 回归——本票专门做这次扫除，不塞进 PR-blocker 提交。

## 背景：为什么是这张票

`verify-package-invariants` 门报 74 违规，实测归因：
- **67 × `empty install function is unnecessary`**：fork 有 67 个包各 ship 一个 `src/invariant.ts`，里面 `install: InvariantInstaller = () => {}` 是空函数，只为"占名"（防止同名包重复 mount），不做运行时检查。upstream 新规则 `15f2997bcb cleanup: omit unneeded invariant companions`（Turtle 2026-08-28）判定：install 为空就该删文件 + 它的发布接线。
- **7 × `dsh-invariants must not be a peerDependency`**：7 个包把 `dsh-invariants` 列进 `peerDependencies`。upstream 新规则 `de256e8bc1 feat: enforce published dependency policy`（imccyu 2026-08-26）不准。
- **7 是 67 的子集**（全在 `packages/client/*`）→ 实质是删 67 个空 companion + 清各自 `exports["./invariant"]`，顺带去掉 7 个已无用的 peerDep。一次同形机械扫除。

**非回归确证**：pre-merge 基点 `65bf3cddc9` 上，空 companion 已存在（抽样 4/4 包 `src/invariant.ts` pre-merge 就有），但两条规则 pre-merge 都不存在（`15f2997bcb`/`de256e8bc1` 均 upstream 提交，pre-merge 不在树里）→ pre-merge 绿只因规则没生。**零内容回归**。与 `client UI i18n`(98)/`package dependencies`(74) 同类（upstream 新门撞 fork 既有），那两门作 known-red，本门同等待遇。

违规包分布：`data/` 37、`client/` 14、`eval/` 5、`query/` 4、`embedder/` 3、`retrieval/` 2、`goal/` 2、`credentials/` 2、`subagent/llm/identity/code-runtime/bundle/` 各 1。

## Scope

1. **删 67 个 `src/invariant.ts`**（空 companion）。逐个判"占名"必要性：删之前确认该包没有"靠空 companion 占名防重复 mount"的真实需求——有则换更轻的占名机制（见 Notes）。
2. **清 67 个 `package.json` 的 `exports["./invariant"]`**（companion 删了，发布接线也删）。
3. **清 7 个包的 `peerDependencies["@deepseek-ai/dsh-invariants"]`**（在 client/* 下，是 67 的子集，删 companion 时顺带清）。
4. tsc + invariant 相关 spec（`verify-package-invariants`/`verify-built-package-invariants`）验绿；67 包逐个或批量验。

## Acceptance

- `pnpm run verify-package-invariants` 0 违规（74→0）。
- `grep -rn 'InvariantInstaller.*= () => {}' packages/`（排除 lib/）返回 0。
- tsc 0 错；`build:official` GREEN；invariant spec 绿。
- `check:ci:static` package-invariants 翻绿，无新增失败。

## Notes

- **占名机制**：空 companion 的 `install = () => {}` + `ctx.invariants.register(PACKAGE_NAME, install)` 原意是"占名"——让 `invariants` service 记下该包的所有权，使第二次 mount 同名包失败 loud。删空 companion 前，须判这 67 个包里有没有"真靠这个占名、删了会静默重复 mount"的。若有，需一个更轻的占名方式（或 upstream 已有别的机制）替代。这张票的价值之一就是把占名机制判清楚，而非赶时间机械删——对 data-agent 后续每加新包更稳。
- 与 [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md) 同模式：非回归 fork drift，拆出单走，不阻塞 PR。两票可并行做（不耦合）。
- 本票前 `package-invariants` 门作 known-red 进 PR 的 known-red 清单（与 i18n/deps 同等）。

### [2026-09-11 复核] Scope 被低估：每包 **4 处**编辑而非 2 处 → 约 **268 处**编辑

实跑 `verify-package-invariants` 得**恰好 74 条**违规（与票记一致）：67 条 `empty install function is unnecessary` + 7 条 `must not be a peerDependency`（后者是前者的真子集，全在 `client/`：`result-cache`、`ui-context-layer`、`ui-present-decomposition`、`ui-present-table`、`ui-semantic-layer`、`ui-settings-models`、`ui-suggest-followups`）。67 条分布：`data` 37、`client` 7、`eval` 5、`query` 4、`embedder` 3、`retrieval` 2、`goal` 2、`credentials` 2，`subagent`/`llm`/`identity`/`code-runtime`/`bundle` 各 1。

**但每个包要动 4 处，不是票里写的 2 处**：
1. 删 `src/invariant.ts`
2. 去掉 `package.json` 的 `exports["./invariant"]`
3. **去掉 `package.json` 的 `files[]` 里的 `"lib/invariant.js"`** —— 门有配对规则（`scripts/package-invariants.ts:120-126`「files must omit lib/invariant.js when src/invariant.ts is absent」），漏了它会换一条红
4. **去掉 `tsconfig.json` 对 invariants 的 project reference**

67 × 4 = **268 处编辑**，另加 7 处 peerDep 删除 + 4 个 `tests/invariant*` spec 删除。

**⚠ 切勿批量 strip peerDep**：全仓 **103** 个包声明 `dsh-invariants` 为 peerDep，只有 **7** 个是违规——该规则以 `usesFlattenedPackageDependencies` 为条件，其余 96 个是**策略正确**的（`must be a workspace:^ peerDependency`）。

**票里「占名机制该不该判清」这个判断题现在有决定性的 upstream 先例**：upstream `c389f96bf3` 只有 **39** 个 `src/invariant.ts`，fork 有 **106**；且 upstream **根本没有** `packages/client/ui-settings-models/src/invariant.ts`（及其 `tests/invariant.client.spec.ts`）——即 upstream 是**直接删掉**这些 companion，而非替换占名机制。agent 可据此自行推进并把该发现报回。

**记账修正**：票里「违规包分布：data/ 37、client/ 14 …」是**违规条数**分布（client 14 = 7 companion + 7 peerDep），不是包数分布；算术自洽（74），标签误导。

**与 [UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md) 的耦合**：`packages/subagent/subagent-qoder/src/invariant.ts` 是 67 之一 → 谁后做，看到的是 66 companion / 73 违规，本票 Acceptance「74→0」需相应改写。
**与 [UM-UI-SETTINGS-MODELS-RE-PORT](UM-UI-SETTINGS-MODELS-RE-PORT.md) 的耦合**：`ui-settings-models` 的 `src/invariant.ts` + `tests/invariant.client.spec.ts` 同时是那张票的「upstream 已删、fork 仍停在 merge-base」文件 → **本票先做**，否则那张票会重新论证甚至错误地把它们恢复回来。

**估算**：1-2 session（机械但量大，268 处 + 一轮 build/门复验可能溢出）。

### [2026-09-11 复核2] workflow 的 4-site plan 漏 site 5/6：gate 的 !hasCompanion 分支查 6 处不是 4 处

独立读 `scripts/package-invariants.ts` + 全量 survey（与 gate 的 67/106 计数一致）发现 workflow 与原 复核 的「每包 4 处」都少算了 2 处。gate 删 companion 后（hasCompanion=false）切到 `!hasCompanion` 分支，查：

- **Site 5（`tsdown.config.ts`）**：若仍 bundle `lib/types/invariant.js` → 新违规 `package build override must omit lib/types/invariant.js when src/invariant.ts is absent`。**12 包**受影响（7 client peerDep offender + `code-runtime/code-runtime-data-python`、`eval/eval-cli`、`query/query-maxcompute`、`query/query-postgres`、`query/query`）。两形态：`clientBundle(name, [...])` 删数组元素 vs `defineConfig([{entry:[...]}, ...])` 删整个 entry 对象。
- **Site 6（`README.md`）**：须含 `No ... companion is published` 句（gate regex `OMITTED_COMPANION_REASON`），否则 `omitted companion requires a README ... reason sentence`。**全 67 个都缺**（0 已有，0 无 README）。规范短句 = `No companion is published.`（224 既有 README 中 99 个用此）。
- **peerDep 7 条**：gate 的 peerDep 检查在 `hasCompanion` 分支、`!hasCompanion` 早 return 之后 → 删 companion 后 7 条违规**自动消失**（非 workflow 估的「74→7」）。但 7 offender 的 peerDep 语义上仍错（flattened policy `usesFlattenedPackageDependencies`）→ 应删；已确认 7 包 `src` 在 `invariant.ts` 之外**零** dsh-invariants import → 删 peerDep 安全，devDep 留。

**净效果**：workflow 4-site apply 单跑 = **74→79**（67 README + 12 tsdown 新红；7 peerDep 自动消）= 回归。补 site5/6 + 删 7 peerDep 后 = **74→0**（达票 Acceptance）。

**决策（执行）**：workflow 只做 4-site companion retirement（268 处，其强项，disjoint 包目录）；site 5/6/peerDep 由主 session 做——site6 用确定性 node 脚本 `/tmp/um-site6-readme.mjs --write`（67 append），site5 12 文件按形态逐个，peerDep 7 文件。然后主 session 串行 verify（verify-package-invariants 期望 74→0）。流程边界未变：判断留人，体量进 workflow+脚本，门/commit 归主 session 串行。

### [2026-09-11 复核3] 修正 复核2 的 gate 分析：4-site apply 单跑即 74→0（非 74→79）

workflow analyze 跑完（14 agent / 499k subagent token / ~35min），crosscheck 独立复核**纠正了 复核2 的一个关键误读**：

**复核2 误以为**删 companion 后 gate 的 `!hasCompanion` 分支会查 site 5/6 → 74→79 回归。**错。** gate 的 owner 发现 `packageInvariantPackages` 以 `exports["./invariant"] !== undefined || existsSync(src/invariant.ts)` 为准——workflow 的 4-site apply **同时**删 `src/invariant.ts` **和** 去 `exports["./invariant"]`，两条件皆假 → 包**退出 owner 集** → `checkManifest`/`checkBuild`/`checkOmissionReason` **全不跑**。故 **verify-package-invariants 单跑 4-site apply 即 74→0**（非 79，非 7）。

**但 site 5/6/peerDep/C 仍要做，只是理由变了**（gate 不再是理由）：

- **site 5（tsdown）**：非 gate 红，是**真 build 断**——删 `src/invariant.ts` 后 `tsc -b` 不再产 `lib/types/invariant.js`，`tsdown` 在缺失 entry 上**崩**。12 包（7 client offender + `code-runtime-data-python`/`eval-cli`/`query-maxcompute`/`query-postgres`/`query`）。`/tmp/um-site5-tsdown.mjs`（dry-run 12/12 0 err）处理。crosscheck 确认 11 个 batch 自报漏了它（prompt 没要求），batch 9 发现了但 skip。
- **site 6（README）**：非 gate 红，仅一致性。67 包全缺句子；`/tmp/um-site6-readme.mjs`（dry-run 67/0/0）处理（hygiene）。
- **peerDep 7**：非 gate 红（owner 退出后 gate 不查 peerDep），但语义对——flattened policy 下 7 offender 的 peerDep 本就不该有；已确认 7 包 src 在 `invariant.ts` 外**零** dsh-invariants import。`/tmp/um-peerdep-strip.mjs`（dry-run 7/7 0 err，devDep 留，JSON 验）处理。
- **concern C（crosscheck 新发现）**：`packages/client/ui-settings-models/tests/invariant.client.spec.ts` 捆了 1 个**实质测试** `ModelsSection({}).toBeNull()`（测客户端组件，非 companion）；workflow 删该 spec 会丢它 → **apply 前迁到** `tests/models-section.client.spec.ts`。另 3 个 spec（`ui-present-decomposition`/`ui-present-table`/`ui-suggest-followups`）只捆 obsolete companion 测试，删之安全（ui-suggest-followups 已读确认）。
- **无 barrel/module 重导出本地 companion**（`grep "from [.]+/invariant" packages/*/src packages/*/*/src` 排除 `invariant.ts`，0 命中）→ 删 `src/invariant.ts` 不破任何 kept src；crosscheck 同证 git 干净。

**crosscheck 另点名的耦合**（awareness，不阻本票）：`ui-settings-models` 同时归 UM-UI-SETTINGS-MODELS-RE-PORT（5 文件含 tsdown，RE-PORT 后跑需对账）；`subagent-qoder` 同时归 UM-QODER-SUBAGENT-RETIRE（若 RETIRE 删整包则本票对它 3 文件是冗余 no-op，顺序：本票先）。

**净结论**：4-site apply → gate 74→0；补 site5（build）+ peerDep（语义）+ site6（hygiene）+ 迁 ModelsSection test → build/test 绿。流程边界不变（判断留人，体量进 workflow/脚本，门/commit 归主 session 串行）。

### Resolution (2026-09-11)

**Landed** — commit `7ad3242d97` on `upstream/resync-2026-09-08` (resync tree `/Users/mckenzie/workspace/dsh-resync`, NOT pushed):
- 4-site retirement of 67 empty invariant companions (workflow `um-invariant-companion-sweep.wf.js`, apply mode): deleted `src/invariant.ts`; removed `exports["./invariant"]` + `files[] "lib/invariant.js"` + the tsconfig `runtime-diagnostics/invariants` project reference; deleted 4 obsolete `tests/invariant.client.spec.ts`.
- Site 5 (build): omitted `lib/types/invariant.js` from 12 `tsdown.config.ts` (7 client `clientBundle` A/B + `code-runtime-data-python` A/B + 4 `defineConfig` C) — else `tsdown` breaks on the missing entry after `src` deletion.
- peerDep (correctness): removed the 7 stale `@deepseek-ai/dsh-invariants` peerDependencies from the 7 client offenders (devDep retained; confirmed zero runtime imports of dsh-invariants outside the deleted companion).
- Spec fixes: relocated the one substantive `ModelsSection` test to `tests/models-section.client.spec.ts`; dropped the stale `import '../src/invariant.ts'` + companion-registration tests (and the now-unused `vi`/`InvariantInstaller` imports) from `identity.spec.ts` and `subagent-qoder.spec.ts`.
- Regen: `docs/architecture-graph.md` + `docs/module-graph.{md,zh.md,i18n.yaml}` (the retirement stale'd them).

**Gates (all green, main session serial)**:
- `verify-package-invariants`: 74 → 0 (39 hand-owned companions conform; retired packages exit the owner set once `src`+`exports` both gone, so `checkManifest`/`checkBuild`/`checkOmissionReason` no longer run for them).
- `verify-built-package-invariants`: 0 (39 compiled companions pass Loader checks).
- `tsc -b tsconfig.host.json` + `tsconfig.client.json`: exit 0.
- `lint:contracts-ready`: 0 warnings / 0 errors.
- `gen-architecture-graph` / `gen-module-graph` / `gen-cordis-catalog` / `gen-doc-graphs` `--check`: up to date.
- `verify-md-links`: 1730 files, all resolve.

**Not my regression**: `gen-config-catalog --check` is red (stale) but PRE-EXISTING — red at session start per the status section; my work touched no `dsh` config block, and `docs/config-catalog.md` is unmodified in this commit. Left for the config/zh-pairing concern that owns it.

**Coupling** (awareness for co-owned tickets, not blocking):
- `packages/client/ui-settings-models` (companion + spec + tsdown + peerDep retired here) is ALSO owned by UM-UI-SETTINGS-MODELS-RE-PORT — that ticket's change count + merge expectations must account for these landings (incl. the new `tests/models-section.client.spec.ts`).
- `packages/subagent/subagent-qoder` (companion + tsconfig retired; spec's companion-test dropped) is ALSO owned by UM-QODER-SUBAGENT-RETIRE.

**Apply notes (env lessons, for future workflow use in this repo)**:
1. `resumeFromRunId` + changed `args` → cached no-op (resume only supports script edits, not args changes).
2. `scriptPath` + `args` → ran 14 agents for ~49 min in **analyze** mode (`args` did not propagate via `scriptPath`; `mode` defaulted to `'analyze'`). Both were pure no-ops (tree verified clean).
3. Hardcoding `const mode = 'apply'` **inline** (no `args` dependence) → landed (272 edits, 67 packages).
The MCP runner also dropped mid-apply (sustained `runner_gone`); a session-only cron retried the probe every ~17 min until reconnected, then verification + commit ran in the main session.
**Lesson**: in this env, hardcode mode inline and don't rely on `args` via `scriptPath`/`resumeFromRunId`; tolerate transient runner drops via a retry cron.
