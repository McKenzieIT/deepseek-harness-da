# da Impact Report — merge `upstream/master` 0d1f50007f into the fork

- date: 2026-09-17
- base: `origin/master` 3df45ef2b7 (record base `c291e7961a`, 666 commits behind)
- target: `upstream/master` 0d1f50007f (5 pure-perf commits past tag `dsh-v0.1.6-alpha.1`)
- branch: `upstream/resync-2026-09-17` (merge commit not yet created when this report was written)
- conflicts: 59 files, all resolved; `pnpm install`, `typecheck`, `build:official`, `test:docs`, `rescope-vendor:check` green

Every item below is a place where upstream's change met da-owned content. Sections 2 and 3 are the review gate: nothing there was overwritten silently. Section 6 lists the calls left for you.

## 1. Decisions you already confirmed

| # | Decision | Where it landed |
|---|---|---|
| 1 | Adopt upstream's `code-runtime` → `ptc-runtime` rename, including the new `resolve(request) → PtcRunSpec` request/spec split | `code-runtime-data-python`, `tool-compute`, `eval-cli` |
| 2 | Keep da's released `code-runtime-python-protocol` package; upstream's consolidation into `experimental/ptc-runtime-python` stays rejected | package kept, [ownership note](../.agents/notes/implemented/architecture/2026-09-14-code-runtime-python-protocol-ownership.md) updated to current state |
| 3 | T18 (Python wide-value limits) is dsh-original, not fork work: take upstream's 253-case suite, drop the fork's 60-case one, close PR #156 as moot | `experimental/ptc-runtime-python` adopted wholesale |
| 4 | New upstream prose gates: exclude da's records corpora, fix the real wording violations | `verify-repository-references`, `verify-concrete-terms` (item 21) |
| 5 | Add a regression test for patch targets rather than only recording the risk | `packages/bundle/data-agent/tests/patch-targets.spec.ts` (item 11) |

## 2. da surfaces preserved through the merge (merge-both)

6. **`packages/api/remotes`** — kept da's `schema-gateway` / `evidence-query` / `result-cache` remote mounts, deps, and the `evidence/eval-run-completed` forwarded event; took upstream's `permission-presets` and `api-terminal-controller` additions.
7. **`ui-settings-models/ProviderEditor.tsx`** — kept the D3 `dashscope` base-URL branch nested inside upstream's rewritten `t()`/messages logic and its new `aria-describedby`.
8. **Generated catalogs** — `tool-cordis/api-catalog.ts` and the client slot catalog were regenerated (`gen-cordis-api`, `gen-client-catalog`), so da's seam rows and UI slots are back in; `gen-tool-catalog` re-emitted `docs/tool-catalog.md` with da's 25 tools.
9. **`tsconfig.base.json`** — 11 hand-written da alias rows restored ahead of the generated block: 6 for client packages whose name does not match their directory, plus `dsh-embedder/src/*`, `dsh-retrieval/src/*`, `dsh-semantic-layer/src/*`, `dsh-result-cache/src/*`, `dsh-evidence-query/src/gateway.ts`.
10. **CI workflow** — kept the fork's `repository_owner == 'deepseek-ai'` owner gate in `issue-lifecycle.yml` (T6) and adopted upstream's new `edited` / `changes.body` condition; `scripts/ci-workflow.spec.ts` asserts the merged condition.
11. **Gate manifests** — da's gates (`gate-coverage`, `upstream-sync-record`, `architecture-graph`) survive in `run-gates.ts`; the `vendored-links` row was dropped because **upstream deleted that gate** (script, package script, and row are all absent at `upstream/master`); the merge plan's claim that it was a da gate was wrong.
12. **`gen-tool-catalog.ts`** — da's `tool-compute` manifest row now mounts `ctx.ptcRuntime` (the rename reaches gate manifests, not just package sources).

## 3. Defects the merge introduced, found and fixed here

13. **The data-agent bundle disabled an entry id that no longer exists.** `packages/bundle/data-agent/cordis.patch.yml` did `- id: code-runtime / disabled: true` before inserting `code-runtime-data-python`; upstream's base bundle now mounts that row as `- id: ptc-runtime`. `boot()` reports an unmatched patch through **`warn`, not an error**, so the data-agent profile would have mounted **both** PTC providers, racing to register `ctx.ptcRuntime`. Fixed, and `packages/bundle/data-agent/tests/patch-targets.spec.ts` now fails on any unmatched target.
14. **`tsconfig.base.json` lost 5 da aliases** → `evidence-query` could not resolve `@deepseek-ai/dsh-semantic-layer/src/relation-graph` (TS2307). Restored (item 9).
15. **`packages/eval/eval-cli/tsconfig.tests.json`** still referenced the deleted `code-runtime/code-runtime-worker-thread` → now `ptc-runtime/ptc-runtime-node`.
16. **`packages/code-runtime/README.i18n.yaml` was deleted by the merge** — git consumed it as the rename source for upstream's `packages/ptc-runtime/README.i18n.yaml` while da kept the group README pair. Restored and re-recorded.
17. **66 fork packages still declared `0.1.5-rc.2`** while upstream moved the root to `0.1.6-alpha.1`; `check-workspace-constraints` requires equality. All bumped.
18. **`scripts/gate-coverage.manifest.json`** did not know upstream's two new generators (`gen-workflow-guest`, `gen-dependency-catalog`) → da's gate-coverage gate failed. Exempted with their verify counterparts as cover.
19. **da docs pointed at moved siblings.** Rebased bilingually and re-recorded: the `code-runtime/` group README (now a two-package da family: data provider + released protocol), `code-runtime-data-python`, `code-runtime-python-protocol` (its "experimental provider consumes this package" claim is no longer true — upstream's provider carries its own protocol module), `tool-compute` (`ctx.ptcRuntime`), and the protocol-ownership Agent Note.

### From the first CI run (fixed in the same branch)

19a. **Upstream's issue automation asserted away the fork's owner gates.** `.github/issue-management/policy.test.mjs` gained two assertions: the `issue-policy.yml` policy job must carry no condition, and the `issue-lifecycle.yml` job's condition must be a folded scalar with upstream's two clauses. The fork gates both workflows on `github.repository_owner == 'deepseek-ai'` (no DSH issue App outside upstream). Resolution: the policy assertion now expects exactly that one condition, and the lifecycle job uses upstream's folded form with the owner gate first — **adopting upstream's review clause** and dropping the fork's extra `action == 'submitted'` guard.
19b. **Doc-sync-only catalogs were stale** (never covered by `test:docs`): regenerated `module-graph` and `persistence-catalog` (with `persistence-schema.json`).
19c. **`verify-package-paths`** flagged one da Agent Note citing the deleted `connection/src/client/fixture.ts`; it names the connection package's fixture transport instead.
19d. **`verify-export-jsdoc`**: `DataPythonCodeRuntime.run` took `request` while the declaring `PtcRuntime.run(spec)` documents `spec`, so the inherited doc stopped matching. The override now takes `spec`.
19e. **`gen-doc-graphs` mixed two designs.** Upstream generates the English graph pages and hand-maintains the Chinese ones; the fork's generator spliced a localized region into `BEGIN/END` markers that upstream's pages no longer carry. Resolution (your call): **adopt upstream's generator**, re-insert only da's 13 `SERVICE_ROLES` rows (its completeness guard needs them), regenerate the five English pages, and bring the Chinese pages along — the da rows' Chinese text came from the fork's own previous pages, and the event matrix's cells are language-neutral. `verify-doc-graphs` green, 1016 pairs consistent.
19f. **`duplication`**: upstream retired the ratio threshold and now fails on any clone. Fencing the by-design twin — da's released protocol package — with `jscpd:ignore-start/end` (on the da side only) dropped the tree from 0.49% to **0.32%**, under the fork's existing 0.338% threshold, so **no threshold change was needed** and the gate is green.
19g. **`test:snapshot`**: upstream added `scopeId` to `ToolExecutionInput`, so the recorded `cordis-inspect-jsdoc` session no longer matched what the live inspect tool reports. `DSH_SNAPSHOT=refresh` replayed the scenario keylessly and rewrote exactly one recorded line; the whole corpus replays green (4 files). The same job also hit `initialize timed out after 10000ms waiting for dsh profile "sdk"` on a different scenario in each CI run while passing locally both alone and under the full suite — recorded in UM18 as CI-load sensitivity, not weakened or retried.

## 4. Pre-existing fork debt this merge exposed

20. **`rescope-vendor` was already red on `origin/master`.** Running it rewrote 5 da files wrongly: `'cordis/request-run'`-style **event ids** in wayfinder records, the `GROUP_ORDER` **directory** name in `scripts/gen-architecture-graph.ts`, and a bare-token example in `scripts/rescope-fork.ts`. Fixed by registering those files in the codemod's own skip mechanism (upstream already skips its equivalents) plus a spec case; the corrupted files were restored.
21. **Two brand-new upstream prose gates** (`verify-repository-references`, `verify-concrete-terms` — neither script exists on `origin/master`) reported 1801 findings, **all in fork-authored text**. Resolution per your decision: da's records/data corpora are excluded (`wayfinder/`, the upstream-sync records, `docs/da-upstream-debt`, eval-case YAML where the term is a field name), and the 63 real wording violations were edited. Both gates are green.
22. **Two dead disable rows removed from the data-agent patch** (`tool-str-replace-editor`, `identity`): no shipped composition mounts either row, at this base or at the merge base, so both were no-ops that produced boot warnings.
22a. **Three gates stay red as fork content debt**, tracked in [UM18](../wayfinder/data-agent/tickets/phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md). The fork's CI on `master` failed in all five most recent runs, so these are the pre-merge baseline, not a regression: per-file coverage misses **167 da files**; `verify-config-catalog` needs a 901-line bilingual pass for da package `Config` blocks; `duplication` still carries **84 da clones** (green today only because the by-design twin is fenced).

## 5. Fork modifications to dsh that upstream's version replaced (report-only)

23. `boot/app-boot` — the fork's CB-1a `collectAggregateEntryFailures` boot diagnostic is gone. It is generic dsh behavior, so it can be offered upstream instead of re-forked.
24. `bash-local/executor`, `bash-sandbox/sandbox`, `session-projection-cache/cache` tests — the fork's flaky-fixes are gone; upstream's versions stand. If they flake on macOS, quarantine as upstream debt (Task 3), do not re-fix.
25. `experimental/ptc-runtime-python` — the fork's two added tests (`host-frame-parse-ceiling`, `protocol-compatibility`) are dropped; upstream's suite covers both surfaces.
26. `client/connection` — upstream removed the `?fixture` demo transport (`createFixtureConnectionRpc`), so T11's `case 'result/get'` arm went with it. Verified no da test or package depends on it; `apps/web/tests` "fixture" hits are unrelated scaffolding.

## 6. Open calls for you

27. **Rename da's own `code-runtime-*` packages to `ptc-runtime-*`?** Deferred: the group directory, `code-runtime-data-python`, and `code-runtime-python-protocol` keep their names, and `DataPythonCodeRuntime` keeps its class name. Only upstream's base classes and ctx key were adopted.
28. **The headless data-agent profile never applies the data-agent preset default.** `agent-presets` is a web-app row, so the bundle's preset override is inert on the headless surface that `scripts/setup-da-profile.sh` also creates. Pre-existing, not merge-caused; the new test records it explicitly.
29. **Rename the eval case field that upstream's vocabulary gate forbids?** The execution-grader note needs one narrow path exception because it names that field; renaming the field in the case format and loader would remove the exception.
30. **`upstream-sync.json` waivers** — the 7 owed remediations are re-evaluated in the next step of this sync; anything that survives the merge is restated there.

## 7. Verification at the time of writing

| Check | Result |
|---|---|
| `pnpm install` | green (lockfile reconciled) |
| `pnpm run typecheck` (host build + client program) | green |
| `pnpm run build:official` | green |
| `pnpm run test:docs` (21 doc gates) | green |
| `pnpm run rescope-vendor:check` | green |
| `pnpm run verify-translation-pairing` | green (1016 pairs) |
| `pnpm run verify-cordis-config` | green (189 files) |
| `pnpm run constraints` | green after the version bump |
| `gen-tool-catalog.spec`, `run-gates.spec`, `rescope-vendor.spec`, `patch-targets.spec` | green |
| `pnpm run hygiene` (18 gates) | green |
| Focused suites: `code-runtime`, `tool-compute`, `bundle/data-agent`, `api/remotes`, `ui-settings-models`, 5 gate specs | green (22 files, 555 tests) |
| `pnpm run duplication`, `pnpm run test:issue-management`, `verify-doc-graphs`, `verify-export-jsdoc`, `verify-package-paths`, `verify-module-graph`, `verify-persistence-catalog` | green |
| `pnpm run test:snapshot` (whole recorded corpus) | green (4 files, after the one-line fixture refresh) |
| PR #168 CI | first run 20 pass / 5 fail → the merge-caused four fixed in `2fa038f6e6` and this commit; the rest is [UM18](../wayfinder/data-agent/tickets/phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md) |
| Whole-suite `pnpm run test`, real-API e2e, Windows lanes | CI owns them |
