# UM17 — post-merge latest-upstream dependency and scheduled-monitor validation

**Type**: task · **Status**: blocked · **Phase**: upstream-merge follow-up
**Blocked by**: PR #130 merged to `master`, the merge commit fetched locally, and UM15 branch cleanup complete
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
