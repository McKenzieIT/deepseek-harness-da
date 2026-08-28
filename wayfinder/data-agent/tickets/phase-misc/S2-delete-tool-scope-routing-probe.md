# S2 — Delete the tool-scope-routing probe package

**Type**: task (deletion)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: unclaimed
**Blocked by**: new-session second verification (S-series process)
**Related**: [E-DA4](E-DA4-delegate-query-engine-probe.md) (resolved probe), [P-DA4](P-DA4-scope-routing-tools.md) (real scope-routing tools, separate), `map.md:153` (E-DA4 decision), `map.md:154` (G-DA5)

## Question
`packages/data/tool-scope-routing` is a stale feasibility probe, not a real package. Delete it.

## Original design purpose
`dev/delegate-probe.ts` was the **E-DA4 feasibility probe** (resolved 2026-08-26): validate that directly instantiating `Nl2sqlEngine` across scopes (`delegate_query`) is end-to-end feasible (24/24 assertions). It was a one-shot validation artifact.

## Why no longer needed
- The probe's PURPOSE was to validate feasibility — **done** (E-DA4 resolved 2026-08-26).
- It was **never meant to be a shipped package**: no `src/index.ts`, no `tsconfig.json`, no `README`, no `main`/`exports`/`files` in `package.json`, not registered in any aggregate tsconfig. Its sole content is `dev/delegate-probe.ts`.
- The real scope-routing implementation is a **separate ticket** ([P-DA4](P-DA4-scope-routing-tools.md) — `switch_scope`/`delegate_query` tools), not this package.

## Replacement
The real scope-routing tools per [P-DA4](P-DA4-scope-routing-tools.md). The probe's findings are preserved in `map.md:153` + the E-DA4 ticket (reproducible).

## Evidence
- `map.md:153` (E-DA4 resolved) + `map.md:154` (G-DA5 → "后续 ticket：P-DA4 scope routing 工具实现").
- `tickets/phase-misc/E-DA4-delegate-query-engine-probe.md` + `P-DA4-scope-routing-tools.md`.
- constraints gate: 12× non-conformant (no src/tsconfig/README/registration; `private:true`, no `publishConfig`, no `main`/`types`/`exports`).
- `ls packages/data/tool-scope-routing/` → only `dev/`, `package.json`, `node_modules` (NO `src/`).

## Risks
None — no consumer, no `src/`, no registration. The probe's design rationale is preserved in `map.md` + E-DA4 ticket.

## Acceptance criteria
- `packages/data/tool-scope-routing/` deleted (package.json + dev/ + node_modules link).
- `pnpm` re-reads `packages/data/*` automatically (no workspace manifest edit needed).
- constraints gate: the 12 `tool-scope-routing` violations gone.
- `verify-cordis-config` + `tsc -b` unaffected (the package was never referenced).

## Follow-ups
- [P-DA4](P-DA4-scope-routing-tools.md) owns the real scope-routing implementation.

---
**S-series process**: RESOLVED 2026-08-28.

## Resolution
2nd verification confirmed: no `src/`, no production consumers (only pnpm-lock + wayfinder prototype JSDoc refs). Package deleted. Constraints gate: 12 tool-scope-routing violations eliminated. E-DA4 findings preserved in map.md:153 + E-DA4 ticket.
