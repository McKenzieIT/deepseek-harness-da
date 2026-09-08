# Agent Note: Fold the drifted looksLikeSql SQL-detection regexes

Status: proposed

## Problem

Three hand-rolled "is this SQL?" predicates live in the eval package with no shared helper, and they have drifted on a load-bearing axis: (a) `packages/eval/eval-cli/src/context.ts:70` `looksLikeSql` — `/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/` tested on uppercased input (anchored at line start, full keyword set); (b) `context.ts:393` inline `sqlIsPresent` — `/\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE)\b/i` (unanchored, case-insensitive, **missing `ALTER` and `DROP`**); (c) `packages/eval/eval-runner/src/sql_semantic_judge.ts:117` `looksLikeSql` — `/\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/` on toUpperCase'd text (full set, unanchored). All three are alive (the context.ts engine-responder path + `sql_semantic_judge` the `LlmSqlSemanticJudge`). The drift is load-bearing: `context.ts:393` omits `ALTER` and `DROP`, so an `ALTER TABLE` / `DROP TABLE` statement is NOT detected as SQL at that site — it falls through to the `if (!sqlIsPresent && sql.length > 20 && !looksLikeToolCall(sql)) reply = sql` branch (`context.ts:394-395`) and the DDL string is echoed as the agent's natural-language reply. Independent of the stream-text-or-reasoning theme (that is `BlockAssembler` text+reasoning extraction, not SQL detection).

## Proposal

Fold — extract one `looksLikeSql(text)` into `eval-runner` (the natural home, next to `sql_semantic_judge`) and re-export it; have `context.ts` import it for both sites (`:70` and `:393`). Align on the full keyword set `{SELECT, WITH, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP}` and one case-handling. Fixes the `ALTER`/`DROP` misrouting for free.

## What we give up

Three private regexes let each site pick its own keyword set; folding commits them to one set. That independence already routed DDL to the reply path, so the lost flexibility is the flexibility to reintroduce the misroute.

## Alternatives considered

**Keep three regexes so each site can pick its keyword set.** It lost because `context.ts:393`'s `sqlIsPresent` already drifts by omitting `ALTER` and `DROP`, so a `DROP TABLE` statement is not detected there and is echoed as the agent's natural-language reply — the independence is what routed DDL to the reply path.

**Fix `sqlIsPresent` in place without folding.** Add `ALTER`/`DROP` to the `:393` regex and leave the three copies. It lost because three drifted copies of "is this SQL?" are the duplication this note removes, and fixing one site leaves the other two free to drift again; folding into one `looksLikeSql` in eval-runner fixes the misroute and prevents the drift from recurring.

## Acceptance criteria

- One `looksLikeSql` definition in `eval-runner` (grep confirms `context.ts` imports it for both sites).
- The full keyword set `{SELECT, WITH, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP}` at all sites.
- An `ALTER TABLE` / `DROP TABLE` statement is detected as SQL at `context.ts:393` (no longer echoed as the reply).
- `pnpm run lint && pnpm run typecheck && pnpm run test` green.

## Risks

Small surface, but the alignment changes behavior at `context.ts:393` (DDL now detected) — verify the eval-cli responder path still routes DDL correctly (to the SQL branch, not the reply branch). The case-handling choice (`toUpperCase` vs `/i`) must match the anchoring (anchored-at-line-start vs `\b`) — pick one shape, or the union may over- or under-match.
