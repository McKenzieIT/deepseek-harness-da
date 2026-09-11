# UM-INVARIANT-COMPANION-CLEANUP — 删 67 个空 invariant companion + 清 peerDep（适配 upstream 新规则）

**Type**: task
**Phase**: upstream-merge
**Status**: open (2026-09-15 拆出，用户决策 b：非回归，作 known-red 单开票)
**Assignee**: unclaimed
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
