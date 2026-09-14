# UM17 — post-merge latest-upstream dependency and scheduled-monitor validation

**Type**: task · **Status**: open — every acceptance item recorded except one external wait (the first real `schedule` trigger) · **Phase**: upstream-merge follow-up
**Was blocked by**: PR #130 merged to `master`, the merge commit fetched locally, and UM15 branch cleanup complete — all three satisfied 2026-09-14/15, see Resolution progress
**Serves**: prove the completed fork still contains the latest upstream commit and that the upstream-update monitor produces an actionable scheduled signal

## Question

After PR #130 lands, does the merged fork contain the then-current `upstream/master`, and does the upstream monitoring path work end to end from schedule trigger through an actionable notification or durable report?

## Current facts on 2026-09-14

- `upstream-sync.json.current.upstreamSha` is `c291e7961a515f6d7af9304e7fd1d257929aef26`.
- `pnpm run upstream-status` is a report command and intentionally exits 0 even when the fork is stale or the remote state is unknown.
- No `.github/workflows/*` file currently declares `schedule:`. A scheduler therefore does not yet exercise the report, and an unchanged exit code cannot create a failed-run alert by itself.

## Required validation

1. Fetch `origin/master` and `upstream/master` from their configured remotes; record both exact SHAs and timestamps.
2. Prove whether `upstream/master` is an ancestor of `origin/master` with `git merge-base --is-ancestor`, and report `git rev-list --count origin/master..upstream/master`.
3. Run `pnpm run verify-upstream-sync-record` against the merged tree and compare the record with the fetched upstream head.
4. Run `pnpm run upstream-status` with a normal fetch and with `--no-fetch`; verify fresh, stale, and remote-failure fixtures through the owning spec rather than mutating real remotes.
5. Inspect the actual scheduled workflow. If none exists, implement one only after choosing an actionable signal: a threshold failure, a durable artifact plus issue, or another explicit notification path. Scheduling an always-zero command alone does not satisfy this ticket.
6. Trigger the workflow manually, then inspect its run, report artifact, permissions, concurrency, and notification behavior. Do not claim the scheduled path works from YAML inspection alone.
7. If upstream advanced after PR #130's recorded SHA, open a new upstream-sync effort rather than rewriting UM15 history.

## Acceptance

- The fork/upstream ancestry result is recorded with exact SHAs and commands.
- The merged `upstream-sync.json` passes its gate and either names the fetched upstream head or reports a new sync as required.
- A real scheduled/manual workflow run proves the monitor's actionable behavior.
- The workflow cannot silently report success when the stale threshold is exceeded or the remote probe is unavailable.
- Any generated impact report is retained as an artifact or committed through the owning upstream-sync process, not left only in a runner workspace.

## Resolution progress (2026-09-15)

Worked from a clean worktree created off freshly fetched `origin/master` (`.worktrees/um17-upstream-monitor`, branch `codex/um17-upstream-monitor`, HEAD = the PR #130 merge commit), never from the pre-merge resync worktree.

### 1-2. Ancestry verdict — the merged fork contains the then-current upstream

| fact | value |
|---|---|
| PR #130 merge commit | `d1ef7dc6d6f0e3b1b7ed27e12abd6658133398ff`, merged 2026-09-14T17:16:41Z, committed 2026-09-15T01:16:41+08:00 |
| `origin/master` at proof time | `d1ef7dc6d6f0e3b1b7ed27e12abd6658133398ff` |
| fetched `upstream/master` | `c291e7961a515f6d7af9304e7fd1d257929aef26`, 2026-09-10T22:17:09+08:00, `Merge pull request #3977 from deepseek-harness/worktree/release-0.1.5-sync-master` |
| `upstream-sync.json.current.upstreamSha` | `c291e7961a515f6d7af9304e7fd1d257929aef26` — equals the fetched head |
| `upstream-sync.json.current.mergeCommit` | `1f731901a76109fefa168fc9bbd785dbfdefc889` — an ancestor of `origin/master` (exit 0), and the recorded upstream sha is inside its ancestry (exit 0) |
| `git merge-base origin/master upstream/master` | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| `git merge-base --is-ancestor upstream/master origin/master` | **exit 0** |
| `git rev-list --count origin/master..upstream/master` | **0** (fork behind) |
| `git rev-list --count upstream/master..origin/master` | **1174** (fork ahead) |

Upstream did not advance past the recorded sha during this session, so no new upstream-sync effort was opened and PR #130's history was not amended.

### 3-4. Record and report behavior

- `pnpm run verify-upstream-sync-record` → `upstream-sync.json is consistent with Git.`, exit 0.
- `pnpm run upstream-status` and `pnpm run upstream-status -- --no-fetch` → **both exit 0**, which is the always-zero report contract itself. Reported fields: ref state fresh (`upstream/master = c291e7961a`), behind-count 0, 0 days since sync (threshold 14), pending waivers 0, **owed remediation (drop waivers) 7** (all `UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS`: `packages/client/runtime/`, `packages/examples/jsonrpc-demo/`, `packages/examples/agent-spine-demo/`, `knip.json`, `packages/client/connection/tests/fake-api.client.ts`, `packages/client/ui-settings-models/src/client/operations.ts`, `.../slot-contract.ts`), impact report written under `upstream-sync/`.
- The seven required behaviors are proven by a new owning suite, `scripts/upstream-monitor.spec.ts`, **13/13 passing**, against temporary fixture repositories with a path-based `upstream` remote — the real remotes were never mutated: fresh upstream, stale upstream (commit threshold), stale upstream (day threshold), remote probe failure, malformed record (unreadable **and** shape violation), merge-SHA mismatch (`collectGitFailures` second-parent message), recorded upstream absent from ancestry, and `--no-fetch` behavior. Two extra cases pin the report/gate split and the probe-ordering fix.

**Defect found and fixed while building the fixtures**: `probeRef` read the local `upstream/master` ref *before* the fetch that refreshes it and compared it against the post-fetch remote sha, so **every run where upstream had advanced reported `stale` and withheld the behind-count** — suppressing the number exactly when the fork had just fallen behind, which is the false-green failure mode the report was built to prevent. `scripts/upstream-status.ts` now probes the remote first, matching its own documented contract. Report semantics are otherwise unchanged and it still always exits 0.

### 5-6. Actionable monitor, implemented and really run

Checkpoint reconfirmed before implementing: no `.github/workflows/*` declared `schedule:` (grep, zero hits) and `upstream-status` exits 0 on every branch.

- **Gate**: `scripts/upstream-monitor.ts` (`pnpm run upstream-monitor`), exit **0** fresh · **1** recorded threshold exceeded · **2** invalid record (unreadable, shape violation, or a recorded upstream commit that is not an ancestor of `HEAD` — an ancestry assertion that existed nowhere before) · **3** remote unprobeable · **4** freshness unprovable. `indeterminate` is never success. Named `upstream-monitor`, not `verify-*`, so it stays out of `verify-gate-coverage`'s PR-gate enrollment: staleness must not gate pull requests, per `verify-upstream-sync-record`'s own reasoning.
- **Workflow**: `.github/workflows/upstream-monitor.yml` — `schedule: '17 21 * * 1'` (**21:17 UTC Monday = 05:17 Asia/Shanghai Tuesday**) plus `workflow_dispatch`; `permissions: contents: read`; `concurrency` per workflow+ref+event with `cancel-in-progress: false`; `fetch-depth: 0` (the ancestry proof and behind-count need full history — a shallow clone reports `indeterminate`, not a false pass); explicit `upstream` remote configuration (`actions/checkout` wires only `origin`); report uploaded with `if: always()`, `retention-days: 90`. No Issue is filed: that would need `issues: write` plus deduplication, update, and closure behavior. The failed run is the notification.
- **Landed** as PR #132, merged 2026-09-14T18:14:37Z, merge commit `a3a305d95cb7d7478cfe210e5b56dc5b5a6b1bb2` (= `origin/master`), branch tip `540512a87629f2074cb6280c459af18ce469deef` confirmed an ancestor. All real checks passed; the only non-green entry was `weighted approval` at 0/2 points, whose `approval-policy.json` lists upstream maintainer handles that do not exist in this fork, and `mergeStateStatus` was `UNSTABLE` (not `BLOCKED`), so it is not branch-protection-required.
- **Manual dispatch, real run**: <https://github.com/McKenzieIT/deepseek-harness-da/actions/runs/34879636874> — event `workflow_dispatch`, head `a3a305d95cb7d7478cfe210e5b56dc5b5a6b1bb2`, conclusion **success**, all nine steps success. Artifact `upstream-monitor-34879636874`, 935 bytes, expires 2026-12-13, downloaded and read: `verdict = fresh (exit 0)` plus the `upstream-status` impact report.
- **Failure path proven in the real runner too**, not merely locally: a throwaway drill branch pointed the `upstream` remote at a nonexistent repository. <https://github.com/McKenzieIT/deepseek-harness-da/actions/runs/34879958861> — report step **success**, gate step **failure with `Process completed with exit code 3`**, artifact step **success**, run conclusion **failure**. Artifact `upstream-monitor-34879958861` (1,541 bytes) contains `ref state = unknown (local tracking ref and remote HEAD both absent)` / `verdict = remote-unavailable (exit 3)`. This is the end-to-end evidence that the workflow cannot silently report success when the remote is unavailable, and that `if: always()` retains the report on a failing job. The drill branch was deleted afterwards (remote and local); it must never be merged.

### 7. Upstream did not advance — no new effort opened

### Remaining pending condition (the only one)

**Manual dispatch verified; first scheduled trigger pending.** The cron path is proven only by a real scheduled run, which cannot occur before 2026-09-21T21:17Z (= 2026-09-22 05:17 Asia/Shanghai), the first Monday after the workflow reached the default branch. A quiet heartbeat was scheduled to check `gh run list --workflow upstream-monitor.yml --event schedule` daily and report only when a scheduled run appears, fails, or needs action. Close this ticket when that run is recorded (id, conclusion, artifact).

Note for whoever closes it: GitHub disables scheduled workflows after 60 days without repository activity, and a `workflow_dispatch` run re-enables them.

### Out of this ticket's scope, found while validating

- `.github/workflows/ci.yml` and `ci-master.yml` runs complete as `failure` in **0 s** with `jobs: []` and the workflow *path* as display title — a startup failure, so their gates (including `check:ci:static`) never execute in this fork. Evidence: runs `34856018515` and `34856019977` on `1c6185d6f4`. Belongs to the CI-infrastructure effort.
- `pnpm run doc-sync` reports 35 passed / 1 failed; the failure is `doc-typecheck` on `docs/superpowers/plans/2026-08-22-phase2-ontology-nl2sql-metrics.md`, whose blob `ff928f193f4ee3c6c5283d4ed0388a6e96caf18e` is byte-identical on both merge parents and on `origin/master`. Inherited, not introduced by the monitor work.
- The data-agent recovery loop recorded for PR #130's GUI evidence was classified and spun out as [UM18](UM18-phase-gate-transport-failure-terminal-state.md): bounded expected recovery, not merge-introduced, but with three real pre-existing phase-gate defects.
