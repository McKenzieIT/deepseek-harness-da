# UM-UI-SETTINGS-MODELS-RE-PORT — re-port upstream 的 ui-settings-models 重构（M1 静默回退了整包）

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Assignee**: wayfinder-session-2026-09-12 (claimed; apply in progress — backbone restore steps 2-4)
**Blocked by**: —（可立即认领；**不阻塞 UM11 PR**——PR 可带「已知 package-revert」说明先 merge，re-port 落地后再补）
**Graduated from**: [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 2026-09-14（blob 级枚举发现 M1 把整个包回退到 merge-base）

## Question

2026-09-07 merge#1（`6b7610d45a`）把 `packages/client/ui-settings-models/` 整个包**静默回退到了 merge-base `141eb6fef8`（2026-08-19）的内容**。27 个 fork 从未碰过的文件（`F==B`、`U!=B`、`M==B`）+ 1 个取 ours 的 `ProviderEditor.tsx` ≈ **30 个文件整体回退**。`tsc` 全绿（回退后包内部自洽），`git diff-tree --cc` 看不见（M1 的树在这里等于 parent¹，combined diff 只显示与**所有** parent 都不同的路径）。

upstream 在 B1 之后对这个包做了 2026-08-26 / 2026-08-28 的重构（`855461c2e8` 加 slot-contract + provider-card/footer 扩展 slot；`2f2e6d627b`）。fork 在 M1 之后**在回退后的基础上继续开发了**：27 个回退文件里 **20 个已同时偏离 B1 和 U2**，6 个仍等于 B1，1 个等于 upstream。

所以"恢复"不是 2 文件恢复（`slot-contract.ts`/`operations.ts`），是把 upstream 的 2026-08-26/28 重构与 M1 之后的 fork 工作做一次**真正的特性 merge**。

## Scope

1. 读 `855461c2e8` 与 `2f2e6d627b` 两个 upstream commit 的 diff，理解 slot-contract / operations / provider-card / footer slot 改了什么。
2. 对 27 个回退文件**逐个读 diff**（M1 之后的 fork 工作 vs upstream 重构），判 adopt-upstream / keep-fork / 真 merge。**这是 sizing 的第一步**——目前只有 blob 比对，没逐个读。
3. 落地：恢复 `slot-contract.ts`/`operations.ts` + 采纳 upstream 重构 + 与 fork 的 post-M1 工作三方 merge。
4. regen `gen-doc-graphs`（slot-catalog 会重新带上这两个文件）+ 修 `README{,.zh}.md:37` 的 "Extension slots" 段（[UM12](UM12-post-merge-ga-fork-ci-resweep.md) L7 依赖本票：在那之前只能删该段止住虚假广告，不能恢复链接）。
5. `docs/subsystems/slots{,.zh}.md:126-127` 的 `settings.models.provider-card`/`footer` 两条 slot 声明会从「虚假」变「真实」——同步核（该文件手写、不被任何 gate 覆盖，re-port 后须手改）。

## 诚实边界

- 20 个「已偏离」文件只做了 blob 比对，**未逐个读 diff**——re-port 规模只能说「非机械」，无法进一步量化。认领本票的第一步就是逐个读 diff sizing。
- `slot-contract.ts`/`operations.ts` 误丢（置信度 ~95%，见 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)），但本票**不做「仅恢复 2 文件」的捷径**——那样会和 fork 的 post-M1 工作打架。
- 真正的 merge 可能暴露 fork post-M1 工作与 upstream 重构的语义冲突（slot 契约变了、provider-card 挂载点变了等）——读到 diff 才知道有多深。

### [2026-09-11 workflow 实测] 中心语义轴 = upstream 把 `ctx` 换成了 `operations` façade；且 apply 有硬拓扑序

本票原写「真正的 merge 可能暴露 fork post-M1 工作与 upstream 重构的语义冲突……读到 diff 才知道有多深」。已读到了。**那个冲突就一条**，其余文件都是它的下游：

> **upstream 用 `createModelsOperations`（`src/client/operations.ts`）取代了 ctx-threading。** `ModelsSectionInjected`、`DeepSeekOnboardingInjected`、`CustomProviderCard` 在 upstream 都收 `operations`，在 HEAD 都收 `ctx`。**piecemeal 采纳会让包内部自相矛盾**——façade 要一次定，然后在同一个改动里推到所有 consumer。

#### apply 拓扑序（不是可选的——乱序会编译不过或让门变红）

1. **[UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md) 先落**：它拥有本包的 `src/invariant.ts`、`tests/invariant.client.spec.ts`，以及 `package.json` 的 invariant 三件套。
2. **`src/client/store.ts`** —— ⚠ **它 BLOCK 住 `slot-contract.ts` 的恢复**：`ProviderDirectoryEntry` 在 HEAD 的 store.ts 里**根本不存在**，而 upstream 的 `slot-contract.ts` 正 `import type { ProviderDirectoryEntry } from './store.ts'`。先恢复 slot-contract 编译不过。
3. **`operations.ts` + `slot-contract.ts`**（两个 restore，upstream blob `8ca6beb798` / `a9eef19368`）。
4. **`README.md` + `README.zh.md`，必须与第 3 步同一个 commit** —— upstream README 的 `### Extension slots` 段（`README.md:46-48`）链接到 `src/client/slot-contract.ts`，拆开提交会让 `verify-md-links` 变红。（HEAD 现在 `invariant` 零命中、`slot-contract` 零引用——fork 当初删这段正是为了消除虚假广告。）
5. **`index.ts`** —— 它 import `createModelsOperations` 并 re-export slot-contract 的类型，所以要等 2-3。upstream 还把 inject 从 HEAD 的 **5 条**加到 **8 条**（`['slots','locale','remote','remote.credentials','remote.llm','remote.settings','settingsScope','settingsSchema']`），并在 settings.section 注册上加 `children: { 'settings.models.provider-card': {kind:'keyed',scope:'root'}, 'settings.models.footer': {kind:'list',scope:'root'} }`。
   → **这条顺带解答了 Scope 5**：`docs/subsystems/slots.md:126-127` 广告的那两个 slot 是 **upstream 的设计**；恢复本包后那两行**就变成真的了**，所以别急着删——等这张票落完再看。
6. **façade 的 consumer 一起动**：`ModelsSection.tsx`、`CustomProviderCard.tsx`、`DeepSeekOnboardingDialog.tsx`、`ModelListEditor.tsx`、`ProviderEditor.tsx`。
7. **各 spec**，含 `tests/apply.client.spec.ts:87` 的 inject 清单 5 → 8。
8. 机械桶（adopt-upstream / restore / delete）任何时候都行，无需判断。
9. **`README.i18n.yaml` 最后**：它的全部 delta 就是记录的 sha1 对（HEAD `a9eb5ad9`/`dc9608e6` vs upstream `64a295e9`/`a75b6f23`）。**绝不手改**——等两侧 README 都落定后，对**你真的复核过的那一对**显式 scoped `--write` 重记。**绝不 `--all`。**

#### 逐文件要点（已验证，勿重导）

- **`package.json` 不可整体采纳**：upstream 版本号 `0.1.3-alpha.2` vs fork `0.1.0-rc.8` → **保 fork 的**（版本由 release 管）。upstream 同时删掉 `exports["./invariant"]`、`files[]` 的 `lib/invariant.js`、`peerDependencies` 的 `dsh-invariants` → **那三件套是 UM-INVARIANT 的 scope，不是本票的**。真正归本票的：upstream 从 peerDependencies 移除 `dsh-client-ui-renderer` 与 `dsh-client-connection`，并给 devDependencies 加 `dsh-util-values`（恢复的 `operations.ts` 需要它）。
- **`tests/apply.client.spec.ts` 双主**：upstream `15f2997bcb` 在这里加了 `import { apply as hostApply } from '../src/index.ts'` + `it('keeps the host Loader entry inert', …)`，作为被删的 invariant spec 的 node-half 断言的落点（**UM-INVARIANT 的活**）；而 `:87` 的 inject 清单 5→8 是**本票的活**。两件事在同一个文件里，别互相踩。
- **`src/client/ProviderEditor.tsx`** 是 M1 唯一按 `ours` 解的文件（见 UM-MERGE-INTEGRITY），所以它的 fork 侧是**刻意的**，不是整包回退的副产物 —— 动它前把两个 diff 都读一遍。
- **`src/client/store.ts`** 除了 `ProviderDirectoryEntry` 缺口，还带着 fork 的 D1 双调用折叠（`listConfigurableProviders()` + `listProviders()`，见其「hard-fail-on-either-half」注释）—— 采纳 upstream 形状时**别把它静默丢掉**。
- **`src/client/welcome-store.ts`** 是**纯 import 顺序**差异（1 插 1 删：upstream 把 `dsh-client-store` 的 `createSnapshotStore` 放在 `SettingsScope` 类型 import 之前，HEAD 相反）。挑一个能过 oxlint import 排序的，无语义。
- ⚠ **`tests/components.client.spec.tsx`（HEAD 77 测试绿）与 `tests/provider-form.client.spec.tsx`（82 测试绿）在 `5fe9b32e44` 里刚被删掉 `ctx as never`**（那 cast 本来就是为绕开已根治的 Context 冲突写的）。**朴素三方合并会把它加回来** —— 视为自动 refute。注意 upstream 版的 `provider-form` spec 明显更小，因为 operations façade 免掉了 ctx/Remote 的 mock。
- **`ModelListEditor.tsx`** 是 upstream 侧改动最大的（vsU 48+/66-），消费 upstream-only 的 locale key `fetchSearch`/`fetchNoMatches` 与 `EditorFooter` 的 prop 改名（`submitLabel`/`submitBusyLabel`/`cancelLabel`）。

#### 工具

已备 workflow：**[`wayfinder/data-agent/workflows/um-ui-settings-models-report.wf.js`](../../workflows/um-ui-settings-models-report.wf.js)**（analyze-only：分桶 → 每个 diverged 文件出合并提案 → 独立评审员**默认判 refuted**；上面这些 coupling 与拓扑序已内置进 agent 提示词，并在返回值里给出 `applyOrder`）。

### [2026-09-11] UM-INVARIANT 已落 → 本票 apply 拓扑序 step 1 满足

[UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md) **resolved**（source `7ad3242d97` on resync，未 push）。本包 `packages/client/ui-settings-models/` 的：
- `src/invariant.ts` + `tests/invariant.client.spec.ts` 已 retire（**ModelsSection 测试已迁到 `tests/models-section.client.spec.ts`**——本票 step 6 改 `ModelsSection.tsx` 时勿漏这个新 spec）；
- `package.json` 的 invariant 三件套（`exports["./invariant"]` + `files[] "lib/invariant.js"` + tsconfig ref）+ `dsh-invariants` peerDep 已清；
- `tsdown.config.ts` 已去 `lib/types/invariant.js` bundling（site-5，build 用）。

→ **本票 apply 拓扑序 step 1「UM-INVARIANT先落」已满足**，可从 step 2（`src/client/store.ts` 补 `ProviderDirectoryEntry`）起推进。本票仍拥有：`README{,.zh}.md` 的 `### Extension slots` 段恢复（step 4）+ upstream 对 peerDeps 的其他改动（去 `dsh-client-ui-renderer`/`dsh-client-connection` + 加 `dsh-util-values` devDep）——这些键与 UM-INVARIANT 清的 `dsh-invariants` 不冲突。

### [2026-09-12] re-port workflow 完成（analyze-only）— 43 文件分类 + 21 提案 + apply 拓扑序

`um-ui-settings-models-report.wf.js` 跑完（43 agent，analyze-only，提案在 `/tmp/um-uism/`，分类在 `/tmp/um-uism-classification.md`）。revisions: M1=`141eb6fef8` / UP=`c389f96bf3` / HEAD=`7ad3242d97`。

**分类（43 文件）**：
- already-equal=12（HEAD==UP，无需工作；含 WelcomeNotice.tsx/tsdown.config.ts 已独立 sync 到 UP）
- adopt-upstream=5（HEAD==M1，UP 移了——直接取 UP：EditorFooter.tsx、ModelsSection.module.css、locales.ts、onboarding-copy.ts、styles.client.spec.ts）
- **three-way-merge=21**（与 M1+UP 都偏离——真语义合并，提案在 `/tmp/um-uism/`）
- restore=2（UP 有 HEAD 无——`operations.ts` + `slot-contract.ts`，中心轴 façade）
- delete=0（invariant.ts + invariant.client.spec.ts upstream 已删 + UM-INVARIANT 已在 HEAD 删 → 无 delete 动作）✓ step 1 满足
- owned-elsewhere=3（UM-INVARIANT 的 invariant.ts + invariant.client.spec.ts + models-section.client.spec.ts 迁移 + package.json invariant 三件套——均已在 HEAD 清）

**中心轴**：upstream 用 `createModelsOperations`（`operations.ts`）取代 ctx-threading。façade consumers：ModelsSection.tsx（HEAD ctx-prop 10 → UP operations 18）、CustomProviderCard.tsx（ctx 2 → operations 7）、DeepSeekOnboardingDialog.tsx（ctx 2 → operations 6）、ProviderEditor.tsx（ctx.remote.credentials.describe → operations.describeCredential）+ EditorFooter.tsx（adopt）+ index.ts（three-way）。**façade 一次定，同改动推到所有 consumer。**

**apply 拓扑序（confirmed）**：
1. ~~UM-INVARIANT 先落~~ ✓ DONE（PR #116）
2. `store.ts` — 须先补 `ProviderDirectoryEntry`（HEAD 0 个，UP 4 个；slot-contract.ts import 它）
3. `operations.ts` + `slot-contract.ts`（两个 restore，UP blob）
4. `README.md` + `README.zh.md` — **同 commit**（UP README:46-48 链 slot-contract.ts；split 会让 verify-md-links 红）
5. `index.ts` — import createModelsOperations + re-export slot-contract types；inject 5→8
6. façade consumers 一起：ModelsSection/CustomProviderCard/DeepSeekOnboardingDialog/ModelListEditor/ProviderEditor
7. specs，含 `tests/apply.client.spec.ts:87` inject 5→8
8. 机械桶（adopt-upstream/restore/delete）随时
9. `README.i18n.yaml` 最后（scoped `verify-translation-pairing --write` 对 reviewed 对，禁 --all）

**耦合（6，confirmed）**：
- UM-INVARIANT 三件套（invariant.ts/spec/models-section/package.json invariant trio）——已在 HEAD 清（PR #116）✓
- `slot-catalog.ts`（`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`，**跨包**）：UP 声明 `settings.models.provider-card`(line 1637) + `settings.models.footer`(line 1591)，HEAD **两个都无**。docs/subsystems/slots{,.zh}.md:126-127 HEAD 已广告两 slot（与将 restore 的 slot-contract.ts 一致），但全局 runtime catalog 缺——**catalog delta 在 cordis-client-runner（跨包；确认本票还是 sibling 管）**。
- package.json：re-port 去 `dsh-client-ui-renderer`+`dsh-client-connection` peerDeps + 加 `dsh-util-values` devDep + **保 fork 版本 0.1.0-rc.8**（不采 UP 0.1.3-alpha.2）。⚠ UP peerDeps 实为只 {cordis}（全砍 peer）——context 指定 re-port scope 是 renderer+connection，更宽的 UP 砍作 merge-detail 解决。
- `tests/apply.client.spec.ts` **双主**：re-port（inject 5→8 + ctx→operations）+ UM-INVARIANT（UP `15f2997bcb` 加 Loader-inert test，但 fork 迁到 `models-section.client.spec.ts`——HEAD 的 apply.client.spec.ts **无** Loader-inert test，merge **不得**在此重加，否则与 fork 迁移重复）。
- `README.i18n.yaml` 最后（recorded sha1 pair，禁手 merge）。
- `ProviderEditor.tsx`：M1 唯一按 ours 解（fork 侧刻意）。M1..HEAD=33+/23-，UP..HEAD=54+/41-。动前读两个 diff。

**陷阱（3）**：
1. **UM-LINT-A cast 移除**（`5fe9b32e44`）：`tests/components.client.spec.tsx`(~line 200) + `tests/provider-form.client.spec.tsx`(~line 152) 的 `ctx: ctx as never,` → `ctx,` 已删（cast 为绕开已根治的 Context 冲突）。UP **不**带此 cast。三方 churn 重（components UP..HEAD 230+/314-，provider-form 81+/157-）易诱 resolver 拉 pre-UM-LINT-A hunk 复活 cast。两文件 three-way-merge；**保 HEAD cast-free ModelsSectionProps injection**。
2. `tests/apply.client.spec.ts` 双主（见上）。
3. `ProviderEditor.tsx` ours（见上）。

**提案 + 评审**：21 个 three-way-merge 提案在 `/tmp/um-uism/`（per-file：`packages-*` 提案内容 + `analysis-notes.md`/`MERGE_RATIONALE.txt` rationale）。challenge verdicts（clean/blocked）在 workflow return（通知截断 240K；proposals + rationales 在 /tmp 可 review）。apply 前逐个读 clean 提案；blocked 的需人裁决，非 retry。

**apply 后验**：tsc -b tsconfig.client.json + lint:contracts-ready 0/0 + gen-doc-graphs --check + 恢复 README Extension-slots 段（`e17f0fa16c` 删过）+ 双语 .zh.md + .i18n.yaml pair + docs/subsystems/slots{,.zh}.md:126-127 决策（删或成真）。

**估算**：~2-3 session（apply 21 三方合并 + 2 restore + 5 adopt + 12 已等 + 验）。

### [2026-09-12] apply LANDED (workflow-driven) — dsh-resync db0be3c426 + 74f5886d2e (unpushed)

Apply workflow `um-ui-settings-models-apply` (10 disjoint-batch agents + 1 crosscheck, ~407K subagent tokens, ~27min): wrote 24 files (2 restore + 5 adopt + 17 three-way that needed changes; 3 skipped as byte-identical to HEAD — truthfully: welcome-notice.client.spec.tsx was NOT actually at target, see fix #2). Façade 5 consumers atomic; 3 traps embedded in agent prompts; crosscheck confirmed all 8 invariants (operations.ts/slot-contract.ts created, store.ts ProviderDirectoryEntry 5>0, no `ctx as never`, no Loader-inert re-add, façade coherent, package.json version/peerDeps/devDeps correct, README Extension-slots restored).

Main-session gates (all green, serially, on fully-applied tree):
- `tsc -b tsconfig.client.json` — 0 errors (after 2 fixes below).
- `lint:contracts-ready` — 0 warnings 0 errors.
- `vitest packages/client/ui-settings-models` — 222/222 passed (10 spec files: components 81, provider-form 82, apply 13, onboarding-dialog 9, welcome-notice 5, models-section 1, store 11, welcome-store 8, readiness 7, styles 5).
- `gen-doc-graphs --check` — 6 graph docs up to date.
- `verify-md-links` — 1730 files, all resolve.

2 tsc errors caught + fixed (root-cause, not papered):
1. `tests/models-section.client.spec.ts` (UM-INVARIANT-relocated, owned-elsewhere, untouched by workflow): `ModelsSection({})` failed tsc because `renderSlot` is now required by `ModelsSectionProps` (façade). The null-guard (`if controller|useSnapshot|operations|schema|t === undefined) return null`) still returns null at runtime -> cast the empty-props arg through `unknown`.
2. `tests/welcome-notice.client.spec.tsx` (workflow wrongly skipped as "byte-identical to HEAD"): imported `WELCOME_NOTICE_COPY` from `onboarding-copy.ts`, but the `adopt` batch took `onboarding-copy.ts` upstream-verbatim (UP moved the copy out into `locales.ts` `en`/`zh` keys). The analyze proposal was STALE — it predated the adopt decision. Fix: rebuild `WELCOME_NOTICE_COPY` as a local const from `locales.ts` keys (matching UP's structure); keep the fork's type-rigor additions (`RemoteErrorCode`/`RemoteResult`, `response<T>`, the `as const`/`as RemoteErrorCode` assertions).

Commits (dsh-resync `upstream/resync-2026-09-08`, no push):
- `db0be3c426` — refactor(ui-settings-models): re-port upstream ctx->operations façade. 26 files (+1171/-669); operations.ts + slot-contract.ts created; lefthook pre-commit hooks green (lint staged, third-party notices, whitespace, vendor manifest).
- `74f5886d2e` — chore(ui-settings-models): regenerate README.i18n.yaml translation pairing (scoped `verify-translation-pairing --write`, never --all): README.md a9eb5ad9->d59b38a7, README.zh.md dc9608e6->d907db55.

Remaining (this ticket stays OPEN):
- **slot-catalog.ts (cordis-client-runner, cross-package)**: the 2 slots (`settings.models.provider-card`/`footer`) are now declared package-locally in `slot-contract.ts` + advertised in `docs/subsystems/slots.md:126-127`, but the GLOBAL runtime catalog `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` still lacks them (HEAD had neither; UP has both). Latent runtime gap (no current extension registers against them; no tsc/lint/gen-doc red). **Scoping decision pending**: UM-UI-SETTINGS owns the cross-package restore, or a sibling ticket. Lean: sibling (scope hygiene — one package per ticket). Concrete enough to ticket -> graduate next session.
- **PR push** (UM11/PR workflow, gated): `db0be3c426` + `74f5886d2e` unpushed on resync. Iron rule: no push without user instruction. PR body must note the ui-settings-models re-port (M1 silent revert undone) per the durable PR-description requirement.
