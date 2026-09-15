# G33 — Extensible Task Graph authorization policy

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

When should the first-release closed actor-command matrix become an extensible Task Graph authorization capability?

Trigger this ticket only when a second independently evolving permission model appears, such as cross-organization remote workers, an external control plane, multi-tenant delegated administration, or enterprise reviewer/operator separation that the core `user`, `orchestrator`, `worker`, `executor-adapter`, `verifier`, and `driver` roles cannot express. Adding another implementation under an existing role does not trigger it.

Define principal and actor identity, command capability vocabulary, resource scope, audience, delegation versus impersonation, expiry, revocation or introspection, policy composition, default-deny behavior, audit records, secret handling, Session compatibility, and migration from the closed matrix without allowing plugins to silently expand core write authority.

## Inputs from the G13 resolution

The first release uses a closed Host-enforced command matrix for `user`, `orchestrator`, `worker`, `executor-adapter`, `verifier`, and `driver`; roles are per-command context, identifiers and `ExecutionTicket` values are not credentials, and unknown actors or commands fail closed. Every retryable or cross-process command has a `TaskGraphCommandId`; replaying the same payload is idempotent, while reusing the identifier with different content fails. This ticket must preserve those defaults and is triggered only by a second independently evolving authorization model, not by another implementation of an existing worker, adapter, or verifier role.
