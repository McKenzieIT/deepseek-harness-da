---
description: "Query semantic-layer coverage, gaps, reachability, eval results, and normalized asset trust signals for sidebar and dashboard consumers."
kind: "package-reference"
---

# @deepseek-ai/dsh-evidence-query

English | [中文](README.zh.md)

## Summary

Use this package to query semantic-layer coverage, gaps, reachability, eval records, deltas, and asset health through one backend for sidebar and dashboard consumers. Confirmation reporting maps `draft` and `unreviewed` to draft, confirmed vocabularies to confirmed, `rejected` to rejected, and unrecognized values to unknown. Asset health reports `lastModified: null` until a durable definition-modification owner exists; it never substitutes filesystem metadata or confirmation time.

## Table of Contents

- [Eval history and asset filtering](#eval-history-and-asset-filtering)
- [Trust reporting](#trust-reporting)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="eval-history-and-asset-filtering"></a>
## Eval history and asset filtering

`evalResultQuery()` returns parsed case records plus `assetFilterStatus`. An omitted `assetId` reports `not_requested`. An asset filter reports `applied` only when every candidate record carries a real case-to-asset mapping; legacy JSONL without that mapping reports `unavailable` and returns the matching global history instead of presenting `caseId` as asset evidence. Direct `EvalResultStore.add()` callers provide explicit asset ids and remain filterable. `evalRunHistory()` requires a limit from 1 through 100 and returns that many newest run summaries without transferring their case records.

Run count, history, and delta read the same `EvalResultStore`. Consumers derive comparable run ids from `metadata.runId`; file count is not evidence that the UI has loaded a run.

-----

<a id="trust-reporting"></a>
## Trust reporting

Coverage and asset-health queries use one confirmation normalization. `confirmed`, `analyst_confirmed`, and `business_confirmed` report as `confirmed`; `draft` and `unreviewed` report as `draft`; `rejected` remains `rejected`; every other value reports as `unknown`. Coverage includes an explicit `unknown` count, so new vocabulary cannot silently increase the draft count.

`AssetHealthReport.lastModified` is nullable. Evidence-query returns `null` because the semantic definition model does not own a durable modification timestamp. [G9: semantic definition `lastModified` ownership](../../../wayfinder/semantic-layer/tickets/G9-definition-last-modified-ownership.md) owns the follow-up decision; file mtime and `confirmation.confirmed_at` are not substitutes.

No runtime invariant companion is published because `@deepseek-ai/dsh-evidence-query` owns no independently observable relationship that can diverge from its runtime state.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `@deepseek-ai/dsh-nl2sql-engine`'s LLM adapter.

#### KV Cache effect

The package's contributions are append-only to the reusable request prefix and do not invalidate prior cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Read-only projection — it never writes back to the semantic layer.
- Gap analysis proposes relations but does not persist them.
- Reachability is BFS-bounded with no path-length cap beyond the default.
- Definition modification time remains unavailable until G9 assigns a durable owner.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
