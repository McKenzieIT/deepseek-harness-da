# PB-deferred: patrol-mode add Config (most-involved R6 fix)

**Type**: task (AFK)
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03)
**Spawned from**: PB-COMPLY plugin-body audit, R6 finding `packages/data/patrol-mode/src/index.ts:41,44`

## Question

patrol-mode is the R6 "extreme case" — `PatrolService` has **no** `static Config` (only a plain `interface PatrolConfig`), and `DEFAULT_MAX_EDITS_PER_ROUND` / `DEFAULT_CONFIRM_TIMEOUT_MS` are bare module constants, so cordis.yml cannot tune max-edits/round or confirm-timeout. (PatrolService also imports neither zod nor schemastery today.)

No removal/rehome proposal exists for patrol-mode (an earlier draft of this ticket cited a non-existent simplification note — corrected: the 2026-09-03 simplification notes target other packages, not patrol-mode).

## Fix (task — full Config plumbing)

1. `import z from '@deepseek-ai/schemastery'`.
2. Add `static Config: z<PatrolConfig> = z.object({ maxEditsPerRound: z.number().default(DEFAULT_MAX_EDITS_PER_ROUND), confirmTimeoutMs: z.number().default(DEFAULT_CONFIRM_TIMEOUT_MS), scope: z.string().default('') })` to PatrolService.
3. `constructor(ctx, config: PatrolConfig = {})` — set `this.config` from config with `?? DEFAULT_*` fallbacks (mirror phase-gate's cfg merge).
4. `apply(ctx, config: PatrolConfig = {}) { ctx.plugin(PatrolService, config) }`.
5. `start(opts?)` — fall back to `this.config.*` (not the DEFAULT consts directly); DEFAULT consts remain only as the schemastery `.default()` values.

## 为何留后续

Not a behavior-blocker (patrol runs correctly with the hardcoded defaults), but this is the most involved of the R6 set — full Config plumbing from scratch (static Config + constructor signature + apply signature + start fallbacks), vs phase-gate/tool-search which only added fields to an existing Config. Deferred to a focused session to avoid risk in the 24-fix batch. Schemastery `z<PatrolConfig>` typechecks (optional-interface accepts defaulted-schema output).
