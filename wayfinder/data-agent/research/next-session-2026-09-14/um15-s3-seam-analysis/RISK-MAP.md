# UM15 §3 — 3rd re-sync round combat map (RISK-MAP)

Synthesized from the 6 per-seam pre-analysis JSONs (`seam-{1..6}.json` in this dir) produced by the `um15-s3-seam-preanalysis` workflow (2026-09-13). The writer agent's StructuredOutput call failed, so this synthesis was authored directly from the raw JSONs.

**Window:** BASE `c389f96bf3a9` (upstream recorded sync tip, 2026-09-08) → NEW `c291e7961a51` (upstream tracking ref, 2026-09-10). 852 commits, all 6 seams touched (seam-1=40, seam-2=23, seam-3=27, seam-4=10, seam-5=19, seam-6=16). **Trigger: decisive GO** (852 >> 150 threshold; seam>0 hard-stop on all 6 incl. seam-3). This is the FIRST real-world exercise of the UM15 durable method.

**Reading order = priorityRank ascending (1 = tackle first).** All 6 seams high-confidence.

---

## Priority 3 — seam-2 (api/gateway + api/remotes) · MEDIUM · 0.5–1 session

Two decoupled themes: (1) `refactor(agent): make runtime identity explicit` — `TypertGatewayService.startRemoteEvent` no longer routes through `typert.contexts.identifyHost`; `TypertRemoteEventContext.agentId: string` becomes **required**. (2) `sessionFeedbackRemote` (from `dsh-command-feedback`) added to the api/remotes client mount-loop.

**Breaking:** `agentId` required (1 producer + test fixtures must supply); removal of the `identifyHost` delegate-to-Host fallback means a no-live-Agent invocation now raises `TypeError` instead of returning `{kind:'next'}` — any fork/plugin relying on the delegation path is silently broken.

**Top collisions (3 hot files):**
- **[high]** `packages/api/remotes/src/client/index.ts` — both-added-related: upstream inserts `sessionFeedbackRemote` between `messageFeedbackRemote` and `fileUploadsRemote`; fork adds `schemaGateway`/`evidenceQuery`/`resultCache`. → **union merge** (keep all 4 additions).
- **[high]** `packages/api/remotes/package.json` — both-added-related: union devDependencies (both added `@deepseek-ai/dsh-agent` — keep once), keep upstream version bump 0.1.5-rc.2, verify fork's `dsh-session` deps move.
- **[medium]** `packages/api/remotes/src/remote-events.ts` — both-added-related: take upstream's `goal/activation-changed` entry AND keep fork's `evidence/eval-run-completed` + the `import type {} from '@deepseek-ai/dsh-evidence-query'` augmentation.

**Approach:** Take-upstream-wholesale for `packages/api/gateway/**` (fork has zero commits there). Watchpoint: post-merge, grep fork-owned code for `TypertRemoteEventContext` / `.context.value` / `context.identity` and update construction sites. The 3 hot files get a **mechanical union** pattern. This is a PATTERN REPEAT of UM14's `workspaceFilesRemote` adoption — treat `sessionFeedbackRemote` the same way.

**Test hotspots:** `gateway-stream.host.spec.ts` (upstream rewrote — must pass with new pendingInvocation identity param), `gateway.host.spec.ts` (1-line trim), `remote-events.host.spec.ts` (upstream added goal/activation-changed + Agent-id assertions).

---

## Priority 3 — seam-6 (api/workspace-files) · MEDIUM · 0.5–1 session

**Semantic pivot:** "confined workspace file service (Agent-bound)" → "read-only file preview surface with header-derived scope (Session-bound)". 5 methods change param shape (`Agent` → `WorkspaceFileScope` with distinct wire lookup id) + 2 new methods appear.

**Breaking (6, the most of any seam):** wire ABI param shape change; client-side type `WorkspaceFileResource` **removed** (fork consumers import it); `createFileResourceProvider(remote, changes, sessions)` → `createFileResourceProvider(remote, changes)` (SessionLookup arg removed); `workspace-file/outside-workspace` now emitted only from `list` not `read`; bundle `inject` changes (`Agent` → `sessions` + `workspaceFileScope` lookup); new devDep `@deepseek-ai/dsh-session-persistence`.

**Top collisions (the hard part is OUT-of-seam call-site co-adaptation):**
- **[high]** `packages/client/ui-sidebar-textpreview/tests/fixtures.client.ts` — upstream-deleted-fork-still-imports: imports the now-removed `WorkspaceFileResource` type at lines 16, 48-49, 88, 113. Must port to `WorkspaceFileStat`.
- **[high]** `packages/client/ui-sidebar-files/src/client/face.ts:55` — upstream-changed-signature-fork-caller: `remote.workspaceFiles.list(sessionId, path, signal)` — fork passes `sessionId: SessionId`; upstream now expects a lookup-registered scope shape.
- **[low]** `packages/api/workspace-files/**` itself — fork has ZERO seam-local touches → take-upstream-wholesale on this path.

**Approach:** `git checkout c291e796 -- packages/api/workspace-files/` (take-upstream wholesale on the seam), then **immediately co-adapt 3 out-of-seam call sites** in the same/adjacent commit: `ui-sidebar-files/src/client/face.ts:55`, `ui-sidebar-textpreview/src/client/rpc.ts:85`, `ui-sidebar-textpreview/tests/fixtures.client.ts`. Confirm bundle wiring (`web-app/cordis.patch.yml` + `api/remotes/src/client/index.ts`) exposes `sessions`+`typert` for the WorkspaceFiles mount. Add `dsh-session-persistence` to the workspace catalog.

**Test hotspots:** `read-all.spec.ts` (new — readAll cap), `scope.spec.ts` (new — WorkspaceFileScope lookup + workspaceRoot fallback), `provider.client.spec.ts` (rewritten — 181-line churn, SessionLookup removal + absolute-address behavior change).

**Note:** the `absolute` address scope is now unsupported — if any fork feature relied on Session-current fallback for absolute URLs, plan a follow-up ticket.

---

## Priority 4 — seam-1 (bundle) · MEDIUM · 1 session

Upstream 0.1.5-rc.2 rollup. Themes: sdk-minimal shrinks (removes `fs-local` + `tool-str-replace-editor` rows); `AgentSetup` arity change (1→2 args); `ui-sidebar-textpreview` renamed to `ui-sidebar-documentpreview`.

**Breaking (3):** `AgentSetup` arity change breaks fork-owned single-arg callers (bench harnesses in `api/session-controller/tests/*.host.spec.ts` + `webhook/webhook/tests/*.spec.ts`); `ui-sidebar-textpreview` rename breaks any bundle patch referencing the old id/package; `fs-local`+`str-replace-editor` removal from sdk-minimal.

**Top collisions:**
- **[high]** `packages/bundle/web-app/cordis.patch.yml` — upstream-modified-fork-modified-adjacent: fork adds 4 additive insert rows (result-cache, ui-present-decomposition, ui-present-table, ui-suggest-followups).
- **[high]** `packages/bundle/web-app/package.json` — upstream-modified-fork-modified-adjacent: fork adds 6 workspace deps.
- **[medium]** `packages/bundle/web-app/src/index.ts` — upstream-refactored-fork-touched.

**Approach:** Three-way-manual for the 2 high-severity files (fork-additive shapes must survive). Take-upstream-wholesale for sdk-minimal/* + base/* + headless/* (fork has no shape to defend there). **GATE the merge behind fixing the 4 out-of-seam `AgentSetup` callers** (`session-presets`, `session-fork` host specs + `runtime`/`session` webhook specs) in the same landing commit — else global typecheck fails. Preserve `packages/bundle/data-agent/*` verbatim (fork-only). Re-run i18n pairing regen for the zh.md + i18n.yaml files.

**Test hotspots:** `sdk-minimal.spec.ts` (full row table), `headless.spec.ts` (bench harness — breaks on single-arg `options.setup`), `api/session-controller/tests/session-presets.host.spec.ts:~71` (out-of-seam AgentSetup caller, must migrate same-session).

**Sequence:** (a) merge NEW → working branch; resolve conflicts file-by-file in order web-app/cordis.patch.yml → web-app/package.json → sdk-minimal/* (take-upstream) → base/* → headless/*; (b) migrate the 4 AgentSetup call-sites to `(ownerCtx, agent)`; (c) re-run i18n regen; (d) run testHotspots; (e) `verify-cordis-config` green on all 5 bundles.

---

## Priority 4 — seam-3 (client/connection) · LOW · 0.5 session

**Despite 27 commits (the historically-breaking seam), this round is LOW severity** — the churn is small surgical fixture.ts changes, NOT the dual-refactor that broke UM14.

Themes: `transport-hooks.fetch` becomes OPTIONAL (widening — safe); `FixtureContextBreakdownProjection.systemTokens` semantics change (sourced from seeded system/message surface node, not `header.system`); `fx-alpha` tool-dispatch event vocabulary renamed (`code-dispatch` → `ptc-dispatch`); `goalView` signature adds `id` param (internal to fixture.ts).

**Top collisions:**
- **[medium]** `packages/client/connection/src/client/fixture.ts` — upstream-refactored-fork-touched-same-file-different-region: fork adds a 13-line island (`case 'result/get'` block after `case 'workspace/archiveSession'`, seeded by `63659a22d4 [UM-CONNECTION-FIXTURE-DEAD-APICLIENT]`).
- **[medium]** same file — fork-additive-must-survive: the `case 'result/get'` block is a **permanent fixture posture per UM-CONNECTION-FIXTURE-DEAD-APICLIENT Resolution** — do NOT delete or refactor it.
- **[low]** `packages/client/connection/src/client/index.ts` — upstream-modified-fork-untouched.

**Approach:** Take-upstream-wholesale for 6 of 7 files. Three-way-manual for `fixture.ts` ONLY: (a) start from upstream NEW's fixture.ts; (b) re-insert the 13-line `case 'result/get'` arm immediately after `case 'workspace/archiveSession'` (upstream preserves it — verified at NEW line 3998); (c) accept upstream's re-inclusion of the `createFixtureConnectionRpc` JSDoc (cosmetic); (d) verify `sessionErr` still in scope. Do NOT reconcile the JSDoc deletion (noise). Do NOT delete the `case 'result/get'` block.

**Test hotspots:** `fixture.client.spec.ts` (tightest guard — run first; upstream added `systemTokens > 0` + `goals/get` armed/disarmed + `disarmOnlyGoal()` timing hook), `client-apply.client.spec.ts` (new `transport?.rpc` short-circuit test ~:488), `tsc -p packages/client/connection/tsconfig.json` (UM-CONNECTION-FIXTURE-DEAD-APICLIENT closed 41 fixture errors — verify count stays 0).

**Historical:** seam-3 BROKE during UM14 — root cause was TWO upstream refactors landing simultaneously (not the case this round). The 27 commits this round are dominated by fixture.ts surgical changes.

---

## Priority 4 — seam-5 (api/remotes) · MEDIUM · 0.5–1 session

**Overlaps seam-2** (same package path `packages/api/remotes`). Two coordinated feature edges: (1) Agent-identity refactor — scoped-waterfall contract in `src/index.ts` now requires `request.agent` (rejects mismatched-owner scoped events with `TypeError`); (2) dispatch payload shape — `TypertRemoteEventInvocation['context']` now includes `agentId: agent.id`.

**Breaking:** scoped-waterfall clients that emit without `request.agent` (matching the routed carrier) now throw; fork's `dsh-schema-gateway`/`dsh-evidence-query`/`dsh-result-cache` waterfalls must be audited; test fixtures must construct agents with an `id`.

**Top collisions:**
- **[high]** `packages/api/remotes/src/client/index.ts` — both-added-related (same as seam-2's hot file).
- **[medium]** `packages/api/remotes/src/remote-events.ts` — both-added-related (same as seam-2's).
- **[low]** `packages/api/remotes/src/index.ts` — upstream-refactored-fork-untouched.

**Approach:** Three-way-manual (dominant) with fork-preserves-additive-only overlay. Take-upstream wholesale for `src/index.ts`, READMEs, `tests/remote-events.host.spec.ts` (fork unmodified). Union merge for `src/client/index.ts`, `src/remote-events.ts`, both tsconfigs (union of composite refs — take upstream's `command-feedback`+`goal`, keep fork's 5 data/identity refs). Take upstream version bump + union devDependencies. Keep fork wholesale for `src/types.ts`, `tests/built-lib.e2e.ts`, `tests/evidence-query-remote.client.spec.ts`. **Post-merge audit:** grep fork's emitter packages (schema-gateway, evidence-query, result-cache) for scoped-waterfall listeners; confirm each emit path attaches `request.agent` before `ctx.emit`.

**Runbook:** settle **seam-2 first** (the remote-api emitter changes), then seam-5 as its consumer downstream.

**Test hotspots:** `remote-events.host.spec.ts` (upstream added goal/activation-changed + mismatched-Agent rejection + reshaped fixture agent to `{id, ctx}` — run FIRST), `built-lib.e2e.ts` (fork W20 staticModules stub — verify module-register path), `evidence-query-remote.client.spec.ts` (fork-only — audit fixture agents for new `.id` requirement before running).

---

## Priority 6 — seam-4 (client/modules) · LOW · 0.25 session (15–20 min)

10 commits but 8 are release tags/merges/README proofreading. Only 2 substantive: deletes 2 local helper redefinitions (`parseDshClient`, `exactPackageSpecifier`) from `src/index.ts` + adds 2 exported helpers to `src/client/manifest.ts` (`optionalStringArray`, `stripClientSuffix`) + widens the re-export list in `src/client/index.ts`.

**Breaking:** none.

**Top collisions:** all **[low]** — `src/index.ts`, `src/client/manifest.ts`, `src/client/index.ts` are all upstream-refactored-fork-unchanged (fork blob === base blob byte-for-byte across the entire seam prefix → zero fork drift).

**Approach:** take-upstream-wholesale. Since fork tree == BASE tree byte-for-byte across the entire seam prefix, apply the 10 upstream commits' effect unchanged. **Schedule this seam LAST** (or in parallel with any zero-drift seam) — near-guaranteed clean apply, can serve as the merge-pipeline smoke-test. Keep it atomic (don't bundle with seam-3/seam-5) so bisect is trivial. After applying: verify `manifest.ts` exports 4 helpers, `client/index.ts` re-exports all 4, `src/index.ts` no longer redefines locally, `packages/client/tsdown.client.ts` still imports `optionalStringArray` cleanly (the one fork consumer outside seam-4).

**Test hotspots:** `node-half.client.spec.ts` (exactPackageSpecifier's new scheme rejection + parseDshClient parity), `loader.client.spec.ts` (boot-graph normalization), `scripts/verify-client-packages.ts` (uses `PARSER_PRELOAD_SOURCE = packages/client/modules/src/index.ts`).

---

## Suggested merge sequence (next session)

1. **seam-4 (client/modules)** — take-upstream-wholesale, 15 min, smoke-test the pipeline is healthy. (Can run in parallel with any zero-drift work.)
2. **seam-2 (api/gateway + api/remotes emitter half)** — 0.5–1 session; settle the Agent-identity refactor + `sessionFeedbackRemote` adoption FIRST.
3. **seam-5 (api/remotes consumer half)** — 0.5–1 session; downstream of seam-2; audit fork emitters for `request.agent`.
4. **seam-1 (bundle)** — 1 session; three-way the 2 high-severity web-app files + gate on the 4 AgentSetup caller migrations.
5. **seam-3 (client/connection)** — 0.5 session; take-upstream 6/7 files + three-way fixture.ts to preserve the `case 'result/get'` block.
6. **seam-6 (api/workspace-files)** — 0.5–1 session; take-upstream on the seam + co-adapt 3 out-of-seam call sites (ui-sidebar-files, ui-sidebar-textpreview). The hardest breaking-change set (6) but the seam-local merge is clean (zero fork drift); the work is the call-site co-adaptation.

**Total estimate:** ~3.5–5 sessions of merge work (seam-2+5 overlap; seam-4 is trivial). Plus verify + commit + push per seam. The 852-commit window is large but the per-seam analysis shows the actual merge work is bounded — the historical fear (seam-3) is LOW this round; the real difficulty is seam-6's out-of-seam call-site co-adaptation + seam-1's AgentSetup migration gate.

**Source data:** `seam-{1..6}.json` in this directory (full per-seam upstreamShift, forkOwnership, collisionPoints, conflictSeverity, recommendedApproach, testHotspots, historicalNote, openQuestions).
