# Upstream Merge Plan — sync `master` → `dsh-v0.1.6-alpha.2` (ddefc45fbc)

- date: 2026-09-18
- record-base: `0d1f50007f` (current `upstream-sync.json`, past tag `dsh-v0.1.6-alpha.1`)
- target: tag `dsh-v0.1.6-alpha.2` → `ddefc45fbc7f8e46dd73185e68295696d1297887` (2026-09-17 21:19:19 +0800)
- branch: `upstream/resync-0.1.6-alpha.2` (tag-style name; the date-style `upstream/resync-2026-09-18` was already taken by a merged remnant, since deleted)
- upstream commits to merge: **882** | upstream churn: **2548 files / +100218 / −23242**
- fork-only commits: **1263** | files both sides touched: **90** | **conflicts on probe: 27**
- owed waiver remediations: **0** (all 7 from the previous sync were settled in that leg)

Every number above was re-derived with git in this leg, not carried over from the handoff.
The target equals `upstream/master` exactly, so "merge the latest tag" and "merge upstream/master"
are the same operation here.

## What makes this sync cheaper than the last one

The previous sync (666 commits) carried an architectural rename (`code-runtime` → `ptc-runtime`) and
hit 59 conflicts. This one has **no rename and 27 conflicts**. Two probe results explain why:

1. **Upstream touched none of da's own trees.** `git diff --name-only 0d1f50007f ddefc45fbc` returns
   zero paths under `packages/data/`, `packages/query/`, `packages/eval/`, `packages/embedder/`.
   da's package families are untouched by these 882 commits.
2. **All 27 conflicts are fork-diverged files** — by definition, since a conflict needs both sides to
   have edited the file. So the resolution rule is uniform: take upstream's body, preserve the fork's
   own rows/branches inside it. There is no "which name wins" question this round.

Upstream's churn concentrates in `packages/client` (657 files), `apps/desktop` (289), `apps/web` (114),
`packages/api` (84), `packages/boot` (55), plus two new package families (`packages/deliverables` +2874,
`packages/skill` +1220). By commit type: 208 fix, 98 feat, 78 test, 70 refactor, 56 docs.

## Conflict resolution table (27 files, 6 groups)

### A. Bilingual generated doc pairs — 14 files
`docs/capability-seams.{md,zh.md,i18n.yaml}`, `docs/config-catalog.{md,zh.md,i18n.yaml}`,
`docs/event-producer-consumer.{md,zh.md,i18n.yaml}`, `docs/module-graph.{md,zh.md,i18n.yaml}`,
`docs/persistence-catalog.i18n.yaml`, `docs/subsystems/README.i18n.yaml`

These are generator output plus a hand-maintained Chinese side. Resolve by **regenerating, not by
hand-merging hunks**: take upstream's generators, re-run them, then re-record the pairing.

**`docs/config-catalog.*` is the landmine.** The fork closed this gate only on 2026-09-17
(commit `dbb8682541`): `gen-config-catalog` added **42 da package sections (~900 lines)** plus 24
trailing-manifest entries, and the Chinese side was filled in **in place** under the pairing contract
(163 `ts config-catalog` fences byte-identical, existing label rendering reused). A naive
take-upstream on this file silently reverts that entire pass and re-reds `verify-config-catalog` —
which, with `DSH_GATE_FAIL_FAST: 1`, aborts every later gate in the `static` lane. Verify after
resolving that all 42 da sections are still present.

Note also the merge driver's own structural warnings from the probe (`docs/subsystems/README`,
`docs/persistence-catalog`): "clean merges diverge structurally: link target diverges between the
pair" — the `.md` side links `boot.md` while the `.zh.md` side links `boot.zh.md`. Resolve the owner
files first, then `pnpm run verify-translation-pairing --write <pair>`.

### B. Generated catalogs — 3 files
`packages/extensions/tool-cordis/src/api-catalog.ts`,
`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`,
`packages/core/tools/tests/gen-tool-catalog.spec.ts`

Regenerate (`gen-cordis-api`, `gen-client-catalog`, `gen-tool-catalog`) rather than hand-merge. da's
seam rows (audit/embedder/identity/nl2sql/schema) and da's client UI slots come back from the
generators. Confirm da's 25 tools reappear in `docs/tool-catalog.md`.

### C. Manifests and lockfile — 5 files
`apps/cli/package.json`, `packages/api/remotes/package.json`,
`packages/bundle/web-app/package.json`, `packages/client/web/package.json`, `pnpm-lock.yaml`

Keep da's dependency rows, take upstream's. Delete-and-regenerate the lockfile via `pnpm install`.

**Version bump, measured this leg:** upstream's release commit moved the root and its own 287
packages to `0.1.6-alpha.2`; **67 fork-only packages stay at `0.1.6-alpha.1`** and must be bumped,
because `check-workspace-constraints` requires equality. (Last sync the equivalent number was 66;
one da package has been added since.)

### D. Root TypeScript config — 1 file
`tsconfig.base.json`

**The known landmine.** This merge dropped 5 da aliases last time (da-impact item 14: `evidence-query`
could not resolve `@deepseek-ai/dsh-semantic-layer/src/relation-graph`, TS2307). The file carries **11
hand-written da alias rows ahead of the generated block** — 6 for client packages whose name does not
match their directory, plus `dsh-embedder/src/*`, `dsh-retrieval/src/*`, `dsh-semantic-layer/src/*`,
`dsh-result-cache/src/*`, `dsh-evidence-query/src/gateway.ts`. Count them before and after.

### E. da-owned source and tests inside dsh packages — 3 files
- `packages/api/remotes/src/client/index.ts` — keep da's `schema-gateway` / `evidence-query` /
  `result-cache` remote mounts; take upstream's additions.
- `packages/api/remotes/tests/built-lib.e2e.ts` — same, on the test side.
- `packages/extensions/tool-cordis/src/index.ts` — keep da's seam wiring; take upstream.

### F. Gate spec — 1 file
`scripts/check-workspace-constraints.spec.ts` — keep da's package rows, take upstream's assertions.

## Dispositions this merge does NOT reopen (probe-verified)

Each of these was settled in an earlier leg. The probe confirms upstream did **not** change the file
the disposition rests on, so each still holds and must not be re-litigated:

| Settled item | File | Upstream in these 882 commits |
|---|---|---|
| §2.6 web keyless smoke batch count (expects 2, fork yields 3) | `apps/web/tests/smoke-real.e2e.ts` | **unchanged** |
| ↳ the constant that drives it | `packages/client/modules/src/index.ts` | changed (+73/−9) but **`MAX_COMBO_URL_BYTES` is still `3 * 1024`** |
| ptc-runtime-python 60s O(depth) budget | `packages/experimental/ptc-runtime-python/tests/runtime.spec.ts` | **unchanged** |
| terminal-bash TERM-ignoring descendant | `packages/terminal/terminal-bash/tests/local.spec.ts` | **unchanged** |
| doc-standard 5s budget | `scripts/doc-standard.spec.ts` | **unchanged** |
| "no da packages in the exemption list" | `scripts/coverage-exempt.ts` | **unchanged** (still verbatim upstream) |

So the web batch assertion stays red for exactly the reason already recorded: upstream did not move
the 3072-byte ceiling, and the fork's 4 extra client plugins still add 228 bytes. Do not touch it.

Upstream did add package-local chunk routing to `client/modules` (`chunkUrl`, `chunkRequest`,
`CLIENT_CHUNK`, and a `fileName` field on `ComboResource`). That is new surface adjacent to the
partitioning logic, so the *observed* batch count is worth re-reading from CI after the merge — but
the ceiling itself did not move, so the disposition does not change.

## Execution sequence

1. Worktree + branch off master: `.worktrees/resync-0.1.6-alpha.2` on `upstream/resync-0.1.6-alpha.2`. **Done.**
2. Register the i18n merge driver worktree-locally (`merge.dsh-translation-pairing.driver`). **Done.**
3. `pnpm install && pnpm run build:official` on the unmerged branch — establishes the green baseline
   so any post-merge red is attributable to the merge, not to a cold worktree. **In progress.**
4. `git merge --no-ff --no-commit dsh-v0.1.6-alpha.2`; resolve groups A–F per the table.
5. `pnpm install` (regenerate lockfile); bump the 67 fork-only packages to `0.1.6-alpha.2`.
6. Regenerate: `gen-cordis-api`, `gen-client-catalog`, `gen-tool-catalog`, `gen-config-catalog`,
   `gen-doc-graphs`, `gen-module-graph`, `gen-persistence-catalog`; then
   `verify-translation-pairing --write` for the affected pairs.
7. `pnpm run rescope-vendor --apply` then `rescope-vendor:check`.
8. `pnpm run build:official`, `typecheck`, `hygiene`, `test:docs`, `constraints`, `duplication`,
   `test:snapshot`, plus the touched-package suites.
9. `scripts/upstream-sync-record.ts` → new `current` record; move `0d1f50007f` into `history` with
   `upstreamTag: dsh-v0.1.6-alpha.2`; re-check `verify-upstream-sync-record`.
10. Write `upstream-sync/da-impact-ddefc45fbc.md` for user review (nothing in da's surfaces resolved
    silently). Push branch, open PR **to origin only**, preserve merge topology (no squash).

## Validation gates (must pass before PR ready)
- `build:official`, `typecheck`, `hygiene`, `test:docs`, `constraints`, `rescope-vendor:check`,
  `verify-upstream-sync-record`, `verify-config-catalog`, `verify-translation-pairing` all green.
- The 42 da sections still present in `docs/config-catalog.md` and its Chinese side.
- 11 da alias rows still present in `tsconfig.base.json`.
- Known-red gates stay exactly as recorded in UM18 (per-file coverage, the unreachable upstream
  budget gates). A **new** red is a merge defect; a **recorded** red is not.

## Risks
- Group A's `config-catalog` pass is one day old and is the most likely thing to be silently reverted.
- Group D silently drops aliases and only surfaces as TS2307 far away, in `evidence-query`.
- `packages/client` churn is large (657 files); the fork's client plugins mount into that base, so
  `apps/web` composition effects may show up only in CI.
