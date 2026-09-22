# UM15 §3 3rd re-sync — merge dry-run report

Source: read-only `git merge-tree --write-tree` dry-run (2026-09-13, subagent `a5111f0989749d770`, 25K tokens). This dry-ran the actual 3-way merge the next session will perform — **did NOT land** (no worktree/index/HEAD touched).

## Methodological note (important)

`git merge-tree --write-tree c389f96bf3a9 c291e7961a51` (BASE vs NEW) returns **clean fast-forward** — useless for conflict discovery, because BASE is a direct ancestor of NEW (linear 852-commit upstream progression). The **meaningful** dry-run is `git merge-tree --write-tree 6695ed150e c291e7961a51` (FORK HEAD vs NEW), whose merge-base is BASE — the actual 3-way merge. All analysis below uses this. `--write-tree` writes a loose tree object but does NOT touch the worktree/index/HEAD (read-only). Fork-additive-shape verification done by inspecting blobs in the resulting tree `9820baebad1c714f3d551071b245af95aa0c5d5d` via `git show`.

## Conflict summary

- **Total content conflicts: 39** (all `CONFLICT (content)`; **zero** modify/delete, rename/rename, or add/add).
- **In-seam conflicts (within the 6 RISK-MAP seam paths): 2 files** — both in seam-2/5 (`packages/api/remotes/`).
- **In-seam predicted collisions that auto-merged CLEANLY: 4 files** (good surprises — seam-1 ×2, seam-2/5 ×1, seam-3 ×1).
- **In-seam zero-drift (clean take-upstream, no merge needed):** seam-2 gateway-half (9 upstream files, 0 fork), seam-4 client/modules (7 upstream files, 0 fork), seam-6 api/workspace-files (25 upstream files, 0 fork seam-local).
- **RISK-MAP-missed collisions: 37 files** — all outside the 6 seam paths (docs/translation-pairing, scripts, ui-layout, ui-settings-models, extensions, typert, test-support, tsconfig, manifests).

Per-seam conflict count: seam-1=0 (2 predicted auto-merged), seam-2=2 (1 confirmed + 1 predicted auto-merged + gateway-half clean), seam-3=0 (1 predicted auto-merged), seam-4=0, seam-5=0 (overlaps seam-2's 2; 1 predicted auto-merged), seam-6=0 (seam-local clean; co-adaptation is build-time).

## Per-seam (RISK-MAP's suggested order: seam-4 → seam-2 → seam-5 → seam-1 → seam-3 → seam-6)

### seam-4 (client/modules) — 0.25 session · 0 conflicts
Zero fork drift (`git diff BASE..HEAD -- packages/client/modules/` = empty). Take-upstream-wholesale. Verify `manifest.ts` exports 4 helpers, `client/index.ts` re-exports all 4, `tsdown.client.ts` imports `optionalStringArray`. RISK-MAP CONFIRMED.

### seam-2 (api/gateway + api/remotes emitter half) — 0.5–0.75 session · 2 conflicts
- `packages/api/remotes/src/client/index.ts` — CONFIRMED [high]. Conflict: fork mount-array (`schemaGatewayRemote, evidenceQueryRemote, resultCacheRemote`) vs upstream's (`pluginInventoryRemote, messageFeedbackRemote, sessionFeedbackRemote, fileUploadsRemote, sessionReferencesRemote`). All 4 imports coexist in import block. **Three-way-manual (mechanical union)** — take upstream's mount list + append fork's 3. PATTERN REPEAT of workspaceFilesRemote adoption.
- `packages/api/remotes/package.json` — CONFIRMED [high]. **Three-way-manual (union devDeps)** — keep `@deepseek-ai/dsh-agent` once, take upstream version bump 0.1.5-rc.2, verify fork's `dsh-session` deps move.
- `packages/api/remotes/src/remote-events.ts` — predicted [medium]; **AUTO-MERGED cleanly**. Verified merged blob preserves fork's `evidence/eval-run-completed` (L39) + `import type {} from '@deepseek-ai/dsh-evidence-query'` augmentation (L15) + upstream's `goal/activation-changed` (the union RISK-MAP wanted, for free).
- Gateway half: 9 upstream-changed files, 0 fork → take-upstream-wholesale.
- **Breaking change gating (not a git conflict):** `agentId` now required + `identifyHost` delegate removed — audit fork/plugin code for `TypertRemoteEventContext` construction sites post-merge.

### seam-5 (api/remotes consumer half) — 0.5 session · 0 new conflicts
Overlaps seam-2's 2 files; `src/index.ts` is upstream-refactored-fork-untouched → clean take-upstream. Reduces to post-merge audit of fork emitters (`dsh-schema-gateway`, `dsh-evidence-query`, `dsh-result-cache`) for `request.agent` attachment. Run `remote-events.host.spec.ts` FIRST (upstream added mismatched-Agent rejection + reshaped fixture agent to `{id, ctx}`).

### seam-1 (bundle) — 0.5–0.75 session (down from 1) · 0 conflicts
Both [high] predicted collisions auto-merged cleanly:
- `packages/bundle/web-app/cordis.patch.yml` — predicted [high]; **AUTO-MERGED**. Verified merged blob has 0 leftover conflict markers + preserves all 4 fork additive rows: `result-cache` (L354), `ui-present-decomposition` (L358), `ui-present-table` (L362), `ui-suggest-followups` (L366).
- `packages/bundle/web-app/package.json` — predicted [high]; **AUTO-MERGED**. Verified `@deepseek-ai/dsh-client-result-cache` (L54) + all fork workspace deps present.
- `packages/bundle/web-app/src/index.ts` (predicted [medium]): upstream changed, fork did NOT touch (RISK-MAP over-prediction). Clean take-upstream.
- `packages/bundle/data-agent/cordis.patch.yml` (the fork-additive file, distinct from web-app's): fork-only (upstream diff on `packages/bundle/data-agent/` empty). Zero merge risk; preserved verbatim. Has its own `result-cache-memory`/`result-cache-gateway` rows.
- Remaining seam-1 work = **out-of-seam AgentSetup caller migration gate** (4 call-sites in session-controller + webhook specs) + i18n regen, NOT merge resolution. Migrate 4 AgentSetup callers to `(ownerCtx, agent)`. Re-run i18n pairing regen.

### seam-3 (client/connection) — 0.25 session (down from 0.5) · 0 conflicts
- `packages/client/connection/src/client/fixture.ts` — predicted [medium]; **AUTO-MERGED**. Verified merged blob preserves the fork's 13-line `case 'result/get':` island at **L3999**, immediately after `case 'workspace/archiveSession'` (exactly where RISK-MAP's runbook wanted it re-inserted). The "three-way-manual re-insertion" RISK-MAP prescribed is **unnecessary** — git already did it.
- `packages/client/connection/src/client/index.ts` (predicted [low]): upstream-only change, clean take-upstream.
- Historically-feared seam is even cleaner than RISK-MAP's LOW assessment. Take-upstream-wholesale for all 7 files. Verify `fixture.client.spec.ts` passes (upstream added `systemTokens > 0` + `goals/get` armed/disarmed + `disarmOnlyGoal()`). Do NOT delete the `case 'result/get'` block (permanent fixture posture per UM-CONNECTION-FIXTURE-DEAD-APICLIENT Resolution).

### seam-6 (api/workspace-files) — 0.5–1 session · 0 conflicts
Upstream changed 25 files; fork touched **zero** seam-local. Clean take-upstream-wholesale. Work = 3 **out-of-seam call-site co-adaptations** (build-time, NOT git conflicts — as RISK-MAP predicted):
- `packages/client/ui-sidebar-textpreview/` → renamed to `ui-sidebar-documentpreview` (upstream rename, R068/R082/R085/R056/R088 similarity scores). Fork does NOT modify `fixtures.client.ts` (empty fork diff) — only imports from it. Git's rename applies cleanly, but **fork import paths break at build-time**. Co-adaptation = update imports to the new package name.
- `ui-sidebar-files/src/client/face.ts:55` — signature change, post-merge typecheck breakage.
- Bundle wiring must expose `sessions` + `typert` for the WorkspaceFiles mount.
- Add `dsh-session-persistence` to workspace catalog. Note: `absolute` address scope now unsupported (plan follow-up ticket if fork relied on it).
- RISK-MAP CONFIRMED. Hardest breaking-change set (6) but zero merge-resolution work in-seam.

## RISK-MAP-missed collisions (37 files, all outside the 6 seams)

### Category A — Translation-pairing docs (16 files, routine, repo-tooled)
`docs/capability-seams.{i18n.yaml,zh.md}`, `docs/config-catalog.md`, `docs/event-producer-consumer.{i18n.yaml,md,zh.md}`, `docs/module-graph.{i18n.yaml,md,zh.md}`, `docs/subsystems/README.zh.md`, `docs/tool-execution-pipeline.{i18n.yaml,md,zh.md}`, `packages/client/ui-settings-models/README.{i18n.yaml,md,zh.md}`. The repo's custom `merge-translation-pairing` driver detected these (5 explicitly flagged in merge-tree output). Resolvable via `pnpm run resolve-translation-pairing-conflicts` + `verify-translation-pairing --write`. Voluminous but mechanical. **~0.5 session.**

### Category B — Manifest/lockfile/tsconfig version-bumps (5 files, routine union)
`apps/cli/package.json` (fork +14/-3, upstream +2/-1), `packages/client/ui-settings-models/package.json`, `python/sdk-runtime/package.json`, `pnpm-lock.yaml`, `tsconfig.base.json` (fork **+118 additive** path mappings — fork-preserves-additive-only; verify upstream's +13/-3 doesn't overlap). **~0.25 session.**

### Category C — Fork-divergent source/test files (11 files, substantive three-way)
- **HIGH:** `packages/extensions/tool-cordis/src/api-catalog.ts` — fork **+787/-12**, upstream +138/-63. Fork's catalog scaffolding heavily overlaps upstream's catalog regen. Likely a **regenerated artifact** — resolvable by taking upstream's generator + re-running the fork's regen rather than manual three-way.
- **MEDIUM:** `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` (fork +72, upstream +321/-96), `scripts/gen-doc-graphs.ts` (fork +175, upstream +21), `packages/typert/generator/src/analyzer.ts` (fork +26, upstream +143/-55), `packages/test-support/session-snapshot/src/harness.ts` (fork +37/-10, upstream +22/-18), `packages/client/ui-settings-models/tests/apply.client.spec.ts` (fork +68/-46, upstream +30/-45), `packages/client/ui-layout/src/client/index.ts` (fork +9 additive), `.github/workflows/ci-master.yml` (upstream +45/-8, fork +4 — preserve fork's CI tweak).
- **LOW:** `packages/client/ui-layout/src/client/AppFrame.tsx` (fork +2/-1 — nearly take-upstream), `packages/subagent/.../scoped-tool-subagent.ts` (fork +1/-1), `packages/core/tools/tests/gen-tool-catalog.spec.ts` (fork +17, upstream +1), `packages/client/ui-settings-models/tests/{onboarding-dialog.client.spec.tsx,welcome-notice.client.spec.tsx}`.

### Category D — Scripts (3 files, fork-dominant generator extensions)
`scripts/gen-cordis-catalog.ts` (fork +77, upstream +6), `scripts/gen-doc-graphs.ts` (fork +175, upstream +21 — also Cat C), `scripts/verify-package-readme-model-experience.ts` (fork +60, upstream +4). Fork's catalog/doc-graph scaffolding overlapping upstream's generator tweaks. Fork-dominant; three-way with fork-preserves-additive.

### Category E — misc (2 files)
`.gitignore` (fork +23 additive, upstream +1 additive — trivial union).

**Key missed-collision flag:** Categories C+D are dominated by **regenerated catalog/doc-graph artifacts** (fork commits `4c34ceabb1 regen slot-catalog`, `193b018827 regen api-catalog`, `4d4f725748 gen-doc-graphs zh emission`). The `tool-cordis/src/api-catalog.ts` +787-line fork stake is almost certainly a regen output, not hand-authored. Resolution strategy: take upstream's **generator** changes, then re-run the fork's regen scripts to produce a fresh merged catalog — NOT manual three-way on 787 lines. This reframes the hardest-looking missed collision as a regen-pipeline task, not a merge task.

## Ready-to-merge verdict

**The merge is SAFE to proceed, and the in-seam core is CLEANER than RISK-MAP predicted — but the conflict surface is BROADER than RISK-MAP scoped.**

Positives:
- No scary conflict types (zero modify/delete, rename/rename, add/add). All 39 are plain content conflicts.
- 4 of 6 RISK-MAP-predicted hot collisions auto-merged cleanly with fork-additive shapes surviving verbatim (verified): cordis.patch.yml, web-app/package.json, remote-events.ts, fixture.ts. Seam-1 and seam-3 are lighter than feared.
- All 3 zero-drift seams confirmed (seam-2 gateway, seam-4, seam-6) — clean take-upstream.
- The 2 actual in-seam conflicts are exactly the mechanical unions RISK-MAP predicted (api/remotes src/client/index.ts + package.json).
- The out-of-seam co-adaptations are build-time, not git conflicts — as RISK-MAP stated.

Surprises warranting re-planning:
- RISK-MAP scoped only the 6 upstream seams and missed 37 fork-vs-upstream conflicts in fork-active areas (docs, scripts, extensions, ui-layout, ui-settings-models, typert, test-support, tsconfig). These are NOT dangerous (mostly routine docs/version-bumps + regenerated artifacts), but they roughly **double the conflict-resolution workload** RISK-MAP estimated.
- The hardest-looking missed collision (`tool-cordis/src/api-catalog.ts`, fork +787) is a regenerated artifact, not hand-written — manageable via re-running the fork's catalog/doc-graph regen pipeline after taking upstream's generator, not via manual three-way.
- `tsconfig.base.json` has a fork +118-line additive block (path mappings) that must survive — RISK-MAP didn't flag it.

**Recommendation:** The actual `git merge` (next stateful session) **can proceed**. RISK-MAP's in-seam sequence (seam-4 → seam-2 → seam-5 → seam-1 → seam-3 → seam-6) remains valid for the in-seam work, but the resolution plan must be **augmented with a parallel "fork-divergent surface" workstream**:
1. **Translation-pairing docs pass** (16 files) — run `resolve-translation-pairing-conflicts` early; unblocks typecheck. ~0.5 session.
2. **Manifest/lockfile/tsconfig union pass** (5 files) — mechanical; preserve tsconfig.base.json's +118 fork block. ~0.25 session.
3. **Regenerated-artifact pass** (api-catalog.ts, slot-catalog.ts, gen-cordis-catalog.ts, gen-doc-graphs.ts) — take upstream generators, re-run fork regen. ~0.75–1 session.
4. **Fork-source three-way pass** (analyzer.ts, harness.ts, ui-settings-models tests, ui-layout, ci-master.yml, etc.) — genuine manual three-ways. ~0.75–1 session.

The fork-divergent surface is **independent of the 6 seam paths** and can be tackled in parallel with the in-seam sequence without cross-blocking.

## Updated per-seam effort estimate

| Seam | RISK-MAP est. | Dry-run revised | Delta reason |
|------|--------------|-----------------|--------------|
| seam-4 | 0.25 session | 0.25 session | unchanged (zero drift confirmed) |
| seam-2 | 0.5–1 session | 0.5–0.75 session | remote-events.ts auto-merged; only 2 mechanical unions + Agent-identity audit remain |
| seam-5 | 0.5–1 session | 0.5 session | remote-events.ts auto-merged; reduces to post-merge emitter audit |
| seam-1 | 1 session | 0.5–0.75 session | cordis.patch.yml + package.json auto-merged (fork rows survived); remaining = AgentSetup caller gate + i18n regen |
| seam-3 | 0.5 session | 0.25 session | fixture.ts auto-merged (`case 'result/get'` survived at L3999); take-upstream 7/7 |
| seam-6 | 0.5–1 session | 0.5–1 session | unchanged (seam-local clean; work = 3 call-site co-adaptations) |
| **In-seam subtotal** | **3.5–5 sessions** | **~2.5–3.5 sessions** | 4 over-predicted hot files auto-merged |
| **+ Missed surface** | (not counted) | **~2.25–2.75 sessions** | 16 docs + 5 manifests + ~14 source/script three-ways |
| **TOTAL** | **3.5–5 sessions** | **~4.75–6.25 sessions** | broader surface, but each piece is cheaper |

**Bottom line:** The merge is as predicted by RISK-MAP **for the 6 seams** (and actually cleaner — 4 hot files auto-merged). The surprises are all **outside** RISK-MAP's seam scope: 37 additional conflicts in fork-divergent areas, dominated by routine translation-pairing docs and regenerated catalog artifacts. None are architecturally dangerous. Proceed with RISK-MAP's in-seam sequence, augmented by the 4-pass fork-divergent workstream above. No re-planning of the in-seam sequence is needed; the augmentation is additive.

## Relevant file paths

- RISK-MAP: `wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/RISK-MAP.md`
- Per-seam JSONs: `wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/seam-{1..6}.json`
- Verified fork-additive survivals (in merge tree `9820baebad1c`): `packages/bundle/web-app/cordis.patch.yml` (L354–367), `packages/client/connection/src/client/fixture.ts` (L3999), `packages/api/remotes/src/remote-events.ts` (L15,39), `packages/bundle/web-app/package.json` (L54)
- The one real in-seam conflict: `packages/api/remotes/src/client/index.ts` (fork side L167, upstream side L170)
- Hardest missed collision: `packages/extensions/tool-cordis/src/api-catalog.ts` (fork +787, regenerated artifact)
