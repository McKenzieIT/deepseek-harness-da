/// <reference types="node" />
/**
 * Carry-forward #37 (D3ii completeness) — harness-responder explicit scopeId.
 *
 * Verifies the D3ii contract on the HarnessAgentResponder.bootContext() path:
 *  (a) Positive — the explicit scopeId passed via opts flows into the
 *      SemanticLayerService config (NOT the old hardcoded 'k11'). Asserted
 *      via the protected semanticLayerConfig() seam, which bootContext() calls
 *      before any plugin mount. The in-process full boot cannot be tested
 *      here because bootContext() mounts ~15 plugins via ctx.plugin() and
 *      eval-cli lacks the test-invariants companion (src/invariant.ts) that
 *      the setup requires for any in-process ctx.plugin() call — the same
 *      constraint documented in scope-id.spec.ts for context.ts boot(). The
 *      seam lets us assert the SemanticLayerService config (what the plugin
 *      would receive) without booting.
 *
 *  (b) D3ii throw — bootContext() (reached via respond() → ensureContext())
 *      fail-louds with the no-default-pointer error when scopeId is absent,
 *      rather than silently falling back to a hardcoded 'k11'. The throw is
 *      at the top of bootContext() (via the seam), before ctx is created or
 *      any plugin mounts, so this is a pure fast test (no schema dir / LLM
 *      key needed). This exercises the actual bootContext path (not just the
 *      seam in isolation).
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/harness-responder.spec.ts
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { HarnessAgentResponder } from '../src/harness-responder.ts'

// Repo root (tests/ → eval-cli/ → eval/ → packages/ → repo root).
const ROOT = join(__dirname, '..', '..', '..', '..')
const PRESET_DIR = join(ROOT, 'apps/cli/config/agent-presets/data-agent')

/**
 * Test-only subclass that exposes the protected semanticLayerConfig() seam so
 * the positive case can assert the SemanticLayerService config (scopeId flows
 * through) WITHOUT booting the full ~15-plugin context (infeasible in eval-cli
 * — no test-invariants companion; see scope-id.spec.ts for the same constraint).
 */
class ExposedHarnessResponder extends HarnessAgentResponder {
  exposeSemanticLayerConfig(): { semanticRoot: string; scopeId: string } {
    return this.semanticLayerConfig()
  }
}

describe('Carry-forward #37 (D3ii) — harness-responder explicit scopeId', () => {
  it('positive: semanticLayerConfig() returns the explicit scopeId (not the old hardcoded k11)', () => {
    // Construct with an explicit non-k11 scopeId. The constructor only checks
    // the preset file exists (no ctx.plugin), so this is safe without the
    // test-invariants companion.
    const responder = new ExposedHarnessResponder({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      variant: 'A',
      presetDir: PRESET_DIR,
      today: '20260902',
      scopeId: 'custom-scope-42',
    })

    const config = responder.exposeSemanticLayerConfig()
    // D3ii: the explicit scopeId flows into the SemanticLayerService config —
    // NOT the old hardcoded 'k11' (the silent default pointer anti-pattern).
    expect(config.scopeId).toBe('custom-scope-42')
    expect(config.scopeId).not.toBe('k11')
    expect(config.semanticRoot).toBe('examples/k11-semantic-layer')
  })

  it('D3ii throw: bootContext (via respond) without scopeId fail-louds before any plugin mount', async () => {
    // Construct WITHOUT scopeId — the constructor succeeds (preset exists),
    // but bootContext() (reached via respond() → ensureContext()) throws at
    // the top via the seam, before ctx is created or any plugin mounts. This
    // is the no-default-pointer contract: no silent 'k11' fallback.
    const responder = new HarnessAgentResponder({
      schemaDir: 'examples/k11-semantic-layer',
      provider: 'aga',
      model: 'qwen3.7-max',
      variant: 'A',
      presetDir: PRESET_DIR,
      today: '20260902',
      // scopeId intentionally omitted → D3ii fail-loud
    })

    await expect(responder.respond('test question')).rejects.toThrow(
      'harness-responder bootContext: explicit scopeId required (D3ii)',
    )
  })
})
