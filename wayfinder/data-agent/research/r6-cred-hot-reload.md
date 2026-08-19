# R6 — 凭证热更新：spawn-env 终结态 vs per-call set_credentials 控制信道

wayfinder ticket R6 · 中文报告 · 主源：harness `packages/mcp/mcp-client/*` + MCP SDK `@modelcontextprotocol/sdk@1.29.0` + P4 原型 scenario 4 + reverse-bi 双清失效。
所有 `path:line` 为绝对路径或仓库内相对路径。INFERENCE 标注的是非源文直引的推断。

MCP SDK（pnpm store）下文记作 `mc-sdk/`，绝对路径前缀 `node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3/node_modules/@modelcontextprotocol/sdk`。

---

## §1 背景：F2 spawn-env 注入 + P4 场景 4 对 E 的证伪

R2 §5.2c 定（INFERENCE）凭证经 `StdioConfig.env` 注入 sidecar 子进程（`packages/mcp/mcp-client/src/index.ts:50` `interface StdioConfig`、`:63-64` `env: Record<string, string>`「Extra env vars merged on top of scrubbed ambient env」）。P4 §3.4 据此定默认值 E：监听 `credentials/updated` → 调 sidecar `invalidate_scope` 工具（surgical，不重启 sidecar）。P4 原型 scenario 4 把这条链跑通并**实证证伪 E 对 cred 变更的充分性**：

- sidecar `credSnapshot()` 在**调用时**读 `process.env`：`wayfinder/data-agent/prototypes/p4-query-engine/sidecar.mjs:16` `for (const r of CREDS) s[r] = process.env[r] ? hash(process.env[r]) : '<unset>'`。
- `ensureConn` 在**建连时**把 `credSnapshot()` 快照存进 `connections`：`sidecar.mjs:22` `if (!connections.has(scope_id)) connections.set(scope_id, { snapshot: credSnapshot(), builtAt: Date.now() })`。子进程 `process.env` 在 spawn 后**冻结**（stdio spawn 语义，见 §2）。
- `invalidate_scope` = `connections.delete(scope_id)`（`sidecar.mjs:53-54`），surgical 丢一个 scope 的连接缓存；但下一次 `ensureConn` 重建时 `credSnapshot()` 仍读**旧 spawn-env**（SK_OLD）。
- 原型自己在 `run.mjs:74` 把张力写明（直引）：

  > ⚠ F2 spawn-env tension: sidecar env is FIXED at spawn. invalidate_scope dropped ${currentScope}'s cache, but the sidecar rebuilds the next connection from STALE spawn-env creds. To pick up the new value: restart sidecar (drops ALL scopes — over-broad, contra E) OR switch cred injection to a per-call set_credentials sidecar channel (diverges from R2 §5.2c "StdioConfig.env").

即：`invalidate_scope` 只清连接缓存、不清 spawn-env（spawn-env 对子进程寿命是只读终结态），所以重建出来的 `ODPS` 对象仍持旧凭据。`restartSidecar`（`run.mjs:48`「reconnect: dispose + re-spawn sidecar (drops ALL scope caches — over-broad per E)」）能取到新值，但**丢所有 scope 缓存**且**过广 contra E 的 surgical 语义**。

**结论（与 ticket 一致）**：E 对**非 cred 配置**热更仍成立（sidecar 重建时重读 scope `config.yaml`，`invalidate_scope` 丢缓存即可让新配置生效）；对** cred 变更**不充分（spawn-env 是子进程寿命的终结态）。R6 调研三选项并推荐其一。

凭证 seam 的硬规则不变：`packages/credentials/credentials/src/index.ts:66-68`（直引）

> Resolution is per call: consumers re-resolve at each operation and must not cache across operations — that per-operation read is what makes a changed credential reach the next operation without a restart.

`credentials/updated` 事件（`packages/credentials/credentials/src/types.ts:18-29`）在 `set`/`unset`/外部编辑后 fan-out；`packages/credentials/credentials-local/src/index.ts` 的 chokidar watcher（`:277` `chokidarWatch(...)`、`:284` `watcher.on('all', ...)`）→ `reconcileFromDisk`（`:450`）→ `notifyUpdated`（`:400`）把磁盘外部编辑热发布成事件。这是「改了凭证」的信号源；R6 问的是信号到了之后**怎么让 sidecar 取到新值**。

---

## §2 选项 (a) reconnect-for-cred-change

凭证变更触发一次 reconnect（新 sidecar generation），新 generation 在 spawn 时读最新 `config.env`。

### 2.1 mcp-client 是否暴露「立即重连 / 重启 server」公共 API？

`packages/mcp/mcp-client/src/connection.ts:99` `export interface ConnectionHandle` 只暴露两项：

```ts
// connection.ts:99
export interface ConnectionHandle {
  ready: Promise<ConnectionOutcome>     // 首次连接尝试的结算
  dispose(): Promise<void>              // 终止：停重连 + 关 client + 等待在途 + 注销所有工具
}
```

`dispose()`（`connection.ts:327` `async dispose(): Promise<void>`）做的是**终结 teardown**：`disposed=true` → 清 `reconnectTimer` → `current.close()` → `await settling` → `await syncChain` → `for (const dispose of disposers.values()) dispose()`（注销该 server 全部工具）。它**不调度重连**。模块 docstring（`connection.ts:12-13`，直引）：

> Exhaustion unregisters the server's tools and stops; disposal (including HMR) is the only way back from that state.

即 `dispose` 之后该 plugin instance 即死，恢复靠 HMR reload / Host 重启（`connection.ts:196-197,213`「reload the plugin or restart the Host」）。自动 reconnect（`scheduleReconnect` → `connectGeneration(false)`）只在**连接丢失**（`generationDown`）时自发，无外部触发入口。

**INFERENCE**：da 侧无「立即重连」公共 API。要为 cred 变更触发 reconnect，要么 (i) 改 mcp-client core 加 `connection.restart()` 之类 API，要么 (ii) 走 HMR（dispose 旧 instance + re-apply 新 instance，属 host 级操作，非 da 侧）。两者都不是 da-side-only。

### 2.2 `config.env` 是否可在 plugin load 后被原地改写？

`createTransport(config)` 的 stdio 分支（`packages/mcp/mcp-client/src/transport.ts:31-40`）：

```ts
// transport.ts:34-40
return new StdioClientTransport({
  command: config.command, args: config.args,
  env: buildChildEnv(config.env),   // 读 config.env
  cwd: config.cwd,
})
```

`buildChildEnv`（`transport.ts:21-22`）`return { ...scrubbedParentEnv(), ...extra }`——读 `config.env` 的当前键值。`createTransport` 在 `connectGeneration`（`connection.ts:237`、`:272` `await generation.connect(createTransport(config))`）里**每个 generation 调一次**。所以如果 `config.env` 对象引用在 generation 之间被原地改写，下一次 generation 会读到新值。

**但**：`config` 是 `apply(ctx, config)`（`index.ts:140`、`:166` `startConnection(ctx, config, reconnect)`）收到的已解析 plugin config，由 Schemastery 解析（`index.ts:118-138` `Config = z.union([...])`，`env: z.dict(String).default({})`）。INFERENCE：Schemastery 不 `Object.freeze`，对象本身可变；但 da 侧（另一个 preset/plugin）**不持有** mcp-client 的 config 对象引用——plugin owns it，`ConnectionHandle` 只暴露 `ready`/`dispose`。所以 da 侧原地改写 `config.env` 无可达路径，除非 (i) mcp-client core 暴露 `config`/`setEnv` 句柄，或 (ii) 脆性 hack 伸手进 loader 的已解析 config。两者皆非 da-side-only。

### 2.3 reconnect 会重建 stdio 子进程 = 所有 scope 缓存全丢

`connectGeneration`（`connection.ts:237`）每次 `new Client(...)` + `createTransport(config)` + `generation.connect(...)`。stdio 的 `createTransport` → `new StdioClientTransport(...)`（`transport.ts:11` import、`:34` 实例化）。SDK `mc-sdk/dist/esm/client/stdio.d.ts:42`「Client transport for stdio: this will connect to a server by **spawning a process**」、`:56`「**Starts the server process** and prepares to communicate with it」。即每次 generation spawn 一个**新子进程**。旧子进程的进程内存（sidecar 镜像的 `_CONNECTIONS` per-scope ODPS 连接缓存）随进程终止而消失——**所有 scope 的连接缓存全部清零**，与 E 的 surgical `invalidate_scope`（只丢一个 scope）直接冲突（P4 §3.4 已论证「reconnect 留作 sidecar 崩溃兜底，不是凭证更新的常规失效路径」）。

### 2.4 (a) 小结

- 热更正确性：**成立**（新 generation 读最新 `config.env`），但前提是 da 能改写 `config.env` 且能触发 reconnect——两者 mcp-client 都不暴露。
- scope-cache 影响面：**过广**（丢所有 scope），contra E 的 surgical。
- creds 是否 model-visible：否（在 spawn-env，不在 tool args）。
- additive-only：**否**——需改 mcp-client core（加「restart now」API + 暴露可改写 env 句柄）或走 host 级 HMR。
- 安全暴露面：stdio 子进程（小），但 creds 仍进 spawn-env = 子进程的 `process.env`，若 sidecar 再 spawn 子进程则凭据被继承——与 standing principle「PAT not in process.env」有张力。
- 偏离 R2 §5.2c：否（仍是 `StdioConfig.env`）。
- 保留 per-call resolve：**部分**——只在 spawn 时 per-call resolve，spawn 之间凭据冻结在 spawn-env（非 per-query）。

---

## §3 选项 (b) per-call `set_credentials` sidecar tool

da 每次 `ctx.query.execute` 前 per-call 解析凭据（`ctx.credentials.resolve`）并调 sidecar `set_credentials(scope_id, creds)` 控制调用；creds 不进 model-visible tool args（tool-query args = sql + scope_id）；sidecar 用最新 creds 重建该 scope 连接。

### 3.1 工具参数在 wire 上是 model-visible 的（确认）

`packages/mcp/mcp-client/src/tools.ts:80-88`（直引核心段）：

```ts
// tools.ts:80 callToolUncached
function callToolUncached(client, rawName, args, exec, opts) {
  return client.request(
    { method: 'tools/call', params: { name: rawName, arguments: args } },
    RawCallToolResultSchema,
    { signal: exec.signal, timeout: opts.toolCallTimeoutMs },
  )
}
```

`createExecutor`（`tools.ts:303`）把 agent loop 传入的 `JSON.parse(model_arguments)` 作为 `args` 直发 wire（`tools.ts:315` 注释「The agent loop passes `JSON.parse(model_arguments)` … can be any JSON value」）。**任何注册工具 args 里的值都进模型可见的 `tools/call` 参数。** 所以 `set_credentials` 若被注册为 model-facing 工具，其 `creds` 入参会泄露给模型——**不可接受**。

### 3.2 `syncTools` 把 `tools/list` 里**所有**工具注册为 model-facing（无 allowlist / 隐藏注册）

`tools.ts:143` `export async function syncTools(...)` 两阶段：fetch（`:150-167` 翻页 `listToolsUncached` 建 `definitions`）+ swap（`:170-183` `ctx.tools.register(definition)`）。`:155` `const publicName = publicToolName(opts.serverName, tool.name)`、`:181` `disposers.set(publicName, ctx.tools.register(definition))`——sidecar 在 `tools/list` 里列出的**每一个** tool 都被注册成 `mcp__<serverName>__<rawName>` model-facing 工具。**无「注册但对模型隐藏」/ allowlist / 程序化（非模型）调用 API。** 若 sidecar 把 `set_credentials` 与 E 的 `invalidate_scope` 列进 `tools/list`，它们即成**模型可调用**（模型可随意 invalidate 缓存 = DoS 面，或可调 `set_credentials` 注入凭据 = 安全面）。

### 3.3 mcp-client 不暴露底层 SDK `Client` 供程序化调用

`connection.ts:99` `ConnectionHandle` 只有 `ready`/`dispose`（§2.1 已引）。SDK `Client` 实例（`connection.ts:240-243` `const generation = new Client(...)`）被闭包在 `connectGeneration` 内，**不外露**。所以 da 无法用 plugin 的 Client 去 `tools/call` 一个未在 `tools/list` 里的 raw name。

**控制信道缺口（(b) 的核心前置）**：da 程序化调用 `set_credentials`（raw name，不进 `tools/list`）有三条路：

1. **da 自持 raw SDK `Client` + stdio transport 连 sidecar（一个子进程，无 plugin）**。按 **A1-split**（`p4-guard-chain-placement.md` §4.2 决策表：`query-maxcompute` sidecar = "dumb raw executor + per-scope 缓存"，其 `execute/attach/cancel/get_progress/estimate_cost` 由 `ctx.query.execute` engine-wrapper **程序化**调用，**不 model-facing**；model-facing 的只有 `tool-query` consumer，镜像 rbi `execution.py:query_data`），da 在自己的 `Client` 上按 raw name `client.request({method:'tools/call', ...})` 调**全部** sidecar 工具——query 五件 AND `set_credentials`/`invalidate_scope`——**无一个进 `tools/list`→`syncTools`→`ctx.tools.register`**（故无 model-facing 注册，无 DoS/安全面）。只有一个子进程（da 的），**无「第二个 child 与 plugin child 缓存分家」问题**（没有 plugin child——P1 下 query 与控制同走 da 的一个 Client/一个子进程）。`tools.ts` 的 `publicToolName`/`createExecutor`/`syncTools`（`:111/143/181/303`）服务于 model-facing 注册，P1 **不需要复刻**。**此路径即 §6.3 P1，additive-only 且消解控制信道缺口**（见 §6.3）。
2. **sidecar 把 `set_credentials`/`invalidate_scope` 排除出 `tools/list`** + da 持有 Client 句柄按 raw name 调——但若 da 自持 Client（路径 1），da 根本不跑 `syncTools`，`tools/list` 列不列控制工具都无所谓（da 按 raw name 调即可），故路径 2 **被路径 1 吸收**；若要用 plugin，则须 plugin 暴露 Client/`callTool`（= 下条 core 改，且见 §6.3 P2 的 allowlist 附加要求）。
3. **mcp-client 新增程序化调用 API**（core 改）：如 `connection.callTool(rawName, args)` 直接在 plugin 的 Client 上发 `tools/call`，不经过 `syncTools` 注册（故不进 `tools/list`、不 model-facing）。

### 3.4 控制信道缺口与 E **共享**（关键）

E（P4 默认值）的 `invalidate_scope` 同样是 da→sidecar 控制调用，同样**不能** model-visible。§3.2 已示 `syncTools` 会把 `tools/list` 全量注册为 model-facing，所以 E 把 `invalidate_scope` 当「sidecar 暴露的 MCP 工具」是有**潜在缺陷**的：要么它进 `tools/list`（模型可调 = DoS 面），要么不进（bridge 不注册、da 无 Client 调不到）。**即 E 本身就需要这条非 model-visible 控制信道，(b) 没有引入新前置——只是把 E 已有的前置对 cred 热更也变成 load-bearing。** 这点必须在 §6 推荐里显式 surface。

### 3.5 偏离 R2 §5.2c 是否可接受

§5.2c 在 R2 笔记里**本身是 INFERENCE**（R2 原文「INFERENCE：优先 stdio transport，凭证经 `StdioConfig.env` 注入」）。R6 正是检验该推断的票，P4 scenario 4 已实证证伪其对 cred 热更的充分性。偏离的代价：creds 不再经 `StdioConfig.env`，改经 per-call 控制信道。**seam 的 per-call resolve 硬规则被保留**（`credentials/src/index.ts:66-68` 直引见 §1）——da 仍 per-call `ctx.credentials.resolve`，只是解析结果改走 `set_credentials` 而非 spawn-env。

**安全侧反而改善**：creds 不再进 spawn-env = 不再进子进程 `process.env` = sidecar 若再 spawn 子进程也不继承凭据，更贴合 standing principle「PAT not in process.env（creds not inherited by tool subprocesses）」。§5.2c 的 spawn-env 注入其实与该原则有张力（spawn-env 就是子进程的 `process.env`），(b) 顺带修掉。

### 3.6 (b) 小结

- 热更正确性：**成立**（per-call resolve + per-call `set_credentials` + 重建该 scope 连接，新凭据立即可达下一条 query）。
- scope-cache 影响面：**surgical**（只动改了 cred 的那个 scope；`set_credentials` 原子更新 per-scope 凭据 + 丢该 scope 连接缓存，镜像 reverse-bi `invalidate_credential` 双清，见 §7）。
- creds 是否 model-visible：**否**——前提是控制信道非 model-visible（`set_credentials` 不进 `tools/list`，da 经程序化路径调）。
- additive-only：**是（P1）**——da 自持 raw `Client`+stdio transport（一个子进程，无 plugin、无 model-facing sidecar 注册、不碰 core，§6.3 P1 详述）；P2 core 改（暴露 `callTool` + allowlist 特性）为 only-if-reuse-plugin 的退路。
- 安全暴露面：stdio 子进程（小），creds **不进 spawn-env**（优于 §5.2c，贴合 PAT not in process.env）。
- 偏离 R2 §5.2c：是，但 §5.2c 是 INFERENCE，R6 证伪之；per-call resolve 硬规则保留。
- 保留 per-call resolve：**是**（da per-call resolve，per-call 推给 sidecar）。

---

## §4 选项 (c) streamable-http + per-request headers

sidecar 跑 streamable-http transport；creds 经 `StreamableHttpConfig.headers` per-request 注入。

### 4.1 plugin 层 headers 是构造固定的

`index.ts:76` `interface StreamableHttpConfig`、`:87-88` `headers: Record<string, string>`「Additional headers attached to MCP requests.」。`createTransport` streamable-http 分支（`transport.ts:45-47`，直引）：

```ts
// transport.ts:45-47
return new StreamableHTTPClientTransport(
  new URL(config.url),
  { requestInit: { headers: config.headers } },
) as Transport
```

transport 在 `connectGeneration`（`:272`）里**每个 generation 构造一次**；`config.headers` 是 plugin load 时解析的引用。plugin 层无 `setHeaders` API（`ConnectionHandle` 只有 `ready`/`dispose`，§2.1）。所以**plugin 层 headers 是构造固定**。

### 4.2 SDK 层：`requestInit` 是静态 `RequestInit`（无 provider 函数），但 `_commonHeaders` 每请求重读 headers 引用

**LINCHPIN**。SDK `mc-sdk/dist/esm/client/streamableHttp.d.ts:75-77`（直引）：

```ts
// streamableHttp.d.ts:75
* Customizes HTTP requests to the server.
requestInit?: RequestInit;     // 静态 RequestInit，无 () => RequestInit provider 重载
```

类型上**无** `() => RequestInit` provider 函数重载。构造器（`streamableHttp.js:29`）`this._requestInit = opts?.requestInit;` 只存引用。但**关键**：`_commonHeaders()`（`streamableHttp.js:58`）**每个请求**重读 `this._requestInit?.headers`（`:72`，直引）：

```js
// streamableHttp.js:72
const extraHeaders = normalizeHeaders(this._requestInit?.headers);
```

`send()`（`:299-306`）每次 `const headers = await this._commonHeaders(); const init = { ...this._requestInit, method: 'POST', headers, ... }; const response = await (this._fetch ?? fetch)(this._url, init);`——每条 MCP 请求都过 `_commonHeaders`。`normalizeHeaders`（`mc-sdk/dist/esm/shared/transport.js:5,14`）`return { ...headers };`——**spread 读调用时的当前键值**。所以**原地改写 `this._requestInit.headers` 对象引用的键值，下一次 `_commonHeaders()` 会读到新值**——SDK 层 per-request headers 经「原地改写共享引用」可达，**无需 provider 函数、无需重连**。

另：SDK 还收 `fetch?: FetchLike`（`streamableHttp.d.ts:81`）自定义 fetch——可包一层在每次请求注入最新 headers；以及 `authProvider?: OAuthClientProvider`（`:73`），`_commonHeaders` 会 `await this._authProvider.tokens()` 每请求取新 Bearer（但仅 OAuth Bearer，不适用 ODPS access_id/access_key 任意 header）。

### 4.3 plugin 层未利用 SDK 的 per-request 能力，(c) 仍需 core 改或 da bypass

`createTransport`（`transport.ts:45-47`）只传 `{ requestInit: { headers: config.headers } }`——**不传** `fetch`、不传 `authProvider`、不暴露可改写 headers 句柄。`config.headers` 引用虽被 SDK transport 持有且 `_commonHeaders` 每请求重读，但 da 侧不持有 `config.headers` 引用（同 §2.2，plugin owns config，`ConnectionHandle` 只暴露 `ready`/`dispose`）。所以 (c) 要拿到真正 per-request creds：

- (i) core 改 mcp-client：`createTransport` 改传一个 `fetch` provider 或 `requestInit` provider（函数），或暴露 `connection.setHeaders(...)`；
- (ii) da 侧 bypass plugin 自持 transport+Client（additive；按 A1-split sidecar 为 da-internal dumb executor，**无 sidecar 工具进 model-facing 注册**——同 §3.3 路径 1 / §6.3 P1。对 streamable-http 多 Client 连同一 HTTP server 同进程同缓存，可行；对 stdio 则是 da 独占一个子进程，无「二子进程缓存分家」问题）；
- (iii) da 侧原地改写 `config.headers` 引用（需持有 config 句柄，同 §2.2 脆性 hack）。

### 4.4 部署/安全权衡：HTTP sidecar 攻击面更大

streamable-http sidecar = **长期运行的 HTTP listener**（intranet 上一个常驻端口），比 stdio 子进程（无监听端口、经 stdin/stdout 通信）攻击面大。per-request cred headers = **每次 HTTP 调用都带凭据**；HTTP sidecar 若不自带 auth，就是 intranet 上的**开放 ODPS 代理**。与 standing principle「intranet-security-first：单一信任边界在 RBI 门；业务用户问题不得达 bash 等」有张力——stdio 子进程无监听面、边界天然收紧，HTTP listener 需额外加一层 auth/mTLS 才能补齐到等价信任边界。

### 4.5 (c) 小结

- 热更正确性：**SDK 层成立**（`_commonHeaders` 每请求重读 headers 引用 + `normalizeHeaders` spread 读当前值；或自定义 `fetch` provider），**plugin 层不成立**（构造固定，无可改写句柄）。
- scope-cache 影响面：**surgical**（sidecar 每请求取最新 headers 重建 per-scope 连接，无需重连）。
- creds 是否 model-visible：否（在 HTTP headers，不在 tool args）。
- additive-only：**部分**——SDK 支持 per-request，但 plugin 未暴露，需 core 改（传 provider/`setHeaders`）或 da bypass。
- 安全暴露面：**大**（HTTP listener + 每请求带 creds，需自带 auth 补齐信任边界），contra intranet-security-first。
- 偏离 R2 §5.2c：是（从 stdio 换 streamable-http）。
- 保留 per-call resolve：是（da per-call resolve，改写 headers per-call）。

---

## §5 三选项对照表

| 维度 | (a) reconnect-for-cred-change | (b) per-call set_credentials | (c) streamable-http + per-request headers |
|---|---|---|---|
| 热更正确性 | 成立（新 generation 读最新 env），但需可改写 env + 可触发 reconnect | **成立**（per-call resolve + per-call 推送 + 重建该 scope） | SDK 层成立（`_commonHeaders` 每请求重读）；plugin 层需改 |
| scope-cache 影响面 | **过广**：丢所有 scope（re-spawn 子进程，进程内存清零）contra E | **surgical**：只动改 cred 的 scope | surgical：per-request headers，无需重连 |
| creds 是否 model-visible | 否（spawn-env） | **否**（前提：控制信道非 model-visible，`set_credentials` 不进 `tools/list`） | 否（HTTP headers） |
| additive-only（不改 mcp-client core） | **否**：需加「restart now」API + 可改写 env 句柄 | **是**（P1：da 自持 Client+transport，无 model-facing sidecar 工具，不碰 core） | **部分**：SDK 支持 per-request，plugin 未暴露，需 core 改传 provider 或 da bypass |
| 安全暴露面 | stdio 子进程（小）；但 creds 进 spawn-env（子进程再 spawn 会继承，与 PAT not in process.env 有张力） | stdio 子进程（小）；**creds 不进 spawn-env**（贴合 PAT not in process.env） | **大**：HTTP listener + 每请求带 creds，需自带 auth 补齐 |
| 偏离 R2 §5.2c 程度 | 不偏离（仍 `StdioConfig.env`） | 偏离（creds 改走 per-call 控制信道）——但 §5.2c 是 INFERENCE，R6 证伪之 | 偏离（stdio → streamable-http） |
| 保留 per-call resolve（`index.ts:66-68` 硬规则） | 部分（仅 spawn 时 per-call，spawn 间冻结） | **是**（da per-call resolve，per-call 推 sidecar） | 是（da per-call resolve，per-call 改 headers） |
| 与 E 的关系 | 取代 E 的 surgical（降级为非 cred 配置用）且需重连兜底 | **精炼 E**：cred 变更用 `set_credentials`，非 cred 配置仍用 `invalidate_scope`；共享控制信道前置 | 与 E 并行（per-request headers 绕过 invalidate 机制） |

---

## §6 推荐：(b) per-call `set_credentials`，附控制信道前置

### 6.1 推荐

**推荐选项 (b)**：da per-call `ctx.credentials.resolve` 解析 4 个 ref（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`），经一条**非 model-visible 控制信道**调 sidecar `set_credentials(scope_id, creds)`（原子更新 sidecar per-scope 凭据 + 丢该 scope 连接缓存），再调 `ctx.query.execute`（query 工具仍是 model-facing，args = sql + scope_id）。凭证变更经 `credentials/updated` → da 侧 per-call resolve 即取最新（seam 硬规则 `index.ts:66-68` 保证），**无需重连、无需重启 sidecar、无需丢其他 scope 缓存**。

### 6.2 理由

1. **per-call resolve 硬规则保留且更强**：`credentials/src/index.ts:66-68`（§1 直引）要求 consumer per-operation 重解析、禁止跨操作缓存。(b) 把「per-call 解析」一直推到 sidecar 门口——da 每次 query 前 resolve + 推送，sidecar 用最新值重建。比 §5.2c 的「spawn 时 resolve 一次、冻结到下次重连」更忠实于硬规则。
2. **surgical，与 E 一致**：`set_credentials` 只动改了 cred 的那个 scope（镜像 reverse-bi `invalidate_scope_connection` 的 `_CONNECTIONS.pop(scope_id)`，`connection.py:317-320`；及 `invalidate_credential` 双清 `credentials.py:192-204`）。不丢其他 scope 的在途连接。reconnect（(a)）过广 contra E，不取。
3. **安全面改善**：creds **不进 spawn-env** = 不进子进程 `process.env` = sidecar 若再 spawn 子进程（如 ODPS SDK 起 subprocess）也不继承凭据，贴合「PAT not in process.env」。§5.2c 的 spawn-env 注入其实与该原则有张力（spawn-env 即子进程 env），(b) 顺带修掉。security surface 仍是 stdio 子进程（无监听端口），优于 (c) 的 HTTP listener。
4. **偏离 §5.2c 可接受**：§5.2c 是 R2 的 INFERENCE，R6 正是检验它的票，P4 scenario 4 已实证证伪其对 cred 热更的充分性。per-call resolve 硬规则保留，偏离的只是「凭证怎么进 sidecar」的传输方式（spawn-env → 控制信道）。
5. **(a)/(c) 的 core 改更重**：(a) 要加「restart now」API + 可改写 env 句柄 + 丢所有 scope；(c) 要 plugin 传 provider/custom-fetch + 起 HTTP sidecar + 补 auth 信任边界。(b) 的控制信道前置（见下）与 E **共享**，不是 (b) 新增的债。

### 6.3 前置条件：控制信道缺口（应立 follow-up 票）

(b) 与 E **共享**一条前置：mcp-client 的 `ConnectionHandle`（`connection.ts:99`）只暴露 `ready`/`dispose`，**无程序化、非 model-visible 调用 API**。`syncTools`（`tools.ts:143,181`）把 `tools/list` 全量注册为 model-facing，无 allowlist/隐藏注册。所以 `set_credentials` 与 E 的 `invalidate_scope` 都不能进 `tools/list`（否则 model-callable = DoS/安全面），但又必须被 da 按需调用。**注**：此缺口仅在「da 经 mcp-client plugin 连 sidecar」时才成缺口（plugin 的 `syncTools` 强制全量 model-facing 注册）；若 da 自持 raw `Client`（下 P1），无 model-facing 注册，缺口自然消解。

**两条可行解法**（二选一，应立 follow-up 票定夺）：

- **(P1) 纯 additive 且消解控制信道缺口：da 自持 raw SDK `Client` + stdio transport（一个子进程，无 plugin）**。da 在 `packages/query/query-maxcompute/` 内自持 stdio transport + SDK `Client`（一个 sidecar 子进程），按 **A1-split**（`p4-guard-chain-placement.md` §4.2 决策表 + `p4-build-defaults.md` §2.5 三包表：`query-maxcompute` = dumb raw executor + per-scope 缓存，其工具由 `ctx.query.execute` engine-wrapper 程序化调用、**不 model-facing**；model-facing 的只有 `query-tool`，镜像 rbi `execution.py:query_data`；rbi 侧 `execution.py:790` G1 / `:798` G5 / `:823` 主查询三处皆在 model-facing `query_data` 体内，engine/sidecar 是内部调用、从不 model-facing）调**全部** sidecar 工具——`execute`/`attach`/`cancel`/`get_progress`/`estimate_cost`（query）AND `set_credentials`/`invalidate_scope`（control）——按 raw name `client.request({method:'tools/call', ...})` 程序化调用。**无一个 sidecar 工具注册到 `ctx.tools`**（不进 `tools/list`→`syncTools`→`ctx.tools.register`），故**无 model-facing 注册**——`set_credentials`/`invalidate_scope` 天然非 model-callable（只是 da 自己 Client 上的 raw-name 调用），**控制信道缺口在此消解**。`tools.ts` 的 `publicToolName`/`createExecutor`/`syncTools`（`:111/143/181/303`）服务于 model-facing 注册，P1 **不需要复刻**（query 工具经 `ctx.query.execute` 程序化调，返回结构化 `QueryOutcome`，不经模型）。不依赖 mcp-client plugin 暴露新 API，**不碰 core**，纯新增 `packages/query/query-maxcompute/`。代价：约 50 行 transport+Client 接线（bounded，比 mcp-client 的通用 MCP bridge 窄——无 `tools/list` 翻页、无图片/resource 投影、无 reconnect 调度）。
- **(P2) core 改：mcp-client 暴露程序化调用（only-if-复用-plugin，over-engineering vs P1）**。`ConnectionHandle` 加 `callTool(rawName, args): Promise<McpResult>`，直接在 plugin 的 Client 上发 `tools/call`（不经 `syncTools` 注册）。**但**：若 da 仍用 mcp-client plugin bridge query 工具，plugin 的 `syncTools`（`tools.ts:143,181`）会把 sidecar `tools/list` **全量注册为 model-facing**（无 allowlist/隐藏注册），即 sidecar 的 `execute`/`attach`/.../`set_credentials`/`invalidate_scope` 全成 model-callable——**这本身就违反 A1-split**（sidecar 应 da-internal、非 model-facing；模型可直接 `mcp__query-maxcompute__execute` 绕过 `tool-query` 的 G1/G5/budget/near-dup/halt/cache 会话门）。所以 P2 要与 A1-split 兼容，**除 `callTool` 外还须加 allowlist/hidden-registration 特性**（只注册 query 工具子集、隐藏控制工具，或让 sidecar 不列控制工具于 `tools/list`）。净：P2 = core 改 + allowlist 特性，**over-engineering vs P1**。保留为「团队坚持复用 mcp-client plugin bridge」时的退路。

**P1 为 clear winner**：additive-only（纯新增 `packages/query/query-maxcompute/`，不碰 core）+ 与 A1-split 一致（sidecar da-internal、非 model-facing）+ **消解控制信道缺口**（无 model-facing 注册 → `set_credentials`/`invalidate_scope` 天然非 model-callable）。P2 是 over-engineering（core 改 + allowlist 特性），保留为「团队坚持复用 mcp-client plugin bridge」时的退路。follow-up 票定调：**P1（additive，推荐）vs P2（core 改 + allowlist 特性，only-if-reuse-plugin）**。无论哪条，**E 的 `invalidate_scope` 与 (b) 的 `set_credentials` 共用同一条控制信道**——P1 下即「da 自持 Client 上的 raw-name 调用」。

**顺带 surface 的潜在不一致**：R2 §5.2c（凭证经 `StdioConfig.env` 注入 sidecar 子进程）+ P4 §4.3 F2（原型用 fake MCP server 子进程经 mcp-client 连）+ 甚至 A1-split 决策表「`query-maxcompute` sidecar（经 mcp-client）」括注，都**假设用 mcp-client plugin 连 query sidecar**；但 A1-split 的精神（sidecar = da-internal dumb executor，会话门留 `tool-query`，sidecar 工具非 model-facing）与 plugin 的 `syncTools`（`tools.ts:143,181`）全量 model-facing 注册**直接冲突**。R6 的精炼：**query sidecar 不用 mcp-client plugin；da 自持 raw `Client`+transport**（additive-only，不碰 core）。mcp-client plugin 仍是连**真正 model-facing 外部 MCP server**（其工具本就该 model-facing）的正当工具——只是不用于 query sidecar。

---

## §7 对 E 的精炼

E（P4 默认值）原态：监听 `credentials/updated` → 调 sidecar `invalidate_scope`（surgical 丢一个 scope 连接缓存），不重启 sidecar。R6 精炼为**按变更类型分路**：

- **非 cred 配置热更**（如 scope `config.yaml` 的 `maxcompute.config_file`/`environment`）：sidecar 重建 per-scope 连接时重读 `config.yaml`，`invalidate_scope` 丢缓存即可让新配置生效。**E 原态成立**——`invalidate_scope` 足够，因为配置源在磁盘（sidecar 每次读），不在冻结的 spawn-env。
- **cred 变更**：spawn-env 是子进程寿命的终结态（`stdio.d.ts:42,56` spawn；`sidecar.mjs:16,22` 快照在建连时定型），`invalidate_scope` 只清连接缓存、不清 spawn-env，重建仍读旧值（P4 scenario 4 实证）。**需 `set_credentials(scope_id, creds)`**：da per-call resolve 取最新凭据，推送进 sidecar 的 per-scope 凭据存储，并**同时丢该 scope 连接缓存**（原子）——镜像 reverse-bi `invalidate_credential`（`credentials.py:192-204`）的双清语义（`:200` `_CACHE.pop(scope_id, None)` 清凭据层 + `:204` `invalidate_scope_connection(scope_id)` 清连接层），只是 (b) 的 `set_credentials` 是「推新值 + 清连接」而非「仅清」。`invalidate_credential` 的 docstring（`credentials.py:195-197`，直引）正好点明这条边界：

  > 同时让 rbi-query 那侧的连接缓存失效 —— 只清这一半的话，下一次 `get_engine` 仍会复用已建好的 `ScopeConnection`（里面那个 `ODPS` 对象拿的是旧凭据），症状是「改了配置只有重启才生效」。

  对 da 侧：(b) 的 `set_credentials` = 「推新凭据 + 丢连接缓存」一步原子，等价于 `invalidate_credential` 但带新值。reverse-bi 是 read-only 源（re-implement 不改），da 侧在 sidecar 内复刻这个语义即可。

- **reconnect（(a)）的角色**：从「cred 变更的常规失效路径」**降级**为「sidecar 崩溃/不可达的兜底」（与 P4 §3.4 已述一致）。cred 变更不再触发 reconnect，scope 缓存不再全丢。

即 R6 对 E 的净改：**cred 变更改走 `set_credentials`（per-call 控制信道），`invalidate_scope` 退守非 cred 配置热更；reconnect 退守崩溃兜底。** E 的 surgical 精神与「不重启 sidecar」结论不变，补上了 spawn-env 终结态这个漏洞。

---

## §8 adversarial 复核发现的缺口与确认（`research/r6-cred-hot-reload-review.md`）

独立复核（不信任本笔记，逐条从源码重派）**7 claim 全 VERIFIED**（claim 5 仅行号引注偏差，实质无误）、(b)+P1 推荐成立。复核还**实证了比本笔记更强的 P1 支点**，并 surface 4 个本笔记低估/未处理的缺口：

### §8.1 更强确认：P1 技术支点（`Protocol.request` 非 `tools/list`-gated）
SDK `Protocol.request()`（`shared/protocol.js:611`）是纯 JSON-RPC send：`:623` capability 门禁**仅当 `enforceStrictCapabilities === true`** 才跑（`shared/protocol.d.ts:22` 可选默认 falsy；mcp-client `new Client` `connection.ts:238` **未设**），且 `assertCapabilityForMethod('tools/call')` 只查 server 在 `initialize` 应答里声明的 `tools` capability，**不查 tool-name 是否在 `tools/list`**。故 da `client.request({method:'tools/call', params:{name:'set_credentials',...}})` 按 raw name 调，**不必**先 `tools/list`、该 name **不必**在 `tools/list` —— P1「da 自持 Client、不注册 sidecar 工具」技术支点实证成立（review §B1）。

### §8.2 HOLE-A（P1 低估 `initialize` 握手义务）
da 的 raw `Client` **必须** `await client.connect(transport)`，自动跑 `initialize` 请求 + `notifications/initialized` + 协议版本校验 + `setProtocolVersion`（SDK `client/index.js` `connect()`）；connect 失败会 `close()` 并抛，da 须处理启动失败。本笔记 §6.3 P1「约 50 行」未显式列此义务（对抗测试问题清单里列了但正文未展开）——「50 行 bounded」偏低（review §B2）。

### §8.3 HOLE-B（P1 跳过 reconnect = 可靠性债，本笔记当简化记、低估）⚠ 最重
本笔记 §6.3 P1 把「无 reconnect 调度」列为**简化收益**。但 mcp-client `connection.ts` 有**成熟 reconnect**：`RECONNECT_DEFAULTS` frozen（指数退避 `initialDelayMs`→`maxDelayMs`、`maxAttempts` 耗尽注销、`connectedAt` 稳定窗口重置预算）、`onclose`→`generationDown`→`scheduleReconnect` 自动驱动、`GENERATION_CLOSE_TIMEOUT_MS` 防重叠子进程。P1 下 da 的 raw Client **无任何** reconnect → sidecar 子进程崩溃 → transport `onclose` → da 的 Client 死 → **谁重连未定**。本笔记 §7 把 reconnect 降级为「崩溃兜底」但未指定 P1 下该兜底由谁承担。三选一：(i) mini reconnect loop（da 重写，+行数+债）；(ii) lazy on-next-call re-spawn（`ctx.query.execute` 检测死 Client → re-spawn+re-connect，简单但崩溃后首条 query 付重启延迟）；(iii) 不重连（崩溃即停服，等 HMR/人工）。**此为开 G4 grilling 票的核心判断轴**（review §C2 HOLE-B + §D）。

### §8.4 HOLE-C（在途查询 per-scope 原子性未处理）
§3.6/§7 称 `set_credentials`「原子更新 per-scope 凭据 + 丢该 scope 连接缓存」。但若该 scope 有在途 query（`ODPS` 对象已 `acquire()` 在用旧凭据跑作业），drop 连接缓存**不必然** abort 在途 ODPS 操作（reverse-bi `invalidate_credential` `credentials.py:192` 同张力）。「原子」一词过强；sidecar 须定 drain（等在途完）vs cancel（强杀）策略（review §C2 HOLE-C）。

### §8.5 HOLE-D（SDK Client notification da 跳过，但可能需要）
`Protocol` 基类构造器自动装 `CancelledNotificationSchema`+`ProgressNotificationSchema` handler。query sidecar 跑长查询 + attach/cancel，若发 `notifications/progress`/`notifications/cancelled`，da 的 raw Client 会收但未必 wire 到 `ctx.query.execute` 的 timeout/cancel 语义。「50 行」可能低估 notification 接线（若 sidecar 用 progress 推送）（review §C2 HOLE-D）。

### §8.6 引注修正（claim 5）
`types.ts` 的 `credentials/updated` 事件声明实为 `:40`（JSDoc 文本「process-environment changes are not observable and never emit」）/`:50`（事件签名），本笔记 §1/Finding 引 `:18-29` 偏移约 20 行；`notifyUpdated` 实为 `index.ts:120`，本笔记引 `:105-117`（前置 JSDoc 跨 `:105-119`）偏 ~3 行。**实质无误**，仅引注偏差（review §A claim 5）。

### §8.7 follow-up
「P1 vs P2」（P1 da 自持 Client、additive；P2 改 mcp-client core 加 `callTool`+allowlist 复用成熟 reconnect）+ P1 崩溃恢复形态（HOLE-B 三选一）+ HOLE-A/C 实现定调 → 开 **G4 grilling 票**（`tickets/phase-2/G4-query-sidecar-control-reliability.md`）让团队显式签字。复核不同意 parent agent「additive-only 即定 P1 无需票」——additive-only 定默认走 P1，但 P1 自担生命周期的可靠性代价是否可接受是真实工程判断，非 standing principle 能独裁（review §D）。

---

## 关键路径索引

**P4 原型证伪（scenario 4）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/prototypes/p4-query-engine/sidecar.mjs`（`:16` `credSnapshot()` 读 `process.env`、`:22` `ensureConn` 建连时快照、`:53-54` `invalidate_scope` = `connections.delete` surgical）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/prototypes/p4-query-engine/run.mjs`（`:34` per-call resolve→spawn env（F2/§5.2c）、`:48` `restartSidecar` 丢所有 scope、`:74` F2 spawn-env 张力原文、`:117/120` scenario 4 步骤）

**harness mcp-client（选项 a/b/c 共据）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/index.ts`（`:50/63-64` `StdioConfig.env`「Extra env vars merged on top of scrubbed ambient env」、`:76/87-88` `StreamableHttpConfig.headers`「Additional headers attached to MCP requests」、`:140/166` `apply`→`startConnection(ctx, config, reconnect)`、`:118-138` `Config = z.union([...])` Schemastery）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/connection.ts`（`:12-13` 模块 docstring「disposal (including HMR) is the only way back from that state」、`:99` `ConnectionHandle` = `ready`/`dispose` only、`:196-197,213` reload/restart 提示、`:237/272` `connectGeneration`→`generation.connect(createTransport(config))`、`:327` `dispose()` 终结 teardown）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/transport.ts`（`:21-22` `buildChildEnv`、`:31` `createTransport`、`:34-40` stdio 分支 `new StdioClientTransport({...env: buildChildEnv(config.env)})`、`:45-47` streamable-http 分支 `new StreamableHTTPClientTransport(url, {requestInit:{headers:config.headers}})`）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/tools.ts`（`:80-88` `callToolUncached` 发 `tools/call` params `{name,arguments:args}`、`:111/155/181` `publicToolName`+`syncTools` 全量注册为 model-facing、`:303/315` `createExecutor` args=`JSON.parse(model_arguments)` 直发 wire）

**A1-split 分层（P1/P2 的依据，R6 新增）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p4-guard-chain-placement.md`（§4.2 A1-split 决策表：`tool-query` consumer = MCP/会话 orchestrator 拥 G1/G5/budget/near-dup/halt/cache/required_predicates；`ctx.query.execute` = engine-wrapper guard host 拥 cost/timeout/retry/orphan；`query-maxcompute` sidecar = "dumb raw executor + per-scope 缓存"，其工具由 `ctx.query.execute` 程序化调用、**非 model-facing**——R6 据此定 P1：da 自持 Client、不注册 sidecar 工具）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p4-build-defaults.md`（§2.5 三包表：`query-tool` = tool-query consumer owns G1/G5/budget/near-dup/halt/cache；`query-maxcompute` = dumb executor + per-scope cache；§6 E surgical invalidate_scope + reconnect 兜底）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/servers/execution.py`（`:790` G1 `pre_sampling_gate` / `:798` G5 `count_estimate_gate` / `:823` 主查询 `run_query_async`——三处皆在 model-facing `query_data` 体内，engine/sidecar 是内部调用、**从不 model-facing**）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/mcp/mcp-client/src/tools.ts`（`:143,181` `syncTools` 把 `tools/list` 全量注册为 model-facing，无 allowlist/隐藏注册——用 plugin = 所有 sidecar 工具 model-facing = A1-split 违反，即 P1 不用 plugin、P2 须加 allowlist 特性的依据）

**MCP SDK（选项 c LINCHPIN + 选项 a stdio 语义）**：
- `mc-sdk/dist/esm/client/streamableHttp.d.ts`（`:73` `authProvider?`、`:75-77` `requestInit?: RequestInit` 静态无 provider、`:81` `fetch?: FetchLike`）
- `mc-sdk/dist/esm/client/streamableHttp.js`（`:29` `this._requestInit = opts?.requestInit`、`:32` `createFetchWithInit`、`:58/72` `_commonHeaders` 每请求 `normalizeHeaders(this._requestInit?.headers)`、`:299-306` `send` 每请求过 `_commonHeaders`、`:89/306/443` `(this._fetch ?? fetch)`）
- `mc-sdk/dist/esm/shared/transport.js`（`:5,14` `normalizeHeaders` → `return { ...headers }` spread 读当前值、`:24` `createFetchWithInit`）
- `mc-sdk/dist/esm/client/stdio.d.ts`（`:19` `env?: Record<string,string>`「environment to use when spawning」、`:42`「spawning a process」、`:56`「Starts the server process」——stdio env 对子进程寿命终结态）
- 绝对前缀：`/Users/mckenzie/workspace/deepseek-harness-da/node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3/node_modules/@modelcontextprotocol/sdk`

**harness 凭证 seam（per-call resolve 硬规则 + 热发布信号源）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/index.ts`（`:66-68` `resolve` docstring per-call resolve 硬规则、`:105-117` `notifyUpdated` fan `credentials/updated`）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/types.ts`（`:18-29` `credentials/updated` 事件声明「Ambient process-environment changes are not observable and never emit」）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials-local/src/index.ts`（`:277-303` chokidar watcher → `reconcileFromDisk` → `notifyUpdated` 热发布外部编辑）

**reverse-bi 双清失效（(b) 的语义镜像，read-only）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`（`:300` `_CONNECTIONS: dict[str, ScopeConnection]`、`:304` `get_scope_connection`、`:317-320` `invalidate_scope_connection` = `_CONNECTIONS.pop(scope_id)` surgical）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py`（`:152` `_resolve_uncached` DB→config_file→env 不缓存、`:166` `resolve_for_scope` per-scope TTL、`:192-204` `invalidate_credential` 双清 `_CACHE.pop`+`invalidate_scope_connection`、`:195-197` docstring「只清这一半…症状是改了配置只有重启才生效」）

**前置票据（背景笔记）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/r2-maxcompute-cred-cache.md`（§5.2c INFERENCE「凭证经 StdioConfig.env 注入」+ §5.2d 失效钩子「invalidate_scope 工具 或 重启 sidecar」——R6 证伪前者对 cred 热更的充分性）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p4-build-defaults.md`（§3.4 E surgical invalidate_scope + reconnect-as-崩溃兜底 + §4 F2 spawn-env）
