/**
 * P-DA4b — Integration patch sketch for phase-gate.ts.
 *
 * Shows the exact code changes needed in the production phase-gate.ts to wire
 * up dynamic conventions + state reset. This is NOT a standalone runnable file;
 * it documents the diff against packages/data/phase-gate/src/phase-gate.ts.
 *
 * ## Changes summary:
 *
 * 1. DELETE: `const SQL_CONVENTIONS = '...'` (line 120)
 * 2. ADD: import { assembleSqlConventions, extractScopeConventions } from './dynamic-conventions'
 * 3. ADD: import { resetScopeSensitiveState } from './state-reset'
 * 4. MODIFY: system-prompt/assemble hook (line 588) — replace static push with dynamic assembly
 * 5. ADD: `scopes/active-changed` listener in constructor
 */

// ── PATCH 1: Delete the hardcoded const ─────────────────────────────────
// DELETE lines 120 (the entire SQL_CONVENTIONS const):
// const SQL_CONVENTIONS = 'SQL conventions (MaxCompute/hive dialect): ...'

// ── PATCH 2: New imports at top of file ─────────────────────────────────
// import { assembleSqlConventions, extractScopeConventions } from './dynamic-conventions.ts'
// import { resetScopeSensitiveState } from './state-reset.ts'

// ── PATCH 3: Replace line 588 in system-prompt/assemble ─────────────────
// BEFORE:
//   if (phase === Phase.GENERATION) {
//     sections.push({ name: 'sql-conventions', text: SQL_CONVENTIONS })
//   }
//
// AFTER:
//   if (phase === Phase.GENERATION) {
//     const scopeInput = extractScopeConventions(this.ctx.schema?.semanticRoot ?? '')
//     sections.push({ name: 'sql-conventions', text: assembleSqlConventions(scopeInput) })
//   }
//
// NOTE: `this.ctx.schema?.semanticRoot` already delegates to the active scope
// via ctx.scopes.active().semanticRoot (P1 pipe) — no additional scope
// resolution needed. When scope-registry is unmounted, it falls back to the
// static config (which is the K11 path in production — preserving backwards
// compat).

// ── PATCH 4: Add event listener in constructor ──────────────────────────
// In PhaseGate constructor, after `this.cfg = { ... }`:
//
//   ctx.on('scopes/active-changed', (scopeId) => {
//     if (scopeId === undefined) return
//     for (const [_agentId, state] of this.sessions) {
//       if (state.current_phase !== 'COMPLETE' && state.current_phase !== 'DECLINED') {
//         resetScopeSensitiveState(state, scopeId)
//       }
//     }
//   })

// ── PATCH 5: PHASE_TOOLS additions (from P-DA4) ────────────────────────
// UNDERSTANDING_TOOLS += ['switch_scope', 'delegate_query', 'resolve_scope']
// (registered in the tool-scope-routing package, not in phase-gate itself —
// only the whitelist names go here)

export {}
