# R5: Object layer result cache — 2026-H2 前沿研究

> 配套 ticket 见 [../tickets/R5-object-layer-result-cache.md](../tickets/R5-object-layer-result-cache.md)；上游 host store 见 [R6](./R6-result-store-server-side.md)；架构锚定见 [G1](../tickets/G1-design-decisions.md) D-arch。
> 证据来源：WebSearch + WebFetch，2026-09-03 检索，偏好 2025–2026 源；vendor 主张按一手文档核验（部分一手文档 403，退而用搜索片段 + 二手佐证，置信度已标注）。研究子 agent 出具，带引用与可落地建议，**核验决定的 (a) 事件驱动失效 + 无 TTL，并纠正原 count-based 倾向为 byte-bounded LRU**。

---

# Findings Report: Browser-Side Hot Cache for Tabular Query Results (2026-09-03)

**Overall verdict:** The decided architecture (own client package, session-scoped, event-driven invalidation, LRU eviction) is directionally correct and matches 2026 frontier practice for the invalidation model. Two concrete corrections: (1) switch from **count-based** to **byte-bounded** LRU with a per-entry size guard — count-based is the wrong choice when entries are multi-MB and variable-sized; (2) add a **client-side generation token** to the cache key to harden against missed `query_data` events (the host reusing a stable `result_id` for mutating data is exactly the case where pure event-driven invalidation has a race window). "No TTL" is fine given event-driven invalidation + session scope. No public 2026 client-side result-cache pattern exists at ChatGPT/Claude/Cursor to copy from — the design is frontier, not derivative.

---

## Area 1 — Invalidation pattern

**Recommendation: VALIDATE the event-driven invalidate-on-upstream-write approach, but add a client-side generation/version token to the cache key as a hardening layer.**

The 2026 consensus for "upstream mutated data under a stable key; a fresh consumer must not be served stale" is **event-driven invalidation** — this is exactly what TanStack Query's `mutation.onSettled → queryClient.invalidateQueries({queryKey})`, SWR's `mutate(key)`, and Apollo's `cache.evict()`+`cache.gc()` all implement. The decided approach matches the dominant pattern. SSE/WebSocket server-push invalidation signals are the 2026 frontier extension for real-time dashboards, and your `query_data` completion observation is an instance of this — correct.

**The subtle case is where the design is most exposed.** The host OVERWRITES data under a stable `qr_` id on identical-SQL re-run (no version history). This is the textbook "stable key, mutating value" hazard that the 2026 literature flags for out-of-order invalidation: if the `query_data` completion event is missed or arrives late (tab backgrounded, reconnect gap, event dropped), the cache silently serves stale data to the *next* fresh consumer until LRU eviction happens. The more robust 2026 pattern is **versioned/generation keys**: embed a monotonically-increasing client-side generation in the key (`qr_R#gen3`) so old data becomes *unreachable* rather than depending on a delete signal arriving. Since the host exposes no version, the client derives its own: bump a per-`result_id` generation counter each time a `query_data` completion for that id is observed. This converts "invalidate (delete) on event" into "rotate key on event" — same trigger, but a missed event only means a stale-but-still-valid older generation is read once, and the next observed event self-corrects. Storage overhead is negligible (old entries evict via LRU).

**On stale-while-revalidate (SWR):** the design correctly does NOT use SWR semantics for the fresh-table case. SWR serves stale-then-revalidate, which would violate "freshly-rendered table must get fresh data." Your nuanced split (fresh table = hard invalidate+refetch; folded older table = acceptable to refresh-to-latest = SWR-style background refresh) is the right call and matches how TanStack distinguishes `staleTime`/`gcTime`. RFC 5861 `stale-while-revalidate` at the HTTP layer has uneven browser support (Chrome/Firefox partial, Safari lags) in 2026, so app-layer invalidation — not HTTP directives — is the right layer for this cache.

**Tag-based invalidation** (Cloudflare purge-by-cache-tags, HTTP `Cache-Tag`) is an **edge/CDN** mechanism, not applicable to an in-tab JS cache — do not adopt it here.

**Citations (all retrieved 2026-09-03):**
- TanStack Query — Optimistic Updates / invalidation lifecycle (`onSettled → invalidateQueries`): https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates (primary; fetched via search snippet — direct fetch returned 403)
- TanStack Query — Important Defaults (default `staleTime: 0`, `gcTime: 5 min`, refetch on focus/reconnect): https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults (primary; via snippet)
- Telerik, "Caching with TanStack Query" (Dec 2025), `gcTime`/`staleTime` distinction: https://www.telerik.com/blogs/caching-tanstack-query
- SWR (Vercel) stale-while-revalidate + `mutate`: https://swr.vercel.app/docs and https://article.juejin.cn/post/7308659801188614185
- Apollo Client — `cache.evict()` + `cache.gc()` (reachability-based GC; **no** explicit `gcCacheLimit`/memory-bound option found): https://www.apollographql.com/blog/first-impressions-with-apollo-client-3 , https://master--apollo-client-docs.netlify.app/docs/react/caching/garbage-collection/
- Versioned/generation keys to defeat out-of-order invalidation: Foojay, "Distributed Cache Invalidation Patterns" (2026): https://foojay.io/today/distributed-cache-invalidation-patterns/ (direct fetch 403; via search snippet — confirms versioned keys prevent stale reads without ordered deletion, at cost of storage); Redisson glossary, "Cache Invalidation" (out-of-order repopulation hazard): https://redisson.pro/glossary/cache-invalidation.html ; OneUptime, "Version-Based Invalidation" (Jan 2026): https://oneuptime.com/blog/post/2026-01-30-version-based-invalidation/view
- RFC 5861 `stale-while-revalidate` 2026 browser support (Chrome/Firefox partial, Safari lags): https://www.php.cn/faq/2479849.html (2026-05-15); app-layer SWR/TanStack as the adopted form
- SSE invalidation-signal pattern (`Cache-Control: no-cache` on stream, built-in `Last-Event-ID` reconnect): https://cloud.tencent.com/developer/techpedia/2637 (June 2026), https://developer.baidu.com/article/detail.html?id=6513884
- Cloudflare purge-by-cache-tags (edge-only): https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/ (via snippet)
- "Caching in 2026" (Feb 2026) — invalidation (correctness) vs eviction (resource mgmt) distinction: https://lukasniessen.medium.com/caching-in-2026-fundamentals-invalidation-and-why-it-matters-more-than-ever-867fee46e98b

**Flag/contradiction for the decided approach:** None that overturns it. The only hardening is the generation-token-in-key suggestion above — it does not replace event-driven invalidation, it makes the *same* event trigger a key rotation instead of a delete, closing the missed-event race. If the team is confident the `query_data` event is always reliably delivered (single in-process source, no reconnect gaps), pure delete-on-event is acceptable and the generation token is optional hardening.

---

## Area 2 — LRU + memory bounds for large browser tables

**Recommendation: CORRECT the eviction model from count-based to byte-bounded LRU with a per-entry size guard. Skip IndexedDB spill and WeakRef for this session-scoped hot cache. Share cached row references (no per-hit structuredClone).**

**Correction 1 — byte-bounded, not count-based.** Count-based LRU is the wrong tool when entries are variable-size up to "a few MB." With count-based, one 5 MB result and one 50 KB result each count as 1 — a handful of large results can evict dozens of small hot ones, and N large results can blow the tab's memory budget before the count cap triggers. The 2026 frontier library for this is `lru-cache` (isaacs) configured with `maxSize` (total byte budget) + `sizeCalculation` (per-entry byte weight) + `maxEntrySize` (per-entry admission guard). `quick-lru` and `mnemonist`'s `LRUCache` are **count-only** — they do not support byte weighting, so they are the wrong choice here. TanStack Query's own cache is **time-based (`gcTime`), not size-based** — it imposes no entry-count or memory cap, so it cannot serve as the bounded hot cache you need; a bespoke byte-bounded LRU above the RPC is correct.

**Concrete numbers for this use case (10 000 rows × N cols, single entry up to a few MB, Chrome tab ~4 GB renderer ceiling):**
- **Per-entry size guard threshold (`maxEntrySize`): ~2 MB.** Entries above this are *not admitted* to the LRU — they're fetched-on-demand each time and discarded after render. Rationale: a single multi-MB entry displaces a disproportionate share of a small cache, and re-fetching one large result is cheaper than thrashing the cache. "A few MB" entries sit at the boundary; ~2 MB keeps the cache effective for the common case while letting oversized results pass through.
- **Total MB cap (`maxSize`): ~50 MB.** Chrome's per-renderer crash ceiling is ~4 GB, but a data-agent UI shares that with the framework, virtualized table DOM, other tabs' processes, and the JS heap. A 50 MB result cache is generous for a hot layer (≈25 typical 2 MB entries, or more smaller ones) while leaving multiple-GB headroom. 100 MB is the absolute ceiling I'd defend; above that you're competing with the table renderer itself.
- **Total entry cap (`max`): set as a *secondary* backstop at ~64 entries.** In practice the byte bound governs; the count cap prevents pathological cases (thousands of tiny 5 KB results accumulating). Defense-in-depth: set both.
- Use `updateAgeOnGet: true` so reads refresh recency (hot results stay resident).

**Correction 2 — do NOT use IndexedDB spill.** IndexedDB-backed spill (Dexie) is valuable for *recoverable, cross-session* caches or offline-first apps. This cache is session-scoped and sits above an RPC to the authoritative host — recoverability is not a goal, and the host is the source of truth. IndexedDB adds async deserialization cost on every spill-back hit and complexity for no gain here. If a result is evicted, re-RPCing is the right recovery (the host always has latest). Skip Dexie/PouchDB for this layer.

**Correction 3 — do NOT use WeakRef/FinalizationRegistry as the primary eviction.** The 2026 consensus is explicit: `WeakRef`+`FinalizationRegistry` provide no capacity control, GC callback timing is not guaranteed, and `WeakRef` objects accumulate in the host `Map` if not paired with a finalizer. They are a *fallback* for memory-sensitive caches of disposable objects (DOM nodes, GPU textures), not a primary strategy for opaque row data you must serve reliably. Explicit byte-bounded LRU is correct; do not add a WeakRef layer.

**Correction 4 — avoid per-hit `structuredClone`.** `structuredClone` performs a deep copy (ArrayBuffers are copied, not transferred) and is costly for large arrays. For a read-only hot cache, hand consumers the **same cached row-object reference** (or a shallow view) and document immutability; do not clone on every hit. If isolation is required, prefer handing out a typed-array view. `postMessage`-with-transferables is zero-copy but detaches the sender buffer — irrelevant here since there's no worker boundary to cross for the cache itself.

**Citations (all retrieved 2026-09-03):**
- `lru-cache` `max`/`maxSize`/`maxEntrySize`/`sizeCalculation`/`updateAgeOnGet` (byte-bounded via `sizeCalculation`): https://www.npmjs.com/package/lru-cache (primary; via snippet), https://blog.csdn.net/gitblog_00399/article/details/151923613 (2026-03-29), https://blog.csdn.net/gitblog_01181/article/details/151950558
- `quick-lru` / `mnemonist` LRUCache are count-only (no `maxSize`/`sizeCalculation`): https://blog.csdn.net/gitblog_00339/article/details/141483047 , https://developer.aliyun.com/article/980495
- TanStack Query cache is time-based, no size/entry cap (must self-manage): https://www.telerik.com/blogs/caching-tanstack-query (Dec 2025), https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults (primary)
- Chrome tab ~4 GB renderer crash ceiling (64-bit), effective 1–2 GB on some platforms: https://wenku.csdn.net/answer/7vj3r3rz7b , https://ask.csdn.net/questions/9305835 ; real 800 MB→4.2 GB crash in 3 min (Nov 2025): https://blog.csdn.net/Very_easygoing/article/details/157839827
- IndexedDB/Dexie streaming guidance (use `each()`/cursors, avoid `toArray()` bulk loads) — confirms spill is about recoverability, not hot-cache: https://www.php.cn/faq/3023244.html (2026-08-20), https://blog.csdn.net/maply/article/details/145192900 (2025-01-16); IndexedDB capacity ≥250 MB: https://blog.csdn.net/tx7do/article/details/155929963
- WeakRef+FinalizationRegistry pitfalls (no capacity control, GC timing not guaranteed, must pair with LRU): https://www.php.cn/faq/2655642.html , https://www.php.cn/faq/2402306.html , https://www.php.cn/faq/2398083.html
- `structuredClone` deep-copies (ArrayBuffers copied, not transferred), costly for large arrays; `postMessage`+transferables is zero-copy but detaches sender: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects (2025-09-18), https://developer.chrome.com/blog/transferable-objects-lightning-fast , https://joji.me/en-us/blog/performance-issue-of-using-massive-transferable-objects-in-web-worker/

**Flags/contradictions for the decided approach:**
- **Count-based LRU (decided) is the wrong eviction model for multi-MB variable entries — this is the single most important correction.** Adopt byte-bounded LRU (`maxSize` + `sizeCalculation` + `maxEntrySize` ~2 MB, `maxSize` ~50 MB, `max` ~64 backstop).
- **No TTL (decided) is correct** given event-driven invalidation handles correctness and the cache is session-scoped (dies with the tab). TTL would be redundant for correctness and would prematurely evict hot entries. Validate, keep as decided.

---

## Area 3 — How 2026 AI-data-agent UIs cache/invalidate query results

**Recommendation: No public 2026 client-side result-cache+invalidation pattern exists at the major AI-agent UIs to copy. Treat the design as frontier; do not claim parity with a known lab pattern. Borrow the server-side invalidation-signal ideas (Rill/Cube refresh) only conceptually.**

Findings from targeted searches:
- **ChatGPT / OpenAI:** No public engineering detail on client-side caching/invalidation of Code Interpreter / Advanced Data Analysis tabular results. OpenAI's published material covers *prompt caching* (server-side prefix caching for latency/cost), which is an orthogonal mechanism. The OpenAI Codex GitHub issue (#5556, Oct 2025) documents elevated *cache miss* rates in the ChatGPT login path — relevant only as evidence that OpenAI's client caching is imperfect and not publicly specified. Conclusion: nothing to copy.
- **Claude / Anthropic:** No public detail on client-side result caching for Artifacts or data-analysis tables. A 2026 arXiv paper studies Claude Artifacts + ChatGPT Analyst as generative-UI widgets (clarity/rigidity tradeoffs) but does not cover cache mechanics. Anthropic's published "prompt caching" is server-side prefix caching, not client result caching.
- **Cursor:** Searches surfaced only token-cache discussions (forum, 2026-02) and N+1-query debugging via MCP — no client-side query-result cache/invalidation engineering detail.
- **Observable:** Observable Framework uses a **build-time/server-side** data-loader cache at `src/.observablehq/cache/` ("avoiding repeated computation"). Client-side, its reactive runtime re-evaluates cells on dependency change — not an opaque result cache+invalidation story. Not a client-side hot-cache precedent.
- **Evidence.dev:** No public client-side query-cache/invalidation detail found (SvelteKit-based; likely relies on standard browser/SvelteKit data-loading conventions). Nothing to borrow.
- **Rill / Cube (BI/OLAP, adjacent):** Both publish **server-side** refresh/invalidation: Rill schedules model data refresh; Cube recommends a Refresh Worker for pre-aggregation cache invalidation in production (auto-invalidates in dev). These validate the *concept* of event/signal-driven refresh but are server-side, not browser-tab hot caches.

**Implication for the design:** There is no established 2026 client-side pattern from the AI-agent UI leaders to benchmark against or copy. The decided approach is therefore not "behind" a frontier — it *is* the frontier for this niche. The closest analogues are the general-purpose data-fetching libraries (TanStack Query, SWR), which the design's event-driven invalidation already mirrors. Do not waste effort trying to reverse-engineer a non-public lab pattern; validate against the TanStack/SWR/Apollo primitives in Area 1 instead.

**Citations (all retrieved 2026-09-03):**
- OpenAI prompt caching (server-side, orthogonal): https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI Codex elevated cache-miss issue (#5556, Oct 2025): https://github.com/openai/codex/issues/5556
- Anthropic prompt caching (server-side): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- arXiv, "Designing Composable Generative Widgets for LLM-Assisted Analysis" (2026) — studies Claude Artifacts/ChatGPT Analyst UI, no cache mechanics: https://arxiv.org/html/2607.17394v1
- Cursor token-cache discussion (forum, Feb 2026): https://forum.cursor.com/t/why-does-cursor-consume-an-absurd-amount-of-cache-read-tokens/151439
- Observable Framework build-time data-loader cache (`src/.observablehq/cache/`): https://blog.csdn.net/gitblog_00381/article/details/148755594 (2025-06-19)
- Rill server-side data refresh scheduling: https://docs.rilldata.com/developers/build/models/data-refresh
- Cube pre-aggregation refresh worker (server-side invalidation): https://docs.cube.dev/docs/pre-aggregations
- Evidence.dev (no client cache detail found; repo): https://github.com/evidence-dev/evidence

**Flag for the decided approach:** None — no contradicting public pattern exists. The only risk is the team assuming a known lab pattern exists to copy; it does not.

---

## Cross-cutting flags (consolidated)

1. **Eviction model is wrong for the data shape (HIGH priority).** Count-based LRU → byte-bounded LRU with `maxEntrySize`~2 MB, `maxSize`~50 MB, `max`~64 backstop. This is the one material correction.
2. **Add a client-side generation token to the cache key (MEDIUM priority, hardening).** `qr_R#genN`, bumped on each observed `query_data` completion for R. Closes the missed-event race that pure delete-on-event leaves open when the host reuses a stable id for mutating data. Does not replace event-driven invalidation; same trigger, safer mechanics.
3. **No TTL — keep as decided (VALIDATED).** Correct given session scope + event-driven correctness.
4. **Event-driven invalidation — keep as decided (VALIDATED).** Matches 2026 TanStack/SWR/Apollo consensus; SSE-observed `query_data` completion is the right invalidation signal source.
5. **Fresh-table vs folded-table nuance — keep as decided (VALIDATED).** Fresh table = hard invalidate+refetch (not SWR); folded table = background refresh-to-latest is acceptable. Correctly avoids SWR's serve-stale-first for the fresh consumer.
6. **Do not adopt** IndexedDB spill, WeakRef-based eviction, tag-based/CDN-style invalidation, or HTTP `stale-while-revalidate` directives for this in-tab cache — all either wrong layer, wrong reliability profile, or solving a different problem (recoverability/offline vs. hot in-session reads).
7. **Do not deep-clone on cache hit** — share the cached row-object reference; document immutability. Avoids `structuredClone` cost on large arrays.

---

## R5 决议对研究的承接（2026-09-03）

- Area 2 的 `maxEntrySize ~2MB` **本 app 上调到 ~8MB**：本 app 的 10000 行 cap（G1 D7）让大结果成为常态，而大表正是 cache 该 memoize 的昂贵场景（折叠/展开一个 10000 行表若不缓存就重 RPC 整 10000 行）；2MB 会把 10000 行表（实测 ~5–10MB）拒之门外、打败 cache 目的。`maxSize` 相应取 ~64MB（研究的 50–100MB 区间内），`max ~64` backstop，`updateAgeOnGet true`。四值落 `Config` 字段可 `cordis.yml` 调（dsh-plugin-development No-hardcoded-tunables）。
- Area 1/2 的 generation-token 硬化（flag #2）**v1 跳过**：本系统事件交付可靠（Session 后台持续吃帧 + 重连 resync 重放），missed-event 竞态窄；defer 升级廉价（cache 内部局部改动，无 API 破）；G1 轻量。记为 Known Limitation，咬到再加。
- Area 3：本设计对该 niche 就是前沿，非落后；不追抄不存在的 lab 范式。
