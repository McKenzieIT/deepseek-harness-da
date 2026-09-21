# T29 — DA CI 与 upstream workflow ownership

**Type**: grilling  ·  **Status**: open
**Part of**: [repo build and theme infra map](../map.md)
**Migrated from**: [semantic-layer CB-5](../../semantic-layer/tickets/CB5-da-ci-upstream-boundary.md)

## Question

Data-agent fork-specific dependencies、platform setup、resource budgets and test adaptations should be owned by which CI lanes, and which changes must stay out of upstream-shared workflows so future upstream syncs remain reviewable?

## Must decide

- Whether DA needs path-scoped CI lanes and which packages, scripts, fixtures, and operating systems they own.
- Whether shared `build:lib:host` memory requirements and upstream test changes are repository-wide fixes or fork-only adaptations.
- How fork-only issue-policy credentials and workflow conditions remain explicit without editing upstream behavior accidentally.
- Which existing workflow edits should remain, move to DA-owned lanes, or be reverted during the next upstream sync.

## Scope

This ticket owns repository CI and upstream-sync policy only. It does not reopen semantic-layer runtime or evaluation implementation work.
