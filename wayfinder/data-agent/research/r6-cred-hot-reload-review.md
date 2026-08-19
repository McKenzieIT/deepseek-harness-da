# R6 — code review（adversarial 源码复核）

独立复核：不信任 R6 笔记的任何论断，逐条从源码重派。主源（实际读取并核行号）：
`packages/mcp/mcp-client/src/{connection,tools,transport,index}.ts` +
MCP SDK `@modelcontextprotocol/sdk@1.29.0`（`dist/esm/client/{index,streamableHttp,stdio}.*` + `shared/{protocol,transport}.*`）+
`packages/credentials/credentials/src/{index,types}.ts` +
`wayfinder/data-agent/prototypes/p4-query-engine/{sidecar,run}.mjs` +
`reverse-bi/libs/rbi-mcp/src/rbi_mcp/{credentials.py,servers/execution.py}` +
`reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`。
SDK 绝对前缀：`/Users/mckenzie/workspace/deepseek-harness-da/node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3/node_modules/@modelcontextprotocol/sdk`。

**总判**：7 条 claim 全部 VERIFIED（其中 claim 5 有一处行号引注偏差，实质无误，记 NUANCED-citation）。推荐 (b)+P1 **成立**——P1 的技术支点（da 自持 raw SDK `Client` + `client.request({method:'tools/call',...})` 按 raw name 调用，不经 `tools/list`、不经 `ctx.tools.register`）经 SDK 源码实证成立。但笔记在两处**低估了 da 需自行承担的生命周期债**（initialize 握手义务、sidecar 崩溃后的 reconnect 策略），且未处理在途查询的 per-scope 原子性。这些不推翻推荐，但构成 follow-up 票的真实判断轴。

---

## §A 逐条复核

### Claim 1 — `ConnectionHandle` 只暴露 `ready`+`dispose`，`dispose()` 是终结 teardown，恢复只靠 HMR/reload → **VERIFIED**

- `packages/mcp/mcp-client/src/connection.ts:99` `export interface ConnectionHandle {`，接口体仅两项：`:103`（约）`ready: Promise<ConnectionOutcome>`、`:110`（约）`dispose(): Promise<void>`。**无** restart/reconnect-now/callTool/Client 句柄。实证。
- `connection.ts:327` `async dispose(): Promise<void> {`：`:328` `disposed = true` → 清 `reconnectTimer` → `current.close()` → `await settling` → `await syncChain` → `for (const dispose of disposers.values()) dispose()`（注销该 server 全部工具）。**不调度重连**。实证。
- `connection.ts:13` 模块 docstring 直引：「Exhaustion unregisters the server's tools and stops; disposal (including HMR) is the only way back from that state.」实证。
- `connection.ts:197`/`:213`/`:291` 三处「reload the plugin or restart the Host」恢复提示。实证。
- 自动 reconnect：`scheduleReconnect()`（`:192` 定义）只被 `generationDown()`（`:177` 调用）触发，即**仅连接丢失**时自发；无外部触发入口。实证。
- 模块顶层 docstring（`:4-13`）自述「restarts the configured server with bounded exponential backoff」——该 restart 是**崩溃后自动 reconnect** 语义，非外部「立即 restart now」API。实证。

claim 1 的「da 侧无立即重连公共 API」INFERENCE 成立：`apply(ctx, config)`（`index.ts:140`）收 resolved config，`ConnectionHandle` 只暴露 `ready`/`dispose`，da（另一 preset/plugin）不持 mcp-client 的 config/Client 引用。

### Claim 2 — `syncTools` 全量注册为 model-facing，无 allowlist；args 直发 wire → **VERIFIED**

- `tools.ts:80` `function callToolUncached(client, rawName, args, exec, opts)` → `:86` `client.request({ method: 'tools/call', params: { name: rawName, arguments: args } }, RawCallToolResultSchema, { signal, timeout })`。rawName + args 直发 wire `tools/call` params。实证。
- `tools.ts:315` 注释直引：「The agent loop passes `JSON.parse(model_arguments)` which is usually an object, but can be any JSON value...」→ `:317` `const argsObj = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>` → `:320` `callToolUncached(client, rawName, argsObj, ...)`。模型传入的 args 原样进 wire params。实证。
- `tools.ts:143` `export async function syncTools(...)`：`:150-167` 翻页 `listToolsUncached`（`:72` 定义）建 `definitions`；`:181` `disposers.set(publicName, ctx.tools.register(definition))`——`tools/list` 里**每一个** tool 都注册成 `mcp__<serverName>__<rawName>`（`:155` `publicToolName`）。**无 allowlist、无「注册但对模型隐藏」、无程序化（非模型）调用 API**。实证。
- 冲突回滚（`:175-179`）只处理 registry namespace squat，不改「全量 vs 子集」语义。实证。

claim 2 的推论成立：若 sidecar 把 `set_credentials`/`invalidate_scope` 列进 `tools/list`，`syncTools` 即把它们注册为 model-callable（DoS/安全面）。控制工具**不能**经 plugin bridge 暴露。

### Claim 3 — stdio：每 generation 新 Client+transport，spawn 子进程，env 对子进程寿命终结，config.env 在 load 时解析且 da 不可达 → **VERIFIED**

- `connection.ts:237` `async function connectGeneration(startup)`：`:238` `const generation = new Client({ name: 'dsh-mcp-client', version: '0.0.1' }, { capabilities: {} })`（每 generation 新 Client）；`:272` `await generation.connect(createTransport(config))`（每 generation 新 transport）。实证。
- `transport.ts:31` `export function createTransport(config)`：`:34-40` stdio 分支 `new StdioClientTransport({ command, args, env: buildChildEnv(config.env), cwd })`。实证。
- `transport.ts:21` `function buildChildEnv(extra)` → `:23` `return { ...scrubbedParentEnv(), ...extra }`——读 `config.env` 当前键值。实证。
- `index.ts:63` `StdioConfig.env` JSDoc「Extra env vars merged on top of scrubbed ambient env.」；`:66` `env: Record<string, string>`（实际 `z.dict(String).default({})` 在 `:138`）。实证。
- SDK stdio spawn 语义：`client/stdio.d.ts:42`「Client transport for stdio: this will connect to a server by **spawning a process** and communicating with it over stdin/stdout.」、`:56` `start()` JSDoc「**Starts the server process** and prepares to communicate with it.」、`:15` `env?` JSDoc「The environment to use when spawning the process.」实证——env 在 spawn 时定型，子进程寿命内冻结。
- `config.env` 不可达：`apply(ctx, config)` 收 Schemastery 解析后的 config（`index.ts:140`），`ConnectionHandle` 只暴露 `ready`/`dispose`（claim 1）。da 不持 mcp-client config 引用。INFERENCE 合理（Schemastery 是否 `Object.freeze` 不影响结论——即使对象可变，da 也拿不到引用）。

claim 3 的推论成立：reconnect = 新 generation = 新 spawn 子进程 = 旧子进程进程内存（sidecar 镜像的 `_CONNECTIONS` per-scope ODPS 缓存）随进程终止清零 = **所有 scope 缓存全丢**，contra E 的 surgical。

### Claim 4 — streamable-http LINCHPIN：`requestInit` 静态无 provider，但 `_commonHeaders` 每请求重读 headers 引用 → **VERIFIED**

- `client/streamableHttp.d.ts:75` JSDoc「Customizes HTTP requests to the server.」、`:77` `requestInit?: RequestInit;`——类型上**静态 `RequestInit`**，**无** `() => RequestInit` provider 重载。实证。
- `client/streamableHttp.d.ts:73` `authProvider?: OAuthClientProvider;`、`:81` `fetch?: FetchLike;`——SDK 另收 auth provider（仅 OAuth Bearer）与自定义 fetch。实证。
- `client/streamableHttp.js:29` `this._requestInit = opts?.requestInit;`（构造器**存引用**，不拷贝）；`:32` `this._fetchWithInit = createFetchWithInit(opts?.fetch, opts?.requestInit);`。实证。
- `client/streamableHttp.js:58` `async _commonHeaders()`：`:72` `const extraHeaders = normalizeHeaders(this._requestInit?.headers);`——**每次调用**重读 `this._requestInit?.headers` 引用。实证。
- `_commonHeaders` 调用点（grep 实证）：`:83`（`_startOrAuthSse`，GET SSE 路径）、`:296`（`send`，POST 路径）、`:436`（`terminateSession`，DELETE 路径）。即**每条 MCP 请求**都过 `_commonHeaders`。
- `shared/transport.js` `normalizeHeaders`（`:5` 定义）：末分支 `return { ...headers };`——**spread 读调用时的当前键值**。实证。
- `streamableHttp.js:288` `async send(message, options)`：`:296` `const headers = await this._commonHeaders();` → `:299-304` `const init = { ...this._requestInit, method: 'POST', headers, body: ..., signal: ... }` → `:306` `const response = await (this._fetch ?? fetch)(this._url, init);`。实证——`send` 每请求过 `_commonHeaders`。
- `(this._fetch ?? fetch)` 三处：`:89`（`_startOrAuthSse` GET）、`:306`（`send` POST）、`:443`（`terminateSession` DELETE）。实证。
- plugin 层：`transport.ts:45` `return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } })`——传 `config.headers` **引用**（非拷贝），每个 generation 构造一次。`config.headers` 在 plugin load 时解析（`index.ts:87` JSDoc「Additional headers attached to MCP requests.」、`:90` `headers: Record<string, string>`、`z.dict(String).default({})`）。da 不可达（同 claim 3）。实证。

claim 4 的 LINCHPIN 论断**逐字成立**：SDK 层支持「原地改写 `this._requestInit.headers` 对象引用的键值 → 下一次 `_commonHeaders()` 经 `normalizeHeaders` spread 读到新值 → per-request 传播」，无需 provider 函数、无需重连；但 plugin 层 `createTransport` 只传一次 `config.headers` 引用，da 不持该引用，故 plugin 层构造固定。(c) 要拿到真正 per-request creds，需 core 改（传 provider/custom-fetch/setHeaders）或 da bypass（自持 transport+Client）。

### Claim 5 — credentials seam：per-call resolve 硬规则；`notifyUpdated` fan `credentials/updated`；ambient env 不发 → **VERIFIED**（行号引注 NUANCED）

- `packages/credentials/credentials/src/index.ts:66` `* Resolve one reference to its current value. Resolution is per call:`（`:67-68` 续「consumers re-resolve at each operation and must not cache across operations — that per-operation read is what makes a changed credential reach the next operation without a restart.」）。per-call resolve 硬规则实证。
- `index.ts:120` `protected notifyUpdated(ref, address?)`：fan `credentials/updated`（`:127` `const args = address === undefined ? ['credentials/updated', ref] : ['credentials/updated', ref, address]`，`:128` `this.ctx.events.dispatch('emit', args)`）。实证。**注**：笔记引 `:105-117`，实际方法签名在 `:120`（前置 JSDoc 跨 `:105-119`）。行号偏 ~3 行，实质无误。
- `packages/credentials/credentials/src/types.ts:40` `* process-environment changes are not observable and never emit.`（JSDoc 内文）、`:50` `'credentials/updated'(ref: CredentialRef, address?: CredentialAddress): void`（事件签名）。实证。**注**：笔记引 `types.ts:18-29`，实际该文本在 `:40`、事件签名在 `:50`；`:18-29` 对应的是 `CredentialAddress` interface 区段，**引注偏移 ~20 行**。这是 claim 5 唯一的瑕疵——行号引注不准，但「ambient process-env changes do NOT emit」的论断本身**逐字实证**。记 **NUANCED-citation**（引注偏差，实质 VERIFIED）。

### Claim 6 — P4 scenario 4 实证证伪 E 对 cred 变更的充分性 → **VERIFIED**

- `prototypes/p4-query-engine/sidecar.mjs:16` `function credSnapshot() { const s = {}; for (const r of CREDS) s[r] = process.env[r] ? hash(process.env[r]) : '<unset>'; return s }`——**调用时**读 `process.env`。实证。
- `sidecar.mjs:22` `function ensureConn(scope_id) { if (!connections.has(scope_id)) connections.set(scope_id, { snapshot: credSnapshot(), builtAt: Date.now() }) }`——**建连时**快照。实证。
- `sidecar.mjs:53` `case 'invalidate_scope': {  // surgical: drop ONE scope's connection cache (mirror invalidate_scope_connection)` → `:54` `const had = connections.delete(scope_id); ...`——`invalidate_scope` = `connections.delete(scope_id)`，surgical。实证。
- `prototypes/p4-query-engine/run.mjs:34` `for (const r of CREDS) { const c = await resolve(r); if (c) env[r] = c.value }  // per-call resolve -> spawn env (F2 / R2 §5.2c)`——per-call resolve 写进 spawn env。实证。
- `run.mjs:48` `async function restartSidecar() { note('reconnect: dispose + re-spawn sidecar (drops ALL scope caches — over-broad per E)'); stopSidecar(); await startSidecar() }`——restart = kill+respawn，丢所有 scope。实证。
- `run.mjs:74` 直引「⚠ F2 spawn-env tension: sidecar env is FIXED at spawn. invalidate_scope dropped ${currentScope}'s cache, but the sidecar rebuilds the next connection from STALE spawn-env creds. To pick up the new value: restart sidecar (drops ALL scopes — over-broad, contra E) OR switch cred injection to a per-call set_credentials sidecar channel (diverges from R2 §5.2c "StdioConfig.env").」实证。

claim 6 的因果链成立：`invalidate_scope` 只清连接缓存、不清 spawn-env（终结态），重建仍读旧值（SK_OLD）；`restartSidecar` 能取新值但丢所有 scope 缓存（contra E surgical）。E 对 cred 变更不充分。

### Claim 7 — reverse-bi 双清语义（`set_credentials` 的镜像）→ **VERIFIED**

- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:192` `def invalidate_credential(scope_id: str) -> None:`；docstring（`:193-197`）直引「同时让 rbi-query 那侧的连接缓存失效 —— 只清这一半的话，下一次 `get_engine` 仍会复用已建好的 `ScopeConnection`（里面那个 `ODPS` 对象拿的是旧凭据），症状是「改了配置只有重启才生效」。」（`:197` 末句）；`:200` `_CACHE.pop(scope_id, None)`（清凭据层）；`:204` `invalidate_scope_connection(scope_id)`（清连接层）。双清实证。
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:300` `_CONNECTIONS: dict[str, ScopeConnection] = {}`；`:304` `def get_scope_connection(scope_id)`；`:317` `def invalidate_scope_connection(scope_id: str) -> None:` → `:320` `_CONNECTIONS.pop(scope_id, None)`（surgical pop）。实证。

claim 7 的镜像论断成立：da 侧 (b) 的 `set_credentials` = 「推新凭据 + 丢该 scope 连接缓存」等价于 reverse-bi `invalidate_credential` 的双清但带新值。reverse-bi 是 read-only 源（da 复刻语义，不改 rbi）。

---

## §B 对抗性测试（SDK `Client` / P1 技术支点）

笔记 §6.3 P1 的支点：da `new Client(...)` + `new StdioClientTransport(...)` + `client.request({method:'tools/call', params:{name, arguments}})` 按 raw name 调，**不**经 `tools/list`、**不**经 `ctx.tools.register`。对抗性验证三问：

### B1. `tools/call` 是否是 raw JSON-RPC send，不被 prior `tools/list` 门禁？→ **是（P1 支点成立）**

- `shared/protocol.js` `request(request, resultSchema, options)`（`:611` 起）：`:623` `if (this._options?.enforceStrictCapabilities === true) { this.assertCapabilityForMethod(request.method); ... }`——**唯一**的 capability 门禁，且**仅当 `enforceStrictCapabilities === true`** 时才跑。
- `shared/protocol.d.ts:22` `enforceStrictCapabilities?: boolean;`——**可选**，默认 `undefined`（falsy）。
- mcp-client 构造 Client（`connection.ts:238`）：`new Client({ name: 'dsh-mcp-client', version: '0.0.1' }, { capabilities: {} })`——**未设** `enforceStrictCapabilities: true`。故 mcp-client（以及 da 若照搬构造）的 `request()` **默认无 capability 门禁**，是纯 JSON-RPC send。
- 即便 da 显式设 `enforceStrictCapabilities: true`：`client/index.js` `assertCapabilityForMethod('tools/call')`（该 case 在 `assertCapabilityForMethod` switch 内）只查 `this._serverCapabilities?.tools`——即 server 在 `initialize` 应答里**声明了 tools capability**（sidecar 作为真 MCP server 会声明），**不**查「该 tool name 是否在 `tools/list` 里」。
- `request()` body（`:628-633`）：`const messageId = this._requestMessageId++; const jsonrpcRequest = { ...request, jsonrpc: '2.0', id: messageId };`——直接拼 JSON-RPC 2.0 envelope 经 transport 发出。**无 tools/list 校验**。
- 旁证：mcp-client 自己的 `callToolUncached`（`tools.ts:80-88`）就是 `client.request({method:'tools/call', params:{name: rawName, arguments}}, RawCallToolResultSchema)`——注释（`tools.ts` 附近）明言「Call without the SDK pre-validating an output schema the bridge may not support」，即绕开 SDK 的 typed `callTool()` 直接发 wire。da 照同一 pattern 调 `set_credentials` raw name 完全可行。

**结论**：da 可 `client.request({method:'tools/call', params:{name:'set_credentials', arguments:{...}}})` 而**不**先 `tools/list`、该 name **不**在 `tools/list` 里——wire 上 server（sidecar）照常收 `tools/call` 并处理。P1 技术支点实证成立。

### B2. SDK `Client` 是否需要 `initialize` 握手（da 必须 `client.connect(transport)`）？→ **是（HOLE：P1 低估此义务）**

- `client/index.js` `async connect(transport, options)`：`super.connect(transport)` → `if (transport.sessionId !== undefined) return;`（重连跳过）→ `const result = await this.request({ method: 'initialize', params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: this._capabilities, clientInfo: this._clientInfo } }, InitializeResultSchema, options);` → 校验 `SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)` → `transport.setProtocolVersion(result.protocolVersion)` → `await this.notification({ method: 'notifications/initialized' });` → `_setupListChangedHandlers`（若有）。
- class JSDoc（`client/index.d.ts`）直引：「The client will automatically begin the initialization flow with the server when connect() is called.」

**结论**：da 的 raw `Client` **必须** `await client.connect(transport)`，这会自动跑 `initialize` 握手 + 发 `notifications/initialized`。笔记 §6.3 P1 正文「约 50 行 transport+Client 接线」未显式提及 this 义务（虽然笔记的对抗性测试问题清单里**列了**这一问）。connect() 失败会 `void this.close()` 并抛——da 须处理启动失败。这不推翻 P1，但「50 行 bounded」低估了「connect() 握手 + 启动失败处理」的接线债。记为 **HOLE-A**。

### B3. P1 是否真正消解控制信道缺口（无 `ctx.tools.register` → `set_credentials`/`invalidate_scope` 非 model-callable）？→ **是（消解成立）**

- P1 下 da 自持 Client，**不**调 `syncTools`（`tools.ts:143`），**不**调 `ctx.tools.register`（`tools.ts:181`）——sidecar 的 `execute`/`attach`/`cancel`/`get_progress`/`estimate_cost` AND `set_credentials`/`invalidate_scope` **全部**按 raw name 经 `client.request({method:'tools/call',...})` 程序化调用，返回结构化结果给 `ctx.query.execute` engine-wrapper，不经模型。
- 模型可见的只有 `tool-query` consumer（args = sql + scope_id）。`set_credentials`/`invalidate_scope` 只是 da 自己 Client 上的 raw-name JSON-RPC 调用，**不存在** model-facing 注册路径。
- 无其他 model-facing 泄露面：da 的 Client 不经 `ctx.tools`，`ctx.query.execute` 是程序化 seam（非 `ctx.tools.register` 的 tool definition）。实证成立。

### B4. P1 与 A1-split 是冲突还是修复潜藏不一致？→ **修复（非冲突）**

- A1-split（`wayfinder/data-agent/research/p4-guard-chain-placement.md:68`）：「provider 是 dumb raw executor（只 `execute/attach/cancel/get_progress/estimate_cost` + sidecar 自有 per-scope 缓存）」；`:139`「修正后的 A1 形态（call it A1-split）」；`:146` 决策表「dumb raw executor + per-scope 缓存 | `query-maxcompute` sidecar（**经 mcp-client**）」；`:148`「A1-split 让 `tool-query` 调 `ctx.query.execute` 三次（G1 探针 / G5 COUNT / 主查询）」。
- `p4-build-defaults.md:213` 三包表：「`packages/query/query-maxcompute/` | ...（dumb executor + per-scope 缓存）| ... | provider：**mcp-client sidecar 代理** + per-call `ctx.credentials.resolve` + `credentials/updated` 失效监听」。
- rbi 侧（`servers/execution.py`）：`:587` `async def query_data(`（model-facing tool 体内）；`:790` `gate_reject = await quality_gate.pre_sampling_gate(...)`（G1）、`:798` `count_clarify = await limit_gate.count_estimate_gate(...)`（G5）、`:823` `outcome: QueryOutcome = await run_query_async(...)`（主查询）——**三处皆在 model-facing `query_data` 体内**，engine/sidecar 是内部调用、从不 model-facing。实证 A1-split 的精神：sidecar 工具非 model-facing。
- **潜藏不一致**（笔记 §6.3 末段已 surface）：`p4-guard-chain-placement.md:146` 括注「经 mcp-client」+ `p4-build-defaults.md:213`「mcp-client sidecar 代理」**假设** query sidecar 经 mcp-client plugin；但 plugin 的 `syncTools`（`tools.ts:143,181`）**全量**注册为 model-facing——若 sidecar 在 `tools/list` 列 `execute`，则 `mcp__query-maxcompute__execute` 成 model-callable，模型可直接调它**绕过** `tool-query` 的 G1/G5/budget/near-dup/halt/cache 会话门。这**直接违反** A1-split 的「sidecar da-internal、非 model-facing」。
- **P1 修复此不一致**：da 自持 raw Client、不调 `syncTools`、不注册 sidecar 工具——sidecar 工具天然非 model-callable，A1-split 精神保全。P1 不与 A1-split 冲突，而是让 A1-split 的「sidecar 非 model-facing」**首次可严格执行**（前置研究只在括注里假设「经 mcp-client」，未察觉 `syncTools` 全量注册的后果）。实证成立。

---

## §C 推荐判断：(b)+P1 — **sound（成立）**，但有 holes

### C1. 推荐成立的核心

- (b) per-call `set_credentials` 经非 model-visible 控制信道：per-call resolve 硬规则保留且更强（claim 5）、surgical 与 E 一致（claim 7 镜像 reverse-bi 双清）、creds 不进 spawn-env（贴合 PAT not in process.env，比 §5.2c 更优）、偏离 §5.2c 可接受（§5.2c 是 R2 INFERENCE，R6 证伪之）。
- P1 是 clear winner：additive-only（纯新增 `packages/query/query-maxcompute/`，不碰 core）、与 A1-split 一致（sidecar da-internal、非 model-facing）、**消解控制信道缺口**（B3 实证：无 model-facing 注册 → 控制工具天然非 model-callable）、技术支点成立（B1 实证：`request()` 是 raw JSON-RPC send，不被 tools/list 门禁）。
- P2（core 改 `callTool` + allowlist 特性）over-engineering：即便加 `callTool`，若 da 仍用 plugin bridge query 工具，`syncTools`（`tools.ts:143,181`）仍全量注册 sidecar 工具为 model-facing = A1-split 违反，故 P2 还须加 allowlist/hidden-registration 特性 = core 改 + 附加特性，比 P1 重。P2 保留为「团队坚持复用 plugin bridge」退路。

### C2. HOLE 清单（笔记低估/未处理的债）

**HOLE-A（P1 低估 initialize 握手义务）**：见 B2。da 的 raw `Client` 必须 `await client.connect(transport)`（跑 `initialize` + `notifications/initialized` + 协议版本校验 + `setProtocolVersion`），并处理启动失败（connect 失败会 `close()` 并抛）。笔记 §6.3 P1 正文「约 50 行 transport+Client 接线」未显式列此步。不推翻 P1（connect() 是 SDK 自动跑握手，da 只需调一次），但「50 行 bounded」的估计偏低。

**HOLE-B（P1 跳过 reconnect = 可靠性债，笔记当简化记、低估）**：笔记 §6.3 P1 把「无 reconnect 调度」列为**简化收益**（「比 mcp-client 的通用 MCP bridge 窄——无 tools/list 翻页、无图片/resource 投影、无 reconnect 调度」）。但 mcp-client 的 `connection.ts` 有成熟 reconnect 策略（`RECONNECT_DEFAULTS` frozen 默认、`scheduleReconnect` 指数退避、`maxAttempts` 耗尽注销、`generationDown`→`scheduleReconnect` 自动驱动、`GENERATION_CLOSE_TIMEOUT_MS` 防重叠子进程）。P1 下 da 的 raw Client **无任何** reconnect——sidecar 子进程崩溃 → transport `onclose` 触发 → da 的 Client 死 → **谁重连？** 笔记 §7 把 reconnect 降级为「sidecar 崩溃/不可达的兜底」，但未指定 P1 下该兜底由谁承担。这是**真实的可靠性判断轴**（见 §D）：da 要么 (i) 重实现一个 mini reconnect loop（+行数、+债），要么 (ii) lazy on-next-call 重连（`ctx.query.execute` 检测死 Client → re-spawn + re-connect，简单但崩溃后首条 query 付重启延迟），要么 (iii) 不重连（崩溃即停服，等 HMR/人工）。笔记未定调。**这是 follow-up 票的核心判断轴**。

**HOLE-C（在途查询的 per-scope 原子性未处理）**：笔记 §3.6/§7 称 `set_credentials`「原子更新 per-scope 凭据 + 丢该 scope 连接缓存」。但若该 scope 有在途 query（ODPS 对象正持旧凭据跑作业），drop 连接缓存不必然 abort 在途 ODPS 操作（`ScopeConnection` 的 `ODPS` 对象已 `acquire()` 在用）。reverse-bi 的 `invalidate_credential`（`credentials.py:192`）有同样张力。笔记未 surface 此并发面。不致命（属 sidecar 实现细节：可等在途 drain 或显式 cancel），但「原子」一词在此过强。

**HOLE-D（SDK Client notification 处理 da 跳过，但可能需要）**：mcp-client 的 `connection.ts`（`:260` 附近）注册 `ToolListChangedNotificationSchema` handler 触发 re-sync。da 的 raw Client 不用 `tools/list`，故 tool-list-changed 无关。但 `Protocol` 基类构造器自动装 `CancelledNotificationSchema` + `ProgressNotificationSchema` handler（`protocol.js` 构造器）。query sidecar 跑长查询 + attach/cancel，若 sidecar 发 `notifications/progress` 或 `notifications/cancelled`，da 的 raw Client 会收但未必 wire 到 `ctx.query.execute` 的 timeout/cancel 语义。笔记「50 行」可能低估 notification 接线（若 sidecar 用 progress 推送）。次要 hole。

### C3. OVERSTATEMENT 清单

**OVERSTAT-1（claim 4 的「无需重连」表述精准，但「plugin 层构造固定」略绝对）**：笔记 §4.2 论「plugin 层无 `setHeaders` API」正确；但 SDK 层 `_commonHeaders` 每请求重读 `this._requestInit.headers` 引用这一事实，意味着**若**有人能原地改写 `config.headers` 对象（同一引用），plugin 层也会传播。笔记已正确指出 da 不持 `config.headers` 引用（claim 3），故「plugin 层构造固定」对 da 侧成立。但表述上「plugin 层未利用 SDK 的 per-request 能力」略绝对——plugin **无意**利用（`transport.ts:45-47` 只传静态 requestInit），但 SDK 层的 per-request 能力**客观存在**且对 plugin 持有的引用有效。笔记 §4.3 已补正（列了 (i)/(ii)/(iii) 三路），故属精准度问题非实质错误。

**OVERSTAT-2（「约 50 行」低估）**：HOLE-A + HOLE-B + HOLE-D 叠加，da 的真实接线（connect 握手 + 启动失败 + 崩溃重连策略 + 可能的 notification 接线）大概率超过 50 行。若采 lazy on-next-call 重连（HOLE-B 选项 ii），50 行尚可；若采 mini reconnect loop，明显超。笔记的「bounded / 比 mcp-client 窄」方向正确（确实无需 tools/list 翻页、图片投影、resource 投影），但绝对行数估计偏低。

**OVERSTAT-3（claim 5 行号引注）**：`types.ts:18-29` 应为 `:40`（文本）/`:50`（事件签名）；`index.ts:105-117` notifyUpdated 实际 `:120`。实质无误，引注偏差。

---

## §D follow-up 票判断：**应立票**（不同意 parent agent「additive-only 即定 P1，无需票」）

### D1. 笔记 §6.3 的 open 项

笔记 §6.3 末段明言「P1 vs P2 应立 follow-up 票定夺」，并把票定调为「P1（additive，推荐）vs P2（core 改 + allowlist 特性，only-if-reuse-plugin）」。parent agent 未立票，理由是「additive-only（一条 standing principle）即决定 P1——故无真正开放的人类决策」。

### D2. 我的独立判：存在真实判断轴，非 standing principle 能独裁

我**同意 P1 是正确推荐**（B1/B3/B4 实证其技术支点与 A1-split 一致性）。但**不同意「additive-only 即了结，无需票」**。理由：

standing principle「优先 additive、不改 core」是一条 **default**，它决定「**默认**走 P1」。但 P1 的 additive 优势**附带一项真实的可靠性代价**：da 自持 raw Client = da 自担 sidecar 生命周期，含崩溃恢复（HOLE-B）。mcp-client 的 `connection.ts` 已有成熟 reconnect（指数退避、maxAttempts 耗尽、防重叠子进程、`onclose` 驱动）——P1 **放弃复用**这套。这不是风格偏好，是**工程可靠性判断**：

- 若团队判「query sidecar 是长驻进程、per-scope ODPS 连接需保活、崩溃需快速恢复」→ 应重用 mcp-client 的成熟 reconnect 生命周期，值得为复用它做一个小 core 改（P2 的 `callTool` + allowlist），而非让 da 重写一套 mini reconnect。
- 若团队判「sidecar 崩溃罕见、lazy on-next-call 重连可接受（query 本就是用户发起、非连续）」→ P1 的 additive 优势压过可靠性债，50 行 + lazy 重连即可。

这两条路是**真实取舍**（复用成熟生命周期 + 小 core 改 [P2] vs da 自担生命周期 + 纯 additive [P1]），不是「additive 原则一刀切」能替团队回答的。它需要人类在「为复用 reconnect 而做 core 改是否值得」上签字——这正是 grilling 票的用途。

### D3. 票应定调的内容

follow-up grilling 票应**显式**问团队签字回答：

1. **da 的 sidecar 崩溃恢复策略**（HOLE-B）：(i) mini reconnect loop（da 重写，+行数）；(ii) lazy on-next-call re-spawn（简单，崩溃后首条 query 付重启延迟）；(iii) 不重连（等 HMR/人工）。这决定 P1 的真实行数与可靠性形态。
2. **是否值得为复用 mcp-client 成熟 reconnect 而做 P2 core 改**：即「additive-only 的可靠性代价是否可接受」。若团队判不可接受 → P2（core 改 `callTool` + allowlist）转正，P1 退为兜底。
3. **`initialize` 握手义务**（HOLE-A）与 **在途查询 per-scope 原子性**（HOLE-C）的实现定调：sidecar 在 `set_credentials` 时对在途 query 是 drain 还是 cancel。

这三项里，第 2 项是真正的「P1 vs P2」判断轴，第 1 项是 P1 内部的可靠性形态选择。两者都需人类签字，非 standing principle 能独裁。

### D4. 结论

- P1 作为推荐**成立**，应执行。
- 但「P1 vs P2」与「P1 的崩溃恢复形态」是**真实开放判断轴**，**应立 follow-up grilling 票**让团队显式签字。parent agent「additive-only 了结，无需票」的推理**低估了 HOLE-B 的可靠性债**——additive-only 决定了默认走 P1，但 P1 自担生命周期这一代价是否可接受，是一个需要人类在可靠性 vs core-change-aversion 之间权衡的真实判断。

---

## §E 关键路径索引（核行号汇总）

**mcp-client 核心**：
- `packages/mcp/mcp-client/src/connection.ts:99`（`ConnectionHandle` only `ready`/`dispose`）、`:13`（disposal is only way back）、`:192`（`scheduleReconnect`）、`:197/213/291`（reload/Host 提示）、`:237`（`connectGeneration`）、`:238`（`new Client`，未设 `enforceStrictCapabilities`）、`:272`（`generation.connect(createTransport(config))`）、`:327`（`dispose` 终结 teardown）
- `packages/mcp/mcp-client/src/tools.ts:72`（`listToolsUncached`）、`:80`（`callToolUncached` raw `tools/call`）、`:111`（`publicToolName`）、`:143`（`syncTools`）、`:181`（`ctx.tools.register` 全量）、`:303`（`createExecutor`）、`:315`（`JSON.parse(model_arguments)` 注释）
- `packages/mcp/mcp-client/src/transport.ts:21`（`buildChildEnv`）、`:31`（`createTransport`）、`:37`（stdio `env: buildChildEnv(config.env)`）、`:45`（streamable-http `new StreamableHTTPClientTransport`）、`:47`（`requestInit: { headers: config.headers }`）
- `packages/mcp/mcp-client/src/index.ts:63`（`StdioConfig.env` JSDoc）、`:87`（`StreamableHttpConfig.headers` JSDoc）、`:140`（`apply`）

**MCP SDK**：
- `client/index.js` `connect()`（跑 `initialize` + `notifications/initialized` + `setProtocolVersion`）、`assertCapabilityForMethod('tools/call')`（只查 `serverCapabilities.tools`，不查 tool-name-in-list）、`callTool()`（typed 便捷法，da 不需要）
- `shared/protocol.js:611`（`request()` 纯 JSON-RPC send）、`:623`（`enforceStrictCapabilities === true` 才门禁）
- `shared/protocol.d.ts:22`（`enforceStrictCapabilities?: boolean` 可选默认 falsy）
- `client/streamableHttp.d.ts:73`（`authProvider?`）、`:75/77`（`requestInit?: RequestInit` 静态无 provider）、`:81`（`fetch?`）
- `client/streamableHttp.js:29`（`this._requestInit = opts?.requestInit` 存引用）、`:32`（`createFetchWithInit`）、`:58`（`_commonHeaders`）、`:72`（`normalizeHeaders(this._requestInit?.headers)` 每请求重读）、`:83/296/436`（`_commonHeaders` 三调用点）、`:288`（`send`）、`:306`（POST `(this._fetch ?? fetch)`）、`:89`（GET）、`:443`（DELETE）
- `shared/transport.js`（`normalizeHeaders` → `return { ...headers }` spread 读当前值；`createFetchWithInit`）
- `client/stdio.d.ts:15`（`env?` JSDoc spawning）、`:42`（spawning a process）、`:56`（Starts the server process）

**credentials seam**：
- `packages/credentials/credentials/src/index.ts:66`（per-call resolve 硬规则）、`:120`（`notifyUpdated` fan `credentials/updated`，笔记引 `:105-117` 偏 ~3 行）
- `packages/credentials/credentials/src/types.ts:40`（ambient env 不发，笔记引 `:18-29` 偏 ~20 行）、`:50`（`credentials/updated` 签名）

**P4 原型**：
- `prototypes/p4-query-engine/sidecar.mjs:16`（`credSnapshot()` 读 env）、`:22`（`ensureConn` 建连快照）、`:53-54`（`invalidate_scope` = `connections.delete`）
- `prototypes/p4-query-engine/run.mjs:34`（per-call resolve→spawn env）、`:48`（`restartSidecar` 丢所有 scope）、`:74`（F2 spawn-env 张力原文）

**reverse-bi 双清**：
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:192`（`invalidate_credential`）、`:197`（docstring「改了配置只有重启才生效」）、`:200`（`_CACHE.pop`）、`:204`（`invalidate_scope_connection`）
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:300`（`_CONNECTIONS`）、`:304`（`get_scope_connection`）、`:317`（`invalidate_scope_connection`）、`:320`（`_CONNECTIONS.pop` surgical）

**A1-split 背景**：
- `wayfinder/data-agent/research/p4-guard-chain-placement.md:68`（A1 dumb raw executor）、`:139`（A1-split 命名）、`:146`（决策表「经 mcp-client」括注——潜藏不一致）、`:148`（三 execute）
- `wayfinder/data-agent/research/p4-build-defaults.md:213`（三包表「mcp-client sidecar 代理」——潜藏不一致）
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/servers/execution.py:587`（`query_data` model-facing）、`:790`（G1 `pre_sampling_gate`）、`:798`（G5 `count_estimate_gate`）、`:823`（主 `run_query_async`）——三处皆在 `query_data` 体内，engine/sidecar 从不 model-facing
