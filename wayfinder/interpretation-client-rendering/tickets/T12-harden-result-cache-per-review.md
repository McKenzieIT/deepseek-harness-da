# T12 — Harden T9 result-cache per code review

**Type**: task (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
**Blocked by**: [T9](T9-result-cache-package-impl.md)（已 ship;本票修补其 code review 发现）
**Blocks**: [T10](T10-consumer-fetchResult-wiring.md)（消费方接线前必须先修本票 HIGH 项——否则 invalidate 失效 + 重复 RPC + transport 错未折叠）
**Related**: [T9](T9-result-cache-package-impl.md)、[T11](T11-connection-fixture-results-arm.md)（connection fixture——本包 `tsc -b` + `?fixture` 运行时依赖 T11）、[R5](R5-object-layer-result-cache.md)

## Question

T9 ship 后 subagent code review 发现 4 HIGH + 5 MEDIUM + 5 LOW + 4 NIT 项。包无消费方故皆为 latent,但 T10 接线后 HIGH 即 detonate;两项 HIGH 直击 R5 的失效正确性机制。本票修补。

### HIGH（must-fix;blocks T10）

1. **in-flight fetch 的失效竞态(epoch guard)**:`cache.ts` `get` miss→fetcher in-flight 时,消费方调 `invalidate(rid)`(fresh `query_data`)删空(key 未存)→ RPC resolve→`lru.set` 存**旧快照**→后续渲染皆命中旧值;无 TTL 故 stale 存活整 session。`qr_` content-addressed 故 re-run 复用同 key——正是 R5 fresh-vs-folded 正确性路径。`connection/reset` flush 同害(pre-reconnect fetch resolve 后 repopulate)。**修**:epoch 计数,每次 `invalidate*` bump,capture before `fetcher(...)`,变则 skip `set`。precedent:`ConversationController.resolveImage` 的 `imageGenerations` guard(`packages/client/ui-conversation/src/client/service.ts`)。
2. **无 in-flight coalescing(single-flight)**:并发 `get` 同 key 皆 miss→重复 `result.get` RPC。React 18 StrictMode double-invoke + 并发渲染 + 两 toolview 共享 `result_id` 皆触发,重复多 MB payload(本缓存旨在避免的)。**修**:`Map<key, Promise>` in-flight(与 epoch guard 合并),或切 `lru.fetch`。precedent:`resolveImage` cache pending promise。
3. **`ResultFetchError` 导出 type-only**:consumers 不能 `instanceof` narrow。contract 在 `cache.ts`/`service.ts`/README 承诺,但 constructor 未到 `/client` barrel(tests 直接 import `../src/client/cache.ts` 故 CI 不见)。**修**:移 `ResultFetchError` 到 `index.ts` value-export 行。
4. **transport 失败逃脱 error taxonomy**:`AbstractApiClient.callUnary`(`packages/host/apiproxy/src/fetch/client.ts`)在 non-2xx/网络失败/30s `AbortSignal.timeout`/rpcId mismatch/zod parse 失败时 **throw**(仅 host business error 返 `{ok:false}`)。故 "other failure→`ResultFetchError`" 只覆半:offline/timeout/abort 以 raw `Error`/`AbortError` reject。无 throwing-fetcher test。**修**:`service.fetch` try/catch 折叠入 `ResultFetchError`(或独立 transport arm)+ throwing-fetcher spec。

### MEDIUM

5. **`updateAgeOnGet: true` 是 no-op**:lru-cache 文档「no effect if `ttl` not set」;无 TTL 故 true/false 等价(empirical 验证)。test「updateAgeOnGet rescues a read entry from eviction」是 vacuous anchor(true/false 皆过)。R5 列此 Config 字段,但语义上 no-op。**修**:drop `updateAgeOnGet`(Config field + README table row + DEFAULT 常量)+ rename test 为「a read refreshes recency」(锚 lru 实际行为)+ Agent Note 记 R5 偏离(字段 no-op without TTL,lru 无 TTL 时 read 本就 refresh recency)。
6. **`JSON.stringify(entry)` 跑两次/miss**:admission guard 一次 + `lru.set` 的 `sizeCalculation` 一次。8MB 上限处两次多 MB 序列化。**修**:`const size = estimateEntrySize(result.value); if (size <= config.maxEntrySize) lru.set(key, result.value, { size })`。
7. **bounds 非 overridable + Config claim 错**:Agent Note 称 client 包用 construction-config idiom 非 schemastery `cordis.yml` Config——但 `packages/client/ui-semantic-layer/src/client/index.ts` 导出 schemastery `Config` + `apply(ctx, config: Config = {})`,正是 R5 要的形态。R5 的 No-hardcoded-tunables/`cordis.yml` 未满足。**修**:`export const Config`(schemastery,四 bound 带默认)+ `apply(ctx, config: Config = {})` merge over `DEFAULT_RESULT_CACHE_CONFIG`;correct Agent Note 的 Config claim。
8. **`invalidateSession`/`invalidateScope` 无 call site 无 owner**:repo 无调用(grep-verified),T10 仅 `fetchResult`/`invalidateResult`。`SessionRuntime.dropScope` 拆 scoped ctx 但留该 session 的 rows 直至 byte/count eviction 或 `connection/reset`。JSDoc 的「session teardown/resync」role 未分配,README Deferred Work 未列。**修**:wire(sessions-side teardown hook 或消费方边界)或列 Deferred Work。
9. **`apply()` 零测试**:`inject=['connection']` + `ctx.plugin` mount + `Context{results}` merge + `connection/reset` flush effect 无覆盖(flush 是本 commit 唯一接线的失效,却未验证)。precedent:`packages/client/ui-theme/tests/apply.client.spec.ts`、`packages/client/ui-skill/tests/browser-plugin.client.spec.ts`(spec 内 `ctx.emit('connection/reset')`)。**修**:加 `tests/apply.client.spec.ts`。
10. **`tsc -b packages/client/result-cache` exit 2**:references `../runtime` 拉 `connection/fixture.ts` 的 T8 residual(TS2741/TS2366);`tsconfig.client.json` 注册本包延红至本 project。Agent Note 的 T8-residual「one-line」understated——clean checkout 无法 tsc-build 本包。**修**:T11 先/同 land。

### LOW

11. inject face 把「no scope」与「not found」混:`sessions.scope(sessionId)` 返 undefined(可达:session 既未 listed 也未 scoped)时 `fetchResult` 同步返 undefined(与 `result-not-found` 不可分),`invalidateResult` 静默 no-op。**修**:face 改 async + scope-missing fail-loud(或 discriminated outcome)。
12. byte/count 预算是 global 非 per-session:忙 session 可 evict 他 session 的 rows。README/Agent Note「session isolation」仅覆 key isolation。**修**:doc 一句。
13. key-collision 仅 argue 未 enforce:wire 仅要 `resultId: z.string().min(1)`,`:`-bearing id 使 `(sid='a',rid='b:c')` 与 `(sid='a:b',rid='c')` 撞。**修**:assert separator absent 或 `encodeURIComponent(scope)`。
14. export-discipline drift(`packages/client/AGENTS.md` rule 1):三 value export 无消费方(`DEFAULT_RESULT_CACHE_CONFIG`/`RESULT_NOT_FOUND`/`createResultCache`),而消费方要的(`ResultFetchError`)是 type-only。**修**:realign——drop 无消费的 value export(或 type-only),`ResultFetchError` value-export。
15. `scopeId()` drop `SessionId` brand(返 string;precedent `ConversationController.scopeId` 返 `SessionId`)+ 无 op label,故 `invalidate()` 抛「results: get requires...」(应 op-labeled)。message 指 `sessions.scope(id).results`(property,需 inject)而 README/T10 用 `.get('results')`。**修**:返 `SessionId` + op-label + message 用 `.get('results')`。

### NIT

16. `index.ts:10` `import type {} from '@deepseek-ai/dsh-client-runtime/client'` dead(line 7 已 import 同 module,augmentation 已 in scope)。
17. `service.ts:82` `as ISessions | undefined` 冗余 cast(augmented `Context.get('sessions')` 已 typed;precedent `ConversationController.requireSessions` 不 cast)。
18. `cache.ts:67` `code: string` widen 自 `RpcErrorCode`(consumers 不能 exhaustively switch)。
19. 8MB max-admissible entry ride `AbstractApiClient` 默认 30s bounded timeout(`DEFAULT_TIMEOUT_MS`);无 `caller-signal-only` policy。

## Scope

T9 code review(subagent)发现的修补。无新决策——epoch guard 是 R5 gen-token v1 的 minimal in-flight 子集(非 missed-event 全量 gen-token,后者仍记 Known Limitation);Config 是 R5 已决的忠实实现(corrects Agent Note 的错误 claim);`updateAgeOnGet` drop 是 R5 字段语义 no-op 的事实纠正。验证:owning vitest(加 throwing-fetcher + apply.client.spec + single-flight + epoch-race spec)+ `tsc -b packages/client/result-cache`(依赖 T11)+ `pnpm run test:gui`。非 trivial → Agent Note 更新(correct Config claim + updateAgeOnGet 偏离 + review 修补记录)。

## Reviewer verdict

> Not shippable as a correctness-complete cache; it *is* shippable as a dormant package. Nothing in the diff is broken today — the package has no consumers, so the four HIGH findings are all latent. But every one of them detonates the moment T10 wires `ui-present-table`/`ui-present-decomposition`, and two of them attack the exact mechanism R5 designated as the correctness authority.

Supersession:无既有 Agent Note 拥有 client result-cache 硬化;[T9 的 Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-03-client-result-cache.md) 是 canonical 记录,本票 resolution 更新之(correct Config claim + 补 review 修补)。

## Resolution

Resolved 2026-09-03 (this session). T9 code-review 修补齐——4 HIGH + 5 MEDIUM 全修 + LOW 13/15 + NIT 16/17 + result-cache `.mock` tsc 错;NIT 18 保留(`code:string` 供 transport arm)。包 `tsc -b` + 29 vitest + bundle + `test:gui` + 4 doc-sync 门对**本包**全绿。resolves → [T10](T10-consumer-fetchResult-wiring.md) unblocked。

**HIGH**(blocks T10,皆 `cache.ts` `get` 重写一气):
1. **epoch guard**(in-flight invalidate 竞态):`get` miss→fetcher in-flight 时 `invalidate*` 标 `entry.aborted=true`→late `lru.set` skip。`InFlight { pending, aborted }` per-key(精准 per-key invalidate——precedent `resolveImage` 的 per-session generation 之子集,per-key 不 over-invalidate 同 scope 他 key);slot 在 IIFE `finally` 释放,identity check(`inFlight.get(key)===entry`)防 newer fetch 被误删。missed-event residual(get-after-invalidate-during-flight 返旧值 once)仍记 Known Limitation。
2. **single-flight**:并发 `get` 同 key miss→coalesce 到 `inFlight` 的 pending(React 18 StrictMode + 并发渲染 + 两 toolview 共享 result_id 不重复 RPC)。
3. **`ResultFetchError` value-export**:移到 `/client` barrel value-export 行(consumers `instanceof` 可);ctor 改 `(resultId, code: string, message)`;新 `RESULT_FETCH_TRANSPORT='transport'` 常量 value-export。
4. **transport-throw folding**:`cache.get` try/catch fetcher throw→`ResultFetchError(code:'transport',messageOf(error))`(fold 在 cache 单点可测,非 `service.fetch`——任何 throwing fetcher 真或 mock 皆覆)。

**MEDIUM**:
5. drop no-op `updateAgeOnGet`(Config 字段 + DEFAULT + lru option + test rename「a read refreshes recency」;lru 无 TTL 时 read 本就 refresh recency,empirical 验证)+ Agent Note 记 R5 偏离。
6. `JSON.stringify` 单次:`const size=estimateEntrySize(value); if(size<=maxEntrySize) lru.set(key,value,{size})`(免 sizeCalculation 再跑)。
7. schemastery `Config`(`ui-semantic-layer` precedent;`export const Config: z<Config>` 三 bound 带默认 + `apply(ctx,config:Config={})` merge over DEFAULT;`@deepseek-ai/schemastery` 经 `vendor/schemastery` path mapping 解析 + VENDORED_LIBRARY gate 内联 bundle;**correct Agent Note 的 Config claim**——原称 client 包不用 schemastery,证伪)。
8. `invalidateSession`/`invalidateScope` owner:列 README Deferred Work(owner=T10 消费方 或 runtime teardown hook;runtime 改出 R5 scope)。
9. `tests/apply.client.spec.ts`:测 `inject=['connection']` + `ctx.results` provision + `connection/reset`→invalidateAll flush + `Config` bound merge(precedent `ui-theme/tests/apply.client.spec.ts`;`SlotTestRuntime` + `ctx.provide('connection',{api})` + `ctx.emit('connection/reset')`)。亦修 result-cache `.mock` tsc 错(helper retype `Mock<ResultFetcher>` + `RESULT_NOT_FOUND as const`——T11 graduate 到本票的 T9 测试 cast 问题)。

**LOW/NIT**(若容量):
- LOW 13:`scopeKey` `encodeURIComponent(scope)`+`encodeURIComponent(rid)` + `invalidateScope` prefix 同编码(`:`-bearing id 不撞 separator)。
- LOW 15:`scopeId(op)` 返 `SessionId` brand + op-label throw(`invalidate()` 不再误报 `get requires`) + message 用 `.get('results')`。
- NIT 16:删 dead `import type{} from '...runtime/client'`(`import type{ClientContext}` 已载 augmentation)。
- NIT 17:删冗余 `as ISessions|undefined` cast(`ctx.get('sessions')` augmented 已 typed)+ drop unused `ISessions` import。
- NIT 18:**不应用**——`ResultFetchError.code:string` 保留 widen,transport arm 需非-RpcErrorCode code(`'transport'`);Agent Note 记。
- LOW 11(inject face scope-missing fail-loud)、LOW 12(global 非 per-session budget,README 已 doc)、LOW 14(export-discipline,保留 documented value exports)、NIT 19(timeout policy,README 已 doc):非 code-touching,README/Agent Note 记,余留 T10/后续。

**验证**:`tsc -b packages/client/result-cache` exit 0 + owning vitest 29/29(17 cache + 5 apply + 7 service)+ `pnpm --filter <pkg> bundle` exit 0(lib/client.js 83.91kB,schemastery + lru-cache 私有 bundling)+ `pnpm run test:gui` exit 0(309 files / 4243 passed / 1 skipped;较 T9 的 4235 增 8 = 5 apply.client.spec + 3 cache 新 spec)+ 4 doc-sync 门(`verify-package-readme-limitations`/`verify-package-readme-model-experience`/`verify-agent-note-format`/`verify-export-jsdoc`)对**本包**全绿(残留失败皆在 `packages/data/result-cache` 等他包,pre-existing,work-surface 外)。聚合 `tsc -b tsconfig.client.json` 仍红——仅 runtime FakeApiClient(T8 同源 residual,graduate [T13](T13-runtime-fakeapiclient-results-arm.md));本包 src + tests tsc 零错。

**Agent Note 更新**(canonical 记录,本票 resolution 更新之):correct Config claim(bounds 是 schemastery Config,非 named constants)+ updateAgeOnGet 偏离 + review 修补记录(HIGH/MEDIUM/LOW/NIT 全)+ Deferred 收窄(gen-token epoch guard 已防 stale-store,residual 仅 get-after-invalidate-during-flight)+ T8 residual 改记 fixed-in-T11 + T12 hardening 段。

**移交**:T12 resolves → [T10](T10-consumer-fetchResult-wiring.md) unblocked(cache HIGH 已修,消费方接线不再 detonate;T10 可接线 `fetchResult`/`invalidateResult` inject face)。前沿:[T10](T10-consumer-fetchResult-wiring.md)(unblocked)、[T13](T13-runtime-fakeapiclient-results-arm.md)(latent,不阻)、T7(chart 线,large)、P2(HITL prototype)。T6 blocked-by T7。
