# Next session — verify latest upstream dependency and scheduled monitoring

## Entry condition

Start only after PR #130 is merged and the upstream-merge worktree/branch cleanup is recorded. Read:

- `wayfinder/data-agent/tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md`
- `wayfinder/data-agent/tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md`
- `upstream-sync.json`
- `scripts/upstream-status.ts`
- `scripts/upstream-sync-record.ts`

## Objective

Prove that the merged fork contains the latest fetched `upstream/master`, then prove that upstream-update monitoring works through a real scheduled or manually dispatched workflow and produces an actionable signal.

## Safety

- Work from a clean checkout of merged `origin/master`; do not reuse the pre-merge resync worktree as evidence.
- Fetch both remotes before comparing SHAs.
- Never rewrite `master`; any new upstream advance starts a new branch/PR.
- Do not call an always-zero report command a monitor unless the workflow independently converts stale/unknown state into an issue, failed threshold job, or other explicit notification.
- Keep credentials out of logs and generated reports.

## Required outputs

1. Exact `origin/master`, `upstream/master`, recorded upstream, and merge-base SHAs.
2. An ancestry/behind verdict with the commands that produced it.
3. `verify-upstream-sync-record` and `upstream-status` results on the merged tree.
4. A real workflow run URL and its artifact/notification evidence.
5. Either close UM17 as verified or open the next upstream-sync effort with the newly observed upstream SHA.
