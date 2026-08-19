# R6 — 凭证热更机制：spawn-env 下 cred 变更如何不重启 sidecar 即生效（research）

**Type**: research
**Phase**: 2
**Status**: Resolved 2026-08-19 (wayfinder "work through the map" session)
**Blocks**: 生产硬化 `packages/query/*`（非当前 ticket；阻生产正确性——陈旧凭据=真 bug）

**Question**: F2 spawn-env 凭证注入下，cred 变更如何**不重启 sidecar 即生效**？`invalidate_scope` 单用留**陈旧 spawn-env 凭据**（P4 prototype scenario 4 实测：da 侧 `ODPS_ACCESS_KEY=SK_NEW`，`invalidate_scope` 丢 sidecar 缓存后，下条连接仍 `#cefdd0`=SK_OLD；要 `restartSidecar` 才翻 `#cefdcb`=SK_NEW，但丢所有 scope）。三选项对账 + 推荐：

- (a) **reconnect-for-cred-change**：cred 变更走 reconnect（丢**所有** scope 缓存，与 P4 E 的 surgical `invalidate_scope` 冲突；`invalidate_scope` 退为仅适用**非-cred 配置变更**，如 scope config.yaml）。
- (b) **per-call `set_credentials` sidecar 工具**：da 每次 `ctx.query.execute` 前 per-call resolve + 调 sidecar `set_credentials(scope_id, creds)`——**creds 不进 model-visible tool args**（tool-query 入参只有 sql+scope_id），是 da→sidecar 内部工具调用；sidecar 用最新 creds 重建 per-scope 连接。偏离 R2 §5.2c「`StdioConfig.env` 注入」但保「不进 args」+ per-call resolve + surgical invalidate。
- (c) **streamable-http + per-request headers**：sidecar 走 streamable-http transport，creds 经 `StreamableHttpConfig.headers` per-request 注入（**待查**：mcp-client `headers` 是 per-call 还是 spawn-fixed？`index.ts` `StreamableHttpConfig` 注释 "Additional headers attached to MCP requests"——需确认每次 tools/call 是否重读 headers）。

主源：harness `packages/mcp/mcp-client/src/index.ts`（`StdioConfig.env` spawn-fixed、`StreamableHttpConfig.headers`、`apply`）+ `packages/mcp/mcp-client/src/connection.ts`（`ReconnectConfig`、dispose+reconnect）+ `packages/credentials/credentials/src/index.ts`（`credentials/updated` 事件、per-call resolve）+ R2 §5.2c-d（`research/r2-maxcompute-cred-cache.md`）+ P4 prototype scenario 4（`prototypes/p4-query-engine/`）。

**Context**: P4 prototype surface（`research/p4-build-defaults.md` §F 修正 + `prototypes/p4-query-engine/` scenario 4 + P4 ticket Resolution 的 Surfaced tension）。这是 P4 grilling 决的 **E（`invalidate_scope`）在生产形态下被 prototype 证伪后的 refine**——E 对非-cred 配置热更仍成立，对 **cred 变更不足**（spawn-env 固定）。

**Research note**: [`../../research/r6-cred-hot-reload.md`](../../research/r6-cred-hot-reload.md) — cited 笔记已写（2026-08-19，/research subagent + 独立交叉验证）。

---

## Resolution（resolved 2026-08-19）

**推荐 (b) per-call `set_credentials` + P1（da 自持 raw SDK `Client`+stdio transport 连 query sidecar，不用 mcp-client plugin，sidecar 工具非 model-facing per A1-split）。** 详见 research 笔记 §5/§6/§7。

- **(b)**：da 每次 `ctx.query.execute` 前 per-call `ctx.credentials.resolve` 4 ref（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT`）→ 经**非 model-visible 控制信道**调 sidecar `set_credentials(scope_id, creds)`（原子更新 per-scope 凭据 + 丢该 scope 连接缓存，镜像 reverse-bi `invalidate_credential` 双清）→ 再跑 query。**无需重连、无需重启 sidecar、无需丢其他 scope**。per-call resolve 硬规则（`credentials/src/index.ts:66-68`）保留且更强；creds **不进 spawn-env**（反贴合 PAT not in process.env）。
- **P1（additive-only，clear winner）**：da 在 `packages/query/query-maxcompute/` 自持 raw `Client`+stdio transport（一个子进程），按 raw name 程序化调**全部** sidecar 工具（query 五件 `execute/attach/cancel/get_progress/estimate_cost` + 控制 `set_credentials`/`invalidate_scope`），**无一进 `ctx.tools`**（故无 model-facing 注册 → 控制信道缺口自然消解）。不碰 mcp-client core，纯新增 `packages/query/query-maxcompute/`。
  - **surface 的潜在不一致**：R2 §5.2c / P4 F2 / A1-split 括注「经 mcp-client」都假设用 mcp-client plugin 连 query sidecar；但 A1-split 精神（sidecar = da-internal dumb executor，会话门留 `tool-query`，sidecar 工具非 model-facing）与 plugin 的 `syncTools`（`tools.ts:143,181` 全量 model-facing 注册、无 allowlist）**直接冲突**（模型可 `mcp__query-maxcompute__execute` 绕过 `tool-query` 的 G1/G5/budget/near-dup/halt/cache）。R6 精炼：**query sidecar 不用 mcp-client plugin**（plugin 仍用于真正 model-facing 的外部 MCP server）。
  - **P2（不取，over-engineering）**：mcp-client core 加 `connection.callTool(rawName, args)` + allowlist/hidden-registration 特性——仅「团队坚持复用 plugin bridge」时的退路；additive-only 原则下 P1 为定夺。
- **(a)/(c) 不取**：(a) reconnect 需改 core 加「restart now」API（`ConnectionHandle` 只暴露 `ready`/`dispose`，`dispose` 终态 teardown `connection.ts:327`，恢复靠 HMR）且 re-spawn 子进程丢**所有** scope 缓存（contra E surgical）；(c) SDK `_commonHeaders` 每请求重读 `requestInit.headers`（per-request 在 SDK 层可达，`streamableHttp.js:58/72`+`shared/transport.js:5,14`），但 plugin 层构造固定、da 够不到 `config.headers`，且 HTTP sidecar 攻击面大（contra intranet-security-first）。
- **E 精炼（非替换）**：cred 变更→`set_credentials`（推新值+丢连接，原子）；非-cred 配置→`invalidate_scope`（sidecar 重读 scope `config.yaml`，E 原态仍成立）；reconnect→崩溃/不可达兜底。spawn-env 对子进程寿命是终结态 = E 对 cred 变更不足的根因（P4 scenario 4 实证）。R2 §5.2c（spawn-env 注入）对 cred 热更证伪，偏离可接受（§5.2c 本是 INFERENCE；per-call resolve 硬规则保留）。

**解锁**：生产硬化 `packages/query/*` 的 cred 热更设计（据 (b)+P1 实现：da 自持 Client+transport、`set_credentials` 控制信道、sidecar 工具非 model-facing）。

**复核**（`../../research/r6-cred-hot-reload-review.md`，adversarial 2026-08-19）：7 claim 全 VERIFIED、(b)+P1 成立（`Protocol.request` `shared/protocol.js:611` 纯 JSON-RPC send、非 `tools/list`-gated 实证 P1 支点）；surface HOLE-A（`initialize` 握手）/B（P1 跳过 reconnect=可靠性债，最重）/C（在途原子性）/D（notification）——HOLE-B 的 P1-vs-P2 可靠性权衡 + 崩溃恢复形态开 **G4** grilling 票定夺。

## Finding（load-bearing 源据，详见 research 笔记）

- **(a)** `ConnectionHandle` 只 `ready`/`dispose`（`connection.ts:99`）；`dispose` 终态 teardown（`:327`），不调度重连，恢复靠 HMR（`:12-13,196-197`）；`connectGeneration` 每代 re-spawn stdio 子进程（`:237/272`+`stdio.d.ts:42,56`）→ 所有 scope 缓存全丢；`config.env` 虽 `createTransport` 每代重读但 da 够不到 config 句柄。
- **(b)** tool args 直发 wire `tools/call`（`tools.ts:80-88`，args=`JSON.parse(model_arguments)` `:315`）→ 任何 registered tool args **model-visible**；`syncTools`（`:143,181`）把 `tools/list` 全量注册为 model-facing，无 allowlist/隐藏注册 → `set_credentials`/`invalidate_scope` 须不进 `tools/list`、由 da 自持 Client 按 raw name 调。**此控制信道缺口与 E 共享**（E 的 `invalidate_scope` 同样不能 model-visible）——P1（da 自持 Client、无 model-facing 注册）消解之。
- **(c)** SDK `StreamableHTTPClientTransport.requestInit` 是静态 `RequestInit`（无 `() => RequestInit` provider，`streamableHttp.d.ts:75-77`），但 `_commonHeaders()` 每请求 `normalizeHeaders(this._requestInit?.headers)`（`streamableHttp.js:58/72`+`shared/transport.js:5,14` spread 读当前值）→ 原地改写 headers 对象 **per-request 生效**（SDK 层）；plugin 层 `createTransport`（`transport.ts:45-47`）构造时定型 + da 够不到 `config.headers` → (c) 经 plugin 需 core 改。HTTP sidecar = 长期 listener + 每请求带 creds，contra intranet-security-first。
- **凭证 seam**：`resolve` per-call 硬规则（`credentials/src/index.ts:66-68`）+ `notifyUpdated` fan `credentials/updated`（`:105-117`）；事件「Ambient process-environment changes are not observable and never emit」（`types.ts:18-29`）→ spawn-env cred 变更子进程侧本不可观测，须 da 侧监听后推 sidecar。
- **reverse-bi 双清镜像**：`invalidate_credential`（`credentials.py:192-204`）= `_CACHE.pop` + `invalidate_scope_connection`（`connection.py:317-320` `_CONNECTIONS.pop(scope_id)` surgical）；docstring（`:195-197`）「只清这一半…症状是改了配置只有重启才生效」= R6 证伪的同一病灶。
