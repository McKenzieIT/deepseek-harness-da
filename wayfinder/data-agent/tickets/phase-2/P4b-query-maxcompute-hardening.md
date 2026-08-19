# P4b — query-maxcompute 生产硬化（P1 接线：da 自持 raw Client+stdio transport 连 query sidecar）

**Type**: prototype
**Phase**: 2
**Status**: Unblocked（G4 resolved 2026-08-20）
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
