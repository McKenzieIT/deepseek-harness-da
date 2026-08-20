# P8 — audit 插件

**Type**: prototype
**Phase**: 2
**Status**: Resolved (2026-08-20) — prototype validated; 生产包 deferred（见 map Not-yet-specified）

**Question**: audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）。

**From G3（per-user Qoder 审计，2026-08-19）**：per-user Qoder subagent 调用全审计（谁/何时/哪个 PAT-scope/Credits）——作 tool-audit（subagent-qoder 工具调用）+ session-event，带 caller 登录身份。详见 G3 Finding。

## Finding / Design (resolved 2026-08-20)

Research〔`../research/p8-audit-scope.md`〕+ grilling 三问（Q1 范围 / Q2 存储 / Q3 隔离）定形态；prototype `../prototypes/p8-audit/` 6 场景全绿 validated。

**决策**：
- **D1 范围 (Q1=a) RBI 忠实精简**：3 面全持久化（tool-audit 全 tool 调用 tagged + session-event + guard 决策 + Tier-2 写）；`audit_event` 不可变 + `audit_override` append-only + query/stats；**不含** ADR-0005 root-cause 分类/calibration/flywheel（map Out-of-scope；分类是 RBI query-round trust 非 da per-user 合规——错消费者）。G3 Qoder feed 经 tag=`qoder_call` 自动捕获。
- **D2 存储 (Q2=A) 关系型 own-`node:sqlite` + `ctx.audit` service**：ctx.storage 实 KV-only（`packages/storage/storage-domain` README 印证「No cross-table transactions, secondary indexes, or multi-segment keys」+ 经 routed kv backend 持久化），不能表达 RBI 关系型 3 表+索引 → P8 own sqlite + sibling ctx seam（additive，declare module merge 不改 core）。**map ⑤d「ctx.storage(SQLite)」澄清**：原则 SQLite+ctx seam 不变，具体 seam=`ctx.audit`（ctx.storage 给不了关系型）。node:sqlite 是 base 已用栈（`storage-sqlite` backend 同款，Node v25 原生）。
- **D3 隔离 (Q3=A) 单 audit DB + 所有权 guard**：`scope_id`/`user_id` first-class 列+索引（`user_id` 镜像 RBI `tenant_id`/`scope_id` 处理——RBI 无此维度 = G3/P12 净增）；所有权 guard 每 read 查 user_id+scope_id 匹配（镜像 RBI P1-2 IDOR fix 扩 `user_id`，NULL-safe IS；privileged caller 旁路 = P9 admin/合规官）。隔离=门(X-RBI-Scope+P10 mTLS)+guard（defense-in-depth；audit 是 admin-queried 非业务用户直查→物理 per-scope DB 需求弱；且 G3 per-user-cross-scope 查询单 DB 原生索引答、per-scope DB 须 federation）。
- **D4 schema**：zod 镜像 RBI AuditRecord envelope（log_id/ts/session_id/scope_id/tenant_id/user_id[new]/model/auto_tags/review_status）+ `extra` 兜底 kind-specific payload + `from_payload`/`to_payload` round-trip（未知键入 extra、摊平回 top-level，无数据丢失）；lean 裁分类域。
- **D5 三面映射**：tool-audit/guard-deny = observe `tools/post-execute`（对 allowed+denied 都触发——harness `tools/README`，故拒绝也被捕获无 tool/result）；session-event = observe `session/event`+`agent/*`；tier-2 = `record_tier2_write` helper（hash 不存正文，fail-silent 不阻断业务写；被 P6 semantic-layer 调，是 P6 stub 的生产态替代）。
- **D6 userId 缺口**：prototype 从 `ctx.requestScope` stand-in 读；真实 = P9 login-state ctx（未建）+ P3 `resolve(ref,{userId})` 调用点；T1 fallback 阶段 user_id=null。`ToolExecution`/`SessionHeader` 无 userId（harness 仅 `anonymous-user-id`）。
- **D7 Credits**：捕 `total_cost_usd`(必)+`total_credits?`(选,null)+`usage`/`modelUsage`（`SDKResultSuccess`，`../research/qoder-sdk-dts.md:21`）；`total_credits` 缺则 null（可选 `getUsageInfo()`/`accountInfo()` fetch，P3 依赖）。
- **D8 write-tiers**：P8 = audit store + `record_tier2_write`（Tier-2 留痕生产态，替代 P6 的 flat-JSON stub）；Tier-1 审批 = P6/P9。
- **D9 tags**：`qoder_call` / `tool_write` / `guard_deny` / `session_event`（+ `tool_call` 兜底）。

**Surfaced tensions（生产包决策，见 map Not-yet-specified）**：
1. **override-of-identity vs 列/索引/guard**：patch `user_id`（误归属修正）经点路径纠正 read VIEW，但 `audit_event.user_id` 列/索引/所有权 guard 仍看 original → 纠正后身份不可经索引查询、guard 查 original。RBI override 是 verdict 字段（非身份）。
2. **override vs SQL 聚合**：`stats` 的 `SUM(json_extract payload)` 用 immutable payload（不反映 override）；corrected totals 须从 materialized view 重聚合（O(n)）OR 写「current view」投影列 OR 接受不入聚合。

**Validated（prototype 6 场景）**：zod 镜像 round-trip ✓；3 表+所有权 guard IDOR-safe null ✓；G3 Credits 捕获 ✓；Tier-2 hash-not-body（正文不进 audit）✓；cross-scope per-user 单 DB 索引查询 ✓；override immutability（original 不变 + view 纠正 + history 链）✓。sessionTelemetry 互补非重复（5 差异：sink/attribution/consumer/durability/consent）——勿改作合规审计。

**Assets**：`../prototypes/p8-audit/`（types.mjs / store.mjs / audit.mjs / harness-stub.mjs / run.mjs / README.md / .gitignore）+ `../research/p8-audit-scope.md`。真实生产包（`packages/data/audit` TS + 真实 Cordis `ctx.on`）待 **P9** 落地后建——**P3 已落地 2026-08-20**（`packages/subagent/subagent-qoder/`，terminal-only one-shot drain `query()` 终态 `result`，Credits 在 `SDKResultSuccess`）→ 生产包 hook 真实 subagent-qoder tool 的 `tools/post-execute`（终态 outcome + Credits 自动捕获），**P8 审 call outcome 非 internal tool/reasoning stream**（P3 标的 core-seam 变更票仅当 forensic 需 stream 才开——见 map Not-yet-specified）。生产包其余决策（override-of-identity / override-vs-聚合 策略 + 真实 Cordis `ctx.on` 接线 + userId 从 P9 login-state ctx 取）→ **P8b**（blocked by P9）。见 map Not-yet-specified。
