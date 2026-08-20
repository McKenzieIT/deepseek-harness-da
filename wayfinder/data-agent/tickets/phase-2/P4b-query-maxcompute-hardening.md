# P4b — query-maxcompute 生产硬化（P1 接线：da 自持 raw Client+stdio transport 连 query sidecar）

**Type**: prototype
**Phase**: 2
**Status**: Resolved (2026-08-20)
**Depends on**: G4（控制信道 + 崩溃恢复形态 = 硬化前置判断，已定）+ R6（cred 热更 (b) per-call `set_credentials` + P1）+ P4（A1-split prototype）
**From**: G4（`G4-query-sidecar-control-reliability.md` Resolution/Design）

**Question**: 把 P4 prototype（`../prototypes/p4-query-engine/` stand-in：`run.mjs` 手搓 `spawn`+line-JSON，注释明写 "mcp-client STAND-IN"，没用 mcp-client plugin/SDK Client）+ G4 决策落地为真 `packages/query/query-maxcompute/`：Service Provider 自持 raw SDK `Client`+`StdioClientTransport`（一个 sidecar 子进程），按 raw name 程序化调全部 sidecar 工具（无一进 `ctx.tools`）、lazy re-spawn 崩溃恢复、`set_credentials` 控制信道（drop 镜像 reverse-bi）、outbound cancel via signal。~40-70 行新增，不碰 core。

**Design（from G4，实现期落实）**: 见 G4 Resolution/Design + [`../../research/g4-sidecar-reliability.md`](../../research/g4-sidecar-reliability.md)。P1 接线骨架：

- **启动**：Service start → `new Client({name,version},{capabilities:{}})` + `new StdioClientTransport({command,args,env:buildChildEnv(scrubbed)})` → `try{await client.connect(transport)}catch{throw}`（HOLE-A；初始启动失败 fail-fast）。`client.onclose=()=>{this.dead=true}` + `client.onerror=(e)=>log`。
- **ensureConnected()（lazy re-spawn）**：`ctx.query.execute` 入口 `if(this.dead||!this.client)return this.reconnect()`；`reconnect()` 用 `connectingPromise` 单 owner 锁（并发 query 共享一个 re-spawn）→ `stopSidecar()`（复用 stdio `close()` 终态）→ `startSidecar()`+`await client.connect(transport)`→清 `dead`；crash-loop 计数器 bounded 重试（maxAttempts，超限抛）。
- **程序化调用（raw name）**：`client.request({method:'tools/call',params:{name,arguments}},RawCallToolResultSchema,{signal,timeout})` 调全部 sidecar 工具——query 五件（`execute/attach/cancel/get_progress/estimate_cost`）经 `ctx.query.execute` engine-wrapper guard chain（cost/timeout/retry/orphan，A1-split）；控制 `set_credentials`/`invalidate_scope` 经 `credentials/updated` 事件 + per-call `ctx.credentials.resolve`。无一进 `ctx.tools`（无 `syncTools`、无 model-facing 注册）。
- **outbound cancel**：TimeoutGuard 传 `AbortSignal` 给 `client.request({...,signal})`→SDK 自动发 `notifications/cancelled`+reject（`protocol.js:670-714`）。inbound Cancelled/Progress handler 留 no-op（sidecar 零 notification per P4）；progress 走 `get_progress` 轮询工具。
- **set_credentials（cred 热更）**：da per-call `ctx.credentials.resolve` 4 ref（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`）→ `client.request('tools/call',{name:'set_credentials',arguments:{scope_id,creds}})` → sidecar 推新值 + 丢该 scope 连接缓存（`_CONNECTIONS.pop`，drop 镜像 reverse-bi，在途持旧跑到完）。非-cred 配置→`invalidate_scope`（sidecar 重读 scope `config.yaml`）。reconnect→崩溃兜底（lazy re-spawn）。
- **dispose**：Service stop → `await client.close()`（stdio 终态：stdin.end→2s→SIGTERM→2s→SIGKILL，mcp-client `GENERATION_CLOSE_TIMEOUT_MS=5000`=4s+1s buffer）→ kill sidecar 子进程；在途 query reject ConnectionClosed（caller/RetryGuard 处理）；ODPS 孤儿作业归 OrphanReaper（A1-split engine-wrapper 门）。

**NEW 边界（G4 subagent surface，实现期处理）**：(1) Service Provider 生命周期挂点（非 plugin，HMR/dispose→`client.close()`→在途 reject+sidecar kill、ODPS 孤儿归 OrphanReaper）；(2) `connectingPromise` 单 owner 锁防并发 double-spawn；(3) stdio 背压 SDK 内建（`send()` write false→`once('drain')`）；(4) initialize 启动竞态无 hang（spawn 后崩在 initialize 响应前→`_onclose` reject→connect 抛→lazy RetryGuard）；(5) dispose 终态复用 stdio `close()`；(6) onclose=reject 在途+clear 状态 vs onerror=仅 callback（设 `client.onclose`→`dead=true` ~5 行 + `onerror` log ~3 行）。

**Deferred**: 真实 sidecar（pyodps ODPS）接入 + per-scope 缓存实现 + OrphanReaper ODPS 孤儿作业清理 + e2e 验收（cred 热更、崩溃恢复、cancel、in-flight reject ConnectionClosed）。

## Resolution（resolved 2026-08-20，wayfinder "work through the map" prototype session）

P4b 落地为真 `packages/query/{query,query-maxcompute}/` 可运行骨架 + 4 scenario 全绿（`pnpm install && node --import tsx/esm packages/query/query-maxcompute/dev/scenarios.ts` → exit 0）。G4 P1 接线骨架全部兑现。5 关键实现决策经 grilling 裁定：

- **D1 package 形态 = Def+Provider 双包（镜像 credentials）**：`packages/query/query/`（极简 Service Definition：abstract `QueryEngine extends Service` + `ctx.query` 声明合并 + abstract `execute/attach/cancel/getProgress` 四件 + 3-state `QueryOutcome` vocabulary；`estimate_cost` 是 CostGuard 内部、不上 seam per P4 B）+ `packages/query/query-maxcompute/`（Provider `MaxComputeQueryEngine extends QueryEngine`，P1 接线）。Consumer `tool-query` 留 P4/后续（不在 P4b scope；见 map Not-yet-specified）。
- **D2 sidecar = node stand-in + 手搓最小 MCP（dep-free `.mjs`）**：`dev/standin-sidecar.mjs` 说真 MCP（initialize echo `protocolVersion`+`capabilities.tools`+`serverInfo` / `notifications/initialized` no-op / `tools/call`），fake ODPS（移 P4 sidecar.mjs：`_CREDENTIALS`/`_CONNECTIONS`/`_INSTANCES` + 幂等 `set_credentials`(drop) + `invalidate_scope` + execute fast/slow/blocking/fail + attach/cancel/get_progress/estimate_cost/get_state/`_test_crash`）。真 pyodps(python) 延后。（harness 自家 `dsh-sdk-jsonrpc-server` 是 JSON-RPC 非 MCP，不可用作 sidecar；stand-in 不 import SDK、免解析不确定性。）
- **D3 cred 热更 = per-call 幂等 set_credentials（无 event listener）**：每条 execute 前 da per-call `ctx.credentials.resolve` 4 refs（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`）→ `client.request('tools/call',{name:'set_credentials',...})`；sidecar 幂等（cred 不变 no-op 保缓存/复用，变则 store+drop 该 scope `_CONNECTIONS`，在途持旧跑到完，G4 HOLE-C drop）。解 P4 F2 张力（per-call 推新不需 restart sidecar；PAT 不进 spawn-env）。`credentials/updated` 事件是 seam 自有 fan-out，P4b 不监听（per-call resolve 已保新鲜；event proactive drop 是生产优化、延后）。
- **D4 OrphanReaper 边界 = dispose clean reject + 暴露 cancel + 不实现 reap**：dispose = `await client.close()`（stdio stdin.end→2s→SIGTERM→2s→SIGKILL）+ kill sidecar；在途 SDK `_onclose` 兜底 reject ConnectionClosed（不 hang）+ log「ODPS orphan cleanup deferred to OrphanReaper (A1-split engine-wrapper)」；暴露 `cancel(instance_id)` raw-name 供 engine-wrapper 的 OrphanReaper 调。reap 逻辑延后（A1-split engine-wrapper 门）。
- **D5 scenario = 全 4 个**（对着 stand-in sidecar fake ODPS，证 P1 接线非真 ODPS；真 e2e 延后）：① cred 热更（per-call set_credentials drop+在途持旧跑到完+幂等 no-op 保缓存+rebuild 用新）② 崩溃恢复+dispose（lazy re-spawn dead→re-spawn→live、在途 reject ConnectionClosed 不 hang、`connectingPromise` 单 owner 锁防并发 double-spawn、dispose close+kill+orphan-deferred log）③ cancel（outbound AbortSignal→SDK `notifications/cancelled`+reject、sidecar 存活）④ 控制工具非 model-callable（`ctx.get('tools')===undefined`、set_credentials/invalidate_scope/get_state 全 raw-name 程序化、无一进 ctx.tools）。

**G4 P1 接线骨架兑现**（`packages/query/query-maxcompute/src/index.ts`，~150 行 additive、不碰 core）：

- **生命周期**：`[Service.init]()` async generator（yield dispose disposer + eager `ensureConnected()` spawn+connect HOLE-A）；`static inject = ['credentials']`（per-call resolve 硬依赖）；dispose = `client.close()`+kill+在途 reject+orphan-deferred log。
- **lazy re-spawn**：`ensureConnected()`（`if(!disposed && client && !dead) return` fast path + `connectingPromise` 单 owner 锁防并发 double-spawn ~10 行 + crash-loop 计数器 bounded 重试 connect 失败、成功 reset 0）；`client.onclose=()=>{this.dead=true}` ~5 行 + `client.onerror` log ~3 行（G4 NEW边界6）。
- **raw-name 程序化调**：`client.request({method:'tools/call',params:{name,arguments}},RawCallToolResultSchema,{signal,timeout})` 调全 sidecar 工具，`RawCallToolResultSchema = z.record(z.string(),z.unknown())` 镜像 mcp-client `tools.ts`；**无一进 `ctx.tools`**（无 `syncTools`、无 model-facing 注册→控制信道缺口消解、set_credentials/invalidate_scope 天然非 model-callable）；`enforceStrictCapabilities` 默认 falsy（raw tools/call 非 tool-name-gated，R6 §8.1 实证）。
- **outbound cancel**：`execute(request, signal?)` 传 `signal` 给 `client.request`→SDK 内建发 `notifications/cancelled`+reject（`protocol.js:670-714`，~0 额外接线）；inbound Cancelled/Progress handler 留 no-op（sidecar 零 notification per P4，HOLE-D）。
- **cred 热更**：`pushCredentials(scopeId)` per-call resolve 4 refs → 幂等 `set_credentials`（HOLE-C drop）。
- **spawn-env**：`new StdioClientTransport({command,args,env: scrubbedParentEnv(),cwd})`（`@deepseek-ai/dsh-subprocess`，drop cred-shaped + stale DSH_*，**不 overlay cred**——PAT not in process.env、intranet-security-first）。
- **decode**：sidecar 返 `{content:[{type:'text',text:JSON}],isError}` → `decodeResult` 取 `content[0].text` JSON.parse → `QueryOutcome`。
- **诊断**：`start()`（幂等 explicit eager connect，保 caller 用前已连——cordis `await fiber`（`ctx.plugin` wrapper）只 await dispose-effect setup、不必然 await `[Service.init]` body 时序，故 boot 后显式 `start()` 兜底；生产硬化可复核 `[Service.init]` 单独是否够）+ `inspectSidecarState()`/`status()`/`callRaw()`/`estimateCost()`（CostGuard-internal、不上 seam）。

**Prototype asset**：`packages/query/{query,query-maxcompute}/`（真包骨架，additive-only、不碰 core）+ `packages/query/query-maxcompute/dev/{standin-sidecar.mjs,fake-credentials.ts,scenarios.ts}`（throwaway stand-in + scenario runner）。4/4 scenario 全绿证明 P1 接线（非真 ODPS）。

**Deferred（P4b 不含、后续）**：

- **engine-wrapper guard chain**（CostGuard `estimate_cost` / TimeoutGuard `signal` / RetryGuard / OrphanReaper）= A1-split `ctx.query.execute` 门——P4b Provider=dumb raw executor、不含；`query` Service Definition 当前极简 abstract（无 guard chain）。+ **tool-query Consumer**（model-facing + 会话门 G1/G5 + 3-execute，P4 B；C1 吃 SQL，NL→SQL 归 P13）。两者是 **query-trio 剩余生产**，待独立票 scoping（见 map Not-yet-specified；session gates 与 guard chain 落 Def concrete `execute` 还是独立 guard 插件待 grilling）。
- 真实 sidecar（pyodps ODPS python 子进程 via stdio MCP server）接入（stand-in 是 fake）。
- 真实 per-scope ODPS 连接缓存（stand-in `_CONNECTIONS` 是 fake Map；set_credentials drop 语义已证、真 ODPS 连接 binding 延后）。
- **P9 per-scope 凭证寻址 feed 未完全消费**：P9（resolved 2026-08-20）`Feeds: P4b` per-scope 凭证寻址 (i)/(ii) 决策（荐 (i)：全局 ref 给 access_id/key + per-scope project/endpoint 按 region；(ii) per-scope 4-ref 备选）。P4b prototype `pushCredentials` per-call `ctx.credentials.resolve(ref)` 是**无 scope address 的全局 resolve**（FakeCreds 亦全局），未把 `scopeId` thread 进 `resolve(ref, {scopeId})`（P12 address 维度）。单 scope prototype 跑通；多 scope 生产（per-game 隔离）需 per-scope addressing per P9 (i)/(ii) + P12 address 维度——生产硬化补 thread scopeId 入 resolve + 选 (i)/(ii)。
- OrphanReaper ODPS 孤儿作业清理（dispose 后在途 ODPS 作业，A1-split engine-wrapper 门，rbi `orphans.py` 镜像）。
- 真 e2e（4 scenario 当前证接线、非真 ODPS/真 cred 热更对抗真 MaxCompute）。
- **data-agent bundle 挂载行对账**：`packages/bundle/data-agent/cordis.patch.yml` 的注释占位 `query-engine`（name TBD）需在 trio 挂载 profile 时改 `@deepseek-ai/dsh-query`+`@deepseek-ai/dsh-query-maxcompute` 双行 + uncomment（现注释保 `pnpm install`/`verify-cordis-config` 不破）。
- 生产硬化 polish：package.json `./invariant` 子包 + `lib/` 构建（`tsc -b`/`tsdown`）+ `pnpm run constraints/typecheck/lint/build/hygiene` 全闸 + `tsconfig.host.json` references 注册 + `./types` 子路径校验 + README Model Experience/Limitations（prototype 跳过 polish，靠 `./src/*` export + tsx 直跑）。
- **Review-surfaced prototype gaps**（subagent code review 2026-08-20；全 minor/nit，verdict ship-ready）：① `decodeResult` 已修——分支 MCP `isError`（surface 远端错文为 `failureKind:'remote'`，不误标 transport）；`pushCredentials` 已修——缺 cred fail-fast（不静默 shrink sidecar 存储 + drop 缓存）。② crash-loop 计数器只计 **connect 失败**（成功 reset 0），post-connect 立即崩的 tight loop 不 trip（match G4 Resolution 字面、gaps research-note 意图）——生产硬化加 stability-window 计数器（connect 存活 N ms 才 reset）。③ outbound `signal` 只到 `execute` 的 tools/call、未到前导 `set_credentials` push（abort 在 cred-push 期不 honored 至 set_credentials 完成）——生产硬化由 engine-wrapper 跨整 execute 持 signal。④ `start()` **非冗余**：经验证 `await fiber`（`ctx.plugin` 返回的 wrapper）**不** await `[Service.init]` body（boot 后 `dead:true`、sidecar 未 spawn），`start()` 兜底 eager connect——生产硬化复核 cordis `ctx.plugin`/`fiber` await 语义（`[Service.init]` 经 `_reload`/`inertia` async 跑、`await fiber` 似只 await dispose-effect setup）。⑤ connect 失败时 SDK `void this.close()` fire-and-forget（`client/index.js:325`），下一轮 re-spawn 的 `stopSidecar` 可能等 stdio 2s+2s grace——crash-loop 恢复延迟或超 G4 ~1.5-3.5s 估计。

**解锁**：（P4b 无直接下游 blocker；query-trio 剩余生产见 Deferred + map Not-yet-specified，待独立票。）
