# Agent Note: Evidence history loading and asset mapping

Status: implemented

English | [中文](2026-09-18-evidence-history-loading-and-asset-mapping.zh.md)

## Problem

The Evidence Dashboard could enter its evidence-first layout after `getEvalRunCount()` observed persisted runs while still showing empty history and delta panels. The count, result query, and delta already shared one parsed `EvalResultStore`; the Client did not request history when the Dashboard mounted, and the sidebar requested history only after asset selection.

Persisted eval cases contain `caseId` but do not yet carry a durable case-to-asset identity. The file-backed store used `caseId` as an `assetId` fallback, so an asset filter could return an empty result that looked like authoritative evidence for that asset.

## Decision

`useEvidenceQuery.fetchEvalHistory()` owns the Client history sequence. It queries the newest ten aggregate run rows, ordered by record timestamp, without sending their case records to the browser, and requests a delta for the latest two runs. Dashboard and sidebar call this same operation; the Dashboard requests global history on mount, and the sidebar requests global history without a selection or an asset-filtered view with one. When the asset filter is applied, the delta uses that same asset and rejects the request if the mapping becomes unavailable before comparison. When selection changes overlap requests, only the latest request may publish history, delta, or an error.

`EvalResultStore` tracks whether each stored record has reliable asset identity. Records added programmatically have explicit asset ids. File-backed records are reliable only when a case-to-asset resolver was supplied. `evalResultQuery()` reports `assetFilterStatus`; it applies an asset filter only when every candidate record has a reliable mapping; otherwise it returns the matching global history with `unavailable` instead of applying the `caseId` fallback. `hasResultsFor()` also ignores fallback ids.

`EvalTrajectory` presents one row per run rather than one row per case record. An unavailable asset filter remains visible even when the global fallback is empty. Auto-layout counts distinct parsed run ids; displayed history and delta always come from query results, never from file count.

The Client plugin waits for `remote.schemaGateway` and `remote.evidenceQuery` before constructing the corresponding RPC clients, so a namespace cannot be frozen as `null` before registration. The management entry uses the current `layout.openRightbar(true, false)` API; the removed `openDetails()` method is not treated as an optional call.

## Alternatives considered

**Treat `caseId` as `assetId`.** This preserves the old empty filtered response but makes a missing case-to-asset mapping source look like evidence that an asset has no eval coverage.

**Hide history until an asset is selected.** This keeps the sidebar behavior but leaves the evidence-first Dashboard empty despite available global runs.

**Add a second run-history store or endpoint.** The existing store already owns parsed records and run ids. A second source would recreate the drift that W18 was initially suspected to contain.

## Consequences

Legacy JSONL remains readable and visible globally. Asset-specific history becomes available only after a real resolver or future evaluation identity owner supplies the mapping. Evaluation T13 remains responsible for a durable case-to-asset mapping source; this change does not invent it.

## Testing

Focused store tests cover explicit mappings, unavailable legacy mappings, fallback-to-global behavior, and `hasResultsFor()`. Dashboard component tests cover loading, empty, error, single-run, and multi-run states, including latest-two delta selection. Hook tests cover overlapping history and delta requests. Sidebar integration tests cover global history before selection, empty unavailable fallback, and asset-filter requests after selection. Client apply tests pin the typed Remote dependencies and current right-sidebar API. W24 records the missing keyless recorded-session Web snapshot composition.
