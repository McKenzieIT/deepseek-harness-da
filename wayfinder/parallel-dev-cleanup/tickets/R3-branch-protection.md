# R3: origin/master branch protection (admin action)

Branch: (none — GitHub admin setting, session cannot enable)

## Question

Enable origin/master branch protection to close the `--no-verify` / no-lefthook bypass.

## Context

② added the CI gate (`.github/workflows/no-production-src-on-master.yml`, PR #6 merged) — reactive (alerts after a bypassed direct push). The REAL prevention is branch protection (GitHub admin setting the session cannot enable; called out in ②'s PR body).

## Action (admin, on github.com/McKenzieIT/deepseek-harness-da/settings/branches → master)

- "Restrict pushes" — block direct pushes to master (only PRs merge).
- "Require status checks to pass before merging" — require the `verify-no-production-src-on-master` check (+ CI).

Once on, `--no-verify` is fully closed (direct pushes blocked pre-push; the local pre-push gate + the CI gate become belt-and-suspenders).
