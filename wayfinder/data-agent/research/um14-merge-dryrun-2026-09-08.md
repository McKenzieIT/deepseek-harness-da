# UM14 Re-sync Merge DRY-RUN — Conflict Confirmation

**Date:** 2026-09-08 · **Method:** actual `git merge --no-commit --no-ff` (line-level), read-only — ABORT after capture, temp worktree removed. Refines Track A's file-overlap (`upstream-resync-conflicts.md`).

## Scenario

| | ref | commit |
|---|---|---|
| ours (fork merge branch) | `upstream/merge-2026-09-07` | `558e6f4f66` ("chart UM re-sync + data-agent 改造 + durable 方法 flow") |
| theirs (upstream) | `upstream/master` | `c389f96bf3` (+449 since base) |
| merge-base | `git merge-base` | `d347e703` (matches Track A) |

Dry-run ran in a detached temp worktree at `/Users/mckenzie/workspace/dsh-resync-dryrun` (HEAD `558e6f4f66`), `git merge --no-commit --no-ff upstream/master` → exit 1 (conflicts, expected). Note: Track A analyzed the *earlier* merge commit `6b7610d45a`; this dry-run re-runs from the newer tip `558e6f4f66`. The UU set still maps cleanly onto Track A's 50 (see §4), so the fork-tip changes added no new overlapping files.

## Headline counts (actual merge)

| metric | value | source |
|---|---|---|
| Total unmerged paths | **36** | `git diff --name-only --diff-filter=U \| wc -l` |
| UU (real content/line conflicts) | **21** | `git status --short` code `UU` |
| AU (rename/relocation conflicts) | **15** | `git status --short` code `AU` |
| AA / UD / DU / DD | **0** | none |

Track A predicted **50** real conflict *candidates* (both-sides-touched files, 57 minus 7 artifacts). The dry-run shows only **21** of those became UU line-conflicts; **29** auto-merged cleanly (same file, different lines). The **15 AU rename conflicts are entirely OUTSIDE Track A's 50** — a blind spot of file-level overlap (path-renamed upstream, can't be seen by `comm` of path lists). This is the dry-run's key refinement over Track A.

## 1. The 21 UU real line-conflicts (manual resolution)

Hunk counts (`grep -c '^<<<<<<<'`); `↑` = upstream commits since base (Track A).

```
hunks  ↑   file
  73   2   packages/extensions/cordis-client-runner/src/client/slot-catalog.ts   [GENERATED]
  11  41   packages/extensions/tool-cordis/src/api-catalog.ts                    [GENERATED]
   6   3   packages/bundle/web-app/package.json
   3   3   packages/client/ui-layout/src/client/AppFrame.tsx
   2  15   tsconfig.host.json                          [BUILD-CRITICAL]
   2  28   scripts/gen-cordis-catalog.ts               [generator source]
   2   1   packages/client/web/src/seed.ts
   2   1   packages/api/remotes/src/client/index.ts
   1   1   scripts/doc-budgets.manifest.json
   1   7   pnpm-workspace.yaml
   1   1   packages/subagent/subagent/src/index.ts
   1   1   packages/client/web/src/platform.ts
   1   1   packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx
   1   1   packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx
   1   1   packages/client/ui-settings-models/package.json
   1   1   packages/client/ui-settings-models/README.zh.md              [docs]
   1   1   packages/client/ui-settings-models/README.md                 [docs]
   1   1   packages/client/ui-settings-models/README.i18n.yaml          [docs, merge-translation-pairing driver]
   1   1   packages/client/ui-layout/src/client/index.ts
   1   2   packages/api/remotes/package.json
   1   1   .github/workflows/build-preview-cloudflare.yml
```

All 21 are in Track A's 50 (no UU file is outside the predicted set).

## 2. The 15 AU rename conflicts (Track A missed — directory rename)

All 15 are `.agents/notes/rejected/simplification/2026-09-03-*.md`. Upstream renamed the directory `.agents/notes/proposed/simplification/` → `.agents/notes/rejected/simplification/`; the fork added these files in the old `proposed/` location, so git reports them as "added in HEAD inside a directory renamed upstream" and suggests moving to the `rejected/` path.

```
.agents/notes/rejected/simplification/2026-09-03-delete-unused-eval-core-runtime-stack.md
.agents/notes/rejected/simplification/2026-09-03-demote-audit-p8b-compliance-cluster.md
.agents/notes/rejected/simplification/2026-09-03-demote-scopeid-dormant-threading.md
.agents/notes/rejected/simplification/2026-09-03-fold-bm25-algorithm-into-shared-helper.md
.agents/notes/rejected/simplification/2026-09-03-fold-bm25linker-cache-across-search-tools.md
.agents/notes/rejected/simplification/2026-09-03-fold-compare-ts-runresult-types.md
.agents/notes/rejected/simplification/2026-09-03-fold-coverage-stats-domain-tally.md
.agents/notes/rejected/simplification/2026-09-03-fold-eval-cli-repo-root-resolvers.md
.agents/notes/rejected/simplification/2026-09-03-fold-looks-like-sql-regex.md
.agents/notes/rejected/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md
.agents/notes/rejected/simplification/2026-09-03-remove-basic-index-substrate.md
.agents/notes/rejected/simplification/2026-09-03-remove-dead-evidence-query-ui-surfaces.md
.agents/notes/rejected/simplification/2026-09-03-remove-live-engine-schema-seam.md
.agents/notes/rejected/simplification/2026-09-03-remove-nl2sql-engine-eval-subpackage.md
.agents/notes/rejected/simplification/2026-09-03-remove-w11-mvcc-snapshot-machinery.md
```

Resolution is mechanical: accept the renamed location (`git mv` / `git add` at the `rejected/` path). No line editing. These were **not** in Track A's 50 (file-level `comm` cannot see directory renames); this is the dry-run's blind-spot catch.

## 3. Track A 50 → manual vs auto-merged reconciliation

Of Track A's 50 real candidates: **21 UU (manual)**, **29 auto-merged**, **0 AU**.

**29 auto-merged (NOT in UU — git merged cleanly, same file different lines):**
```
package.json(20↑)  .github/workflows/ci.yml(14↑)  subagent-acp.spec.ts(13↑)
spawn.spec.ts(13↑)  apps/cli/package.json(9↑)  app-boot/src/index.ts(9↑)
agent-loop/src/index.ts(9↑)  bash-sandbox/sandbox.spec.ts(9↑)  bash-local/executor.spec.ts(7↑)
lsp-stdio/instance.spec.ts(6↑)  ci-master.yml(5↑)  tsconfig.client.json(5↑)  [BUILD]
web-app/cordis.patch.yml(4↑)  verify-package-readme-model-experience.ts(4↑)
tsconfig.base.json(4↑)  [BUILD]  .gitignore(2↑)  app-boot.spec.ts(2↑)
client/web/package.json(2↑)  agent/runtime-types.ts(2↑)  tools/src/index.ts(2↑)
subagent/src/types.ts(2↑)  gen-doc-graphs.ts(2↑)  docs/subsystems/README.md(1↑)
api/remotes/tsconfig.host.json(1↑)  connection/fixture.ts(1↑)
agent-loop/tool-calls.spec.ts(1↑)  tool-bash/tools.spec.ts(1↑)  tool-subagent/src/index.ts(1↑)
gen-tool-catalog.ts(1↑)
```

The two **build-critical tsconfigs that auto-merged** (`tsconfig.base.json` 4↑, `tsconfig.client.json` 5↑) are notable: Track A flagged all 3 as high-risk, but the dry-run proves base+client touched different lines than the fork → no conflict. Only `tsconfig.host.json` conflicts (see §5).

## 4. Build-critical tsconfig status (3)

| file | upstream commits | dry-run | resolution |
|---|---|---|---|
| `tsconfig.base.json` | 4 | **auto-merged** (not in UU) | none — fork & upstream touched different lines |
| `tsconfig.client.json` | 5 | **auto-merged** (not in UU) | none |
| `tsconfig.host.json` | 15 | **UU** (2 hunks) | additive union — see below |

`tsconfig.host.json` — both hunks are **additive path-glob / project-list unions**:
- Hunk 1 (~L103): HEAD adds `examples/*/src/**/*.ts`, `examples/*/tests/**/*.ts`; upstream adds `apps/desktop/scripts/**/*.ts`, `apps/desktop/tests/**/*.ts`, `benchmarks/**/*.ts`. → keep both sets.
- Hunk 2 (~L416): HEAD adds project `packages/examples/agent-spine-demo` + `apps/cli`; upstream adds `apps/cli`, `apps/desktop-host`, `apps/desktop`. → union of project paths.

Resolution complexity: **LOW** — pure union merges, no semantic conflict. Build-critical but trivially resolvable (keep all paths from both sides; de-dup `apps/cli`). Highest upstream churn (15↑) but cleanest conflict shape.

## 5. Cordis catalog status (the "scary" hotspots are GENERATED)

| file | ↑ | hunks | dry-run | nature |
|---|---|---|---|---|
| `packages/extensions/tool-cordis/src/api-catalog.ts` | 41 | 11 | UU | **GENERATED** — header: "Generated by scripts/gen-cordis-api.ts — do not edit by hand; run `pnpm run gen-cordis-api`" |
| `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` | 2 | **73** | UU | **GENERATED** — header: "Generated by scripts/gen-client-catalog.ts — do not edit by hand; run `pnpm run gen-client-catalog`" |
| `scripts/gen-cordis-catalog.ts` | 28 | 2 | UU | **generator source** (hand-edited) |

The 73-hunk `slot-catalog.ts` looked like the worst conflict in the set. It is a **generated artifact**: the 73 hunks are mechanical, not a 73-region manual merge. **Resolution = regenerate after merging the generator + its source inputs**, NOT hand-edit 73 regions. Same for `api-catalog.ts` (11 hunks → regen via `gen-cordis-api`).

`scripts/gen-cordis-catalog.ts` is the one real manual merge in the cordis surface — 2 hunks, both **additive** (both sides append entries to a `service → 'owner README path'` catalog map; fork adds data-agent services `retrieval`/`evalRunner`/`results`/`contextLayer`/`EvalResultStore`/…, upstream adds `resources`/`sidebarRight`/`WorkspaceFile*`). → union merge (keep both sets of catalog entries).

So the cordis "hotspot" (41↑+28↑+2↑ churn, 86 conflict hunks) collapses to: **1 small additive manual merge in the generator source + 2 regenerations**. The true cordis manual effort ≈ 2 hunks, not 86.

## 6. Complexity assessment

Real manual line-merge burden = **19 files** (21 UU minus the 2 generated catalogs):
- 2 build/critical-config: `tsconfig.host.json` (additive union), `pnpm-workspace.yaml` (1 hunk)
- 1 generator source: `gen-cordis-catalog.ts` (2 additive hunks)
- 6 ui-settings-models cluster (all 1-hunk, package-scoped): README.md/zh/i18n.yaml, package.json, onboarding spec, welcome-notice spec
- 4 web/client: `AppFrame.tsx`(3), `ui-layout/index.ts`(1), `platform.ts`(1), `seed.ts`(2)
- 2 api/remotes: `package.json`(1), `src/client/index.ts`(2)
- 4 misc 1-hunk: `bundle/web-app/package.json`(6), `subagent/src/index.ts`(1), `doc-budgets.manifest.json`(1), `build-preview-cloudflare.yml`(1)

**`bundle/web-app/package.json` (6 hunks)** is the densest non-generated file after AppFrame(3). Worth a closer look in Session A.

**Generated catalogs (2 files, 84 hunks)** → regen, not manual: `slot-catalog.ts`, `api-catalog.ts`.

**Rename conflicts (15 AU)** → mechanical `git mv`/`git add` at the `rejected/` path.

**`README.i18n.yaml`** — the `merge-translation-pairing` custom merge driver was unavailable in the bare dry-run worktree (no node_modules) and left an "ordinary text conflict". In a deps-present environment, `pnpm run resolve-translation-pairing-conflicts` may auto-resolve it. Treat as low-effort.

## 7. Feasibility confirmation

**The merge is DOABLE.** No semantic impossibilities; no file is conflicted beyond union/additive resolution or regeneration. The apparent worst-case (86 cordis hunks) is an illusion of generated files. True manual scope: 19 small files (mostly 1-hunk) + 1 build-critical additive union + 15 mechanical renames + 2 regenerations. Estimated manual effort: a focused session, not a multi-day effort.

## 8. Recommendation for Session A (resolution order + strategy)

Per merge-assistance discipline (build-critical first → generated catalogs via regen last):

1. **Build-critical tsconfig.host.json (2 hunks)** — union merge both path-glob hunks; de-dup `apps/cli`. Verify `tsc`/build host target immediately after.
2. **Workspace/config** — `pnpm-workspace.yaml` (1 hunk), `bundle/web-app/package.json` (6 hunks), `api/remotes/package.json` (1). Get pnpm install + workspace resolution green before touching code.
3. **Rename conflicts (15 AU)** — `git mv` fork's `proposed/simplification/2026-09-03-*.md` → `rejected/simplification/` (accept upstream's directory rename). Mechanical; do as a batch.
4. **Source inputs that feed the generators** — `api/remotes/src/client/index.ts` (2), `ui-layout/src/client/index.ts` (1), `AppFrame.tsx` (3), `client/web/src/platform.ts` (1), `seed.ts` (2). These are the real code merges; resolve first because they are inputs to catalog regen.
5. **Generator source** — `scripts/gen-cordis-catalog.ts` (2 additive hunks, union). Resolve before regen.
6. **ui-settings-models cluster (6)** — package-scoped, mostly additive; `README.i18n.yaml` try the `resolve-translation-pairing-conflicts` script first, fall back to manual.
7. **Remaining 1-hunk files** — `subagent/src/index.ts`, `doc-budgets.manifest.json`, `build-preview-cloudflare.yml`.
8. **Regenerate catalogs (LAST)** — after all source inputs + generator are merged: `pnpm run gen-client-catalog` (→ slot-catalog.ts), `pnpm run gen-cordis-api` (→ api-catalog.ts). This resolves the 84 generated hunks for free. Verify freshness via `verify-client-catalog` / `verify-cordis-api`.
9. **Verify** — `tsc` green (host target), `pnpm install` clean, catalog freshness checks pass, then commit the merge.

**Key gotcha for Session A:** do NOT hand-merge `slot-catalog.ts`/`api-catalog.ts` — they are generated; any manual edit will be overwritten by regen and freshness-gating will flag the drift. Merge the generator + inputs first, regen last.

---

*Dry-run was read-only: `git merge --abort` + `git worktree remove --force` executed after capture. No permanent state left in the merge branch.*
