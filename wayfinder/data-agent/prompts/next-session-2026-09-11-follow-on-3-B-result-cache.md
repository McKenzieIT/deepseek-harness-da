# Next-session prompt — Follow-on 3-B shard 3：`client/result-cache` D3 迁移（148 → 144）

> 承接：`next-session-2026-09-10-follow-on-3-rescope-B.md`（Follow-on 3 rescope B——user 拍板攻 187 真路径 consumer 改造；已完成 shard 2 ui-settings-models）。本 prompt **自洽**，next session 据此独立执行。

## 决策历史（本 prompt 前提，勿再重决）

- **Follow-on 3 rescope = B**（2026-09-10 user 拍板）——攻 217 consumer 真路径（非 18 包 `src/remote.ts` 结构 A）。B = 直接服务核心需求 #1（sync upstream）+ #2（适配采新 Typert 类型）。
- **B 分 shard**（按 consumer 包 error 数从大到小）：
  - shard 1 = client/runtime 131（**decommission，Phase-2 blocked by Plan B ADR-0002**，另 session）
  - shard 2 = ui-settings-models 39（**resolved 2026-09-11 主 session**，resync `03e865a148`）
  - shard 3 = connection 30（**已随 Follow-on 3 connection fake-api 清**，`2504169487`）
  - **shard 3-b = result-cache 4**（**本 session 主战场**）
  - shard 4 = 小包 17（`ui-semantic-layer` 7 + 3 presenter 各 2 = Phase-2）
- **Plan B ADR-0002**（2026-09-10 已 grill=Plan B）：4 presenter migrate by "register 模式"（不 keep-standalone），随 client/runtime decommission Phase-2 一起做。

## 累进进度（tsc client `--force` 权威）

| session | 事件 | 起→止 | commit（resync） |
|---|---|---|---|
| 2026-09-09/10 | Follow-on 1 fixture + Follow-on 2 config | 287 → 217 | `63659a22d4` + `5ee128214d` |
| 2026-09-10 | connection fake-api（shard 3）| 217 → 187 | `2504169487` |
| **2026-09-11** | **ui-settings-models（shard 2）** | **187 → 148** | **`03e865a148`** |
| **next** | **result-cache（本 session）** | **148 → 144（预期）** | — |
| deferred | Phase-2 = client/runtime 131 + 4 presenter 13（144→0）| — | — |

**resync tip**: `03e865a148`（branch `upstream/resync-2026-09-08`，未 push）
**master tip**: `61a0140e94`（ahead origin 17，未 push；push 由 UM11+UM12+push 独立负责）

## 本 session 目标：result-cache 4 → 0（148 → 144）

**已 grep 的 4 error**（`/tmp/dsh-tsc-postfix-2026-09-11.log`）：

```
packages/client/result-cache/src/client/index.ts(72,21): TS2339 Property 'api' does not exist on type 'ConnectionHandle'.
packages/client/result-cache/src/client/service.ts(21,15): TS2305 no exported member 'IApiClient'.
packages/client/result-cache/tests/apply.client.spec.ts(7,15): TS2305 (同上)
packages/client/result-cache/tests/result-service.client.spec.ts(7,15): TS2305 (同上)
```

**受影响 src**（预 read）：
- `src/client/index.ts` — plugin apply()，inject `connection`，构造 `ResultServiceImpl` 传 `api: connection.api`。
- `src/client/service.ts` — `ResultServiceImpl extends Service`，持 `api: IApiClient` 私字段；`fetch()` 调 `this.api.results.get({resultId}, signal)`；返 `Promise<RpcResult<ResultEntry>>`。
- `src/client/cache.ts` — 纯 LRU，`ResultFetcher = (rid, signal?) => Promise<RpcResult<ResultEntry>>`；用 `response.result.ok`/`response.result.error.code === 'result-not-found'` 判 miss vs. error。
- tests `apply.client.spec.ts` / `result-service.client.spec.ts` — build mock `IApiClient` fixtures 返 `RpcResult`-shape。
- `result-cache.client.spec.ts` — 测纯 cache，可能不需改（除非 fetcher 契约变）。

## Host 契约（**已重验 2026-09-11**，勿重导）

`packages/data/result-cache/src/remote.ts`（一等 upstream Typert Remote gateway）：
- **namespace = `'result'`**（**单数**！非 `'results'`）——`ctx.remote.result.get(rid)`。
- **method = `@Remote('get')`**，signature = `get(resultId: ResultId): ResultEntry`（positional string 入、直接返 entry；无 `.result` wrapper）。
- **miss → `throw new RemoteError('result-not-found', ..., { resultId })`**（`RemoteError` 从 `@deepseek-ai/dsh-typert-protocol`）
- **cache absent → `throw new Error(...)`**（Typert 兜底映射到 `{ code: 'internal' }`）
- Client 侧 `RemoteResult<T>` = `{ok:true;value:T} | {ok:false;error:RemoteFailure}`（`packages/typert/protocol/src/types.ts:74`）。miss 在 wire 会**包**为 `{ok:false, error:{code:'result-not-found'}}` 还是抛？——**D2 决策关键，先查**。

## 决策点

### D1（**已解**）— namespace = `'result'` 单数

### D2（**本 session 必决**）— fetcher 契约

**先查事实**：`ctx.remote.result.get(rid)` 返 `Promise<RemoteResult<ResultEntry>>` 还是 `Promise<ResultEntry>` + miss 抛？grep `packages/api/gateway/src/client/` 的 wire dispatch + `packages/data/result-cache/lib/typert.remote-client.d.ts`（host-side type-emit）。

**两选一（都上游忠实）**：
- **A（surface adaptation，minimal cache.ts 变）**：`service.ts` 内 wrap `ctx.remote.result.get(rid)` 结果 → `RpcResult<ResultEntry>` shape。cache.ts 契约不变。**PRO**：0 diff cache.ts。**CON**：私有路径保 RpcResult-shape 假象。
- **B（deep refactor，cache.ts fetcher 变 throw-based）**：`ResultFetcher = (id, signal?) => Promise<ResultEntry>`；miss → `undefined`（service.ts catch RemoteError.code）；transport → throw。cache.ts 内 `try/catch` 分派。**PRO**：idiomatic Typert、清 stale RpcResult type。**CON**：cache.ts 内改动大、`ResultFetchError` 语义要 rewire。

**推荐 B**（清 stale RpcResult type，per B rescope 精神 = 采新 Typert 类型；A 保留 fork drift）。**先 grill 用户按 #3 纪律**（先答"上游忠实最佳重构、最利 data-agent"再问）——若 A 就够，则 A；否则 B。

### D3（**本 session 决**）— result-cache 依赖：`connection` 还是 `remote`？

`index.ts` 目前 `inject = ['connection']` + `connection.api`。新 pattern：
- **改 `inject = ['remote']`**（ui-settings-plugins 模式）——service 直接 `this.ctx.remote.result.get(...)`。移除 `ResultServiceConfig.api` field。
- 事件 `connection/reset` 用 `ctx.on('connection/reset')` 已够（cordis event bus，见 ui-settings inject 例）——不需 `ctx.get('connection')`。

**推荐**：`inject = ['remote']` + 事件保 `ctx.on('connection/reset')`。**验证** `connection/reset` 是否走 cordis event bus——grep `packages/client/connection/src/client/index.ts` 找 `emit('connection/reset')`。

## 执行流程（**铁律**）

1. **Read**（本 prompt + 若需 grill 用户，用 `grilling` skill）。dispatch Explore subagent **仅当**需额外事实（e.g., cache.ts 全文、Typert `RemoteError` wire 处理）；否则**主 session 直接读**。
2. **决策 D2 + D3**（若需 grill，按 #3 纪律先答"上游忠实最佳"）。
3. **实现**（小改 = 主 session；大改 D3+D2-B = dispatch general-purpose subagent，per shard 2 pattern）。
4. **tsc 验**（铁律，subagent 报告 = 未验证断言，主 session 重导 ≥1 关键）：
   - bounded: `PATH="/usr/local/bin:$PATH" /usr/local/bin/node ./node_modules/typescript/bin/tsc -b packages/client/result-cache/tsconfig.json 2>&1 | tail -80`
   - `--force` 权威: `... -b tsconfig.client.json --force 2>&1 | grep -cE 'error TS'`（目标 = 144，distribution result-cache 0 + 其它包不动）。
5. **vitest 验（本 session 加）**：`packages/client/result-cache/tests/*.spec.ts` 3 file + **ui-settings-models 8 spec**（上 session tsc 绿但 vitest 未跑，负债——本 session 顺便验）。
6. **commit + 记**：resync `[Follow-on-3-B]`；master `[wayfinder(um-flow)]` + ticket `## Session progress` + map Decisions-so-far bullet。**不 `--no-verify`**（lefthook oxlint/whitespace）。**不 `git add -A`**（tsdown output 未跟踪不 gitignore，用具体 path）。

## Deferred（本 session 不做）

- **Phase-2**（144 → 0）：client/runtime 131 delete + 4 presenter 13 迁移。见 `../tickets/phase-misc/R-DA-CLIENT-RUNTIME-DECOMMISSION.md` Phase-2 + `../tickets/phase-misc/R-DA-UI-PRESENTER-COMPOSITION.md`。另 session。
- **ui-settings-models README drift**（EN+ZH line 37 提 `ConfigurableProviderView`）：doc-sync gate follow-up。1 分钟可顺手改，非阻塞。
- **untracked tsdown `.d.ts`/`.js`/`.map`**（`data/audit` + `data/evidence-query` + `data/semantic-layer`）：pre-existing，非本 session 产；查 + gitignore follow-up。
- **`pnpm-lock.yaml` modified 18/18**：pre-existing。
- **push**（UM11 PR + UM12 GA-FORK-CI + push 方案 D）：Phase-2 完成后做。

## 关键上下文（**已验证，勿重导**）

- **api-remotes barrel**（`packages/api/remotes/src/client/index.ts`）：exports `ClientRemote`/`CredentialInfo`/`LlmConfigurableProvider`/`LlmDiscoveredModel`/`SettingsNamespaceView` + `RpcResult`（暂留）；不 exports `IApiClient`/`CredentialView`/`ConfigurableProviderView`/`DiscoveredModelView`。
- **`RemoteResult<T>`** = `{ok:true;value:T} | {ok:false;error:RemoteFailure}`（`packages/typert/protocol/src/types.ts:74`）。**miss 是抛 vs. `{ok:false}`——D2 关键事实，先查**。
- **`ResultsRemote.get`** namespace = `'result'`（单数）；positional `(resultId: string)`；success 返 `ResultEntry`；miss = `RemoteError('result-not-found', ..., {resultId})` throw（Host 层）。
- **`TestRemote`**（`packages/test-support/client-runtime/src/remote.ts:60`）：`emit(event, args)` 驱动 events。测 spec pattern = `packages/client/ui-settings-plugins/tests/apply.client.spec.ts`。
- **reference migrations**：ui-settings-plugins（inject remote pattern）+ ui-settings-models（shard 2，resync `03e865a148`）。
- **worktrees**：
  - master `/Users/mckenzie/workspace/deepseek-harness-da`（tip `61a0140e94`，ahead 17）
  - resync `/Users/mckenzie/workspace/dsh-resync`（`upstream/resync-2026-09-08`，tip `03e865a148`）
- **node v24 强制**：`PATH="/usr/local/bin:$PATH"`（`/usr/local/bin/node` = v24.15.0；nvm 无 v24）。
- **主 session 强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；subagent 也用。`mcp__local__grep` 不可靠——用 `mcp__local__bash` 的 `rg` / `grep -rEn`。

## 起手 checklist

1. Read 本 prompt + `../tickets/phase-misc/R-DA-TYPERT-REMOTE-REGISTRATION.md` 的 `## Session progress`。
2. Read `packages/client/result-cache/src/client/cache.ts`（判 D2 A vs. B 的 blast radius）。
3. grep Typert `RemoteError` client-side 处理（`packages/api/gateway/src/client/`）——判 wire 层是抛还是包 `RemoteResult`。此决定 D2。
4. 决策 D2 + D3（若不清，grill 用户按 #3 纪律）。
5. 实现 → tsc 验 → **vitest 3+8 spec 验（本 session 铁律加）** → commit → 记。
6. 若 vitest 未过，回滚 or 修，不 `--no-verify`。
7. 目标：148 → 144，且无 vitest 回归（result-cache + ui-settings-models）。
