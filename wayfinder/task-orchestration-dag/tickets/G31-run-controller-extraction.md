# G31 — Run Controller extraction threshold

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md), [G24 Advanced routing, parallelism, and optimization](G24-advanced-routing-and-parallelism.md)
**Blocks**: —

## Question

When should Plan Run budgets, holds, Stop Reasons, and continuation policy be extracted into a reusable Run Controller capability?

Require a second consumer or independently evolving policy/provider family. If triggered, define transaction ownership, durable usage and stop history, policy-version changes, Plan consistency, recovery, API stability, and migration without splitting one scheduling decision across two authorities.
