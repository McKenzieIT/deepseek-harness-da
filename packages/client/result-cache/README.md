# @deepseek-ai/dsh-client-result-cache

Browser-side hot cache for INTERPRETATION query/compute results: a
session-scoped, byte-bounded LRU over the `result.get` RPC, wired as the
`ctx.results` Cordis service. The cache memoizes result rows so folding and
expanding a rendered table never re-RPCs the host, while a fresh `query_data`
re-run invalidates the stale entry so the next render re-fetches.

Consumers reach the service through the inject face, addressed from a
scoped ctx so `get`/`invalidate` resolve the caller's session:

```ts
inject: (sessionId) => ({
  fetchResult: (rid) => sessions.scope(sessionId)?.get('results')?.get(rid),
  invalidateResult: (rid) => sessions.scope(sessionId)?.get('results')?.invalidate(rid),
})
```

## Configuration

The cache bounds live in `DEFAULT_RESULT_CACHE_CONFIG` (R5 resolution):

| bound | default | role |
|---|---|---|
| `maxEntrySize` | 8,000,000 | per-entry byte budget; entries above are fetched on demand, never cached |
| `maxSize` | 64,000,000 | total byte budget across all entries |
| `max` | 64 | entry-count backstop |
| `updateAgeOnGet` | `true` | refresh recency on read so hot results stay resident |

The size unit is the JSON-serialized UTF-16 code-unit length of the entry — a
proxy for retained memory, chosen so admission and eviction reason about the
same shape that sits on the heap.

## Tests

Pure cache-core specs (`result-cache.client.spec.ts`) anchor the byte-bounded
LRU semantics: miss→fetch→cache hit (no clone, no second fetch), session-key
isolation, `maxEntrySize` admission, byte-budget (`maxSize`) eviction, the
`max` count backstop, `updateAgeOnGet` recency, the `result-not-found`/error
paths, and the `invalidate`/`invalidateScope`/`invalidateAll` API. The
service spec (`result-service.client.spec.ts`) drives the scope-addressed
`ctx.results` through the real `createScope` tag, asserting session
isolation, miss→`result.get`→cache, not-found/error, and scoped invalidation.
21 tests total.

## Model Experience

None, as this browser-side cache serves renderer fold/expand re-renders over the `result.get` RPC; it registers no prompt, tool, schema, or session event, and cached rows never enter model context.

#### KV Cache effect

No direct effect; the cache holds renderer data (query/compute result rows), not model KV state, so a hit or miss changes no token the provider KV-caches.

## Known Limitations and Deferred Work

- **Missed-event race (generation token v1 skipped).** Within a session, if a
  `query_data` completion event is missed or arrives late (tab backgrounded,
  reconnect gap), a cached entry for that id may briefly serve stale rows
  until LRU eviction or the consumer's invalidation call lands. R5 evaluated
  a client-side generation token (`qr_R#genN`, key rotation on each observed
  completion) to close this race and deferred it — this system's event
  delivery is reliable (the Session stays resident and consumes frames, and
  reconnect resyncs/replays), so the race is narrow; the upgrade is local to
  the cache (the `fetchResult(rid)` signature is unchanged, the token never
  surfaces) and cheap to add if it bites.
- **Per-`query_data` invalidation is realized at the consumer boundary, not
  via a cache-internal event subscription.** The client runtime owns the
  conversation event stream (the `Session` object layer); an external package
  cannot subscribe to `query_data` tool-result completion without modifying the
  runtime (which R5 ruled out — "不内联进 runtime") or registering a
  Conversation Node as a pure invalidation side-channel. The consumer
  (`ui-present-table`/`ui-present-decomposition`) already observes
  `query_data` nodes through the toolview slot props, so the natural home for
  the invalidation call is its inject face (`invalidateResult(rid)` on a
  fresh same-turn `query_data`). The cache exposes the `invalidate(rid)` API
  for this; the consumer wiring is deferred to its own focused change (T9
  step 6) so this package ships self-contained. The `connection/reset`
  reconnect flush is wired here (it is the runtime's sanctioned
  "wire-derived caches must treat their state as stale" signal).
- **Session scoping is the scope-addressed Service form, not a per-session
  Cordis service instance.** R5's "session-scoped `ctx.results`, mirroring the
  host `ctx.resultCache` placement" is realized as one root `Service` whose
  `this.ctx` the Cordis tracker rebinds to the caller's scoped ctx (mirroring
  `ConversationController`), with `sessions.scopeOf` deriving the session and
  the LRU keyed by `(sessionId, resultId)`. A true per-session service
  instance would require a runtime hook no external package owns; the
  scope-addressed form achieves the same cross-session isolation without
  runtime modification.
- **Bounds are named overridable constants, not `cordis.yml` Config.** Client
  packages receive construction config through the `ctx.plugin(Class, config)`
  idiom (the `ConversationController` precedent), not a schemastery
  `cordis.yml` Config; the four bounds are therefore named, documented
  constants in `DEFAULT_RESULT_CACHE_CONFIG`, overridable at the `apply`
  construction site. Wiring them to a `cordis.yml`/`dsh.client` config field
  is deferred until that mechanism is established for client packages.
- **No IndexedDB spill, no `WeakRef`/`FinalizationRegistry`, no per-hit
  `structuredClone`.** The cache is session-scoped, the host is the source of
  truth, and recoverability is not a goal — re-RPCing is the right recovery.
  Hits return the same cached reference (results are treated as immutable
  read-only views), avoiding `structuredClone` cost on large arrays.
