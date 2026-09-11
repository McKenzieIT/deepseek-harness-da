# UM-UI-SETTINGS-MODELS-RE-PORT — re-port upstream 的 ui-settings-models 重构（M1 静默回退了整包）

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
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
