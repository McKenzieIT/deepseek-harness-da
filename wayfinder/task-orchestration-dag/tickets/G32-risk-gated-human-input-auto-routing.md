# G32 — Risk-gated human input auto-routing

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

When should the explicit-first human-input router add a classifier, validate it through offline replay and later shadow/suggestion deployment, and promote qualified proposals into automatic low-risk BTW handling?

Use the first release's real routing evidence and [G19 human-input routing research](../research/G19-human-input-routing-frontier.md) to define classifier and prompt versioning, representative Chinese and English data-agent eval sets, confidence calibration, risk-weighted loss, destructive false-positive limits, mixed-intent handling, user correction labels, privacy and retention, per-user preferences, UI disclosure, canary scope, kill switch, rollback, and policy-version persistence.

The promotion is an explicit implementation and release decision; accumulated data never enables it automatically. The first release remains explicit BTW with ordinary Enter defaulting to Queue and runs no online classifier; it records explicit route choices and outcomes for later offline replay. Automatic Steer, Interrupt, Cancel, Plan mutation, budget changes, verification relaxation, result-unknown retry, and table or partition write-target changes remain prohibited unless a later named follow-up reopens them with separate evidence.
