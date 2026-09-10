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
