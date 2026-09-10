# Upstream Re-sync Conflict Assessment

**Scenario** — 3-way merge of `upstream/master` (c389f96bf3) into fork merge commit `6b7610d45a`.
- merge-base = `d347e703` (confirmed: `git merge-base 6b7610d45a c389f96bf3` → d347e703)
- ours (fork)  = `6b7610d45a` (parents 65bf3cddc9=fork, d347e703=upstream)
- theirs (upstream) = `c389f96bf3` (= `upstream/master`), +449 commits since base

A file conflicts only if **both sides** changed it vs base. Step 3's intersection of the two `--name-only` lists gives the candidate set; Step 4's `git diff --stat d347e703..6b7610d45a -- <file>` confirms whether the fork actually diverged (non-empty = real risk).

## Headline counts

| metric | value | source |
|---|---|---|
| Fork-diverged files (N) | **2988** | `git diff --name-only d347e703..6b7610d45a \| wc -l` |
| Upstream-touched unique files | **4567** | `git log --name-only --pretty=format: d347e703..upstream/master \| grep -v '^$' \| sort -u \| wc -l` |
| Conflict candidates (M) = ∩ both | **57** | `comm -12` of the two sorted lists |

### Breakdown by category (of 57 candidates)

| category | count | note |
|---|---|---|
| build-critical | **3** | root tsconfigs only (see §build-critical) |
| fork-data-agent (`packages/data/**`, `packages/bundle/data-agent/**`) | **0** | none in intersection |
| docs (`docs/**`, `**/*.md`, `wayfinder/**`) | **3** | see §docs |
| other (residual) | **51** | incl. 2 package-scoped tsconfigs + 7 --name-only artifacts |
| **total** | **57** | |

Return-line "other" = 54 = docs(3) + other(51) = M − B − D.

### Real vs artifact

All 57 candidates show fork divergence (`git diff --quiet d347e703..6b7610d45a -- <file>` → non-zero for all). But **7 have 0 real upstream commits** (`git rev-list --count d347e703..upstream/master -- <file>` = 0): they appear in the no-pathspec `--name-only` list due to merge-commit / add-then-delete noise (pathspec history-simplification prunes them). For these, upstream's net change vs base is nil → fork's version wins → **no conflict**.

- Real conflict candidates (both sides truly changed) = **50** (57 − 7)
- 7 artifacts: `knip.json`, `vitest.config.ts`, `packages/examples/agent-spine-demo/{package.json,src/index.ts}`, `packages/examples/jsonrpc-demo/{package.json,src/packaged-bin.ts,tsconfig.json}` (all absent at both base & upstream/master tip, or base==tip unchanged — fork-only additions / reverted churn)

## Build-critical conflict candidates (highest-risk)

All 3 are root build configs, all fork-diverged, all with real upstream commits → **all 3 are real, high-risk conflicts**.

| file | upstream commits (d347e703..upstream/master) | fork divergence (d347e703..6b7610d45a) | verdict |
|---|---|---|---|
| `tsconfig.base.json` | 4 | 114 ins, 1 del | REAL conflict — high risk |
| `tsconfig.client.json` | 5 | 7 ins | REAL conflict — high risk |
| `tsconfig.host.json` | **15** | 66 ins, 1 del | REAL conflict — **highest risk** (most upstream churn) |

### Build-adjacent (package-scoped tsconfigs, counted in "other")

| file | upstream commits | fork divergence | verdict |
|---|---|---|---|
| `packages/api/remotes/tsconfig.host.json` | 1 | 3 ins | REAL — medium risk (package-scoped) |
| `packages/examples/jsonrpc-demo/tsconfig.json` | 0 | 24 ins | ARTIFACT — no real upstream change |

## Docs conflict candidates (3)

| file | upstream commits | fork | verdict |
|---|---|---|---|
| `docs/subsystems/README.md` | 1 | diverged | real (low risk) |
| `packages/client/ui-settings-models/README.md` | 1 | diverged | real (package-scoped README) |
| `packages/client/ui-settings-models/README.zh.md` | 1 | diverged | real (package-scoped README) |

## Top conflict hotspots by upstream churn (real candidates, top 10)

| file | upstream commits | category |
|---|---|---|
| `packages/extensions/tool-cordis/src/api-catalog.ts` | 41 | other |
| `scripts/gen-cordis-catalog.ts` | 28 | other |
| `package.json` (root) | 20 | other |
| `tsconfig.host.json` | 15 | **build-critical** |
| `.github/workflows/ci.yml` | 14 | other |
| `packages/subagent/subagent-acp/tests/subagent-acp.spec.ts` | 13 | other |
| `packages/subprocess/subprocess-local/tests/spawn.spec.ts` | 13 | other |
| `apps/cli/package.json` | 9 | other |
| `packages/boot/app-boot/src/index.ts` | 9 | other |
| `packages/core/agent-loop/src/index.ts` | 9 | other |

## Full candidate list (57)

Below: every candidate with upstream-commit count (`git rev-list --count d347e703..upstream/master -- <f>`) and fork-divergence. `0↑` = --name-only artifact (no real upstream change, no conflict).

```
41↑ diverged  packages/extensions/tool-cordis/src/api-catalog.ts
28↑ diverged  scripts/gen-cordis-catalog.ts
20↑ diverged  package.json
15↑ diverged  tsconfig.host.json                       [build-critical]
14↑ diverged  .github/workflows/ci.yml
13↑ diverged  packages/subagent/subagent-acp/tests/subagent-acp.spec.ts
13↑ diverged  packages/subprocess/subprocess-local/tests/spawn.spec.ts
 9↑ diverged  apps/cli/package.json
 9↑ diverged  packages/boot/app-boot/src/index.ts
 9↑ diverged  packages/core/agent-loop/src/index.ts
 9↑ diverged  packages/shell/bash-sandbox/tests/sandbox.spec.ts
 7↑ diverged  packages/shell/bash-local/tests/executor.spec.ts
 7↑ diverged  pnpm-workspace.yaml
 6↑ diverged  packages/lsp/lsp-stdio/tests/instance.spec.ts
 5↑ diverged  .github/workflows/ci-master.yml
 5↑ diverged  tsconfig.client.json                    [build-critical]
 4↑ diverged  packages/bundle/web-app/cordis.patch.yml
 4↑ diverged  scripts/verify-package-readme-model-experience.ts
 4↑ diverged  tsconfig.base.json                       [build-critical]
 3↑ diverged  packages/bundle/web-app/package.json
 3↑ diverged  packages/client/ui-layout/src/client/AppFrame.tsx
 2↑ diverged  .gitignore
 2↑ diverged  packages/api/remotes/package.json
 2↑ diverged  packages/boot/app-boot/tests/app-boot.spec.ts
 2↑ diverged  packages/client/web/package.json
 2↑ diverged  packages/core/agent/src/runtime-types.ts
 2↑ diverged  packages/core/tools/src/index.ts
 2↑ diverged  packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
 2↑ diverged  packages/subagent/subagent/src/types.ts
 2↑ diverged  scripts/gen-doc-graphs.ts
 1↑ diverged  .github/workflows/build-preview-cloudflare.yml
 1↑ diverged  docs/subsystems/README.md               [docs]
 1↑ diverged  packages/api/remotes/src/client/index.ts
 1↑ diverged  packages/api/remotes/tsconfig.host.json  [build-adjacent]
 1↑ diverged  packages/client/connection/src/client/fixture.ts
 1↑ diverged  packages/client/ui-layout/src/client/index.ts
 1↑ diverged  packages/client/ui-settings-models/README.i18n.yaml
 1↑ diverged  packages/client/ui-settings-models/README.md            [docs]
 1↑ diverged  packages/client/ui-settings-models/README.zh.md         [docs]
 1↑ diverged  packages/client/ui-settings-models/package.json
 1↑ diverged  packages/client/ui-settings-models/tests/onboarding-dialog.client.spec.tsx
 1↑ diverged  packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx
 1↑ diverged  packages/client/web/src/platform.ts
 1↑ diverged  packages/client/web/src/seed.ts
 1↑ diverged  packages/core/agent-loop/tests/tool-calls.spec.ts
 1↑ diverged  packages/shell/tool-bash/tests/tools.spec.ts
 1↑ diverged  packages/subagent/subagent/src/index.ts
 1↑ diverged  packages/subagent/tool-subagent/src/index.ts
 1↑ diverged  scripts/doc-budgets.manifest.json
 1↑ diverged  scripts/gen-tool-catalog.ts
 0↑ diverged  knip.json                                            [artifact]
 0↑ diverged  packages/examples/agent-spine-demo/package.json      [artifact]
 0↑ diverged  packages/examples/agent-spine-demo/src/index.ts      [artifact]
 0↑ diverged  packages/examples/jsonrpc-demo/package.json          [artifact]
 0↑ diverged  packages/examples/jsonrpc-demo/src/packaged-bin.ts  [artifact]
 0↑ diverged  packages/examples/jsonrpc-demo/tsconfig.json         [artifact]
 0↑ diverged  vitest.config.ts                                     [artifact]
```

## Methodology & commands run

1. Fork divergence: `git diff --name-only d347e703..6b7610d45a` → 2988 files.
2. Upstream touched: `git log --name-only --pretty=format: d347e703..upstream/master | grep -v '^$' | sort -u` → 4567 files.
3. Intersection: `comm -12 <fork-sorted> <upstream-sorted>` → 57 candidates.
4. Per-candidate upstream commit count: `git rev-list --count d347e703..upstream/master -- <file>`.
5. Per-candidate fork divergence: `git diff --quiet d347e703..6b7610d45a -- <file>` (exit 0 = identical/no change; non-zero = diverged).
6. Build-critical fork diff detail: `git diff --stat d347e703..6b7610d45a -- <file>` (empty stat = fork kept upstream's version = no conflict; non-empty = fork diverged = real risk).
7. Artifact verification: `git cat-file -e <ref>:<file>` at base/tip/fork + `git log --oneline [--no-merges] d347e703..upstream/master -- <file>` (7 files: absent at both base & tip or unchanged → 0 real upstream commits → no conflict).

**Caveat**: `git log --name-only` (no pathspec) includes merge-commit combined-diff noise; 7 candidates are artifacts (0 real upstream commits). A `--no-merges` variant of step 2 would exclude them, yielding 50 real candidates. Headline M=57 follows the task's prescribed step-2 method; real conflict risk = 50.
