/**
 * External OpenAI-compatible HTTP embedder provider (`InfinityEmbedder`) +
 * `InfinityReranker` peer.
 *
 * Mirrors rbi `InfinityEmbedder`/`InfinityReranker` (rbi-retrieval/semantic/
 * embedder.py): a heavy embedder served over an OpenAI-compatible
 * `POST /v1/embeddings` endpoint (request `{model, input}`, response
 * `{data:[{embedding, index}]}`) + a `POST /rerank` endpoint (request
 * `{model, query, documents, return_documents}`, response
 * `{results:[{index, relevance_score}]}`). The serving framework + model
 * (Infinity/TEI/Ollama + bge-m3/Qwen3-Embedding) are user-deployed ops, not
 * map architecture decisions (T2 live-probe 2026-08-20: AGA relays chat
 * generation but NOT embeddings — 4 endpoint variants 404; the intranet
 * heavy embedder is an independent self-deployed service, NOT an AGA relay).
 *
 * Async (TS divergence): rbi uses blocking `urllib` in a short-lived
 * subprocess; a long-lived Cordis service must use async `fetch`.
 *
 * The HTTP logic lives in pure helpers (`infinityEmbed`/`infinityRerank`)
 * with an **injectable fetch** so the wire + `InferenceError` mapping are
 * unit-testable without binding a port. `InfinityEmbedder` is the
 * `ctx.embedder` Service; `InfinityReranker` is a plain `Reranker` (peer,
 * not a Service) wired into the retrieval provider's config.
 *
 * No auth (T2: user self-deployed; the endpoint URL+model are config). If a
 * self-deployed embedder later requires a bearer token, it rides the
 * credentials seam (`ctx.credentials.resolve`) — deferred (not blocking P5b;
 * intranet-security-first: the token never enters `process.env`).
 *
 * @module @deepseek-ai/dsh-embedder-http
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { EmbedderService, InferenceError, type Reranker, type EmbedResult } from '@deepseek-ai/dsh-embedder/src/index.ts'

/** Minimal fetch shape the helpers depend on (decoupled from the full Response type). */
export interface FetchLike {
  (url: string, init?: {
    readonly method?: string
    readonly headers?: Record<string, string>
    readonly body?: string
    readonly signal?: AbortSignal
  }): Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>
}

/** OpenAI-compatible `/v1/embeddings` response row. */
interface EmbeddingsResponse {
  readonly data?: readonly { readonly embedding?: number[]; readonly index?: number }[]
}

/** `/rerank` response row. */
interface RerankResponse {
  readonly results?: readonly { readonly index?: number; readonly relevance_score?: number }[]
}

/**
 * Embed texts via an OpenAI-compatible `POST /v1/embeddings` endpoint.
 * @param texts - the texts to embed.
 * @param opts - url/model/timeout/fetch + optional `expectedDim` for mismatch detection.
 * @returns one vector per text, aligned to the input order.
 * @throws {InferenceError} `not_ready` (HTTP 503), `unavailable` (other HTTP / network), `timeout`, `dim_mismatch`.
 */
export async function infinityEmbed(
  texts: readonly string[],
  opts: {
    readonly url: string
    readonly model: string
    readonly timeout?: number | undefined
    readonly fetch: FetchLike
    readonly expectedDim?: number | undefined
  },
): Promise<number[][]> {
  if (texts.length === 0) return []
  const { url, model, timeout = 2000, fetch: fetchImpl, expectedDim } = opts
  const ac = new AbortController()
  const to = setTimeout(() => ac.abort(), timeout)
  try {
    const r = await fetchImpl(`${url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
      signal: ac.signal,
    })
    if (!r.ok) {
      if (r.status === 503) throw new InferenceError('not_ready', `HTTP ${r.status}`)
      throw new InferenceError('unavailable', `HTTP ${r.status}`)
    }
    const j = await r.json() as EmbeddingsResponse
    const rows = (j.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const vecs = rows.map(x => x.embedding ?? [])
    if (expectedDim !== undefined && vecs.length > 0) {
      const obs = vecs[0]?.length ?? 0
      if (obs !== expectedDim) throw new InferenceError('dim_mismatch', `expected ${expectedDim}, got ${obs}`)
    }
    return vecs
  } catch (e) {
    if (e instanceof InferenceError) throw e
    const name = (e as { name?: string })?.name
    if (name === 'AbortError' || name === 'TimeoutError') throw new InferenceError('timeout', String(e))
    throw new InferenceError('unavailable', String(e))
  } finally {
    clearTimeout(to)
  }
}

/**
 * Re-score (query, text) pairs via a `POST /rerank` endpoint.
 * @param query - the query string to score the candidate texts against.
 * @param texts - the candidate texts to relevance-score; the returned scores align to this order.
 * @param opts - url/model/timeout/fetch for the rerank endpoint.
 * @returns one relevance score per text, aligned to the input order.
 * @throws {InferenceError} `unavailable` / `timeout`.
 */
export async function infinityRerank(
  query: string,
  texts: readonly string[],
  opts: { readonly url: string; readonly model: string; readonly timeout?: number | undefined; readonly fetch: FetchLike },
): Promise<number[]> {
  if (texts.length === 0) return []
  const { url, model, timeout = 2000, fetch: fetchImpl } = opts
  const ac = new AbortController()
  const to = setTimeout(() => ac.abort(), timeout)
  try {
    const r = await fetchImpl(`${url}/rerank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, query, documents: texts, return_documents: false }),
      signal: ac.signal,
    })
    if (!r.ok) throw new InferenceError('unavailable', `HTTP ${r.status}`)
    const j = await r.json() as RerankResponse
    const sc = new Array<number>(texts.length).fill(0)
    for (const x of j.results ?? []) {
      const idx = x.index
      if (typeof idx === 'number' && idx >= 0 && idx < texts.length) sc[idx] = x.relevance_score ?? 0
    }
    return sc
  } catch (e) {
    if (e instanceof InferenceError) throw e
    const name = (e as { name?: string })?.name
    if (name === 'AbortError' || name === 'TimeoutError') throw new InferenceError('timeout', String(e))
    throw new InferenceError('unavailable', String(e))
  } finally {
    clearTimeout(to)
  }
}

/** Configuration for the Infinity embedder provider. */
export interface InfinityEmbedderConfig {
  /** Base URL of the OpenAI-compatible embedding service (e.g. `http://127.0.0.1:4143`). */
  readonly url: string
  /** Model name the serving framework exposes (e.g. `bge-m3`). */
  readonly model: string
  /** Per-request timeout in ms (default 2000). */
  readonly timeout?: number
  /** Injectable fetch (tests); defaults to the global fetch. */
  readonly fetch?: FetchLike
}

/** Runtime configuration schema for the Infinity provider. */
export const Config: z<InfinityEmbedderConfig> = z.object({
  url: z.string(),
  model: z.string(),
  timeout: z.number().default(2000),
})

/**
 * External OpenAI-compatible embedder (`ctx.embedder` provider). The dimension
 * is discovered on the first embed and cached; a later mismatch throws
 * `InferenceError('dim_mismatch')` → the retrieval provider degrades to
 * BM25-only.
 */
export class InfinityEmbedder extends EmbedderService {
  static Config = Config

  private _dim: number | undefined
  private readonly _fetch: FetchLike

  constructor(ctx: Context, public config: InfinityEmbedderConfig) {
    super(ctx)
    this._fetch = config.fetch ?? globalThis.fetch as unknown as FetchLike
  }

  get dim(): number | undefined {
    return this._dim
  }

  get modelId(): string {
    return `infinity:${this.config.model}`
  }

  async embed(texts: readonly string[]): Promise<EmbedResult> {
    const vecs = await infinityEmbed(texts, {
      url: this.config.url,
      model: this.config.model,
      timeout: this.config.timeout,
      fetch: this._fetch,
      expectedDim: this._dim,
    })
    if (this._dim === undefined && vecs.length > 0) this._dim = vecs[0]?.length
    return vecs
  }
}

/** Constructor args for the plain InfinityReranker peer. */
export interface InfinityRerankerConfig {
  readonly url: string
  readonly model: string
  readonly timeout?: number
  readonly fetch?: FetchLike
}

/**
 * InfinityReranker peer (rbi mirror) — a plain `Reranker` (not a Service):
 * wire it into the retrieval provider's config as the reranker refinement
 * layer. Injectable fetch for testing.
 */
export class InfinityReranker implements Reranker {
  private readonly _url: string
  private readonly _model: string
  private readonly _timeout: number
  private readonly _fetch: FetchLike

  constructor(config: InfinityRerankerConfig) {
    this._url = config.url
    this._model = config.model
    this._timeout = config.timeout ?? 2000
    this._fetch = config.fetch ?? globalThis.fetch as unknown as FetchLike
  }

  get modelId(): string {
    return `infinity:${this._model}`
  }

  async rerank(query: string, texts: readonly string[]): Promise<readonly number[]> {
    return infinityRerank(query, texts, {
      url: this._url,
      model: this._model,
      timeout: this._timeout,
      fetch: this._fetch,
    })
  }
}

export default InfinityEmbedder
