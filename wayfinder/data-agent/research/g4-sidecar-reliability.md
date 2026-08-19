# G4 — query sidecar 控制信道 + 可靠性：P1 崩溃恢复形态 / P1-vs-P2 / HOLE-A·C·D 定调

**Type**: grilling research note（advisory，逐条从一手源码重派，不信任二手转述含 R6 笔记）
**Status**: research（待人裁——推荐是 advisory，tradeoff 摆清，边界点明，供 grilling 定夺）
**Ticket**: `wayfinder/data-agent/tickets/phase-2/G4-query-sidecar-control-reliability.md`
**Predecessor**: R6（`r6-cred-hot-reload.md` resolved 2026-08-19 定 (b)+P1）+ R6 复核（`r6-cred-hot-reload-review.md` surface HOLE-A/B/C/D）

---

## §1 背景（established，本笔记 verify 不盲信）

R6 已 resolved：**(b) per-call `set_credentials`** + **P1**（da 自持 raw SDK `Client`+stdio transport 连 query sidecar、**不用 mcp-client plugin**、sidecar 工具非 model-facing per A1-split）为推荐。R6 复核 7 claim 全 VERIFIED、(b)+P1 成立。但复核 surface 4 个 HOLE：

- **HOLE-A**：da 的 raw `Client` 必须 `await client.connect(transport)`（SDK 自动跑 initialize+notifications/initialized+协议版本校验+setProtocolVersion；connect 失败 close()+抛）——R6 §6.3「约 50 行」低估此义务。
- **HOLE-B（最重）**：P1 自持 raw Client = da 自担 sidecar 崩溃恢复生命周期；mcp-client `connection.ts` 已有成熟 reconnect——P1 放弃复用。
- **HOLE-C**：`set_credentials` 时对在途 query 的 per-scope 原子性（drain/cancel/drop？）——「原子」过强。
- **HOLE-D**：SDK `Protocol` 基类自动装 Cancelled/Progress handler，是否 wire 到 `ctx.query.execute` 的 timeout/cancel。

**G4 三问**：(Q1) P1 下 sidecar 崩溃恢复形态（i/ii/iii 三选一）；(Q2) 是否值得为复用 mcp-client 成熟 reconnect 而做 P2 小 core 改（真 P1-vs-P2 判断轴）；(Q3) HOLE-A+C+D 实现定调。

**常设原则**：additive-only（da 改动只叠加、不改/不删 core、保上游升级路径）/ reverse-bi 只读源（重新实现不改）/ intranet-security-first / PAT auth（凭证经 credentials seam、不进 process.env）/ 语义层一等公民。

**关键框架判断（本笔记 verify 并钉死）**：P4 原型 `run.mjs` 自己就是「da 自持 raw stdio client」的 stand-in（手搓 `spawn`+line-JSON `callSidecar`，注释明写 "mcp-client STAND-IN"，**没用 mcp-client plugin、没用 SDK Client**）；`sidecar.mjs` 纯请求/响应、**零 notification**（pending→`attach` 是轮询非 push）。→ **P1 是 P4 原型的产品化**（stand-in 换真 SDK Client+transport+真 MCP `tools/call`），**非偏离**；**P2（mcp-client plugin）才是偏离**（引入 `syncTools` 全量 model-facing 注册，A1-split 禁）。详见 §4.4。

---

## §2 一手源清单（逐条核行号）

实际读取并核行号的一手源：

**harness mcp-client**（`packages/mcp/mcp-client/src/`）：
- `connection.ts`：`:46` `RECONNECT_DEFAULTS` frozen（`enabled:true, initialDelayMs:500, maxDelayMs:30_000, maxAttempts:10`）、`:57` `GENERATION_CLOSE_TIMEOUT_MS=5_000`、`:80` `resolveReconnectPolicy`（fail-loud 校验+freeze）、`:99` `ConnectionHandle` 接口**仅** `ready`+`dispose`（无 callTool/restart/Client 句柄）、`:164` `isCurrent` guard、`:170` `enqueueSync` 串行化 syncTools（`syncChain` promise tail）、`:183` `generationDown`（client=undefined→scheduleReconnect）、`:192` `waitForClose`（GENERATION_CLOSE_TIMEOUT_MS 防重叠子进程）、`:202` `scheduleReconnect`（enabled 检查+稳定窗口 `connectedAt>=maxDelayMs` 重置预算+`failedAttempts++`+`>maxAttempts` 耗尽注销+`initialDelayMs*2**(n-1)` 指数退避 capped maxDelayMs+`reconnectTimer.unref()`）、`:232` `connectGeneration`（`:238` 每 generation `new Client({name:'dsh-mcp-client',version:'0.0.1'},{capabilities:{}}` **未设 enforceStrictCapabilities**、`:260` `generation.onclose=()=>{...generationDown}`、`:265` `setNotificationHandler(ToolListChangedNotificationSchema,...)`→enqueueSync、`:272` `await generation.connect(createTransport(config))`、`:273` `await enqueueSync(generation,...)`、catch→`await generation.close()`+`waitForClose`+`generationDown`）、`:292` `settling=connectGeneration(true)`、`:295` `ready` promise、`:309` `dispose`（disposed=true+清 reconnectTimer+`current.close()`+`waitForClose`+`await settling`+`await syncChain`+dispose 全部 disposers）
- `tools.ts`：`:80` `callToolUncached(client,rawName,args,exec,opts)`→`:86` `client.request({method:'tools/call',params:{name:rawName,arguments:args}},RawCallToolResultSchema,{signal:exec.signal,timeout:opts.toolCallTimeoutMs})`（**raw tools/call，P2 可直接复用此 pattern**）、`:111` `publicToolName`（`mcp__<serverName>__<rawName>`）、`:143` `syncTools`（两阶段 fetch `listToolsUncached` 翻页 + swap `ctx.tools.register` **全量 model-facing 无 allowlist**）、`:181` `disposers.set(publicName,ctx.tools.register(definition))`、`:303` `createDefinition`、`:315` `createExecutor`（注释「The agent loop passes `JSON.parse(model_arguments)`」→ args 原样进 wire params）
- `transport.ts`：`:21` `buildChildEnv(extra)`→`:23` `return {...scrubbedParentEnv(),...extra}`（cred scrub+overlay seam，P1 da 侧须镜像）、`:31` `createTransport(config)`（stdio `new StdioClientTransport({command,args,env:buildChildEnv(config.env),cwd})` / streamable-http `new StreamableHTTPClientTransport(new URL(config.url),{requestInit:{headers:config.headers}})`）
- `index.ts`：`:22` `name='mcp-client'`、`:25` `inject=['tools']`、`:28` `DEFAULT_TOOL_CALL_TIMEOUT_MS=60_000`、`:55` `StdioConfig`（`env:Record<string,string>`「Extra env vars merged on top of scrubbed ambient env」）、`:78` `StreamableHttpConfig`（`headers`——**无 PAT/auth header provider seam**）、`:130` `apply(ctx,config)`（resolveReconnectPolicy fail-loud + reserve serverName + `startConnection` + `ctx.effect(()=>connection.dispose())` + `await connection.ready` + failOnStartupError throw）

**MCP SDK**（`node_modules/.pnpm/@modelcontextprotocol+sdk@1.29.0_zod@4.4.3/.../sdk/dist/esm/`）：
- `client/index.js`：`:285` `async connect(transport,options)`→`:286` `await super.connect(transport)`→`:287` `if(transport.sessionId!==undefined) return`（重连跳过 init）→`:293` `request({method:'initialize',params:{protocolVersion:LATEST_PROTOCOL_VERSION,capabilities,clientInfo}},InitializeResultSchema)`→`:304` `if(!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) throw`→`:307` `this._serverCapabilities=result.capabilities`→`:311` `if(transport.setProtocolVersion) transport.setProtocolVersion(result.protocolVersion)`→`:316` `await this.notification({method:'notifications/initialized'})`→`:324` `catch(error){ void this.close(); throw error }`（**HOLE-A 证实：connect 失败 close()+抛**）、`:395` `assertCapabilityForMethod` case `'tools/call'`/`'tools/list'`：**只查 `this._serverCapabilities?.tools`，不查 tool-name-in-list**、`:411` `assertNotificationCapability`：`'notifications/cancelled'`「always allowed」、`'notifications/progress'`「always allowed」
- `shared/protocol.js`：`:2` import `CancelledNotificationSchema`/`ProgressNotificationSchema`、`:19` `_responseHandlers=new Map()`、`:21` `_progressHandlers=new Map()`、`:22` `_timeoutInfo=new Map()`、`:27` `setNotification_handler(CancelledNotificationSchema,notification=>{this._oncancel(notification)})`、`:30` `setNotification_handler(ProgressNotificationSchema,notification=>{this._onprogress(notification)})`、`:33` `setRequestHandler(PingRequestSchema,...)`（auto-pong）、`:169` `async _oncancel(notification)`（查 `_requestHandlerAbortControllers` by requestId→abort，**inbound cancel，client 侧基本 no-op**）、`:206` `async connect(transport)`（`if(this._transport) throw 'Already connected...use a separate Protocol instance per connection'`——**一 Client 一 transport for life，mcp-client 故每 generation 新 Client**）、`:209` wrap `transport.onclose`→`_onclose()`、`:248` `_onclose()`（捕获 `responseHandlers`→clear→`:268` `const error=McpError.fromError(ErrorCode.ConnectionClosed,'Connection closed')`→`:269` `this._transport=undefined`→`:270` `this.onclose?.()`→`:271` **`for(const handler of responseHandlers.values()) handler(error)` —— reject 所有在途 request 以 ConnectionClosed，不 hang**）、`:611` `request(request,resultSchema,options)`（`:623` `if(this._options?.enforceStrictCapabilities===true)` 才门禁——**默认 falsy，纯 JSON-RPC send**、`:628` `messageId=this._requestMessageId++` 多路复用、`:670` `const cancel=(reason)=>{...this._transport?.send({method:'notifications/cancelled',params:{requestId:messageId,reason}})...; reject(error)}`、`:710` `signal.addEventListener('abort',()=>cancel(...))`、`:713` `timeoutHandler=()=>cancel(...)`、`:424` `_onprogress(notification)`（查 `_progressHandlers` by progressToken=messageId，无 handler→`_onerror 'unknown token'`））
- `client/stdio.js`：`:60` `async start()`→`:65` `spawn(command,args,{env:{...getDefaultEnvironment(),...serverParams.env},stdio:['pipe','pipe',stderr??'inherit'],shell:false,cwd})`、`:76` `on('error',...)`→reject+onerror、`:80` `on('spawn',...)`→resolve、`:83` `on('close',_code=>{this._process=undefined;this.onclose?.()})`（**进程 close→onclose→Protocol._onclose→reject 在途**）、`:87` `stdin.on('error',...)`→**仅 onerror，不立即 onclose**（EPIPE 窗口）、`:137` `async close()`（`:144` `stdin.end()`→`:146` 2s race→`:150` SIGTERM→`:155` 2s race→`:161` SIGKILL；**两段 2s grace，mcp-client `GENERATION_CLOSE_TIMEOUT_MS=5000`=4s+1s buffer**）、`:173` `send(message)`（`:175` `if(!this._process?.stdin) throw 'Not connected'`、`:179` `if(stdin.write(json)) resolve()` else `:181` `stdin.once('drain',resolve)`——**backpressure 内建**）
- `client/stdio.d.ts`：`:42`「spawning a process」、`:56`「Starts the server process」、`:15` `env?`「The environment to use when spawning the process」

**P4 原型**（`wayfinder/data-agent/prototypes/p4-query-engine/`）：
- `sidecar.mjs`：`:16` `credSnapshot()` 读 `process.env`、`:22` `ensureConn()` 建连时快照、`:53` `case 'invalidate_scope':`→`:54` `connections.delete(scope_id)` surgical、纯 line-JSON stdio **零 notification**（pending→`attach` 是轮询 op 非推送）
- `run.mjs`：`:27` 注释 "mcp-client STAND-IN"、`:30` `startSidecar()`（spawn+scrubbedEnv+per-call resolve→env+line-JSON）、`:47` `callSidecar`（pending Map+5s timeout）、`:48` `restartSidecar()` 注释「reconnect: dispose + re-spawn sidecar (drops ALL scope caches — over-broad per E)」、`:74` F2 spawn-env 张力原文、per-query instance（每 execute 新 instance_id）

**P4 研究**：
- `p4-guard-chain-placement.md`：§4.2 A1-split 决策表（`:146` `query-maxcompute` sidecar 行括注「**经 mcp-client**」——**潜藏不一致，P1 修复**；`:148` 三 execute G1/G5/main 各独立 executor）
- `p4-build-defaults.md`：§2.5 三包表（`:213` `query-maxcompute`=「provider：**mcp-client sidecar 代理** + per-call `ctx.credentials.resolve` + `credentials/updated` 失效监听」——潜藏不一致）、§3.3（`:260` reconnect=`connectGeneration` 新 Client+新 transport+re-spawn+re-syncTools，**每 reconnect 空 `_CONNECTIONS`**）、§3.4（`:267` 重启 sidecar=`_CONNECTIONS` 全丢过广、`:269` `invalidate_scope` 工具 surgical、`:278` reconnect 留作崩溃兜底）、§6 E（`:382` 同）

**R6 研究**（context，verify 不盲信）：
- `r6-cred-hot-reload.md`：§6.3 P1（`:245`「约 50 行 transport+Client 接线（bounded...**无 reconnect 调度**）」——**50 行+把无 reconnect 列简化收益**）、§6.3 P2（`:246` `ConnectionHandle` 加 `callTool` **还须 allowlist/hidden-registration**）、§6.3 P1 clear winner（`:248`）、§7（`:255-270` cred 变更→`set_credentials`「推新值+丢缓存 一步**原子**」、reconnect 降级为崩溃兜底）、§8.1（`:275` `Protocol.request` 纯 JSON-RPC send 非 tools/list-gated）、§8.2 HOLE-A（`:279` connect 握手义务）、§8.3 HOLE-B（`:282` 三选一 i/ii/iii）、§8 HOLE-C（「原子」过强）、§8 HOLE-D（`:288` Cancelled/Progress handler）、§8 follow-up（`:294` G4 票）
- `r6-cred-hot-reload-review.md`：7 claim VERIFIED、§B1-B4 P1 技术支点实证、§C2 HOLE-A/B/C/D、§D 应立 follow-up 票

**reverse-bi**（`/Users/mckenzie/workspace/reverse-bi/`，只读源）：
- `libs/rbi-mcp/src/rbi_mcp/credentials.py`：`:192` `def invalidate_credential(scope_id)`、docstring `:193-197`「同时让 rbi-query 那侧的连接缓存失效——只清这一半的话，下一次 `get_engine` 仍会复用已建好的 `ScopeConnection`（里面那个 `ODPS` 对象拿的是旧凭据），症状是『改了配置只有重启才生效』」、`:200` `_CACHE.pop(scope_id,None)`（清凭据层）、`:201-206` `try/except invalidate_scope_connection`（best-effort，失败仅 warn）、`:165` `resolve_for_scope`（per-scope TTL 缓存，锁外解析 errata MINOR-8）
- `libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py`：`:1-30` 顶部诚实记账「⚠ 本模块在生产上**尚未接入**」「生产路径一次都不经过这里」「`registry.invalidate()` 与 `invalidate_scope_connection` 的**生产调用点为 0**（全仓只有测试调）」「代码是对的、测试是绿的、生产走不到」、`:300` `_CONNECTIONS:dict`、`:304` `get_scope_connection`、`:317` `def invalidate_scope_connection`→`:320` `_CONNECTIONS.pop(scope_id,None)`（**surgical pop，无 drain/cancel/wait**）

**harness 插件/Service 模型**（NEW 边界用）：
- `packages/credentials/credentials/src/index.ts`：`CredentialProvider extends Service`、`super(ctx,'credentials')`、abstract resolve/describe/set/unset、`protected notifyUpdated` fan `credentials/updated`——**query-maxcompute 镜像此 Service 模型**
- `wayfinder/data-agent/research/harness-plugin-model.md`：Service Definition=abstract `extends Service`（`:87`/`:369`）、Service Provider extends Service Definition + `static inject`（`:97`/`:393`）、「Registrations are effects: every listener/tool/service/timer goes through ctx.effect」（`:115`）、「One Service Provider per ctx key per context」（`:555`）

---

## §3 Q1 — P1 下 sidecar 崩溃恢复形态（i/ii/iii 逐一对比）

**前置事实（SDK 内建，三种形态共享）**：sidecar 子进程崩溃 → stdio transport `_process.on('close')` 触发（`stdio.js:83-85`）→ `this.onclose?.()` → Protocol `_onclose()`（`protocol.js:248-273`）→ **`for(const handler of responseHandlers.values()) handler(error)` 以 `ConnectionClosed` reject 所有在途 `request()`**（`protocol.js:271`）→ da 的 `ctx.query.execute`→`client.request('tools/call')` promise **reject（不 hang）**。即：**在途 query 的命运是 reject with ConnectionClosed**，由 SDK 兜底，三种形态均如此。形态选择影响的是「reject 之后谁、何时 re-spawn」。

### §3.1 形态 (i) mini reconnect loop（da 重写指数退避）

**形态**：da 仿 mcp-client `connection.ts` 自写一个 supervisor：`onclose`→`generationDown`→`scheduleReconnect`（指数退避+maxAttempts+稳定窗口）。

**行数估计**：~120-180 行。拆解：
- `await client.connect(transport)` 握手义务（HOLE-A，~10 行含启动失败 close+抛，见 §5.1）：da 须 `try { await client.connect(transport) } catch { await client.close(); throw }`（`client/index.js:324` 已自动 close，da 仅需 catch+抛/log）。
- 新 Client+新 transport per generation（`protocol.js:206` 一 Client 一 transport for life，须新 Client 如 mcp-client `connection.ts:238`）：~15 行。
- `onclose` handler → `generationDown` + `scheduleReconnect`（指数退避 `initialDelayMs*2**(n-1)` capped `maxDelayMs`、`maxAttempts` 耗尽注销、`connectedAt` 稳定窗口重置、`reconnectTimer.unref()`）：~60-80 行（mcp-client `connection.ts:202-290` 这段约 90 行，da 可去掉 ToolListChanged/syncTools/enqueueSync/disposers 逻辑省 ~30 行）。
- `GENERATION_CLOSE_TIMEOUT_MS` 防重叠子进程（`waitForClose`，~15 行）。
- `isCurrent` guard + 并发串行化（~15 行）。
- `dispose` 终结 teardown（清 timer+close+await settling+unregister，~15 行）。
- notification 接线（HOLE-D，若 sidecar 不发则 0 行；见 §5.3）。

**边界 case**：
- **在途 query 命运**：reject ConnectionClosed（SDK 兜底，上）。RetryGuard 若实现，可在此 reject 后触发 re-spawn+retry——但 RetryGuard 是 query 级语义，见 rbi `core/guards/retry.py`，属 A1-split engine-wrapper 门。
- **并发多 query 共享一个 Client**：单例 Client 由 supervisor 持有；`isCurrent` guard 防 race；reconnect 串行化（`syncChain` 等价物）。但 da 不跑 syncTools，故无 syncChain 需求——并发安全简化为「一个 reconnectPromise，并发 query 仰望它」。
- **per-scope 缓存重建代价**：re-spawn = 新 sidecar 子进程 = 进程内存 `_CONNECTIONS` 全丢（`p4-build-defaults.md:267`），**所有 scope 的 ODPS 连接重建**。ODPS 连接握手数量级：秒级（ODPS SDK 建 `ODPS` 对象+`project`+ tunnel endpoint 解析，非 TCP 单握手，实测通常 1-3s，重时更高）。reconnect 后首条 query 付此代价 ×scope 数（若 warm 多 scope）。
- **HMR/dispose**：supervisor 挂在 query-maxcompute Service 生命周期（见 §6.1），HMR dispose→`dispose()`→close sidecar+清 timer。

**评价**：最忠实复刻 mcp-client 可靠性，但**对 da 的 query 模式过建**（见 §4.1）。行数最重、债最大。

### §3.2 形态 (ii) lazy on-next-call re-spawn（推荐）

**形态**：`ctx.query.execute` 检测死 Client（`client` 为 undefined 或上次 `request()` reject 为 ConnectionClosed）→ re-spawn + `await client.connect(newTransport)` + 重发 `tools/call`。无后台 timer、无指数退避、无 maxAttempts。

**行数估计**：~40-70 行。拆解：
- 单例 Client 持有 + `ensureConnected()` 守卫（检测死→re-spawn+connect，~20-30 行）。
- `await client.connect(transport)` 握手（HOLE-A，~10 行）。
- 并发 double-spawn 防护：一个 `connectingPromise`，并发 query 仰望（~10 行，见 §6.2）。
- 启动失败处理（connect 抛→propagate 给 query，~5 行）。
- 无 notification 接线（HOLE-D no-op，0 行，见 §5.3）。
- 无 `dispose` 重逻辑（Service stop 时 `client.close()`+kill 子进程，~5 行；或依赖 stdio `close()` 的 stdin.end→SIGTERM→SIGKILL，`stdio.js:137-170`）。

**边界 case**：
- **在途 query 命运**：reject ConnectionClosed（SDK 兜底）。**崩溃后首条 query 付重启延迟**（见下）。
- **崩溃后首条 query 延迟**（数量级估计）：spawn node 子进程（~100-300ms，node 启动 + sidecar.mjs import）+ `initialize` 握手（SDK `request('initialize')` 往返，本地 stdio ~5-20ms）+ `notifications/initialized`（一通知）+ 首条 `tools/call` 的 per-scope ODPS 连接建立（1-3s，见 §3.1）。**总计 ~1.5-3.5s**。对「用户发起、非连续」的 query 模式，此延迟可接受（用户对首条 query 延迟容忍度高于连续工具调用）。若 sidecar 是常驻 node+ODPS SDK 已 warm，spawn 段可更低。
- **并发 double-spawn**：若两并发 query 同时检测死 Client，须防 double-spawn——一个 `connectingPromise`（owner 首个 query 持，余 await）。**这是 (ii) 的真实并发债**，但 ~10 行可解（见 §6.2）。
- **per-scope 缓存重建**：re-spawn = 全丢（同 §3.1），但仅崩溃时发生（非常规 cred 变更路径——R6 §7 已把 cred 变更改走 `set_credentials` surgical 不重启）。
- **HMR/dispose**：见 §6.1。
- **无 maxAttempts give-up**：sidecar 反复崩溃时，每次 lazy 都重试，无上限。但 da query 是用户发起——用户会看到反复失败并停手，等价于「人肉 maxAttempts」。可加一个简单计数器（~5 行）防 crash-loop 无限。

**评价**：**与 da 的 query 模式最匹配**（用户发起、非连续、每条 execute 是天然重试点），行数最轻，additive 最纯。崩溃后首条 query 付 ~1.5-3.5s 延迟是可接受代价。**推荐**。

### §3.3 形态 (iii) 不重连（崩溃即停服）

**形态**：sidecar 崩溃 → Client 死 → 在途 query reject → 后续 query 检测死 Client 直接抛「sidecar 不可达，请重启 Host/触发 HMR」。等价 mcp-client `reconnect.enabled=false`（`connection.ts:197` 提示「registered tools will fail until an HMR reload or Host restart」）。

**行数估计**：~20-30 行（单例 Client + 死检测抛 + Service stop 时清理）。

**边界 case**：
- **在途 query 命运**：reject ConnectionClosed。
- **后续 query**：抛「sidecar down」错，用户须手动重启 Host 或触发 HMR。
- **可用性**：最差。sidecar 崩溃后整个 query 能力停服直到人工干预。对生产不可接受（除非团队判 sidecar 极稳定 + 崩溃=应告警人工介入）。

**评价**：**不推荐**（除非团队显式判「sidecar 崩溃应停服告警」）。与 P4 原型 `restartSidecar`（`run.mjs:48`，dispose+re-spawn）相比是倒退——P4 原型至少有 crude restart。

### §3.4 Q1 推荐：**(ii) lazy on-next-call re-spawn**

**理由**：
1. **与 da query 模式匹配**：query 是用户发起、非连续；每条 `ctx.query.execute` 是天然重试点。mcp-client 的后台指数退避 supervisor 服务于「model-facing 连续工具调用」场景（模型可能连续调多工具，崩溃需透明快速恢复），对 da 是**过建**（见 §4.1）。
2. **行数最轻 + additive 最纯**：~40-70 行 vs (i) 的 ~120-180 行。不碰 core。
3. **P4 原型已是此形态的 crude stand-in**：`run.mjs:48` `restartSidecar`（dispose+re-spawn）即 (ii) 的手搓版，注释自承「drops ALL scope caches — over-broad per E」。P1 产品化 = 把 stand-in 换真 SDK Client + 加 `ensureConnected` 守卫 + 加 `connectingPromise` 防 double-spawn，**非新发明**。
4. **崩溃后 ~1.5-3.5s 延迟可接受**：用户对首条 query 延迟容忍度高于连续工具调用。
5. **HOLE-A 已计入**：connect 握手 ~10 行已含在 40-70 行内。
6. **HOLE-D no-op**：sidecar 纯请求/响应（P4 实证零 notification），SDK 自动装的 Cancelled/Progress handler 留 no-op（见 §5.3）。

**配套建议**：
- 加一个简单 crash-loop 计数器（~5 行）：连续 N 次（如 5 次）lazy re-spawn 后仍立即崩→抛「sidecar 反复崩溃，请人工排查」+ 停服（等价 mini maxAttempts）。防 sidecar 启动期反复崩溃的无界重试。
- `connectingPromise` 单 owner 锁（~10 行）防并发 double-spawn（见 §6.2）。

---

## §4 Q2 — P1 vs P2（真判断轴）

### §4.1 P1 放弃的 mcp-client reconnect 能力逐条列

mcp-client `connection.ts` 的成熟 reconnect 能力（P1 全放弃）：

| 能力 | 源码 | 对 da query 模式的价值 |
|---|---|---|
| **bounded 指数退避** `initialDelayMs*2**(n-1)` capped `maxDelayMs` | `connection.ts:202-230` | **低**：da query 非连续，崩溃后用户自然间隔（用户读结果、思考下一问），退避无意义；mcp-client 服务连续工具调用，模型可能秒级连调，退避防雪崩 |
| **maxAttempts give-up** 耗尽注销 | `connection.ts:213` `>maxAttempts` | **中**：防 crash-loop 无限重连。da (ii) 用简单计数器（~5 行）即可等价 |
| **稳定窗口 crash-loop 防护** `connectedAt>=maxDelayMs` 重置 failedAttempts | `connection.ts:211` | **低**：da 崩溃罕见，crash-loop 更罕见；简单计数器够 |
| **`GENERATION_CLOSE_TIMEOUT_MS` 孤儿防护** 防重叠子进程 | `connection.ts:57,192-200` | **中**：da (ii) 若 dispose 后子进程未及时退出，可能重叠。但 stdio `close()` 自带 stdin.end→2s→SIGTERM→2s→SIGKILL（`stdio.js:137-170`），da 复用即可 |
| **`isCurrent` race-safe** 防 race close/error 信号 | `connection.ts:164` | **低**：da 单例 Client + `connectingPromise` 锁（~10 行）即等价 |
| **`enqueueSync` 串行化** syncTools | `connection.ts:170-180` | **零**：da 不跑 syncTools（P1 不注册工具），无串行化需求 |
| **`onclose`→`generationDown`→`scheduleReconnect` 自动驱动** | `connection.ts:183-189,260` | **中**：da (ii) 改为「reject 在途→下条 query lazy re-spawn」，非自动后台驱动 |

**关键判断**：mcp-client reconnect 的**整套设计假设是「model-facing 连续工具调用 + 崩溃需透明快速恢复」**（模型连续调 `mcp__server__tool`，崩溃=工具不可用=阻断 agent loop）。da 的 query 模式是**「用户发起、非连续、每条 execute 天然是重试点」**——用户在 query 间有思考/阅读间隔，崩溃后首条 query 付 ~1.5-3.5s 重启延迟对用户可见但可接受。**故 mcp-client reconnect 对 da 模式是过建**：6 项能力中，对 da 高价值的仅「maxAttempts give-up」+「孤儿防护」两项，均可 ~10 行简化实现；其余 4 项要么零价值（enqueueSync）要么低价值（退避/race-safe/自动驱动）。

### §4.2 P2 的 core 改具体改什么

**P2 = `ConnectionHandle` 加 `callTool(rawName, args): Promise<McpResult>` + allowlist/hidden-registration 特性**。

**具体改点**（行数估计 ~60-100 行 core 改 + 特性）：
1. `connection.ts:99` `ConnectionHandle` 接口加 `callTool(rawName, args): Promise<McpResult>`——实现复用 `tools.ts:80` `callToolUncached` 的 pattern（`client.request({method:'tools/call',params:{name:rawName,arguments:args}},RawCallToolResultSchema,{signal,timeout})`）。~15 行。
2. **但此 alone 不够**：`connectGeneration`（`connection.ts:273`）仍 `await enqueueSync(generation,...)` → `syncTools`（`tools.ts:143,181`）**全量注册 sidecar 工具为 model-facing** → A1-split 违反（`set_credentials`/`invalidate_scope` 成 `mcp__query-maxcompute__set_credentials` model-callable = DoS/安全面，`execute` 成 `mcp__query-maxcompute__execute` 绕过 tool-query 会话门）。故 P2 **还须** allowlist/hidden-registration 特性：
   - 方案 a：`Config` 加 `modelFacingTools?: string[]`（allowlist），`syncTools` 只注册 allowlist 内的，余 hidden。`connection.ts:273` 跳过 sync 或 sync 只注册子集。~30-50 行（改 syncTools+Config schema+connection.ts 调用点）。
   - 方案 b：`Config` 加 `registerTools: false`（sidecar 工具全 hidden，仅 `callTool` 程序化调）。~10 行（但等于 P1 的「不注册」+复用 reconnect，是 P1+P2 hybrid）。
3. `index.ts` `StdioConfig`/`StreamableHttpConfig` 加 allowlist/hidden 字段。~10 行。
4. 暴露 `ConnectionHandle` 给 da（da 怎么拿到 handle？mcp-client plugin 是 `apply` 内部 `startConnection`，handle 不 export——P2 还须 export handle 或加 `ctx.mcp` seam）。~15-30 行。

**对 additive-only / 上游升级路径的违反**：
- P2 改 `connection.ts`（core）+ `tools.ts`（core）+ `index.ts`（core）三处——**改 core 一处即违反 additive-only 默认**。
- 上游 SDK 升级时，mcp-client 这些文件可能 conflict（mcp-client 是 harness 自有但随 harness 版本演进）。
- additive-only 原则定默认走 P1；P2 须人显式签字「为复用 reconnect 值得改 core」。

### §4.3 P2 复用成熟 reconnect 的收益是否值此 core 改

**收益**：复用 mcp-client 的 6 项 reconnect 能力（§4.1），无需 da 自写。
**代价**：core 改 3 处（connection.ts/tools.ts/index.ts）+ allowlist 特性 + 暴露 handle seam，~60-100 行 core 改 + 违反 additive-only + 上游升级 conflict 风险。

**判断**：**不值**。理由：
1. §4.1 已证 mcp-client reconnect 6 项中仅 2 项对 da 高价值（maxAttempts give-up + 孤儿防护），均 ~10 行可简化实现于 da 内（P1 (ii) 形态）。
2. P2 的 allowlist/hidden-registration 特性是**为兼容 A1-split 而被迫加的**（不加则 syncTools 全量 model-facing 违反 A1-split），非 da 主动需求——这是「为用 plugin 反而要改 plugin 加特性」的倒置。
3. P1 (ii) 的 ~40-70 行 additive 纯新增 vs P2 的 ~60-100 行 core 改+特性+违反 additive-only——P1 更轻且保上游升级路径。

### §4.4 验证 P1 是 P4 原型产品化（非偏离）vs P2 是偏离

**P1 = P4 原型产品化（钉死）**：
- P4 `run.mjs:27` 注释明写 "mcp-client STAND-IN"，`startSidecar`（`:30`）手搓 `spawn`+scrubbedEnv+per-call resolve→env，`callSidecar`（`:47`）手搓 pending Map+5s timeout line-JSON。
- P1 = 把 stand-in 的「手搓 spawn+line-JSON」换成「真 SDK `Client`+`StdioClientTransport`+真 MCP `tools/call`」——**同一形态（da 自持 raw stdio client 连 sidecar），仅升级协议层**。`restartSidecar`（`:48`，dispose+re-spawn）即 P1 (ii) lazy re-spawn 的 crude 版。
- `sidecar.mjs` 纯请求/响应零 notification（pending→`attach` 轮询）→ P1 sidecar 沿用此 = SDK 自动装的 Cancelled/Progress handler no-op（§5.3）。
- **结论**：P1 是 P4 原型的**产品化**，非偏离。

**P2 = 偏离（钉死）**：
- P4 原型**不用 mcp-client plugin**（`run.mjs:27` "STAND-IN" 明示）。P2 引入 mcp-client plugin = **偏离原型设计**。
- P2 引入 `syncTools`（`tools.ts:143,181`）全量 model-facing 注册——直接违反 A1-split「sidecar da-internal、非 model-facing」（`p4-guard-chain-placement.md:146` 决策表）。须加 allowlist 特性补救 = **为用 plugin 反而要改 plugin**。
- **结论**：P2 是偏离。

### §4.5 Q2 推荐：**P1（additive-only，lazy re-spawn 形态）**

**理由**：
1. **additive-only 默认**：P1 纯新增 `packages/query/query-maxcompute/`，不碰 core；P2 改 core 3 处违反默认。
2. **P4 原型已是 raw-client stand-in**：P1 是产品化非偏离；P2 是偏离。
3. **mcp-client reconnect 对 da 模式过建**（§4.1）：6 项能力仅 2 项高价值，~10 行可简化于 da 内。
4. **P2 复用 reconnect 的收益不值 core 改+allowlist 特性**（§4.3）。
5. **可靠性代价可接受**：P1 (ii) lazy re-spawn，崩溃后首条 query ~1.5-3.5s 延迟，对用户发起的 query 模式可接受。

**P2 保留为退路**：仅当团队判「query sidecar 长驻、per-scope ODPS 连接需保活、崩溃需快速透明恢复（<500ms）」时，P2 复用成熟 reconnect 才值 core 改。但 da query 模式不满足此前提（用户发起非连续）。

---

## §5 Q3 — HOLE-A/C/D 实现定调

### §5.1 HOLE-A：initialize 握手义务（确认是义务非可选）

**确认**：da 须 `await client.connect(transport)`（`client/index.js:285`）。SDK `connect()` 自动跑：
- `super.connect(transport)`（`:286`，Protocol 绑 transport+start）
- `request({method:'initialize', params:{protocolVersion:LATEST_PROTOCOL_VERSION, capabilities, clientInfo}})`（`:293`）
- 协议版本校验 `SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)`（`:304`）
- `this._serverCapabilities=result.capabilities`（`:307`）——**关键：`assertCapabilityForMethod('tools/call')`（`:395`）依赖此，只查 server 声明的 `tools` capability**
- `transport.setProtocolVersion(result.protocolVersion)`（`:311`）
- `await this.notification({method:'notifications/initialized'})`（`:316`）

**connect 失败处理**：`catch(error){ void this.close(); throw error }`（`:324-328`）——SDK **已自动** `close()`（关 transport/kill 子进程）并抛。da 须：
- `try { await client.connect(transport) } catch (e) { /* SDK 已 close，da 仅 log+propagate 或转 lazy re-spawn */ throw e }`（~5-10 行）。
- 启动失败在 (ii) lazy 形态下：propagate 给 `ctx.query.execute`→query 抛「sidecar 启动失败」→用户见错。RetryGuard 不应重试启动失败（非 transient），或限定重试次数。

**对 Q1 行数影响**：HOLE-A 已计入 §3.2 的 ~40-70 行（含 connect 握手 ~10 行）。R6 §6.3「约 50 行」低估——实际 ~40-70 行（lazy 形态）或 ~120-180 行（mini loop 形态）。

### §5.2 HOLE-C：在途 query 在 `set_credentials` 时的 drain/cancel/drop 三选

**深挖 reverse-bi `invalidate_credential` 实际行为**：
- `credentials.py:200` `_CACHE.pop(scope_id, None)`——纯 drop 凭据缓存。
- `credentials.py:204` `invalidate_scope_connection(scope_id)`→`connection.py:320` `_CONNECTIONS.pop(scope_id, None)`——纯 drop 连接缓存。
- **无 drain、无 cancel、无 wait**。docstring（`credentials.py:193-197`）自述症状「改了配置只有重启才生效」= **在途 query 持旧 `ScopeConnection`（含旧凭据的 `ODPS` 对象）跑到完**；只清缓存让**下一次** `get_scope_connection` 重建用新值。
- `connection.py:1-30` 诚实记账：「本模块在生产上尚未接入」「生产调用点为 0」「代码是对的、测试是绿的、生产走不到」——**reverse-bi 的 invalidate 本身生产未验证**，是镜像非 battle-tested 参考。

**三选分析**：
- **drain（等在途完）**：`set_credentials` 阻塞等所有同 scope 在途 query 完成→再 drop 缓存。**过建**：ODPS 长查询可能跑分钟级，`set_credentials` 阻塞不可接受；且需 sidecar 维护 per-scope 在途计数（+状态机）。弃。
- **cancel（强杀在途）**：`set_credentials` 调 sidecar `cancel(instance_id)` 强杀在途 ODPS 作业→drop 缓存。**重**：需 ODPS 作业取消支持（rbi `executor.cancel` 有此能力），但 cred 变更不应等价于用户显式 cancel——在途 query 已被授权（旧凭据有效），cred 变更无权追溯取消。且若 cred 变更因 OLD 凭据泄露，cancel 也救不回已发出的数据。cancel 应**留给显式用户 cancel 工具**（A1-split 的 `cancel` 工具）。
- **drop（丢缓存，在途持旧跑到完）**：`set_credentials` 推新凭据进 sidecar per-scope 存储 + drop 该 scope 连接缓存。在途 query 持旧 `ScopeConnection` 跑到完（旧凭据仍有效至 query 结束），**下一次** `execute` 重建用新凭据。**镜像 reverse-bi `invalidate_credential`**。

**安全 concern 评估（drop 是否泄漏旧凭据）**：
- **同 scope、已授权**：在途 query 启动时旧凭据有效且已授权；cred 变更不追溯授权。旧 `ScopeConnection` 持旧凭据至 query 完成（秒-分钟级），bounded。
- **无跨 scope 泄漏**：drop 只影响 `scope_id` 目标，其他 scope 缓存不动。
- **唯一真实 concern**：若 cred 变更因 OLD 凭据**泄露/吊销**，在途 query 继续用泄露凭据至完成。但这是边缘 case（cred 轮换通常非因泄露），且 cancel 也救不回已发出数据。可接受。
- **PAT not in process.env 一致**：drop 不把凭据写 spawn-env（P1 下 `set_credentials` 推 sidecar per-scope 存储，非 spawn-env 终结态），保 intranet-security-first。

**推荐：drop（镜像 reverse-bi，弃「原子」措辞，cancel 留给显式用户 cancel 工具）**。verify 成立——reverse-bi 即 drop 语义（且生产未验证，da 侧复刻即等价可信度）。R6 §7「推新值+丢缓存 一步**原子**」的「原子」一词过强：在途 query 持旧跑到完非原子，应改措辞为「**推新凭据 + 丢该 scope 连接缓存**（在途 query 持旧跑到完，下一次 execute 取新值）」。

### §5.3 HOLE-D：Cancelled/Progress notification 是否 wire

**确认 SDK 自动装 handler**：`Protocol` 构造器（`protocol.js:27-32`）自动 `setNotification_handler(CancelledNotificationSchema, n=>this._oncancel(n))` + `setNotification_handler(ProgressNotificationSchema, n=>this._onprogress(n))`。da `new Client(...)` 继承此。

**`_oncancel`（`protocol.js:169`）行为**：查 `_requestHandlerAbortControllers` by `notification.params.requestId`→abort。**这是 inbound cancel（server 取消它正在处理的、client 发来的 request）**。对 da（client）侧：sidecar 作为 server，若它发 `notifications/cancelled` 告诉 da「我取消了你发的 request X」→ da abort 该 request handler。但 da 作为 client 几乎不处理 inbound request（sidecar 是 dumb executor，不发 request 给 da），故 `_oncancel` 基本不触发。

**`_onprogress`（`protocol.js:424`）行为**：查 `_progressHandlers` by `progressToken(=messageId)`，无 handler→`_onerror 'unknown token'`。仅当 da 在 `request()` 时传 `options.onprogress` 才注册 handler（`protocol.js:643-644`）。

**P4 原型实证**：`sidecar.mjs` 纯 line-JSON 请求/响应，**零 notification**（`handle(req)` 同步返回，pending→`attach` 是轮询 op 非推送）。生产 sidecar 若沿用 polling（`get_progress`/`cancel` 工具），不发 `notifications/progress`/`notifications/cancelled`。

**outbound cancel（client→server）SDK 已内建**：`request()` 的 `options.signal`（`protocol.js:610,710`）——AbortSignal abort → `cancel()` 发 `notifications/cancelled`（`:677`）+ reject。da 的 `ctx.query.execute` TimeoutGuard 只须传 `signal` 给 `client.request({method:'tools/call',...},{signal})`，SDK 自动发 cancel + reject timeout。**不需手动 wire inbound handler**。

**推荐：不接线 inbound handler，用 polling 工具，handler 留 no-op**。verify 成立：
1. sidecar 沿用 P4 polling（`get_progress`/`cancel` 工具按 raw name 程序化调）→ 不发 notification → 自动装的 handler 不触发 → no-op，无害。
2. da 的 TimeoutGuard 传 `signal` 给 `client.request()` → SDK 自动 outbound cancel + reject（`protocol.js:670-714`）→ 不需 wire inbound。
3. **若未来 sidecar 改用 progress 推送**：da 须在 `request()` 传 `onprogress` callback（`protocol.js:643`）接 `_onprogress` 路由，~5-10 行。但当前 polling 模式下 0 行。

**结论**：HOLE-D 在 polling 模式下 no-op，不增行数。SDK 的 outbound cancel 经 `signal` 已 wire，不需额外接线。

---

## §6 NEW 边界（R6 HOLE-A/B/C/D 之外，源码深挖发现）

### §6.1 da raw Client 的 Service 生命周期挂点 + HMR/dispose 债

**发现**：query-maxcompute 镜像 credentials 切分（`p4-build-defaults.md:213`），是 **Service Provider**（`extends Service`，`harness-plugin-model.md:87,369,393`），非 mcp-client 那样的 plugin（`apply(ctx,config)`）。Service 生命周期是 **fiber/context-scoped**，经 `ctx.effect` 注册（`harness-plugin-model.md:115`）。

**含义**：
- da raw Client 挂在 query-maxcompute Service 实例上。Service mount 时建 Client+spawn sidecar，Service dispose（HMR hot-swap 或 app shutdown）时 `client.close()`+kill 子进程。
- **HMR 时在途 query 命运**：HMR dispose query-maxcompute → `client.close()` → stdio `close()`（`stdio.js:137-170`）→ transport `onclose` → `_onclose()`（`protocol.js:248-273`）→ **在途 request reject ConnectionClosed**。即 HMR 时在途 query reject（不 hang），但 sidecar 子进程被 kill → ODPS 作业可能 orphan（sidecar 进程死，ODPS 作业继续在 MaxCompute 侧跑，无人收割）→ **OrphanReaper concern**（A1-split engine-wrapper 门）。
- **HMR 是 dev-time 事件**：生产无 HMR。但 query-maxcompute 配置变更（如改 sidecar command）会触发 Service re-mount。生产此场景罕见。
- **app shutdown**：Service stop → `client.close()` → sidecar 优雅退出（stdin.end→2s→SIGTERM→2s→SIGKILL，`stdio.js:137-170`）。在途 query reject。可接受。
- **推荐**：da Service `stop()` 显式 `await client.close()`（复用 stdio 的 2s+2s grace）+ log 在途 query reject。OrphanReaper（A1-split 门）独立处理 ODPS 侧孤儿作业（rbi `orphans.py` 有此能力，da 镜像）。~10 行。

### §6.2 单例 Client 并发安全 + lazy double-spawn 防护

**发现**：P1 (ii) lazy 形态下，单例 Client 跨并发 `ctx.query.execute` 共享。SDK `request()`（`protocol.js:628` `messageId++`）多路复用，并发 request 安全。**但 lazy re-spawn 有 double-spawn 风险**：若两并发 query 同时检测 Client 死（transport close），两者都尝试 re-spawn+connect → 双子进程。

**防护**（~10 行）：一个 `connectingPromise` 单 owner 锁：
```
async ensureConnected() {
  if (this.client && !this.dead) return this.client
  if (this.connectingPromise) return this.connectingPromise  // 并发仰望
  this.connectingPromise = this.spawnAndConnect()  // 首个 query 持锁
  try { return await this.connectingPromise } finally { this.connectingPromise = undefined }
}
```
此锁在 da 内，非 core 改。mcp-client 用 `isCurrent` guard（`connection.ts:164`）+ `syncChain` 串行化（`:170`）解等价问题，da 简化为单 promise 锁即可（不跑 syncTools 无需 syncChain）。

### §6.3 stdio stdin/stdout 背压（SDK 已内建，无需 da 处理）

**发现**：`stdio.js:179-181` `send()`：`if(stdin.write(json)) resolve() else stdin.once('drain',resolve)`——**backpressure 内建**。若 sidecar 消费慢（如长查询时 stdout 拥塞），da 的 `send()` 自动等 drain。da 不需额外背压处理。

**stdout 端**：`stdio.js:90-96` stdout data → `readBuffer.append` → `processReadBuffer` → `onmessage`。SDK 逐条解析 line-JSON，da 不直接读 stdout。无背压债。

### §6.4 initialize 握手与 sidecar 启动竞态

**发现**：`client.connect(transport)`（`client/index.js:285`）先 `super.connect`（`protocol.js:206`，绑 transport + `await transport.start()` 即 spawn），再 `request('initialize')`。**若 sidecar spawn 成功但崩溃在响应 initialize 之前**（如 sidecar 启动期 panic、ODPS SDK 初始化失败）：
- sidecar 进程 close → `stdio.js:83` `onclose` → `protocol.js:209` wrapped → `_onclose()`（`protocol.js:248`）→ 在途 `initialize` request 的 responseHandler 被 reject ConnectionClosed（`:271`）。
- `client.connect()` 的 `await this.request({method:'initialize'},...)`（`:293`）reject → `catch`（`:324`）`void this.close(); throw`。
- **da 见 connect 抛 ConnectionClosed** → (ii) lazy 形态：propagate 给 query → RetryGuard 可重试（启动期崩溃可能是 transient）或 crash-loop 计数器累加。
- **无 hang**：SDK `_onclose` 兜底 reject。

**边界**：sidecar spawn 失败（command 不存在，ENOENT）→ `stdio.js:76` `on('error')` → reject start() + onerror。`super.connect`（`protocol.js:230` `await transport.start()`）reject → `client.connect` reject → `catch` close+throw。da 同样见 connect 抛。

### §6.5 dispose 终态与在途 query

**发现**：Service `stop()` → `client.close()` → stdio `close()`（`stdio.js:137-170`）：`stdin.end()`（EOF）→ 2s grace → SIGTERM → 2s → SIGKILL。**在途 query 命运**：
- transport close 触发 `onclose` → `_onclose` reject 在途 request ConnectionClosed。
- 若 sidecar 子进程在收到 stdin EOF 后优雅退出（响应 close event），在途 query 的 ODPS 作业**可能被 sidecar 在退出前收割/取消**（取决于 sidecar 实现）——但 da 侧 request 已 reject，结果（若到达）丢失。
- **推荐**：da dispose 不 await 在途 query（它们已 reject）；OrphanReaper 独立处理 ODPS 侧孤儿。~5 行。

### §6.6 SDK Client `onclose`/`onerror` 区分

**发现**：Protocol.connect（`protocol.js:209-216`）wrap `transport.onclose`→`_onclose()`，wrap `transport.onerror`→`_onerror(error)`：
- **`onclose`**（`protocol.js:248-273`）：transport 关闭（进程 exit）→ reject 所有在途 request + clear 状态 + 调 `this.onclose?.()`（da 可设的 callback）。
- **`onerror`**（`protocol.js:275-277`）：transport 错误（如 stdin EPIPE、stdout parse error）→ 调 `this.onerror?.(error)`（da callback），**不 reject 在途 request，不 clear 状态**。

**边界（EPIPE 窗口）**：`stdio.js:87-89` `stdin.on('error')`→**仅 onerror**。若 sidecar 死在 da `send()` 写 stdin 时，da 见 EPIPE（onerror），但 onclose 须等进程 close event（可能微秒-毫秒后）。此窗口内 da 的 `request()` promise **未 reject**（onclose 未触发）→ 极短 hang 窗口。但 close event 必到（进程已死），onclose 随即触发 reject。**无永久 hang**。

**`send()` after close**：`stdio.js:175` `if(!this._process?.stdin) throw 'Not connected'`——若 da 在 onclose 后、re-spawn 前 call `client.request()`，`send()` 同步抛。da (ii) `ensureConnected()` 守卫应在 request 前检测死 Client → re-spawn，避免此路径。但若竞态（检测活、send 时刚死），`send()` 抛 → `request()` reject → 下次 lazy re-spawn。可接受。

**推荐**：da 设 `client.onclose` callback（~5 行）标记 Client 死（`this.dead=true`）→ `ensureConnected` 快速路径检测。`client.onerror` log（~3 行）即可。不需 wire onerror 到 query 语义（onclose 已兜底 reject）。

---

## §7 关键路径索引（核行号汇总）

**Q1 在途 query 命运（SDK 兜底）**：
- `node_modules/.../sdk/dist/esm/shared/protocol.js:248-273`（`_onclose` reject 所有在途 request ConnectionClosed）
- `node_modules/.../sdk/dist/esm/client/stdio.js:83-85`（进程 close→onclose）

**Q1 (ii) lazy re-spawn 行数**：~40-70 行（§3.2），含 HOLE-A connect ~10 行 + `ensureConnected`+`connectingPromise` ~30 行 + crash-loop 计数器 ~5 行 + dispose ~5 行

**Q2 P1 vs P2 核依据**：
- `packages/mcp/mcp-client/src/connection.ts:99`（`ConnectionHandle` 仅 ready+dispose，P2 须加 callTool）
- `packages/mcp/mcp-client/src/tools.ts:80`（`callToolUncached` raw tools/call，P2 可复用 pattern）
- `packages/mcp/mcp-client/src/tools.ts:143,181`（`syncTools` 全量 model-facing 无 allowlist，P2 须加 allowlist 特性）
- `packages/mcp/mcp-client/src/connection.ts:202-290`（reconnect 全套，P1 放弃）
- `wayfinder/data-agent/prototypes/p4-query-engine/run.mjs:27,48`（P4 stand-in + restartSidecar，P1 产品化非偏离）
- `wayfinder/data-agent/research/p4-build-defaults.md:213`（三包表「mcp-client sidecar 代理」潜藏不一致）
- `wayfinder/data-agent/research/p4-guard-chain-placement.md:146`（A1-split 决策表「经 mcp-client」括注）

**Q3 HOLE-A**：`node_modules/.../sdk/dist/esm/client/index.js:285-329`（connect 握手+close+throw）

**Q3 HOLE-C**：
- `reverse-bi/libs/rbi-mcp/src/rbi_mcp/credentials.py:192-206`（invalidate_credential 纯 drop）
- `reverse-bi/libs/rbi-query/src/rbi_query/engines/maxcompute/connection.py:1-30`（生产未接入诚实记账）、`:317-320`（invalidate_scope_connection pop）
- `wayfinder/data-agent/research/r6-cred-hot-reload.md:255-270`（§7「原子」措辞过强）

**Q3 HOLE-D**：`node_modules/.../sdk/dist/esm/shared/protocol.js:27-32`（构造器自动装 Cancelled/Progress handler）、`:169`（`_oncancel`）、`:424`（`_onprogress`）、`:670-714`（`request()` outbound cancel via signal）

**NEW 边界**：
- §6.1 Service 生命周期：`packages/credentials/credentials/src/index.ts`（`CredentialProvider extends Service` 模板）、`wayfinder/data-agent/research/harness-plugin-model.md:87,115,555`
- §6.2 double-spawn 防护：`node_modules/.../sdk/dist/esm/shared/protocol.js:628`（messageId 多路复用，并发 request 安全）+ da `connectingPromise` 锁
- §6.3 背压：`node_modules/.../sdk/dist/esm/client/stdio.js:179-181`（send backpressure 内建）
- §6.4 启动竞态：`node_modules/.../sdk/dist/esm/client/stdio.js:76`（spawn error）、`:83`（close）、`node_modules/.../sdk/dist/esm/client/index.js:293-328`（initialize reject→close+throw）
- §6.5 dispose 终态：`node_modules/.../sdk/dist/esm/client/stdio.js:137-170`（close stdin.end→2s→SIGTERM→2s→SIGKILL）
- §6.6 onclose/onerror 区分：`node_modules/.../sdk/dist/esm/shared/protocol.js:209-216,248-277`；`node_modules/.../sdk/dist/esm/client/stdio.js:87-89,175`

**R6 前序**：
- `wayfinder/data-agent/research/r6-cred-hot-reload.md:245-248`（§6.3 P1/P2+「50 行」+「无 reconnect 调度」简化收益）、`:255-270`（§7 set_credentials+reconnect 降级）、`:278-294`（§8 HOLE-A/B/C/D+G4 票）
- `wayfinder/data-agent/research/r6-cred-hot-reload-review.md`（7 claim VERIFIED+§C2 HOLE+§D 应立票）

---

## §8 总判（advisory，供人裁）

- **Q2（P1 vs P2）**：推荐 **P1**。additive-only 默认 + P4 原型已是 raw-client stand-in（P1 产品化非偏离，P2 偏离）+ mcp-client reconnect 对 da query 模式过建（6 项仅 2 项高价值，~10 行可简化）+ P2 core 改+allowlist 特性不值。
- **Q1（崩溃恢复形态）**：推荐 **(ii) lazy on-next-call re-spawn**。~40-70 行（含 HOLE-A connect+crash-loop 计数器+connectingPromise 锁），崩溃后首条 query ~1.5-3.5s 延迟可接受，与 da 用户发起非连续 query 模式匹配。配套：crash-loop 计数器（~5 行，防无界重试）+ `connectingPromise` 单 owner锁（~10 行，防并发 double-spawn）。
- **Q3 HOLE-A**：connect 握手是义务（SDK `client/index.js:285`），connect 失败 SDK 已自动 close+throw，da 仅 catch+propagate（~5-10 行，已计入 Q1 行数）。R6「50 行」低估。
- **Q3 HOLE-C**：推荐 **drop**（镜像 reverse-bi `invalidate_credential`，弃 drain/cancel）。在途 query 持旧 `ScopeConnection` 跑到完（同 scope 已授权，无跨 scope 泄漏，bounded），下一次 execute 取新值。弃 R6「原子」措辞，改「推新凭据+丢该 scope 连接缓存」。cancel 留给显式用户 cancel 工具（A1-split）。
- **Q3 HOLE-D**：推荐 **不接线 inbound handler，用 polling 工具，handler 留 no-op**。sidecar 沿用 P4 polling（零 notification）→ 自动装的 Cancelled/Progress handler 不触发。outbound cancel 经 `request()` 的 `signal` 已内建（SDK 自动发 `notifications/cancelled`+reject），da TimeoutGuard 传 signal 即可，0 额外行数。
- **NEW 边界**：da raw Client 挂 query-maxcompute Service 生命周期（fiber-scoped，HMR/dispose 时 close+kill）；stdio 背压 SDK 内建；initialize 启动竞态 SDK `_onclose` 兜底 reject（无 hang）；dispose 终态复用 stdio 2s+2s grace；onclose/onerror 区分（EPIPE 极短窗口但 close event 必到，无永久 hang）。OrphanReaper（ODPS 侧孤儿作业）独立属 A1-split engine-wrapper 门。

**综合推荐**：**P1 + (ii) lazy re-spawn + HOLE-A connect 握手 + HOLE-C drop + HOLE-D no-op polling**。纯 additive（~40-70 行新增于 `packages/query/query-maxcompute/`），不碰 core，与 A1-split 一致，消解控制信道缺口，可靠性代价（崩溃后 ~1.5-3.5s + 在途 query reject）对 da query 模式可接受。P2 + (i) mini loop 保留为「团队判 sidecar 长驻/崩溃需 <500ms 透明恢复」退路，但 da query 模式不满足此前提。

**需人裁签字**：
1. P1 vs P2（additive-only 默认走 P1，但「为复用 reconnect 值 core 改」是否值得需人显式否决）。
2. (ii) lazy vs (i) mini loop（崩溃后 ~1.5-3.5s 延迟是否可接受，或团队要求 <500ms 透明恢复→(i)）。
3. HOLE-C drop vs cancel（cred 因泄露轮换时在途 query 继续用泄露凭据是否可接受，或团队要求 cancel 强杀）。
