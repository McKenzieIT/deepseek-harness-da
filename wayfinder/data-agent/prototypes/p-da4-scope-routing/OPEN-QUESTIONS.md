# Open Questions & Tradeoffs

## Settled (proposed — pending your confirmation)

### Q1: Subagent scope context → (乙) override active scope

The subagent runs the normal pipeline with `ctx.scopes.active()` overridden
to the target scope. All existing infra just works.

**Tradeoff**: the subagent DOES NOT share the parent's scope-registry state.
It gets a scoped config override on `ctx.schema` pointing to the target's
`semanticRoot` + `scopeId`. This means:
- Pro: parent's active scope is undisturbed
- Pro: no file-level mutex contention on scopes.yaml
- Con: if the subagent needs to switch scope (unlikely), it can't

### Q2: delegate_query return → (丙) both structured + text

Subagent runs all 4 phases (U+G+E+I) and returns:
- `outcome`: QueryOutcome (columns/rows/error)
- `interpretation`: the subagent's INTERPRETATION text

**Tradeoff**: running INTERPRETATION in the subagent adds one LLM call but
gives the main agent a pre-digested per-scope answer it can synthesize from
without reading raw rows (which may be large).

### Q3: Harness fallback → (甲) system-prompt section

Dynamic section via `ctx.systemPrompt.section()`. Two layers:
1. Static: scope list always in prompt (passive awareness)
2. Dynamic: alias-match hint when user mentions a non-active scope

**Tradeoff**: adds ~200-400 tokens to system prompt when multiple scopes are
registered. Acceptable for 2-5 scopes. If we hit 20+ scopes, need pagination
or summary (not yet a concern).

### Q4: LLM ignores hint → (甲) allow

Harness never forces. The hint is floor-not-ceiling.

---

## Genuinely Open (need your input)

### Q5: delegate_query phase whitelist placement

Current proposal: `delegate_query` is UNDERSTANDING-only.

But consider: the main agent might realize during INTERPRETATION that it needs
data from another scope to complete the synthesis ("user asked to compare K11
vs X63 daily active"). By then it's past UNDERSTANDING.

Options:
- **(A)** UNDERSTANDING-only (current): rely on the model to recognize
  multi-scope questions upfront. If it misses, the next user message triggers
  a new question with correct routing.
- **(B)** UNDERSTANDING + INTERPRETATION: allow delegation during synthesis
  for "oh, I need the other scope's data too" moments. Phase-gate allows it
  because delegate_query is read-only from the main pipeline's perspective.
- **(C)** UNIVERSAL: completely unrestricted. Simplest, but weakens the
  phase-gate discipline.

**Lean**: (B) — UNDERSTANDING + INTERPRETATION. It covers the "compare" case
without opening the gate in GENERATION/EXECUTION where scope confusion is
most dangerous.

### Q6: subagent lifetime and cost control

The subagent runs a full 4-phase pipeline. Uncapped, it could make 60 LLM
calls (PipelineConfig.max_llm_calls_per_turn). For a multi-scope query
dispatching to 3 scopes, that's 180 LLM calls total.

Options:
- **(A)** Subagent inherits parent's budget (shared max_llm_calls_per_turn).
  Con: one slow subagent starves the others + the main agent.
- **(B)** Subagent gets a REDUCED budget (e.g. max_llm_calls = 20, roughly
  1 pass through U+G+E+I without retries). Con: can't self-heal on failures.
- **(C)** Subagent gets full budget but there's a TOTAL cap on delegate_query
  calls per question (e.g. max 3 delegations). Con: arbitrary limit.

**Lean**: (B) + (C) combined. Reduced per-subagent budget (20 calls) AND max
3 delegations per question. Keeps total worst-case at ~60 LLM calls.

### Q7: system-prompt scope list token overhead

With 2 scopes (K11 + X63) it's ~200 tokens. What's the expected scope count
in production? If it could grow to 10+, we need a pagination strategy (e.g.
only inject the top-3 by alias relevance + a "use list_scopes for more" note).

### Q8: delegate_query and the "spawn-in-process" substrate

The ticket says "subagent 使用 spawn-in-process（不继承父上下文）". This substrate
doesn't exist yet. The prototype uses `ctx.agentLoop.createAgent()` which IS
the existing substrate. Is `spawn-in-process` a new lightweight mechanism we
need to design, or is `createAgent()` sufficient?

Concerns with `createAgent()`:
- Full ReactLoopAgent overhead (session persistence, registry entry)
- Single-use agents shouldn't persist
- Cleanup: must explicitly `dispose()` after completion

Alternative: a lighter `ctx.agentLoop.runEphemeral(options)` that creates,
runs-to-completion, extracts results, and self-destructs — no persistence,
no registry entry, no session materialization.

**Lean**: use `createAgent()` for now (it works). If perf matters, add
`runEphemeral()` later as a fast-path optimization. The tool's API doesn't
change either way — it's an internal implementation detail.
