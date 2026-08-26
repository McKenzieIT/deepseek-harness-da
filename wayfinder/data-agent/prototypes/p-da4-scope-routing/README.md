# P-DA4 Scope-Routing Tools — Prototype

Prototype for the "LLM 工具自决 + harness 兜底" scope routing approach (G-DA5 decision).

## Design Decisions (proposed)

| # | Question | Proposed Answer | Rationale |
|---|----------|-----------------|-----------|
| 1 | subagent scope context | (乙) subagent walks normal pipeline, `ctx.scopes.active()` overwritten | Zero new concepts — all existing infra (semantic-layer, corpus, phase-gate) just works with a different active scope |
| 2 | `delegate_query` returns | (丙) both: `QueryOutcome` (structured rows) + subagent INTERPRETATION text | Main agent needs the text for cross-scope synthesis; structured data for precision |
| 3 | harness fallback inject | (甲) system-prompt section (dynamic, each turn) | Cleanest integration via existing `system-prompt/assemble` waterfall; no fake tool results |
| 4 | LLM ignores multi-scope hint | (甲) allow — harness only suggests, never forces | Respects G-DA5 principle: hint is floor, not ceiling; strong models route better than the alias heuristic |

## File Layout

```
src/
  index.ts            — plugin entry (apply + inject)
  list-scopes.ts      — list_scopes tool
  switch-scope.ts     — switch_scope tool
  delegate-query.ts   — delegate_query tool (subagent dispatch)
  scope-hint.ts       — harness fallback (system-prompt section + alias matching)
  aliases.ts          — scope metadata alias resolution
  types.ts            — shared types
```

## Package Coordinates (target)

```
packages/data/tool-scope-routing/
  package.json        — @deepseek-ai/dsh-tool-scope-routing
  src/                — above layout
```

Registers via bundle preset row (additive-only, no core edits).
