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

A miss that the host answers `result-not-found` resolves to `undefined`; any
other failure — a host business error or a thrown fetcher (transport:
network/timeout/abort/parse) — rejects with a `ResultFetchError`
(value-exported from the `/client` barrel so consumers can `instanceof`-narrow;
`error.code` is the host code or `'transport'`).

## Configuration

The cache bounds are a schemastery `Config` (R5's "Config fields from
`cordis.yml`") — overridable from `cordis.yml`; `apply(ctx, config = {})`
merges the host's config over `DEFAULT_RESULT_CACHE_CONFIG`:

| bound | default | role |
|---|---|---|
| `maxEntrySize` | 8,000,000 | per-entry byte budget; entries above are fetched on demand, never cached |
| `maxSize` | 64,000,000 | total byte budget across all entries |
| `max` | 64 | entry-count backstop |

The size unit is the JSON-serialized UTF-16 code-unit length of the entry — a
proxy for retained memory, chosen so admission and eviction reason about the
same shape that sits on the heap. The size is computed once per fetch and
passed to `lru.set` so `sizeCalculation` is not re-invoked on store.

## Tests

Pure cache-core specs (`result-cache.client.spec.ts`) anchor the byte-bounded
LRU semantics: miss→fetch→cache hit (no clone, no second fetch), single-flight
coalescing of concurrent gets for the same key, the in-flight invalidation
(epoch) guard, transport-throw folding into `ResultFetchError`, session-key
isolation (a `encodeURIComponent`-ed composite key), `maxEntrySize` admission,
byte-budget (`maxSize`) eviction, the `max` count backstop, read-recency (no
TTL — `lru-cache` refreshes recency on read regardless), the
`result-not-found`/error paths, and the `invalidate`/`invalidateScope`/
`invalidateAll` API. The service spec (`result-service.client.spec.ts`) drives
the scope-addressed `ctx.results` through the real `createScope` tag,
asserting session isolation, miss→`result.get`→cache, not-found/error, and
scoped invalidation. The apply spec (`apply.client.spec.ts`) mounts `apply()`,
asserting `ctx.results` provision, the `connection/reset` → `invalidateAll`
flush, and the `Config` bound merge. 29 tests total.

## Model Experience

None, as this browser-side cache serves renderer fold/expand re-renders over the `result.get` RPC; it registers no prompt, tool, schema, or session event, and cached rows never enter model context.

#### KV Cache effect

No direct effect; the cache holds renderer data (query/compute result rows), not model KV state, so a hit or miss changes no token the provider KV-caches.

## Known Limitations and Deferred Work

- **In-flight invalidation is guarded; the missed-event residual stays.** An
  `invalidate*` that lands while a fetch is in flight marks it `aborted` so its
  late `lru.set` is skipped — no stale snapshot is stored for the session. The
  residual R5 defers: a `get` that starts after the invalidate but before the
  in-flight fetch resolves coalesces onto it and receives the old value once
  (a full generation token — `qr_R#genN` key rotation on each observed
  completion — would block that; this system's event delivery is reliable, so
  the race is narrow and the upgrade is local to the cache with no API break).
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
- **`invalidateSession`/`invalidateScope` owner is unassigned.** The API is
  exposed for session teardown/resync, but no call site wires it: the
  runtime's `SessionRuntime.dropScope` tears down a scoped ctx but leaves that
  session's cached rows until byte/count eviction or `connection/reset`. The
  natural owner is the consumer (T10, mirroring the per-`query_data`
  invalidation deferral) or a runtime session-teardown hook; wiring is
  deferred (a runtime change is outside R5's scope).
- **The byte/count budget is global, not per-session.** The LRU is one
  byte-bounded map keyed by `(sessionId, resultId)`; a busy session can evict
  another session's rows. Key isolation holds (one session's rows never leak
  to another under a shared `qr_` id); only the eviction budget is shared
  across sessions.
- **Session scoping is the scope-addressed Service form, not a per-session
  Cordis service instance.** R5's "session-scoped `ctx.results`, mirroring the
  host `ctx.resultCache` placement" is realized as one root `Service` whose
  `this.ctx` the Cordis tracker rebinds to the caller's scoped ctx (mirroring
  `ConversationController`), with `sessions.scopeOf` deriving the session and
  the LRU keyed by `(sessionId, resultId)`. A true per-session service
  instance would require a runtime hook no external package owns; the
  scope-addressed form achieves the same cross-session isolation without
  runtime modification.
- **A max-size entry fetch rides the carrier's default bounded timeout.**
  `AbstractApiClient.callUnary` bounds every unary with a 30s
  `AbortSignal.timeout`; an admissible 8MB entry that takes longer to stream
  aborts. There is no caller-signal-only (no-host-timeout) policy yet; a
  large-result path that needs it would add one non-destructively.
- **No IndexedDB spill, no `WeakRef`/`FinalizationRegistry`, no per-hit
  `structuredClone`.** The cache is session-scoped, the host is the source of
  truth, and recoverability is not a goal — re-RPCing is the right recovery.
  Hits return the same cached reference (results are treated as immutable
  read-only views), avoiding `structuredClone` cost on large arrays.
