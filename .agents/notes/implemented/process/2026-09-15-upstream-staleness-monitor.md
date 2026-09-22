# Agent Note: Gate upstream staleness on a schedule instead of scheduling a report

Status: implemented

English | [中文](2026-09-15-upstream-staleness-monitor.zh.md)

## Problem

[`upstream-status`](../../../../scripts/upstream-status.ts) exits 0 by contract, and no workflow declared `schedule:`, so the fork had no way to learn that it had fallen behind upstream. Putting the report on a schedule would not have fixed that: every run would report success whether the fork was current, months behind, or unable to reach the remote at all. The report also read the local `upstream/master` ref *before* the fetch that refreshes it, so any run where upstream had advanced compared a pre-fetch sha against a post-fetch one, called the ref stale, and withheld the behind-count — suppressing the number precisely when the fork had just fallen behind.

## Decision

[`upstream-monitor`](../../../../scripts/upstream-monitor.ts) is a separate gate over the same record and the same ref probe. It exits 1 when the recorded thresholds are exceeded, 2 when the record is unreadable, violates its shape contract, or names an upstream commit that is not an ancestor of `HEAD`, 3 when the remote cannot be probed, and 4 when freshness cannot be proven — a stale tracking ref or a missing count is never reported as success. Staleness stays out of [`verify-upstream-sync-record`](../../../../scripts/verify-upstream-sync-record.ts), which gates pull requests: upstream moves independently of any pull request, so a behind-count there would fail unrelated work and be disabled within a week.

[`upstream-monitor.yml`](../../../../.github/workflows/upstream-monitor.yml) runs both commands daily at 21:17 UTC (05:17 Asia/Shanghai) and on manual dispatch, with `contents: read`, one non-cancelling run per ref and event, and the report retained as an artifact on failing runs too. Daily rather than weekly: the thresholds are 14 days and 150 commits, so a weekly probe could sit on a breach for up to 7 days — half the day-threshold spent on reporting latency — and one run costs about a minute. The failed run is the notification; no Issue is filed, because automatic Issue creation would first have to define write permissions, deduplication, update, and closure behavior.

`probeRef` now probes the remote before reading the tracking ref, which is what its own documented contract always claimed. Both commands accept `--root <path>` so the fixture suite drives the stale, unknown, and malformed-record branches against temporary repositories with a path-based `upstream` remote, never against the real remotes.

## Alternatives considered

**Make `verify-upstream-sync-record` fail on staleness.** It runs on every pull request, where a behind-count is not author-controllable. The gate would fail unrelated changes and be waived away.

**Schedule `upstream-status` and read the logs.** A green run that nobody opens is not a signal, and the run is always green. The threshold decision has to live in an exit code.

**File an Issue from the workflow.** It needs `issues: write` plus deduplication, update, and closure rules; an unmanaged bot would open one Issue per week. A failed scheduled run already notifies the owner.

**Report `indeterminate` as success.** An unfetched or unreachable ref under-reports the distance to upstream, which is the false green the report was built to prevent. Unprovable freshness fails.

## Consequences

A fork that drifts past 14 days or 150 commits now fails a scheduled job, and so does a broken record or an unreachable remote; the artifact carries the reasons. `upstream-status` keeps its report semantics, but a run where upstream advanced now prints the behind-count it used to withhold. The monitor requires `fetch-depth: 0` and a configured `upstream` remote — a shallow checkout reports `indeterminate` rather than a false pass. The first scheduled trigger only fires after the workflow reaches the default branch.

[The fixture suite](../../../../scripts/upstream-monitor.spec.ts) covers fresh, commit-threshold, day-threshold, unprobeable remote, unreadable record, shape violation, unabsorbed upstream commit, `--no-fetch` staleness, post-fetch freshness, second-parent mismatch, and artifact-on-failure.
