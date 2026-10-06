# T29 — DA CI 与 upstream workflow ownership

**Type**: grilling
**Status**: open
**Part of**: [repo build and theme infra map](../map.md)
**Migrated from**: [semantic-layer CB-5](../../semantic-layer/tickets/CB5-da-ci-upstream-boundary.md)

## Question

Data-agent fork-specific dependencies、platform setup、resource budgets and test adaptations should be owned by which CI lanes, and which changes must stay out of upstream-shared workflows so future upstream syncs remain reviewable?

## Must decide

- Whether DA needs path-scoped CI lanes and which packages, scripts, fixtures, and operating systems they own.
- Whether shared `build:lib:host` memory requirements and upstream test changes are repository-wide fixes or fork-only adaptations.
- How fork-only issue-policy credentials and workflow conditions remain explicit without editing upstream behavior accidentally.
- Which existing workflow edits should remain, move to DA-owned lanes, or be reverted during the next upstream sync.

## Scope

This ticket owns repository CI and upstream-sync policy only. It does not reopen semantic-layer runtime or evaluation implementation work.

## 与 parallel-dev-cleanup 的分工（2026-10-06 定）

本票与 [R4](../../parallel-dev-cleanup/tickets/R4-ci-red-gate-policy.md) 都涉及「CI 门禁」，
但决定的不是同一件事。**互不决定对方**：

| | 决定什么 | 不决定什么 |
|---|---|---|
| **T29**（本票） | lane 归属与 **upstream 边界**：哪些改动该留在 DA 自己的 lane、哪些不该碰上游共享 workflow、fork-only 条件与凭据如何显式化 | 哪些 check 进 required |
| **[R4](../../parallel-dev-cleanup/tickets/R4-ci-red-gate-policy.md)** | **required 集合**，以及非 required 的处置（修 / 冻结已知基线 / 明示放弃） | lane 该归谁、改动该不该进上游 workflow |

记这条分工是因为本票是第二处可能重复记账的地方：本票的 Must-decide 里
「fork-only issue-policy credentials and workflow conditions」与
parallel-dev-cleanup [R5](../../parallel-dev-cleanup/tickets/R5-issue-workflows-upstream-only.md)
指的是同一组 workflow。**R5 已 resolved**（守卫已在 master 生效，
`issue-policy.yml:19` 的 `repository_owner == 'deepseek-ai'`，最近 5 次运行全 skipped），
故本票承接的是**往后的**边界政策（下次 upstream sync 时这些守卫要不要留、怎么留），
不是重新论证那两个 workflow 为什么红。

该事实历史上在四处记过账：R5、repo-infra [T6](T6-ci-checkout-issue-policy.md)（closed）、
semantic-layer `CB5-da-ci-upstream-boundary.md`（`status: migrated` → 本票）、
data-agent [UM2](../../data-agent/tickets/phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md)。
**本票是其唯一的后继归属。**
