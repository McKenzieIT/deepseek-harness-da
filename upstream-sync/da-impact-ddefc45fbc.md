# da Impact Report — merge tag `dsh-v0.1.6-alpha.2` (ddefc45fbc) into the fork

- date: 2026-09-18
- base: `origin/master` `20940d6fb1` (record base `0d1f50007f`, 882 commits behind)
- target: tag `dsh-v0.1.6-alpha.2` → `ddefc45fbc7f8e46dd73185e68295696d1297887` (equals `upstream/master` exactly)
- branch: `upstream/resync-0.1.6-alpha.2`, merge commit `ce11b3929e4a` (two parents, topology preserved)
- upstream churn: 2548 files / +100218 / −23242 | conflicts: **25**, all resolved
- fork-only packages version-bumped `0.1.6-alpha.1` → `0.1.6-alpha.2`: **66**

Every item below is a place where upstream's change met da-owned content. Sections 3 and 6 are
the review gate: nothing there was resolved silently. Section 6 lists the calls left for you.

Two structural facts made this sync cheaper than the last one (666 commits, 59 conflicts, plus a
rename): upstream touched **zero** files under `packages/data/`, `packages/query/`, `packages/eval/`
or `packages/embedder/`, and there was no architectural rename. All 25 conflicts were fork-diverged
files, so the rule was uniform — take upstream's body, preserve the fork's own rows inside it.

## 1. Decisions you confirmed during this leg

| # | Decision | Where it landed |
|---|---|---|
| 1 | Sync first, coverage batch 2 after | this branch; coverage untouched here |
| 2 | Delete the two merged `upstream/resync-*` remnants, keep `-2026-09-17` (its worktree holds the session prompt) | `git branch -d` on `83be9786e1` and `1c6185d6f4`; recorded as batch 4 in the deletion manifest |
| 3 | Fix the snapshot regression fork-side and produce attribution evidence rather than accept a red lane | `240dd0db25` + the upstream-tag reproduction in item 16 |

## 2. da surfaces preserved through the merge

1. **`tsconfig.base.json`** — the 11 hand-written da alias rows sit above the
   `BEGIN generated package aliases` marker and were never in the conflict region; the two
   conflicting hunks were both inside the generated block. Adopted upstream's move of
   `tool-present` from `packages/fs/` to `packages/deliverables/` while keeping da's three
   `tool-present-*` aliases. `verify-tsconfig-paths` confirms the result is exactly what the
   generator emits. Alias count 511 → 526, **zero removed** (last sync silently dropped 5).
2. **`packages/api/remotes`** — kept da's `schema-gateway` / `evidence-query` / `result-cache`
   remote mounts and their manifest rows; adopted upstream's new `plugin-manager` and
   `office-to-pdf` mounts. All five imports verified present.
3. **`packages/api/remotes/tests/built-lib.e2e.ts`** — kept da's `evidenceQueryMounted` assertion
   and adopted upstream's `invalidResult`. This one needed care: upstream turned the throwing path
   into a returned Result and **deleted the `invalidRejected` binding**, which the auto-merged
   region above had already taken. A naive keep-both union would have compiled against a variable
   that no longer exists.
4. **`apps/cli/package.json`**, **`packages/bundle/web-app/package.json`**,
   **`packages/client/web/package.json`** — kept da's `dsh-data-agent`, `dsh-invariants` and `zod`
   rows respectively, took upstream's additions alongside.
5. **`scripts/check-workspace-constraints.spec.ts`** — kept da's bundle-owned data-agent preset
   payload test; took upstream's new client-chunk and payload assertions.
6. **Generated catalogs** — regenerated rather than hand-merged, so da's content came back from
   source: da's audit / embedder / identity / nl2sql / schema seam rows in
   `tool-cordis/src/api-catalog.ts` (+805 lines), da's **13** slot occupants in the client slot
   catalog (20 slot keys unchanged), da's **25** tools in `docs/tool-catalog.md`, da's **42**
   package sections in `docs/config-catalog.md`, and da's **13** `SERVICE_ROLES` rows in
   `docs/capability-seams.md` (the 152 fork lines in `scripts/gen-doc-graphs.ts` survived intact).

## 3. Defects the merge introduced, found and fixed here

7. **`ui-semantic-layer` stopped compiling** (`b23345b3a2`). Upstream reworked the Session
   Controller client contract: `SessionListState.current`/`currentAddress` are gone ("navigation
   belongs to view owners") and `ISessions.open`/`openSubagent`/`clear` were replaced by a
   retain/reference model (`retain`, `using`, `retainInfo`). da's fork-only package used both, so
   `tsc -b tsconfig.client.json` failed with two TS2339s. `sessions.open(id)` became
   `uiWorkspace.openSession(id)` — upstream's own replacement for the same action. `state.current`
   has **no public replacement** (the selection store is now private inside `ui-workspace`, and
   upstream's plugins read the displayed session from an Agent-scoped ctx, which a root-mounted
   plugin does not have), so the staged-preset flow now snapshots the id set and picks the id that
   appears afterwards. Behaviour is preserved and arguably narrowed — the old code applied the
   staged preset to whatever session happened to be current.
8. **Every generated artifact silently lost da's rows** (`93fe2f0771`, `ca4c089adf`). Resolving
   generated files take-upstream drops da's content by construction. The worst case was
   `docs/config-catalog.md`, where the fork's one-day-old 900-line bilingual pass (`dbb8682541`)
   went with it; `verify-config-catalog` re-reds and, under `DSH_GATE_FAIL_FAST`, aborts every
   later gate in the `static` lane. Regenerating restored the English side to 173 sections
   (131 upstream + 42 da).
9. **`docs/config-catalog.zh.md` has no generator.** Recomposed mechanically rather than
   re-translated (`dsh-translate-docs` is yours to trigger): upstream's current Chinese body for
   each of its 128 sections, master's Chinese body for each of the 42 da sections, the 24 da
   entries across the three trailing manifests (13 + 4 + 7), and anchors copied verbatim from the
   English side so ordering cannot drift. This was safe because upstream's only change to
   `gen-config-catalog.ts` in 882 commits was a one-line prose tweak, and 41 of the 42 da sections
   have a byte-identical English body to master (the 42nd, `dsh-nl2sql-engine`, differed only in
   its trailing anchor). Verified: 173 sections and 170 anchors on both sides, 0 structural
   mismatches, all 170 `ts config-catalog` fences byte-identical across languages, package-section
   set **and order** identical to English, no section dropped, 0 U+FFFD.
10. **The two graph pages** needed the same treatment, but each translates a different part —
    measured from the fork's own en/zh pair rather than assumed. `capability-seams`' mermaid block
    is language-neutral (copied verbatim from English) while its table header and Note column are
    translated; `event-producer-consumer`'s **both** tables are entirely language-neutral, so its
    Chinese tables are now byte-identical to English.
11. **`gen-tool-catalog.spec.ts`** carried upstream's expected tool list (`8e847ebc35`). Replaced
    with the actual catalog output collected through the spec's own `collectToolCatalog()` — 93
    names — rather than transcribed by hand.
12. **A stale `packages/fs/tool-present/` directory** broke `constraints`. Upstream moved that
    package to `packages/deliverables/`; the pre-merge baseline build had left `lib/` and
    `node_modules` behind, so the directory survived with 0 tracked files. Removed.
13. **`upstream-sync.json`** now records ddefc45fbc with `upstreamTag`, so the gate cross-checks
    the tag ref and not only the SHA.

### 16. The one that mattered: upstream's resolution-mode flip broke every snapshot lane

`pnpm run test:snapshot` went from green to **83 failed / 77 passed**, all with one message:

```
dsh: UNKNOWN: Cannot read properties of undefined (reading 'prepare')
```

Root cause, established at runtime rather than inferred. Upstream commit
`9ddef327a4 feat: resolution mode link to runtime` — committed **1h27m before the tag** — changed
the non-packaged default in `apps/cli/src/profile-boot.ts` from `?? 'link'` to `?? 'runtime'`.
A tsx launch exports `TSX_TSCONFIG_PATH`, whose `paths` map rewrites workspace imports to `src/`;
`runtime` mode resolves bare plugin names through package `exports` into built `lib/`. With both
active `@deepseek-ai/dsh-tools` is loaded **twice**, and `TOOL_RUNTIME_SCHEDULER` is a
module-scoped `Symbol()` (not `Symbol.for()`), so the ToolRuntime instance carries an own symbol
*described* `Symbol(@deepseek-ai/dsh-tools.scheduler)` while `agent-loop`'s lookup returns
`undefined` and every tool dispatch dies on `.prepare`.

**Attribution: upstream, with hard evidence.** The nine `resolutionMode` lines in
`profile-boot.ts` are byte-identical to upstream at the same line numbers (the file is otherwise
fork-diverged 99/175, but not there), and nothing in the repo passes `resolutionMode` explicitly.
A worktree checked out at the **pure upstream tag** — `packages/data` absent, build 0 errors —
reproduces the identical failure on the same scenario:

```
$ git worktree add --detach .worktrees/upstream-tag-alpha2 ddefc45fbc
$ pnpm install && pnpm run build:official
$ npx vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t "agent-instructions"
  Tests  1 failed | 121 skipped (122)
  stderr: dsh: UNKNOWN: Cannot read properties of undefined (reading 'prepare')
```

So upstream's own release breaks its own recorded corpus whenever it runs from source with built
libs present — which is exactly the worktree flow CLAUDE.md mandates, and what CI does.

**Fix (`240dd0db25`): the fallback backend now follows the launch mode.** Both launchers already
agree on the signal that means "source mode" — `loader-smoke`'s `src` mode sets
`TSX_TSCONFIG_PATH`, and the SDK's `resolveDshNodeLaunchFromManifests` sets it only on its source
branch (both files pure upstream and untouched by this merge). Upstream's new `runtime` default is
kept for plain-Node launches, where it is correct.

Pinning `link` unconditionally was tried and **rejected**: it inverts the failure, fixing the 62
headless/acp scenarios but breaking the 21 sdk ones, which launch the built bin under plain Node
and so legitimately need `runtime`. The launch-mode-aware default fixes both sets at once —
`test:snapshot` is now **4 files, 160 passed / 2 skipped, 0 `prepare` errors, 0 `failed to
import`**. The new spec case in `resolved-profile-boot.spec.ts` is mutation-checked: restoring
upstream's hardcoded `'runtime'` fails exactly that case (1 failed / 16 passed) and nothing else.

## 4. Pre-existing fork debt, re-confirmed not regressed

14. **`app-boot` CB-1a group-apply enumeration** still fails. Verified by running the same test on
    pre-merge master, where it also fails — matching UM18's record that this is pre-existing (the
    fork's `collectAggregateEntryFailures` diagnostic was replaced by upstream last sync, but the
    fork's test for it remains).
15. **Per-file coverage** is untouched by this leg — the 62-package backlog and the batch-2
    measurements stand. Worth noting for the next leg: all nine batch-2 target files (and
    `query/query`) are **still absent from upstream at ddefc45fbc**, so they remain 100% fork-owned
    and the recorded attribution survives the new baseline unchanged.
    **`duplication`** is green at 69 clones / 0.25% (threshold 0.338%), matching UM18's record;
    no fence and no threshold was touched.

## 5. Settled dispositions this merge does NOT reopen (probe-verified)

Each rests on upstream not having changed the file the disposition depends on:

| Settled item | File | Upstream in these 882 commits |
|---|---|---|
| §2.6 web keyless smoke batch count (expects 2, fork yields 3) | `apps/web/tests/smoke-real.e2e.ts` | **unchanged** |
| ↳ the constant that drives it | `packages/client/modules/src/index.ts` | changed (+73/−9) but **`MAX_COMBO_URL_BYTES` is still `3 * 1024`** |
| ptc-runtime-python 60s O(depth) budget | `packages/experimental/ptc-runtime-python/tests/runtime.spec.ts` | **unchanged** |
| terminal-bash TERM-ignoring descendant | `packages/terminal/terminal-bash/tests/local.spec.ts` | **unchanged** |
| doc-standard 5s budget | `scripts/doc-standard.spec.ts` | **unchanged** |
| "no da packages in the exemption list" | `scripts/coverage-exempt.ts` | **unchanged** (still verbatim upstream) |

Upstream did add package-local chunk routing to `client/modules` (`chunkUrl`, `chunkRequest`,
`CLIENT_CHUNK`, a `fileName` field on `ComboResource`) — new surface next to the partitioning
logic, so the *observed* batch count is worth re-reading from CI, but the 3072-byte ceiling did
not move and the disposition is unchanged.

## 6. Fork modifications to dsh that upstream's version replaced (report-only)

17. **`packages/extensions/tool-cordis/src/index.ts` — upstream retired the whole dynamic-cordis
    tool family.** Attribution is unambiguous: all seven `cordis_*` tools exist at the merge base,
    so the family is upstream content, and the fork's **only** edit to that file was a 16-line
    `ctx.effect()` wrapper around upstream's registrations. Upstream cut the file 533 → 83 lines,
    keeping only `cordis_inspect_list` and `cordis_inspect_query`, and moved the plugin lifecycle
    into the new `packages/boot/plugin-manager` (exposed as a `plugin_manager` tool, now present in
    the tool catalog). Taken wholesale per the highest principle. The fork's `ctx.effect()`
    wrapping — which made those registrations disposable — is gone with it; same category as last
    sync's CB-1a boot diagnostic, offered upstream rather than re-forked.
    **No da production code depends on the removed tools** (verified across `packages/data`,
    `query`, `eval`, the client UI packages, the data-agent bundle and presets).

## 7. Open calls for you

18. **Is the launch-mode-aware `resolutionMode` default the disposition you want long-term?**
    It is a one-expression fork-side compatibility shim for an upstream defect in an already
    fork-diverged file. The alternatives were a permanently red snapshot lane (rejected by the same
    reasoning that rejected accepting the sdk handshake failure) or an unconditional `link` pin
    (rejected because it breaks the sdk lane). Since the rule forbids PRs to upstream, this stays
    fork-side until upstream fixes it — at which point the shim should be revisited, because a
    future upstream release may make `runtime` correct for source launches too.
19. **Two wayfinder records now describe a superseded upstream mechanism.**
    `wayfinder/data-agent/research/harness-plugin-model.md:330-331` documents
    `cordis_define`/`cordis_run`/`cordis_stop`/`cordis_inspect` as the "dynamic in-process package"
    mode, and `wayfinder/interpretation-client-rendering/tickets/T5-...md:38` notes a P1 prototype
    was `cordis_stop`'d. Both are historical prose, not code dependencies, so nothing breaks — but
    if the research note is meant to describe the *current* harness, it now needs the
    `plugin_manager` story instead. Not touched here.
20. **Does da want to adopt `plugin_manager`?** Upstream's replacement for the retired family is a
    real capability the data-agent profile does not currently mount.
21. **Rename da's `code-runtime-*` → `ptc-runtime-*` is still blocked.** #167 and #114 are both
    still OPEN (verified this leg), so the prerequisite is unmet. The sync is now done, which was
    the ordering constraint recorded last leg, so the rename is unblocked the moment those two land.
22. **Coverage batch 2 is the next unit of work** and is ready to start on this new baseline — see
    item 15 for why its recorded attribution did not need recomputing.

## 8. Verification at the time of writing

| Check | Result |
|---|---|
| Pre-merge baseline `build:official` on the fresh worktree | green — so any red here is attributable to the merge |
| `pnpm install` | green (lockfile reconciled) |
| `pnpm run build:official` | green |
| `pnpm run typecheck` | green (0 errors) |
| `pnpm run constraints` | green after the 66-package bump |
| `pnpm run doc-sync` | **43 passed / 0 failed** |
| `pnpm run hygiene` | **18 passed / 0 failed** |
| `pnpm run verify-translation-pairing` | green — **1104 pairs**, all consistent |
| `pnpm run verify-config-catalog` | green (173 sections) |
| `pnpm run verify-doc-graphs` | green (6 docs) |
| `pnpm run verify-tsconfig-paths` | green |
| `pnpm run rescope-vendor:check` | green — 9436 files, no residue, idempotent |
| `pnpm run duplication` | green — 69 clones, 0.25% (threshold 0.338%) |
| `pnpm run verify-upstream-sync-record` | green — consistent with Git |
| `pnpm run upstream-status` | behind-count 0, 0 pending waivers, 0 owed remediations |
| `pnpm run test:snapshot` | **4 files, 160 passed / 2 skipped** (was 83 failed / 77 passed) |
| `apps/cli` + `app-boot` suites | 350 passed; 1 failure (`app-boot` CB-1a) reproduces on pre-merge master — pre-existing, see item 14 |
| `gen-tool-catalog.spec`, `resolved-profile-boot.spec` | green (10/10 and 17/17) |
| Whole-suite `pnpm run test`, real-API e2e, Windows lanes | CI owns them |
