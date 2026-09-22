/**
 * Tests for the embedder Service Definition: a minimal concrete provider
 * registers under the `embedder` service name (so consumers reach it as
 * `ctx.embedder`), and `InferenceError` builds the message the BM25-only
 * degradation path logs — bare kind when no detail is supplied, `kind: detail`
 * when one is.
 *
 * Provider behavior (FakeHash / HTTP) lives with those packages; here we pin
 * only the abstract seam's registration plus the typed-failure vocabulary.
 *
 * Run: `pnpm vitest run packages/embedder/embedder`
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { EmbedderService, InferenceError } from '@deepseek-ai/dsh-embedder'
import type { EmbedResult } from '@deepseek-ai/dsh-embedder'

/** Minimal concrete provider: one deterministic vector per input text. */
class StubEmbedder extends EmbedderService {
  get modelId(): string {
    return 'stub-embedder'
  }

  embed(texts: readonly string[]): Promise<EmbedResult> {
    return Promise.resolve(texts.map(text => [text.length, 0, 0]))
  }
}

describe('EmbedderService seam', () => {
  it('registers a concrete provider under the embedder service name', async () => {
    const ctx = new Context()
    await ctx.plugin(StubEmbedder)
    expect(ctx.embedder).toBeInstanceOf(StubEmbedder)
    expect(ctx.embedder.modelId).toBe('stub-embedder')
    await expect(ctx.embedder.embed(['a', 'bb'])).resolves.toEqual([[1, 0, 0], [2, 0, 0]])
  })
})

describe('InferenceError', () => {
  it('carries the bare kind as its message when no detail is supplied', () => {
    const error = new InferenceError('unavailable')
    expect(error.message).toBe('unavailable')
    expect(error.kind).toBe('unavailable')
    expect(error.name).toBe('InferenceError')
    expect(error).toBeInstanceOf(Error)
  })

  it('appends a colon-separated detail when one is supplied', () => {
    const error = new InferenceError('dim_mismatch', 'cached 768, got 1024')
    expect(error.message).toBe('dim_mismatch: cached 768, got 1024')
    expect(error.kind).toBe('dim_mismatch')
  })

  it('keeps the bare kind for an explicitly empty detail (no dangling colon)', () => {
    expect(new InferenceError('timeout', '').message).toBe('timeout')
  })
})
