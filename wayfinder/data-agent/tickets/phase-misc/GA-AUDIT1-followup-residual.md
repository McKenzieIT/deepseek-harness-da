# GA-AUDIT1-followup — residual cleanup index

**Type**: task (index of remaining GA-AUDIT1-followup ④/②/③/① items — the next session picks a batch from this)
**Status**: open (handoff from the 2026-09-04 session that processed 14 items)
**Source**: [GA-AUDIT1-followup-findings](./GA-AUDIT1-followup-findings.md) (the resolved ticket's 73 deferred) + the 2026-09-04 `.tmp/adversarial-review/confirmed*.json` reconciliation (50 smell items re-verified).
**Related**: [GA-GRILL-derived-from-lineage-direction](./GA-GRILL-derived-from-lineage-direction.md) (sl-3), [GA-GRILL-search-asset-id-normalization](./GA-GRILL-search-asset-id-normalization.md) (usl-9)

## Progress this session (4 commits, 14 ④ items)

| commit | batch | items |
|---|---|---|
| `82c59266ae` fix(data) | semantic-layer | sl-5 (alt-FK cross-product), sl-10 (splitMetricName dedup) |
| `c807d36a11` fix(data) | nl2sql-engine | nl2sql-7 (inject=['query']), -11 (fixture substrings), -8 (typed MetricCorpusDoc + type guard), -3 (stripLineComments string-aware), -4 (prompt render-helpers dedup, byte-identical via 4 inline snapshots) |
| `24a0fd884b` fix(credentials) | embedder-retrieval-creds | erc-3 (drop find preflight — no secret read), -5 (keychain-host staleness doc), -6 (Reranker range doc) |
| `33d025b472` fix(query) | query-engines | qe-6 (DATEDIFF comment), -7 (--Note/注意 preserved), -14 (DEFAULTS dedup), -15 (conventions comment) |

= 14 items (10 real fixes + 4 doc fixes). Every batch: TDD RED→GREEN or refactor-with-guard; oxlint 0; typecheck 0; full-tree typecheck green throughout.

## Deferred → ② this session (7 — need grilling / mock-sidecar / cross-package)

- **sl-3** relation-graph derived_from lineage direction → grilling ticket `GA-GRILL-derived-from-lineage-direction` (A/B/C: directional-lineage vs bidirectional-expansion; callers ontology.ts + tool-search-data-sources use getDerived bidirectionally for recall).
- **qe-2** decodeResult payload validation, **qe-3** stopSidecar race, **qe-5** credentials TOCTOU, **qe-8** callControl AbortSignal, **qe-11** backoff cancellable — 5 sidecar/concurrency fixes; **need mock-sidecar test infra** (no existing sidecar-lifecycle test in query-maxcompute — only classify-error/normalize/qualify/per-scope specs). Not deterministically TDD-able without it.
- **qe-13** conventions loader cross-package dedup (maxcompute + postgres near-identical → shared createConventionsLoader in dsh-query).

## Remaining ④ smell (~21 — batchable by package, all re-verified REMAINING 2026-09-04)

| package | items | note |
|---|---|---|
| data-infra | di-5 (getLinker stale cache, dormant), di-12 (STATUS_RANK error/pending tie), di-13 (patrol-mode dead loop + broken scope filter), di-14 (entriesEqual JSON.stringify holes) | 4 doable. **di-10/di-11 DEFERRED** (phase-gate.ts has uncommitted PB-COMPLY WIP — WIP-entangled; di-11 also multi-agent semantics). |
| ui-semantic-layer | usl-10 (RemoteResult/unwrap dup), usl-11 (kindBadgeClass dup), usl-12 (triggerEval loading), usl-13 (useLayoutMode stale docstring) | 4 doable. **usl-9 DEFERRED** (inferKindFromId prefix — gated on open grilling GA-GRILL-search-asset-id-normalization; SchemaExplorer.tsx has GA-WIRING-impl WIP). |
| ui-context-layer | ucl-7 (domain chip color local vs global index), ucl-8 (narration-gate ?? cast), ucl-9 (render().then no .catch), ucl-10 (fadeIn rAF leak) | 4 doable, single package. |
| ui-present-misc | upm-2 (isLatestTurn dup), upm-9 (parseFloat vs Number inconsistent), upm-10 (extractText dup + trim) | 3. **RE-VERIFY** — TableCard.tsx moved (concurrent R4 chart-types commit `b2860731d5`/`2abfd47bd1` + post-ship `4f11d43762`); line numbers + possibly code changed. upm-7 RESOLVED (PB-COMPLY R11). |
| eval-cli-exp | ece-13 (resolveRunFile unsorted), ece-14 (expandQuery bare catch), ece-15 (LEVEL_CONFIGS ?? {}) | 3. **RE-VERIFY** — eval-cli had uncommitted GA-EVAL-MANIFEST-impl WIP (bin/eval.ts→src/bin.ts, +src/index.ts/invariant.ts); compare.ts/context.ts/harness.ts may have moved. |
| llm-dashscope | ld-4 (reasoning_content inline → reuse textDeltaOf) | 1, single-file. |
| data-tools-discovery | dtd-7 (alt-labels presentationMeta regex → structured) | 1, local. |
| core-runtime-scripts | crs-3 (seed-event-external-refs --with-llm unread) | 1, local. |

## ② refactor (11 — larger/cross-package, each its own scope)

sl-3 (grilling opened) · qe-2/3/5/8/11 (mock-sidecar) · qe-13 (cross-package conventions) · ld-5 (extract serialize helpers to dsh-llm, cross-package) · dtd-4 (concept write ConceptDefinitionSchema validation, structural) · crs-4 (goal-eval-policy import-type barrel, structural) · ece-11 (repo-root 4 sites, cross-file).

## ③ dead/cosmetic (5 — eval-core)

eval-core-4/-5 (delete unused eval-core runtime stack — small consolidation decision: delete vs wire as the single eval engine) · eval-core-6/-8/-9 (pure dead-branch/cosmetic: infra_retry 'permanent' dead branch, computeSummary dead counters, checkResponder auth-heuristic divergence).

## ① design decisions (2 — breaking, need product input)

data-infra-4 (scope-registry write API multi-tenant validation — cross-package signature + tenant Phase-1 OPTIONAL) · eval-cli-exp-5 (EvalRunnerService silent defaults — breaking, bundle config coordination).

## Notes for the next session

- **Re-verify before fixing**: each remaining item's `file:line` (code moved — concurrent commits touched ui-present-table, eval-cli, etc.). The 2026-09-04 reconciliation (50 smell items) confirmed 49 REMAINING / 1 RESOLVED at that time; re-confirm the specific item is still real before fixing.
- **Disconnect countermeasures** (the 2026-09-04 session hit `runner_gone` repeatedly): after each `edit_file` that's a refactor (behavior-preserving — lost edit would still pass tests = false green), run `git diff <file> | grep <marker>` to confirm persistence; GREEN-test fixes (RED→GREEN) are self-verifying (lost edit = RED); typecheck/specs **foreground** (not background — background shells get killed by disconnects).
- **TDD**: logic fixes → RED test first; refactors → pin current behavior (inline snapshot or existing tests) then extract; doc fixes → oxlint + typecheck suffice.
- **WIP-entangled files to avoid**: phase-gate.ts (PB-COMPLY), SchemaExplorer.tsx (GA-WIRING-impl), TableCard.tsx (R4 chart-types — now committed but moved). Re-verify these are clean before touching.
- **Mock-sidecar infra** (for qe-2/3/5/8/11): building a fake-MCP-sidecar test harness in query-maxcompute is a prerequisite — a separate task ticket worth opening.
