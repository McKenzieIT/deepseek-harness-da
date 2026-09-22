---
type: task
status: resolved
assignee: codex
blocked_by: []
---

# W23: confirmation 与 asset-health trust reporting 修正

## Question

如何让 evidence-query 的 coverage 与 asset health 共用同一 confirmation status 口径，使 `analyst_confirmed` 计入 confirmed、未知状态明确报告，并在没有字段 owner 的情况下停止用空字符串伪装 `lastModified` 数据？

范围限于：

- 为 `draft`、`confirmed`、`analyst_confirmed`、`rejected` 和未知状态添加 focused fixtures；
- 集中归一化 confirmation status，并让 coverage 与 asset health 共用该结果；
- 调查 `lastModified` 的字段 owner，不用文件 mtime 或 confirmation timestamp 代替；
- 更新 evidence-query 的返回类型、README/JSDoc 和必要的直接类型消费者；
- 若 `lastModified` 没有 owner 语义，创建一张窄范围后续决策票，并在当前返回中明确 unavailable。


## Answer

Evidence-query now uses one normalization function for both coverage tallies and `assetHealth()`:

- `draft` and `unreviewed` report as `draft`;
- `confirmed`, `analyst_confirmed`, and `business_confirmed` report as `confirmed`;
- `rejected` reports as `rejected`;
- every other value reports as `unknown`.

`ConfirmationBreakdown` now includes `unknown`, and `AssetHealthReport.confirmationStatus` exposes the normalized union. The focused fixture covers the requested `draft`, `confirmed`, `analyst_confirmed`, `rejected`, and unknown cases, plus the current `business_confirmed` and `unreviewed` vocabulary found in the semantic-layer corpus.

`lastModified` has no current owner semantics. Git history shows that W4 introduced the field and the empty-string return together; the semantic definition schemas own `confirmed_at`, while G6 chose audit-backed definition changes but did not define a queryable modification timestamp. Evidence-query therefore returns `lastModified: null` and does not substitute file mtime or confirmation time. [G9: semantic definition `lastModified` ownership](G9-definition-last-modified-ownership.md) owns the follow-up decision.

Verification on 2026-09-18: the RED run failed 10 focused assertions for missing aliases, missing unknown accounting, raw asset-health statuses, and empty-string modification times. After the implementation, all 78 evidence-query tests passed, the package TypeScript build passed, and the README translation pair passed its focused consistency check.

No Agent Note was added: the implementation is a local vocabulary normalization and removal of a placeholder value. The only durable unresolved decision—definition modification-time ownership—is isolated in G9 instead of duplicating speculative rationale here.
