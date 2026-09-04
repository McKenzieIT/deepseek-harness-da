# GA-AUDIT1-followup — residual cleanup index

**Type**: task (index of remaining GA-AUDIT1-followup ④/②/③/① items — the next session picks a batch from this)
**Status**: open (handoff from the 2026-09-04 session that processed 14 items)
**Source**: [GA-AUDIT1-followup-findings](./GA-AUDIT1-followup-findings.md) (the resolved ticket's 73 deferred) + the 2026-09-04 `.tmp/adversarial-review/confirmed*.json` reconciliation (50 smell items re-verified).
**Related**: [GA-GRILL-derived-from-lineage-direction](./GA-GRILL-derived-from-lineage-direction.md) (sl-3), [GA-GRILL-search-asset-id-normalization](./GA-GRILL-search-asset-id-normalization.md) (usl-9)

## Progress to date (5 commits, 18 ④ items — 2026-09-04 across 2 sessions)

| commit | batch | items |
|---|---|---|
| `82c59266ae` fix(data) | semantic-layer | sl-5 (alt-FK cross-product), sl-10 (splitMetricName dedup) |
| `c807d36a11` fix(data) | nl2sql-engine | nl2sql-7 (inject=['query']), -11 (fixture substrings), -8 (typed MetricCorpusDoc + type guard), -3 (stripLineComments string-aware), -4 (prompt render-helpers dedup, byte-identical via 4 inline snapshots) |
| `24a0fd884b` fix(credentials) | embedder-retrieval-creds | erc-3 (drop find preflight — no secret read), -5 (keychain-host staleness doc), -6 (Reranker range doc) |
| `33d025b472` fix(query) | query-engines | qe-6 (DATEDIFF comment), -7 (--Note/注意 preserved), -14 (DEFAULTS dedup), -15 (conventions comment) |
| `c26eada21b` fix(client) | ui-context-layer | ucl-7 (NodeDetailPanel chip color → global sorted domain index via new `allDomains` prop, threaded from ContextLayerView's sorted set), -8 (narration-gate node id → first string via type-predicate `.find`, not `??`+`as string`), -9 (ContextLayerGraph `render().then(applyLOD)` cancelled-flag guard + `.catch`), -10 (`fadeIn` returns rAF cancel fn; `useGraphAnimations` cancels pending fadeIn rAFs on unmount) |

= 18 items (14 prior + 4 this batch; 14 real fixes + 4 doc fixes). Every batch: TDD RED→GREEN (each fix RED-watched-fail → minimal GREEN → persistence-checked via `git diff <file> | grep <marker>`); per-file `pnpm exec oxlint` 0 (89-rule); full-tree `pnpm run typecheck` exit 0 throughout; subagent code-review + test review (ucl-9 Test 2 strengthened to assert a non-empty LOD update — closed a no-op false-green). New tests this batch: +8 (narration-gate.client.spec 3 / NodeDetailPanel.spec 1 / graph-animations.client.spec 2 / ContextLayerGraph.spec 2).

## Deferred → ② this session (7 — need grilling / mock-sidecar / cross-package)

- **sl-3** relation-graph derived_from lineage direction → grilling ticket `GA-GRILL-derived-from-lineage-direction` (A/B/C: directional-lineage vs bidirectional-expansion; callers ontology.ts + tool-search-data-sources use getDerived bidirectionally for recall).
- **qe-2** decodeResult payload validation, **qe-3** stopSidecar race, **qe-5** credentials TOCTOU, **qe-8** callControl AbortSignal, **qe-11** backoff cancellable — 5 sidecar/concurrency fixes; **need mock-sidecar test infra** (no existing sidecar-lifecycle test in query-maxcompute — only classify-error/normalize/qualify/per-scope specs). Not deterministically TDD-able without it.
- **qe-13** conventions loader cross-package dedup (maxcompute + postgres near-identical → shared createConventionsLoader in dsh-query).

## Remaining ④ smell (~17 — batchable by package, all re-verified REMAINING 2026-09-04)

| package | items | note |
|---|---|---|
| data-infra | di-5 (getLinker stale cache, dormant), di-12 (STATUS_RANK error/pending tie), di-13 (patrol-mode dead loop + broken scope filter), di-14 (entriesEqual JSON.stringify holes) | 4 doable. **di-10/di-11 DEFERRED** (phase-gate.ts has uncommitted PB-COMPLY WIP — WIP-entangled; di-11 also multi-agent semantics). |
| ui-semantic-layer | usl-10 (RemoteResult/unwrap dup), usl-11 (kindBadgeClass dup), usl-12 (triggerEval loading), usl-13 (useLayoutMode stale docstring) | 4 doable. **usl-9 DEFERRED** (inferKindFromId prefix — gated on open grilling GA-GRILL-search-asset-id-normalization; SchemaExplorer.tsx has GA-WIRING-impl WIP). |
| ui-present-misc | upm-2 (isLatestTurn dup), upm-9 (parseFloat vs Number inconsistent), upm-10 (extractText dup + trim) | 3. **RE-VERIFY** — TableCard.tsx moved (concurrent R4 chart-types commit `b2860731d5`/`2abfd47bd1` + post-ship `4f11d43762`); line numbers + possibly code changed. upm-7 RESOLVED (PB-COMPLY R11). |
| eval-cli-exp | ece-13 (resolveRunFile unsorted), ece-14 (expandQuery bare catch), ece-15 (LEVEL_CONFIGS ?? {}) | 3. **RE-VERIFY** — eval-cli had uncommitted GA-EVAL-MANIFEST-impl WIP (bin/eval.ts→src/bin.ts, +src/index.ts/invariant.ts); compare.ts/context.ts/harness.ts may have moved. |
| llm-dashscope | ld-4 (reasoning_content inline → reuse textDeltaOf) | 1, single-file. |
| data-tools-discovery | dtd-7 (alt-labels presentationMeta regex → structured) | 1, local. |
| core-runtime-scripts | crs-3 (seed-event-external-refs --with-llm unread) | 1, local. |

(ui-context-layer 4 done — `c26eada21b`; was the recommended single-package starting point. data-infra 4 or ③ eval-core 5 are the next low-risk picks.) |

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
- **Client-package test-file naming** (learned `c26eada21b`): under `packages/client/*/tests/`, a `.ts` spec with NO `.client.` infix is matched by the HOST aggregate's `packages/*/*/tests/**/*.ts` include, but client SRC is excluded from host (`packages/client/*/src/**`) → `tsc -b tsconfig.host.json` TS6307s on the imported client src. Fix: name client-package `.ts` specs `*.client.spec.ts` (matches the host exclude `**/*.client.spec.ts`; still included by the client aggregate `packages/client/*/tests/**/*.ts` + `**/*.client.spec.ts`; still run by vitest). `.tsx` specs are NOT matched by the host `**/*.ts` glob (`.tsx` ≠ `.ts`) → `.spec.tsx` is host-excluded implicitly, fine as-is (matches pre-existing `ContextLayerOverlay.spec.tsx`). Pre-existing convention in ui-context-layer: `graphDataBridge.client.spec.ts` / `service.client.spec.ts`. Bottom line: for `.ts` client-package specs, use the `.client.` infix.
- **Lefthook vs `pnpm exec oxlint` rule-set mismatch** (learned `c26eada21b`): the pre-commit `lefthook` runs oxlint with a REDUCED 48-rule set; the per-file `pnpm exec oxlint` the process uses runs the fuller 89-rule set. They can disagree: e.g. `narration-gate.ts:169` carries `// oxlint-disable-next-line typescript/no-unnecessary-condition` which the 89-rule set NEEDS (the rule fires on `!item || typeof item !== 'object'` for a typed-as-object item) but the 48-rule lefthook set omits the rule → lefthook flags the directive "unused" (non-blocking warning; commit still succeeds). Keep such directives — removing them breaks `pnpm exec oxlint`. Don't be alarmed by lefthook "unused oxlint-disable" warnings on pre-existing directives; verify against `pnpm exec oxlint <file>`.
- **ucl-10 known minor limitation** (`c26eada21b`): `useGraphAnimations.activeFadeRef` (Set of fadeIn cancel fns) self-evicts only on unmount, not after a natural rAF fire — mirrors the file's existing `activeBlinkRef`/`activePulseRef` accumulate-clear-on-unmount pattern; magnitude is trivial (small closures, dozens–hundreds/session, cleared on panel close). A clean fix (`fadeIn` `onSettled` callback + slot indirection + an optional public param) was deemed disproportionate to this low-severity nit beyond the original finding; revisit only if long-session memory becomes measurable. Both subagents flagged it (low severity); left as-is deliberately.
- **ucl-7 helper not extracted** (`c26eada21b`): the global-index color logic was inlined in NodeDetailPanel (`allDomains?.indexOf(domain) ?? -1` → `colorIdx`); a `domainColorIndex(domain, allDomains, fallback)` helper in graph-styles.ts would match `comboStyle`'s index-based pattern but is YAGNI for one call site — the React swap-test guards it.
- **Re-review on committed state**（c26eada21b+05636377f1，2nd subagent pass — holistic review + 实际 vitest/oxlint 重跑）：4 fix CORRECT；4 spec RESIST 假绿（revert 各 fix → 对应测试 RED，逐条验证）；向后兼容 OK（fadeIn void→()=>void 安全宽化 — client/index.ts re-export 已更新、仅包内 caller 捕获；NodeDetailPanel allDomains? additive/optional）；测试命名 .client.spec.ts 正确（packages/client/*/tests/ 下零裸 .spec.ts）；vitest 7 files/31 tests exit 0；oxlint 0/0（89-rule）。Flakiness LOW（ucl-9 双 await Promise.resolve() 校准单 .then hop；.catch 静默吞 rejected render — 可接受，cancelled-path 是测试目标）。
- **ucl-7 低危 residual**（re-review 发现，prior pass 漏；DEFERRED 到后续 session）：chip↔combo 色号在多域 filter 激活时 diverge。ContextLayerView 传 filteredData（节点子集）给 ContextLayerGraph，toG6Data 从子集建 domainIndexMap，而 chip 用全量 allDomains → combo 用子集索引。修前更糟（chip 用本地索引），故严格改进非回归；no-filter 常见场景已完全一致。Fix sketch：把全量 sorted allDomains 透传进 ContextLayerGraph（新可选 prop）→ toG6Data，用 allDomains ?? [...domainSet].sort() 建 domainIndexMap 使 comboStyle 用全局索引。TDD：RED — render ContextLayerGraph（mocked Graph）with data domains ['beta','gamma'] + allDomains=['alpha','beta','gamma']；assert mockGraph.setData 的 combos 含 style: comboStyle(1) for 'beta'（global 1 vs subset 0 → RED）。GREEN — thread allDomains。~4 src + ~15 test 行。
