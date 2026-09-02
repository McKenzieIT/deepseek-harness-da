/**
 * Phase 5d (D3ii) — eval-cli boot explicit scopeId tests.
 *
 * Verifies the D3ii contract on the eval-cli boot() boundary:
 *  (b) boot() without scopeId fail-louds with the D3ii no-default-pointer
 *      error rather than silently falling back to a hardcoded 'k11'. The
 *      throw is at the top of boot(), before ctx is created or any plugin
 *      mounts, so this is a pure fast test (no schema dir / LLM key needed).
 *
 *  (a) boot() with explicit scopeId (positive case + scopeId propagation to
 *      CtxOdpsAdapter/CtxQueryExecutor/SemanticLayerService/Nl2sqlAgentResponder)
 *      — the positive case is covered by main.spec.ts's "loads and runs with
 *      fake key" CLI integration test, which runs the full CLI (subprocess)
 *      relying on the CLI's `--scope-id` default ('k11') → boot({scopeId}) →
 *      schema mount + collaborator construction. That test does NOT explicitly
 *      pass `--scope-id` and asserts only status===0 + stdout strings; it does
 *      NOT assert scopeId→adapter propagation. The in-process boot() path
 *      cannot be tested here because the test-invariants setup
 *      (scripts/test-invariants.ts) requires a `src/invariant.ts` companion
 *      for any package whose tests call ctx.plugin() in-process, and eval-cli
 *      has none (its existing tests all run via subprocess or test pure
 *      functions). Propagation is therefore not runtime-asserted within
 *      eval-cli's own tests; it is structurally guaranteed by the constructor
 *      params (CtxOdpsAdapter/CtxQueryExecutor/Nl2sqlAgentResponder all take
 *      scopeId as a required constructor arg, typechecked) and runtime-asserted
 *      in eval-runner-service.spec.ts, which uses the same forked adapter
 *      pattern (capturedScopeIds: every ctx.query.execute scopeId equals the
 *      runBatch scopeId).
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/scope-id.spec.ts
 */
import { describe, it, expect } from 'vitest'
import { boot } from '../src/context.ts'

describe('Phase 5d (D3ii) — eval-cli boot explicit scopeId', () => {
  it('boot() without scopeId throws the D3ii no-default-pointer error (before any plugin mount)', async () => {
    // The D3ii throw is at the top of boot(), before ctx is even created —
    // so no schema dir / LLM key / query sidecar is needed. This is the
    // fail-loud contract: no silent 'k11' fallback.
    //
    // The positive case (boot WITH scopeId → schema mount + collaborators)
    // is covered by main.spec.ts's CLI integration test, which runs boot()
    // in a subprocess (sidestepping the test-invariants companion requirement).
    await expect(boot({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      today: '20260902',
      withQuery: false,
      noSqlJudge: true,
      queryExpansion: false,
      // scopeId intentionally omitted → D3ii fail-loud
    })).rejects.toThrow('eval-cli boot: explicit scopeId required (D3ii: no default pointer)')
  })
})
