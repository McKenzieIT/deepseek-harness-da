/**
 * FakeHash embedder provider — the zero-dependency default tier.
 *
 * Mirrors rbi `FakeHashEmbedder` (rbi-retrieval/semantic/embedder.py): a
 * deterministic sha256-token-hash → L2-normalized vector stub. No egress, no
 * model load — clone-and-run. **Weak semantic signal** (hash-based, not
 * meaning): like rbi's FakeHash, this proves the seam + hybrid mechanism, NOT
 * retrieval quality (real quality needs the external OpenAI-compatible
 * embedder tier, `dsh-embedder-http`). The `InferenceError`→BM25-only
 * degradation is exercised by the retrieval provider, not here (FakeHash is
 * always available).
 *
 * Also exports `FakeReranker` (rbi peer) — a query-token-recall fraction
 * scorer, used as the reranker peer-protocol stub in retrieval tests +
 * as a no-egress default reranker.
 *
 * @module @deepseek-ai/dsh-embedder-fakehash
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createHash } from 'node:crypto'
import { EmbedderService, type Reranker, type EmbedResult } from '@deepseek-ai/dsh-embedder/src/index.ts'
import { tokenize } from '@deepseek-ai/dsh-embedder/src/tokenize.ts'

export { tokenize } from '@deepseek-ai/dsh-embedder/src/tokenize.ts'

/** Configuration for the FakeHash embedder provider. */
export interface FakeHashConfig {
  /** Hash-vector dimension (default 256, mirrors rbi + the P5 prototype). */
  readonly dim?: number
}

/** Runtime configuration schema for the FakeHash provider. */
export const Config: z<FakeHashConfig> = z.object({
  dim: z.number().default(256),
})

/**
 * Project one text to a deterministic L2-normalized hash vector (rbi
 * `FakeHashEmbedder` mirror): each token's sha256 → a bucket index (mod dim),
 * the bucket counts form the vector, then L2-normalized. Exported so the
 * hash projection is unit-testable without a Cordis context.
 * @param text - the text to embed.
 * @param dim - the hash-vector dimension.
 * @returns the L2-normalized hash vector.
 */
export function hashVec(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0)
  for (const tok of tokenize(text)) {
    const h = Number(createHash('sha256').update(tok).digest().readBigUInt64BE(0) % BigInt(dim))
    v[h] = (v[h] ?? 0) + 1
  }
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  if (n > 0) for (let i = 0; i < dim; i++) v[i] = (v[i] ?? 0) / n
  return v
}

/**
 * Query-token-recall fraction (rbi `FakeReranker` mirror): the fraction of
 * the query's tokens that also appear in the text. 0 when the query has no
 * tokens; 1 when every query token is present.
 * @param query - the query whose tokens are checked for recall.
 * @param text - the text whose token set is checked for query-token hits.
 * @returns the fraction of query tokens present in the text (0..1).
 */
export function fakeRecall(query: string, text: string): number {
  const qt = new Set(tokenize(query))
  if (qt.size === 0) return 0
  const tt = new Set(tokenize(text))
  let hit = 0
  for (const t of qt) if (tt.has(t)) hit += 1
  return hit / qt.size
}

/**
 * Zero-dependency FakeHash embedder (`ctx.embedder` provider). Always
 * available (never throws `InferenceError`); the BM25-only degradation is
 * exercised against the HTTP tier, not here.
 */
export class FakeHashEmbedder extends EmbedderService {
  static Config = Config

  private readonly _dim: number

  constructor(ctx: Context, config: FakeHashConfig = {}) {
    super(ctx)
    this._dim = config.dim ?? 256
  }

  get dim(): number {
    return this._dim
  }

  get modelId(): string {
    return `fake-hash-${this._dim}`
  }

  async embed(texts: readonly string[]): Promise<EmbedResult> {
    return Promise.resolve(texts.map(t => hashVec(t, this._dim)))
  }
}

/**
 * FakeReranker peer (rbi mirror) — query-token-recall fraction scorer. A
 * plain `Reranker` (not a Service): wire it into the retrieval provider's
 * config as the reranker peer-protocol refinement layer.
 */
export class FakeReranker implements Reranker {
  get modelId(): string {
    return 'fake-recall'
  }

  async rerank(query: string, texts: readonly string[]): Promise<readonly number[]> {
    return Promise.resolve(texts.map(t => fakeRecall(query, t)))
  }
}

export default FakeHashEmbedder
