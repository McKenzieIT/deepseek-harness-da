# Agent Note: Per-session branch and worktree isolation for parallel work

Status: proposed

English | [中文](2026-09-04-parallel-session-branching-policy.zh.md)

## Problem

The [dsh-data-agent PR workflow](../../../../docs/da-pr-workflow.md) requires a `feat/<ticket-id>-<slug>` or `fix/<ticket-id>-<slug>` branch plus PR for any new package, seam, feature, or bug fix, and allows a direct push to `main` only for pure Wayfinder documentation and experiment probe scripts. [Responding to PR review on a stack](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md) adds that each PR branch gets its own worktree: "parallel fixes never share a checkout."

Since 2026-09-03, parallel session work has followed neither rule. `git worktree list` shows a single checkout on `master`; `git for-each-ref` shows no `feat/*` or `fix/*` branch dated after 2026-08-26; and `git log --since=2026-09-01` lands dozens of `feat()` and `fix()` commits that touch `packages/*/src` directly on `master`. The working tree on `master` carries five interleaved workstreams at once (ui-present-table, twelve untracked simplification proposals, new eval cases, new Wayfinder tickets, and a probe script), the reflog records `commit (amend)` and `reset` against that shared tip, and `master` sits one commit ahead of `origin/master` with a stale stash.

Three gaps let this happen. First, the session-dispatch prompts under `wayfinder/*/prompts/` that launch parallel work end with "commit" and never name a branch or worktree, so the documented branch model never reaches the sessions that must follow it. Second, the harness will not close that gap: [Durable Agent Teams](../../implemented/feature/2026-08-05-agent-teams.md) states that "Worktree isolation is not a harness runtime behavior" and rejected auto-creating isolated worktrees, leaving branch and worktree setup to the prompt or deployment. Third, no gate rejects a `feat` or `fix` commit that lands on `master`, so the rule is advisory. The "parallel" in the prompts also changed meaning: parallel branches became parallel subagents on one branch, relying on file-non-overlap to avoid write conflicts rather than on isolation.

## Proposal

Make the session prompt the enforcement point, because the harness delegates isolation to it. Every next-session prompt instantiates a branch contract as its first block; every parallel ticket gets its own worktree and branch; the direct-to-`main` allowlist is narrowed and checked; the Lead session is the integration boundary and lands a batch before the next one starts.

### Session-prompt branch contract

Every `wayfinder/*/prompts/*-session-prompt.md` opens with this block, instantiated for the session's ticket:

```sh
git worktree add ../dsh-<ticket-id> -b <type>/<ticket-id>-<slug> master
cd ../dsh-<ticket-id>
node scripts/install-lefthook.mjs   # regenerate worktree-local hooks
```

- worktree: `../dsh-<ticket-id>`
- branch: `<type>/<ticket-id>-<slug>` where `type` is `feat`, `fix`, `refactor`, or `upstream`
- baseline: `master` at the named commit
- No commits land on `master`. All work stays on the branch.
- Landing: `gh pr create` (dependent chains use `gh stack link`), merged only after [dsh-pre-push-checks](../../../skills/dsh-pre-push-checks/SKILL.md) passes.

A canonical template lives at [`wayfinder/_templates/session-prompt.md`](../../../../wayfinder/_templates/session-prompt.md). The [dsh-data-agent PR workflow](../../../../docs/da-pr-workflow.md) names that template as the contract every session prompt must instantiate.

### One worktree and one branch per parallel ticket

A parallel session or subagent that owns a ticket works in its own worktree on its own `feat/` or `fix/` branch. [Responding to PR review on a stack](../../../../docs/cookbook/responding-to-pr-review-on-a-stack.md) already requires this, and [Landing an official GitHub PR stack](../../../skills/dsh-merging-stacked-prs/SKILL.md) requires a dedicated worktree for a stack. Dependent chains use native `gh stack` rather than hand-merged individual PRs. Intra-session parallel subagents either each take an Agent-tool worktree isolation plus a child branch, or serialize their commits; file-non-overlap is not a substitute for isolation.

### Direct-to-main allowlist

A commit may land on `master` without a branch only when its diff touches no `packages/*/src` and consists solely of Wayfinder map, ticket, or research prose, or an experiment probe script plus its audit-log entry. Anything else — including `feat`, `fix`, or `refactor` to `packages/`, `apps/`, `examples/`, `native/`, `python/`, or `scripts/` — goes on a branch and PR. The session prompt carries this as a pre-commit checklist so the author checks the diff surface, not the commit type, before pushing.

### Lead as integration boundary

The Lead session that aggregates parallel work inspects the final diff and runs the relevant checks before pushing, matching the [Agent Teams shared-checkout boundary](../../implemented/feature/2026-08-05-agent-teams.md): "The final diff and tests remain the Lead's integration boundary." A parallel batch does not start until the previous batch's PRs are merged or explicitly abandoned, so work never accumulates interleaved on one tip.

## Alternatives considered

### Why not auto-create worktrees in the harness?

The [Agent Teams note](../../implemented/feature/2026-08-05-agent-teams.md) already rejected this: worktree creation, branch naming, merge policy, ignored files, build artifacts, and cleanup are deployment choices, and auto-isolation would change the same-world contract that existing subagents and sandboxes expose. Reopening that decision would revisit a shipped architectural boundary to fix a prompt-level omission; the prompt is the cheaper place to fix.

### Why not rely on file-non-overlap for parallel subagents?

The `next-session-parallel-4-tickets.md` prompt already warns "注意避免写冲突" and falls back to serializing one subagent when two touch the same file. That is luck, not isolation: Bash, formatters, generators, and external writers bypass filesystem stale-version rejection, as the Agent Teams note records. Two sessions that believe their files do not overlap still share one index and one tip, so an `amend` or `reset` by one rewrites the other's commits.

### Why not a single global lock that serializes all sessions?

A lock prevents write contention but discards the parallelism the Wayfinder map is built to exploit, and it does nothing for reviewability: a long sequence of commits on `master` still cannot be reverted or reviewed per ticket. Branches give per-ticket review and revert; a lock gives neither.

### Why not enforce only with a gate, without the prompt contract?

A pre-push gate that rejects `feat`/`fix` on `master` is listed in [Acceptance criteria](#acceptance-criteria) and is necessary, but a gate that rejects work after it is done forces rework. The prompt contract makes the branch the first step, so the gate confirms intent rather than redirecting finished work. Both are needed; the gate is the backstop, not the primary.

### Why not keep the status quo and clean master per batch?

Manual cleanup after the fact cannot recover independent review boundaries once concerns are interleaved on one tip; the reflog's `amend` and `reset` already show shared history being rewritten. Per-ticket branches make cleanup structural rather than forensic.

## Acceptance criteria

- `git worktree list` shows one worktree per in-flight parallel ticket; the main checkout on `master` is clean between batches.
- `git for-each-ref refs/heads` shows a `feat/` or `fix/` branch for every in-flight ticket; no `feat()` or `fix()` commit that touches `packages/*/src` appears on `master` in `git log master`.
- Every new `wayfinder/*/prompts/*-session-prompt.md` opens with the branch-contract block and links the template.
- `pnpm run verify-agent-note-format` reports no violation for any note added under this policy.
- A pre-push gate rejects a `feat` or `fix` commit on `master` whose diff touches `packages/*/src`, per the root [AGENTS.md](../../../../AGENTS.md) rule that mechanically checkable invariants run as an executed top-level gate.
- The Lead runs `pnpm run typecheck` and the relevant surface tests before push; a parallel batch does not start while the previous batch has open PRs.

## Risks

- A worktree per ticket raises per-session setup cost and disk use; the repository already supports worktree-local Lefthook hooks and Git 2.26+ worktree configuration, so the cost is setup commands, not new infrastructure.
- Branch names derived from ticket ids can collide if two sessions pick the same slug; the contract's `<type>/<ticket-id>-<slug>` form uses the ticket id as the disambiguator.
- The direct-to-`main` allowlist depends on checking the diff surface, which a session can misread; the pre-push gate is the backstop that catches a `packages/*/src` touch claimed as documentation.
- Intra-session subagent worktrees via the Agent tool need their own child branches or serialized commits; without that, parallel subagents still share the session's branch and re-introduce the problem at a smaller scale.
- The twelve existing `2026-09-03` simplification drafts fail `verify-agent-note-format` today; this note does not fix them, and they keep the gate red until each gets a real `## Alternatives considered` section or is rejected.
