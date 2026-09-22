# Upstream Merge Plan — sync origin/master → upstream/master (0d1f50007f, past dsh-v0.1.6-alpha.1)

- date: 2026-09-16
- record-base: c291e7961a (current upstream-sync.json, includes dsh-v0.1.5-rc.2)
- target: upstream/master 0d1f50007f (666 commits ahead; latest tag dsh-v0.1.6-alpha.1)
- fork-only commits: 1224 | conflicts on probe: 59 files | owed waiver remediations: 7

## Guiding principle (user-set 2026-09-16)

1. **dsh's own changes → take latest upstream directly.** This includes upstream's
   `code-runtime` → `ptc-runtime` rename (a dsh rebrand): **adopt it**, do not keep the old name.
2. **da's own additions → never silently overwrite; report in a separate document for review.**
   da-owned surfaces: Pipeline presets, semantic layer (`ui-semantic-layer`), `code-runtime-data-python`,
   `packages/data/*`, `llm-dashscope`, da agent presets, da seam rows in `tool-cordis/api-catalog.ts`,
   and any da-added tests on a dsh package (e.g. the T18 wide-value cases).
3. All changes land on a branch → PR to **origin only**; never a PR to upstream.

## The core reconciliation: `code-runtime` → `ptc-runtime`

Upstream renamed the whole Python-runtime family (`7c9bb5914c refactor(ptc): align runtime packages…`,
`3ca9c7d489 rename code-mode to ptc`). The fork forked `code-runtime` **before** the rename and carries the
old names. Resolution (principle 1): **adopt `ptc-runtime`** — take upstream's `ptc-runtime`,
`ptc-runtime-node`, `experimental/ptc-runtime-python`, and the `code-runtime-python-protocol`→`lazy-require`
move. Then (principle 2) **re-apply da's own runtime additions on the new names and REPORT them** — chiefly
`code-runtime-data-python` (da data-agent variant) and any da-added wide-value/O(depth) tests.

## Conflict resolution table (59 files, by category)

### A. take-upstream — dsh-owned, mechanical (docs, tests, dsh src)
- `.agents/notes/implemented/architecture/2026-07-31-ptc-runtime-python-fd3-protocol.{i18n.yaml,md,zh.md}`
- `docs/capability-seams.{i18n.yaml,md,zh.md}`, `docs/config-catalog.{i18n.yaml,md,zh.md}`,
  `docs/event-producer-consumer.{i18n.yaml,md,zh.md}`, `docs/module-graph.{i18n.yaml,md,zh.md}`,
  `docs/subsystems/browser-use.i18n.yaml`, `docs/subsystems/code-runtime.{md,zh.md}`
- `packages/browser-use/README.i18n.yaml`, `packages/experimental/browser-use-runtime/README.i18n.yaml`
- `packages/api/remotes/{package.json,src/client/index.ts,src/remote-events.ts}` (verify no da edit first)
- `packages/boot/app-boot/src/index.ts`, `packages/client/connection/src/client/fixture.ts`
- `packages/core/tools/tests/gen-tool-catalog.spec.ts`, `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
- `packages/shell/bash-local/tests/executor.spec.ts`, `packages/shell/bash-sandbox/tests/sandbox.spec.ts`
- `packages/session/session-projection-cache/tests/cache.spec.ts` (T19 area — confirm fork fix already upstreamed or moot)
- `snapshots/session/cordis-inspect-jsdoc/session.v3.jsonl`
- `*.i18n.yaml` metadata resolved by `resolve-translation-pairing-conflicts` after the paired `.md`/`.zh.md`.

### B. code→ptc migration — adopt upstream rename
- `packages/experimental/ptc-runtime-python/{src/index.ts,src/protocol.ts,tests/*}` → take upstream (new target)
- `packages/experimental/code-runtime-python/{src/protocol.ts,tests/protocol.spec.ts}` → migrate to ptc-runtime-python; drop old-named copy
- `packages/code-runtime/code-runtime-python-protocol/{src/index.ts,tests/protocol.spec.ts}` → adopt upstream (`lazy-require` move)
- `packages/code-runtime/README.{md,zh.md}` → take upstream (ptc)

### C. merge-both — dsh file + da additive change (keep da, take upstream body)
- `packages/client/ui-settings-models/src/client/ProviderEditor.tsx` — **D3**: keep da `'dashscope'` layout; take upstream layout changes
- `packages/extensions/tool-cordis/src/api-catalog.ts` — keep da seam rows (audit/embedder/identity/nl2sql/schema); take upstream
- `scripts/run-gates.ts`, `scripts/run-gates.spec.ts` — keep da gates (`gate-coverage`, `upstream-sync-record`, `vendored-links`, `runtime-closure`); take upstream
- `scripts/ci-workflow.spec.ts` — keep da workflows (`e2e.yml`/`release-vendor.yml`, fork skip-on-owner); take upstream
- `scripts/check-workspace-constraints.ts`, `scripts/package-dependency-policy.ts`, `scripts/verify-package-dependencies.spec.ts` — adopt ptc rename; keep da package rows
- `tsconfig.base.json`, `tsconfig.host.json` — adopt ptc aliases/refs; keep da aliases (semantic-layer, data/*, eval, embedder, code-runtime-data-python)
- `apps/cli/package.json` — keep da deps; take upstream
- `.github/workflows/issue-lifecycle.yml` — keep fork skip-on-owner (T6); take upstream

### D. regenerate
- `pnpm-lock.yaml` → delete conflict, run `pnpm install`

## da-affected items requiring a SEPARATE report (principle 2)

Produce `upstream-sync/da-impact-<target>.md` listing, for user review, every place the merge/rename touches
da's own creations — do NOT resolve these silently:
1. `code-runtime-data-python` — must be re-based on the new `ptc-runtime` protocol; confirm its bindings tests.
2. T18 wide-value / O(depth) tests — decide whether they are da-added (→ port + fix CI portability) or dsh-original (→ take upstream's version).
3. `ui-semantic-layer` alias/refs in `tsconfig.*` — confirm the merge kept da's semantic layer wired.
4. da agent presets / Pipeline presets under `packages/data/*` + `agent-presets` — confirm none dropped by the rename.
5. `tool-cordis/api-catalog.ts` da seam rows (D1/D2 signature-doc rows) — keep in lockstep with the debt registry.

## Execution sequence

1. Register i18n merge driver (worktree-local): `git config merge.dsh-translation-pairing.driver 'sh scripts/merge-translation-pairing-driver.sh %O %A %B %P'`.
2. Branch off origin/master; `git merge --no-ff --no-commit upstream/master`.
3. Resolve A (take-upstream), B (ptc adopt), C (merge-both), D (regenerate) per table.
4. `pnpm run rescope-vendor --apply` (re-scope vendored Cordis names after the sync).
5. `pnpm install` (regenerate lockfile).
6. `pnpm run rescope-vendor:check`, `pnpm run verify-upstream-sync-record`, `pnpm run hygiene`.
7. `pnpm run build:official`; then targeted `pnpm run typecheck` + the touched-package tests.
8. Update `upstream-sync.json` (new current record; move c291e7961a to history) and re-evaluate the 7 owed waivers (drop the ones the merge made moot; keep-fork survivors re-declared).
9. Write `da-impact-<target>.md` (section above); commit; push branch; open PR to origin.

## Validation gates (must pass before PR ready)
- `build:official` green; `typecheck` green; `hygiene` green; `verify-upstream-sync-record` green; `rescope-vendor:check` clean.
- Fork CI (`check:ci:static`, `check:ci:coverage`, snapshots) — pre-existing upstream-debt reds expected until quarantined; new reds are merge defects.

## Risk & environment notes
- 59 conflicts incl. an architectural rename: high blast radius on build/typecheck if mis-resolved.
- This sandbox blocks git writes (each needs host escalation; no interactive `git mergetool`), so conflict
  resolution is slow and error-prone here — a dedicated environment with normal git tooling is preferable.
- The merge is fully reproducible (probe aborted cleanly); re-running `merge --no-commit` re-creates the state.
