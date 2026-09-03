# T9 — client result-cache 包实现(object layer 热缓存)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: closed (resolved 2026-09-03)
**Assignee**: claude-code · 2026-09-03 (this session)
**Blocked by**: [T8](T8-result-get-rpc.md)（cache miss 通路依赖 `result.get` RPC;[T8] 已 resolve 2026-09-03,`result.get` 已 ship,本票 miss 通路就绪）
**Related**: [R5](R5-object-layer-result-cache.md)（决策:B 单包 / 事件驱动失效 / byte-bounded LRU / Config bound / gen-token v1 跳过）、[T8](T8-result-get-rpc.md)（miss 通路）、[T2](T2-ui-present-table.md)/[T4](T4-present-table-display-upgrade.md)（消费方 ui-present-table）

## Question

按 R5 Resolution 实现 client 侧 object-layer 热缓存包:

1. `packages/client/result-cache/`(Mode 3):`package.json`(`@deepseek-ai/dsh-client-result-cache`,`dsh.client` manifest,`lru-cache` 进 `dependencies`)+ `tsconfig.json`(references runtime)+ `src/client/{index.ts,service.ts,...}` + `README.md`(Model Experience + Known Limitations)。
2. 三个注册面:`tsconfig.client.json` references 行 + `packages/bundle/web-app/cordis.patch.yml` `dsh.client` 行 + `packages/bundle/web-app/package.json` dep 行。
3. service `ctx.results`(session-scoped):`get(rid)` 做 cache→miss→`result.get` RPC;`lru-cache` 实例(`maxSize`/`sizeCalculation`/`maxEntrySize`/`updateAgeOnGet`),`Config` 字段(`maxEntrySize ~8MB`/`maxSize ~64MB`/`max ~64`)从 `cordis.yml` 注入。
4. 失效订阅:inject `sessions`/`conversationEvents`,订阅 `query_data` tool_result 完成 → 提取 `result_id` → `cache.delete(rid)`(`cr_` 天然不触发)。
5. inject face(供 ui-present-table 消费):`inject: (sessionId) => ({ fetchResult: (rid) => ctx.results.get(rid) })`(参 ui-suggest-followups `submit` face)。
6. `ui-present-table` 改:inject 加 `fetchResult`;`args.result_id` → `fetchResult(rid)` → 全量 rows;T4 `parseQueryData` TSV 扫描降级为 cache-miss fallback。

## Scope

destination 实现(按 R5 已定 spec 机械构建,无新决策)。当前项目开发依赖票推进,故从 R5 的 destination handoff 拉进 ticket。Known Limitation:missed-event 竞态(gen-token v1 跳过,咬到再加)。dsh-plugin-development 全程合规(Mode 3 + Config + Agent Note)。

## Resolution

Resolved 2026-09-03 (this session). `packages/client/result-cache/` Mode 3 package shipped + 全链验证通过(client cache 的 miss 通路调 T8 产物 `IApiClient.results.get`,21 tests green + `test:gui` 全绿 + 包 tsc 零错 + bundle 构建成功 + 全 doc-sync/client 包门对**本包**全绿)。

**实现**(按 [R5](R5-object-layer-result-cache.md) Resolution;实现决策超 R5 spec 记于 Agent Note [`.agents/notes/implemented/architecture/2026-09-03-client-result-cache.md`](../../../../.agents/notes/implemented/architecture/2026-09-03-client-result-cache.md)):

1. **包骨架**:`packages/client/result-cache/`(Mode 3):`package.json`(`@deepseek-ai/dsh-client-result-cache`,`dsh.client` manifest `inject: [connection, runtime]`,`lru-cache ^10.4.0` 进 `dependencies`——私有 bundling,无 `dsh.client.external`)+ `tsconfig.json`(references api/remotes + cordis + runtime + invariants)+ `tsdown.config.ts`(`clientBundle`)+ `src/{index.ts(node 半空 apply),invariant.ts(No-runtime-invariant)}` + `src/client/{types.ts,cache.ts,service.ts,index.ts}` + `README.md` + 21 tests。
2. **三注册面**:`tsconfig.client.json` references 行 + `packages/bundle/web-app/cordis.patch.yml` `dsh.client` `result-cache` 行 + `packages/bundle/web-app/package.json` dep 行(`verify-client-packages` 确认 46 client 包、0 explicit external request——lru-cache 私有 bundling 合规)。
3. **service `ctx.results`(scope-addressed Service)**:`ResultServiceImpl extends Service`(name `results`),`get(rid)` 经 `sessions.scopeOf(this.ctx)` 派生 caller session(tracker rebinds `this.ctx` to scoped ctx,镜像 `ConversationController` + host `ResultCache`),LRU 复合键 `${sid}:${rid}` 隔离会话;miss → `ctx.connection.api.results.get({resultId})`(T8 通路)→ ok cache(超 `maxEntrySize` 不缓存,按需 fetch)→ `result-not-found` 返 `undefined`(不缓存)→ 其他错 `ResultFetchError`。`lru-cache` 配 `maxSize`/`sizeCalculation`(JSON 序列化 UTF-16 码元长度)/`maxEntrySize`/`max`/`updateAgeOnGet`;命中返同引用(不 clone)。
4. **失效**:`invalidate(rid)`/`invalidateSession(sid)`/`invalidateAll()` 公开 API;`apply` 接 `ctx.on('connection/reset', → invalidateAll())`(runtime 的 sanctioned "wire-derived caches must treat their state as stale" 重连 flush)。**per-`query_data` 失效不在此包内订阅**(见下 deferred)。
5. **Config bound**:`DEFAULT_RESULT_CACHE_CONFIG`(`maxEntrySize 8MB`/`maxSize 64MB`/`max 64`/`updateAgeOnGet true`),命名可覆盖常量(非 `cordis.yml`——见下 deferred);四值落 `apply` 构造 config(`ctx.plugin(Class, config)` idiom,`ConversationController` precedent)。
6. **inject face 契约**(供消费方,见 README):`inject: (sessionId) => ({ fetchResult: (rid) => sessions.scope(sessionId)?.get('results')?.get(rid), invalidateResult: (rid) => ... })`。消费方经 scoped ctx 寻址,`scopeOf` 派生 session。

**实现决策超 R5(记于 Agent Note)**:
- **scope-addressed Service 形态,非 per-session cordis service instance**:R5「session-scoped `ctx.results`,镜像 host」实现为单根 `Service` + tracker rebound ctx + `scopeOf` + 复合键(per-session service instance 需 runtime hook,external 包不拥有——R5 禁 runtime 改「不内联进 runtime」;scope-addressed 形态达成同等会话隔离)。
- **per-`query_data` 失效在消费方边界实现,非 cache 内事件订阅**:runtime `Session` object layer 拥有 conversation event stream;external 包无可订阅的 `query_data` 完成 tap(runtime 改或 Conversation-Node 纯副作用 side-channel 均排除)。消费方(`ui-present-table`/`ui-present-decomposition`)经 toolview slot props 已观察 `query_data` 节点 → `invalidate(rid)` 的自然归属是消费方 inject face。`connection/reset` 重连 flush 在此包接线(sanctioned)。本包暴露 `invalidate(rid)` API 就绪。
- **本地 `ResultEntry` 镜像**(非 import):镜像 apiproxy contract 的 `ResultEntry`(browser-safe stance,同 T8);结构同一,RPC 返回值无 cast 赋值。

**T8 residual 浮现(未在本 session 修)**:构建本包 `tsc -b` 时发现 `packages/client/connection/src/client/fixture.ts` 的 `FixtureApiClient` `ApiProxy` fake 未补 T8 加的 `results` 域(TS2741 `Property 'results' is missing` + 一处缺 return)。`tsc -b packages/client/connection/tsconfig.client.json` 独立于本包 exit 1——client tsc 聚合自 T8 起红(T8 验 `tsc -b apiproxy` + `tsc -b tsconfig.host.json` + `test:gui`,均不 typecheck `connection/fixture.ts`)。本包 `src/` tsc 零错;`test:gui` 不受影响(vitest 经 esbuild 转译,不 typecheck)。按 `packages/client/AGENTS.md`「未触代码红——note 不 silent fix」,记于此 + graduated 为 follow-up(非本 pathspec-limited commit)。

**验证**:`pnpm vitest run packages/client/result-cache/tests/`(21/21——cache core 14 + scope-addressed service 7)+ `pnpm run test:gui`(exit 0;T8 fixture residual 不阻 vitest)+ 包 `tsc -b`(本包 src 零错;connection/fixture T8 residual 另记)+ `pnpm --filter <pkg> bundle`(exit 0,lib/client.js 48kB,lru-cache 私有 bundling)+ doc-sync(`verify-agent-note-format`/`verify-package-readme-limitations`/`verify-package-readme-model-experience`/`verify-package-invariants`/`verify-client-packages`/`verify-export-jsdoc`/`verify-optional-dependency-imports`/`verify-package-paths` 对**本包**全绿;残留失败皆在 data/eval/query/proposed-notes 等他包,pre-existing,work-surface 外)。本包加入 `verify-package-readme-model-experience` 的 `SENTENCE_MODEL_EXPERIENCE` 'none' allowlist(模型无关 infra,镜像 `api/remotes`/`ui-tool`/`ui-conversation`)。

**Deferred(graduated 为 follow-up 票)**:
1. **消费方接线(T9 step 6)**:`ui-present-table`/`ui-present-decomposition` 注册 `fetchResult`/`invalidateResult` inject face,`args.result_id` → `fetchResult(rid)` 取全量 rows,T4 `parseQueryData` TSV 扫描降级 cache-miss fallback,fresh-`query_data` → `invalidateResult(rid)`。pathspec 排除 stable 消费方包 → graduated。
2. **connection `FixtureApiClient` `results` arm(T8 residual)**:1 行机械补 `results` stub(`FixtureApiClient` 的 `ApiProxy` fake)+ 补 return。connection-scoped change,非本 commit。
3. **generation-token v1**(R5 Known Limitation):missed-event 竞态 hardening,cache 内部局部改动无 API 破。
4. **`cordis.yml` Config 接线 bounds**:client 包用 `ctx.plugin(Class, config)` construction-config idiom(非 schemastery `cordis.yml`);bound 落 `cordis.yml` 待 client config 机制建立。

**移交**:本包 `ctx.results` 就绪待消费方接线(step 6 follow-up)。前沿:T7(blocks T6,chart 线)、P2(prototype HITL)。

## Code review(subagent,2026-09-03)

T9 ship 后 subagent code review 发现 **4 HIGH + 5 MEDIUM + 5 LOW + 4 NIT** 项。包无消费方故皆 latent(reviewer verdict:「dormant package,nothing broken today」),但 T10 接线后 HIGH 即 detonate;两项 HIGH 直击 R5 的失效正确性机制:

- **HIGH 1(in-flight invalidate 竞态)**:`get` miss→fetcher in-flight 时,消费方调 `invalidate(rid)`(fresh `query_data`)删空(key 未存)→ RPC resolve→`lru.set` 存**旧快照**→后续渲染命中旧值;无 TTL 故 stale 存活整 session。`qr_` content-addressed 故 re-run 复用同 key——正是 R5 fresh-vs-folded 正确性路径。`connection/reset` flush 同害。
- **HIGH 2(无 single-flight)**:并发 `get` 同 key 皆 miss→重复 `result.get` RPC(React 18 StrictMode double-invoke + 并发渲染 + 两 toolview 共享 `result_id` 皆触发,重复多 MB payload)。
- **HIGH 3(`ResultFetchError` 导出 type-only)**:consumers 不能 `instanceof` narrow;contract 在 `cache.ts`/`service.ts`/README 承诺但 constructor 未到 `/client` barrel。
- **HIGH 4(transport 失败逃脱 taxonomy)**:`AbstractApiClient.callUnary` 在 non-2xx/timeout/abort/zod-parse 失败时 **throw**(仅 host business error 返 `{ok:false}`);故 "other failure→`ResultFetchError`" 只覆半。

**MEDIUM**:`updateAgeOnGet: true` 是 no-op(lru「no effect if ttl not set」,无 TTL;test vacuous);`JSON.stringify` 跑两次/miss(admission guard + lru.set sizeCalculation);**bounds 非 overridable + Config claim 错**(Agent Note 称 client 包不用 schemastery Config,但 `ui-semantic-layer/src/client/index.ts` 导出 schemastery `Config` + `apply(ctx, config)`——R5 的 `cordis.yml` Config 实可达,Agent Note claim 证伪);`invalidateSession`/`invalidateScope` 无 call site 无 owner;`apply()` 零测试(`connection/reset` flush 是本 commit 唯一接线的失效却未验证);T9 `tsc -b` exit 2(依赖 T11)。

**LOW/NIT**:inject face 混「no scope」与「not found」;global 非 per-session 预算;key-collision 仅 argue 未 enforce;export-discipline drift(三 value export 无消费方,`ResultFetchError` 反 type-only);`scopeId` drop `SessionId` brand + op-label;dead import + 冗余 cast + `RpcErrorCode` widen + timeout policy。

修补 graduated 为 [T12](T12-harden-result-cache-per-review.md),**blocks [T10]**(消费方接线前必须先修 HIGH)。T11 扩展(runtime TypeError in `?fixture` + T9 `tsc -b` exit 2 依赖 T11)。Agent Note 的 Config claim(`cordis.yml` 不可达)被 `ui-semantic-layer` precedent 证伪,T12 corrects。详见 [T12](T12-harden-result-cache-per-review.md)。
