/**
 * D2e corpus enrichment (2026-08-21) — pure projection from semantic-layer
 * events + terminology to a retrieval corpus.
 *
 * Packs `params_fields` (field name + field description) + `terminology` slang
 * into the indexed `description`; does NOT index `domain` (probe refuted it:
 * coarse Chinese domain names inflate false-positives, losing item.add /
 * shop.buy). This is the production form of the probe_hypotheses.py
 * `params+term` variant (pack-into-description ×1) that measured 54.8% strict
 * / 58.1% loose recall on the REAL default prefetch path (Bm25Linker). The
 * weighting variant (×3) was refuted by the same probe (equal-strict,
 * worse-loose), and term-only (64.5%) was judged 31-case small-sample noise
 * (it flips to 48.4% on the §7 bigram-only port) — see the D2e ticket
 * Resolution + probe_hypotheses.py `main_linker_fidelity`.
 *
 * The output shape (`EventCorpusItem`) is structurally identical to the
 * retrieval sinks — `DataSourceDoc` (nl2sql-engine `Bm25Linker`) and
 * `RetrievalCorpusItem` (retrieval-inproc `HybridRetriever`): all are
 * `{ id, description?, metrics?, payload? }`. No runtime dep on either: the
 * `Bm25Linker`/`HybridRetriever` `buildCorpus` applies field weights as token
 * repetition over this shape, so a richer `description` raises recall without
 * touching `FIELD_WEIGHTS`.
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/corpus
 */

/** Event projected to the fields the retrieval corpus indexes — a subset of
 * `RawEvent.raw` / `EventDefinition`. `domain` is deliberately absent: it is
 * not indexed (probe refuted it). */
export interface EventCorpusInput {
  /** Event name (becomes the corpus `id`). */
  readonly name: string
  /** Short human description; indexed ×1 (per the sink's description field weight). */
  readonly description?: string
  /** Per-field `{ type, description }`; the field name + description are packed
   * into the indexed text — this is where the rich semantic content lives. */
  readonly params_fields?: Readonly<Record<string, { readonly description?: string }>>
  /** Metric definitions keyed by name; the metric names are carried through for
   * the sink to index (×1 / ×4 per the sink's metric field weight). */
  readonly metrics?: Readonly<Record<string, unknown>>
}

/** Terminology bridge: event name -> slang aliases (inverted from
 * terminology.yaml's `slang -> maps_to.events`). */
export type EventTerminology = Readonly<Record<string, readonly string[]>>

/** A corpus item the retriever indexes (DataSourceDoc / RetrievalCorpusItem-shaped). */
export interface EventCorpusItem {
  /** Unique identifier (event name); repeated by the sink's `id`/`name` field weight. */
  readonly id: string
  /** Enriched description (event desc + params_fields name+desc + terminology
   * slang); repeated by the sink's description field weight. */
  readonly description?: string
  /** Metric definitions keyed by name; each name is repeated by the sink's metric field weight. */
  readonly metrics?: Readonly<Record<string, unknown>>
  /** Opaque payload — the original event (short description + params_fields) carried through to the hit. */
  readonly payload?: unknown
}

/** Slang-alias separators: ASCII slash/comma + fullwidth comma + enumeration comma. */
const SLANG_SPLIT = /[/,，、]/

/**
 * Parse terminology.yaml's `slang -> maps_to.events` into an `event -> [slangs]`
 * map, splitting multi-alias slang on `/ , ， 、` and deduping preserving order.
 * Lenient: missing/empty/malformed terminology or individual entries yield an
 * empty map (no throw) so a broken glossary never poisons the corpus.
 * @param raw - the parsed terminology.yaml value (may be null / non-object).
 * @returns event name -> ordered, deduped slang aliases.
 */
export function parseTerminology(raw: unknown): EventTerminology {
  if (typeof raw !== 'object' || raw === null) return {}
  const terms = (raw as { terminology?: unknown }).terminology
  if (!Array.isArray(terms)) return {}
  const e2s: Record<string, string[]> = {}
  for (const t of terms) {
    if (typeof t !== 'object' || t === null) continue
    const slang = (t as { slang?: unknown }).slang
    if (typeof slang !== 'string') continue
    const mapsTo = (t as { maps_to?: unknown }).maps_to
    if (typeof mapsTo !== 'object' || mapsTo === null) continue
    const events = (mapsTo as { events?: unknown }).events
    if (!Array.isArray(events)) continue
    for (const alias of slang.split(SLANG_SPLIT)) {
      const s = alias.trim()
      if (!s) continue
      for (const e of events) {
        if (typeof e !== 'string') continue
        const list = e2s[e] ?? (e2s[e] = [])
        if (!list.includes(s)) list.push(s)
      }
    }
  }
  return e2s
}

/**
 * Is `v` a plain (non-array, non-null) object? Used to guard unvalidated raw
 * YAML field values (a `params_fields` entry that is a string/array/null is
 * skipped, mirroring the probe's `if not isinstance(fdef, dict): continue`).
 * @param v - the value to test.
 * @returns true when `v` is a non-null, non-array object.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Build the per-field params text: each field name + (non-empty) field
 * description, space-joined. Mirrors probe_hypotheses.py `params_text`; a
 * non-object field value is skipped entirely (no stray field-name token).
 */
function paramsText(paramsFields: Readonly<Record<string, { readonly description?: string }>> | undefined): string {
  if (!paramsFields) return ''
  const out: string[] = []
  for (const [fname, fdef] of Object.entries(paramsFields)) {
    if (!isPlainObject(fdef)) continue // mirror probe: non-dict field value -> skip
    out.push(fname)
    const d = (fdef as { description?: unknown }).description
    if (typeof d === 'string' && d) out.push(d)
  }
  return out.join(' ')
}

/** D2h (2026-08-21): the enrichment variant — which slices of each event pack
 * into the indexed `description`. `params+term` (default, the D2e-shipped form)
 * packs the event description + params_fields (field name + desc) + terminology
 * slang; `term-only` packs the event description + terminology slang ONLY
 * (drops params_fields — the D2g verdict (A) higher-recall form on the shipped
 * Bm25Linker: 77.0% strict vs params+term 68.1% on 113 gold; best
 * term@topK=20 = 85.0%). `params-only` is NOT shipped (D2g measured it 63.7%
 * strict, strictly worse than params+term 68.1% + degenerate with
 * params+term-on-no-slang); a future ticket can add it as a non-breaking enum
 * extension. The variant is a mount-time SemanticLayerConfig choice (not
 * mid-session); switching it remounts the Service (new WeakMap key -> fresh
 * enriched linker), so it is NOT part of the D2f corpusVersion cache key. */
export type CorpusVariant = 'params+term' | 'term-only'

/**
 * Build an enriched retrieval corpus from semantic-layer events + terminology.
 * Each item's `description` packs the event description + terminology slang;
 * `params+term` (default, the D2e-shipped measured-best form) ALSO packs
 * params_fields (field name + field description). `term-only` drops
 * params_fields (the D2g verdict (A) higher-recall form — param-field text
 * dilutes the CJK-synonym slang bridge via BM25 tf-saturation + length norm).
 * `domain` is NOT indexed (probe refuted it). The original event is carried as
 * `payload` (so a hit can surface the short description + fields).
 * @param events - the events to project (RawEvent.raw / EventDefinition subset).
 * @param terminology - event -> slang aliases (from `parseTerminology`).
 * @param variant - which slices to pack: 'params+term' (default, shipped) or 'term-only'.
 * @returns corpus items ready for `Bm25Linker` / `HybridRetriever` indexing.
 */
export function buildRetrievalCorpus(
  events: readonly EventCorpusInput[],
  terminology: EventTerminology,
  variant: CorpusVariant = 'params+term',
): readonly EventCorpusItem[] {
  return events.map((ev) => {
    const parts: string[] = []
    if (ev.description) parts.push(ev.description)
    // D2h: term-only drops the params_fields slice (the D2g higher-recall form);
    // params+term (default) packs it (the D2e-shipped form).
    if (variant !== 'term-only') {
      const pt = paramsText(ev.params_fields)
      if (pt) parts.push(pt)
    }
    const slangs = terminology[ev.name]
    if (slangs) for (const s of slangs) parts.push(s)
    return {
      id: ev.name,
      description: parts.join(' '),
      ...(ev.metrics !== undefined ? { metrics: ev.metrics } : {}),
      payload: ev,
    }
  })
}
