# G37 — Manual execution adapter

**Type**: grilling
**Status**: open
**Blocked by**: [G17 Executor adapters](G17-native-source-adapters.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

When recurring work requires a person to act outside the platform, how should a manual execution target assign and claim that work, correlate the external action with an Attempt, accept outputs and evidence, and establish cancellation or an unknown outcome without introducing a separate Task lifecycle?

## Trigger and scope

[G17 Executor adapters](G17-native-source-adapters.md) defers generic manual execution from the first release. Revisit this ticket when real analytics or data-engineering workflows repeatedly stop because a person must perform an operation outside the platform, such as starting a job in a system with no callable interface and returning its result. Approval, clarification, and manual reconciliation of uncertain external effects remain existing first-release interactions; they do not require this adapter and are not deferred here.

Decide actor authorization, assignment and claiming, durable correlation, result submission, duplicate or late submissions, cancellation acknowledgement, abandonment, and any required UI. Preserve Task DAG admission, immutable write scopes, and the distinction between submitted evidence and verified completion. A person's confirmation must not silently release quarantined writes or turn an unverified result into verified completion.

Evaluate the smallest useful manual workflow against the frequency and cost of these interruptions, the effort to maintain assignment and evidence handling, and the benefit to users who cannot automate the external system. Do not add a general workforce-management system or enable manual execution merely because the generic adapter interface can represent it. Provider-specific automatic reconciliation and compensation remain owned by [Recovery and external-effect reconciliation](G23-recovery-and-external-effect-reconciliation.md).
