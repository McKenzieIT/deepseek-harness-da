# G4 — query sidecar 控制信道 + 可靠性：P1（da 自持 Client，additive）vs P2（改 mcp-client core 复用 reconnect）

**Type**: grilling
**Phase**: 2
**Status**: Unblocked
**Blocks**: 生产硬化 `packages/query/query-maxcompute/`（控制信道 + 崩溃恢复形态是硬化的前置判断）

**Question**: R6 已定 (b) per-call `set_credentials` + **P1**（da 自持 raw SDK `Client`+stdio transport 连 query sidecar，不用 mcp-client plugin，sidecar 工具非 model-facing per A1-split → 控制信道缺口消解、additive-only）为**推荐**。但 adversarial 复核（`../../research/r6-cred-hot-reload-review.md`）确认推荐成立的同时 surface 了 **HOLE-B**：P1 自持 raw Client = da **自担 sidecar 生命周期含崩溃恢复**，而 mcp-client `connection.ts` 已有成熟 reconnect（`RECONNECT_DEFAULTS` frozen、`scheduleReconnect` 指数退避、`maxAttempts` 耗尽注销、`onclose`→`generationDown`→`scheduleReconnect` 自动驱动、`GENERATION_CLOSE_TIMEOUT_MS` 防重叠子进程）——P1 **放弃复用**这套。这是 **additive-only standing principle 不能独裁的可靠性判断**（原则定默认走 P1，但 P1 的可靠性代价是否可接受需人裁）。grilling 一问一答定调：

1. **da 的 sidecar 崩溃恢复策略**（HOLE-B，P1 内部形态选择）：(i) mini reconnect loop（da 重写指数退避，+行数+债）；(ii) lazy on-next-call re-spawn（`ctx.query.execute` 检测死 Client → re-spawn+re-connect，简单但崩溃后首条 query 付重启延迟）；(iii) 不重连（崩溃即停服，等 HMR/人工）。决定 P1 真实行数与可靠性形态。
2. **是否值得为复用 mcp-client 成熟 reconnect 而做 P2 小 core 改**（真正的 P1-vs-P2 判断轴）：P2 = mcp-client `ConnectionHandle` 加 `callTool(rawName, args)` + allowlist/hidden-registration 特性（让 da 复用 plugin 的 Client+reconnect 生命周期，sidecar 工具不全量 model-facing）。若团队判「query sidecar 长驻、per-scope ODPS 连接需保活、崩溃需快速恢复」→ 复用成熟 reconnect 值得做小 core 改（P2 转正，P1 退兜底）；若判「sidecar 崩溃罕见、lazy 重连可接受（query 本就用户发起、非连续）」→ P1 的 additive 优势压过可靠性债。
3. **`initialize` 握手义务**（HOLE-A）+ **在途查询 per-scope 原子性**（HOLE-C）的实现定调：da 须 `await client.connect(transport)`（自动跑 `initialize`+`notifications/initialized`+协议版本校验，connect 失败 `close()`+抛）；sidecar 在 `set_credentials` 时对在途 query 是 drain（等完）还是 cancel（强杀）——「原子」一词过强（drop 连接缓存不必然 abort 在途 ODPS 作业，reverse-bi `invalidate_credential` `credentials.py:192` 同张力）。附带 HOLE-D（SDK `Cancelled`/`Progress` notification 是否 wire 到 `ctx.query.execute` 的 timeout/cancel）。

**Context**: R6（`../../research/r6-cred-hot-reload.md` + `R6-cred-hot-reload.md`，resolved 2026-08-19）定 (b)+P1；adversarial 复核（`../../research/r6-cred-hot-reload-review.md`）7 claim 全 VERIFIED、(b)+P1 成立（`Protocol.request()` `shared/protocol.js:611` 是纯 JSON-RPC send、非 `tools/list`-gated 实证 P1 技术支点；`enforceStrictCapabilities` 可选默认 falsy、mcp-client `new Client` `connection.ts:238` 未设；`assertCapabilityForMethod('tools/call')` 只查 server `tools` capability 不查 tool-name-in-`tools/list`），但 surface HOLE-A（initialize 握手）/B（reconnect 可靠性债，最重）/C（在途原子性）/D（notification）。P4 A1-split（sidecar = da-internal dumb executor，会话门留 `tool-query`，sidecar 工具非 model-facing——P1 修复了前置研究括注「经 mcp-client」与 `syncTools` 全量 model-facing 注册的潜藏冲突）。常设原则 additive-only / intranet-security-first。reverse-bi read-only（`invalidate_credential` 双清是 (b) 的语义镜像）。

**Resolution**: （grilling，待解——一问一答给推荐；解后回填 Design + 更新 map Decisions + 解锁生产硬化 `packages/query/query-maxcompute/`）。
