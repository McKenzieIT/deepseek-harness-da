# P8 audit — PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** 非 shipped 包、非生产代码。validated 形态将重新实现为真实 `packages/data/audit`（或 `packages/audit/audit`）Cordis 包（TS、Schemastery `defineTool`、真实 Cordis `ctx.on`）——那是生产步骤，非本原型。本目录是 wayfinder ticket **P8** 的 primary-source artifact；勿 promote。见 `../../tickets/phase-2/P8-audit.md`。

## The question it answers

P8 audit 的状态模型对不对？——`AuditRecord`（zod 镜像 RBI pydantic envelope + `extra` 兜底 + 净增 `user_id`；lean 裁 ADR-0005 分类/flywheel）+ 3 面（tool-audit/guard-deny observe `tools/post-execute` + session-event observe `session/event` + tier-2 `record_tier2_write`）+ 关系型 SQLite store（3 表：`audit_event` 不可变 append + `audit_override` append-only 点路径 patch + `audit_tag` junction；WAL；所有权 guard）+ G3 feed（per-user Qoder 调用：谁/何时/PAT-scope/Credits，`SDKResultSuccess` 的 `total_cost_usd`/`total_credits?`/`usage`/`modelUsage`）。map ⑤d「ctx.storage(SQLite)」澄清为 `ctx.audit`（sibling seam）+ own sqlite（ctx.storage 实 KV-only 无索引/跨表，`storage-domain` 印证）。

## Locked decisions (见 ticket P8 + research 笔记)

- **D1 范围 (Q1=a)**：RBI 忠实精简——3 面全持久化（tool-audit 全 tool 调用 tagged + session-event + guard 决策 + Tier-2 写）；`audit_event` 不可变 + `audit_override` append-only + query/stats；**不含** ADR-0005 root-cause 分类/calibration/flywheel（map Out-of-scope）。G3 Qoder feed 经 tag=`qoder_call` 自动捕获。〔`../../research/p8-audit-scope.md`〕
- **D2 存储 (Q2=A)**：关系型 own-`node:sqlite` + `ctx.audit` service（sibling ctx.* seam；ctx.storage KV-only 不能表达 RBI 关系型 3 表+索引——`storage-domain` README 印证「No cross-table transactions, secondary indexes, or multi-segment keys」）。additive（declare module merge 不改 core）。
- **D3 隔离 (Q3=A)**：单 audit DB + `scope_id`/`user_id` first-class 列 + 索引（`user_id` 镜像 RBI `tenant_id`/`scope_id` 处理）+ 所有权 guard（每 read 查 user_id+scope_id 匹配，镜像 RBI P1-2 IDOR fix 扩 `user_id`；privileged caller 旁路 = P9 admin/合规官）。
- **D4 schema**：zod 镜像 RBI AuditRecord envelope（log_id/ts/session_id/scope_id/tenant_id/user_id[new]/model/auto_tags/review_status）+ `extra` 兜底 kind-specific payload + `from_payload`/`to_payload` round-trip；lean 裁分类域。
- **D5 三面映射**：tool-audit/guard-deny = observe `tools/post-execute`（对 allowed+denied 都触发，故拒绝也被捕获，无 tool/result 也能记）；session-event = observe `session/event`+`agent/*`；tier-2 = `record_tier2_write` helper（被 P6 semantic-layer 调）。
- **D6 userId 缺口**：prototype 从 `ctx.requestScope`（stand-in）读 user_id；T1 fallback → null。真实 per-user 身份（P9 login-state ctx）未建；P8 后读之（同 P3 `resolve(ref,{userId})` 读的 ctx）。
- **D7 Credits**：捕 `total_cost_usd`(必)+`total_credits?`(选,null)+`usage`/`modelUsage`（`SDKResultSuccess`, `../../research/qoder-sdk-dts.md:21`）；`total_credits` 缺则 null（可选 `getUsageInfo()`/`accountInfo()` fetch，P3 依赖）。
- **D8 write-tiers**：P8 = audit store + `record_tier2_write`（hash 不存正文，fail-silent）；Tier-1 审批 = P6/P9。
- **D9 tags**：`qoder_call` / `tool_write` / `guard_deny` / `session_event`（+ `tool_call` 兜底）。

## Run

```
cd wayfinder/data-agent/prototypes/p8-audit
npm install                      # zod 3.23.8（node:sqlite 是 Node 22.5+/25 内置，无依赖）
node run.mjs --demo              # 自动跑 6 场景，每步打印全 audit 状态
node run.mjs                     # 交互菜单
```

Scratch DB：`./audit.PROTOTYPE-wipe-me.db`（+ `-wal`/`-shm` sidecar），每次运行开头 wipe。生产用 `var/audit/audit.db`（WAL）。

## Assumptions (react to these)

1. **`.mjs`, not TS.** Throwaway；无 build step。真实实现是 TS（zod + Schemastery `defineTool` + 真实 Cordis `ctx.on`）。
2. **harness-stub.mjs is a STAND-IN.** 假 Cordis ctx 模拟 tools/* pipeline（pre-execute → ctx.tools.guard → execute → post-execute → result）+ session events。真实实现在 vendored Cordis（`packages/core/tools`+`session`+`agent-loop`）。stub 简化：waterfall 同步（无 async `next()`），first-deny-wins；load-bearing 属性镜像 = 「`tools/post-execute` 对 allowed+denied 都触发」（harness `tools/README`）。
3. **identity 是 stand-in.** `ctx.requestScope` = 假 per-request 登录态。真实身份 = P9 web-login `Tenant` + P10 mTLS（未建）。T1 fallback 阶段 user_id=null。
4. **subagent-qoder (P3) 已落地 2026-08-20**（`packages/subagent/subagent-qoder/`，terminal-only one-shot drain `query()` 终态 `result`，Credits 在 `SDKResultSuccess`）。tool-audit 工具名无关——S1 用伪造的 subagent-qoder result（带 Credits）模拟；生产包 hook 真实 subagent-qoder tool 的 `tools/post-execute`（终态 outcome + Credits 自动捕获），**P8 审 call outcome 非 internal tool/reasoning stream**（P3 标的 core-seam 变更票仅当 forensic 需 stream 才开）。
5. **Credits 值是伪造的.** S1/S6 用伪造 `total_cost_usd`/`total_credits`/`usage`/`modelUsage`（shape 取自 `research/qoder-sdk-dts.md:21` `SDKResultSuccess`）。真实值由 Qoder SDK 返回。
6. **node:sqlite.** Node v25.9.0 原生可用（无 `--experimental-sqlite` flag）。生产同款（`storage-sqlite` backend 同款栈）。
7. **stats SUM 用 immutable payload**（见下 surfaced tension #2）；**ownership guard 用列值（original identity）非 override 视图**（见 #1）。

## Surfaced findings (原型主要发现)

**Validated（状态模型成立）：**
- **zod 忠实镜像 RBI AuditRecord.** envelope + `extra` 兜底 + `from_payload`/`to_payload` round-trip（未知键入 extra、摊平回 top-level，无数据丢失）；lean 裁分类域；净增 `user_id`。→ D4 validated。
- **3 表关系型 + 所有权 guard 工作.** `audit_event` 不可变 append（payload EXCLUDES auto_tags）+ `audit_override` append-only **点路径** patch（original 不变，read view 纠正，history 链可查）+ `audit_tag` junction（标签唯一真相源，不进 payload）。IDOR-safe null（bob ⊾ alice's record = null = 不存在，无 existence oracle on 32-bit log_id 空间）。→ D2/D3 validated（S4/S5）。
- **G3 feed 捕获.** `qoder_call` tag + Credits（`total_cost_usd`/`total_credits`/`usage`/`modelUsage`）从 `SDKResultSuccess`。→ D7 validated（S1）。
- **Tier-2 hash-not-body.** `record_tier2_write` 存 `payload_hash`+`payload_bytes`，**不**存正文（intranet-security-first：留痕答谁/何时/哪个 scope/哪一版，不答正文）。fail-silent 不阻断业务写。→ D8 validated（S3：正文不在 audit 记录里 ✓）。
- **单 DB 索引答 cross-scope per-user 合规查询.** `query(qoder_call, user_id=alice)` 跨 game-1+game-2 原生索引答，无需 per-scope-DB federation（per-user ⊥ per-scope）。→ D3 validated（S6）。

**Surfaced tensions（待决策/react）：**
1. **override-of-identity vs 列/索引/guard.** patch `user_id`（误归属修正）经点路径纠正 read VIEW，但 `audit_event.user_id` **列**/索引/所有权 guard 仍看 original → 纠正后的身份**不可**经索引查询、guard 查 original。RBI 的 override 是 verdict 字段（非身份）。→ 决策：禁身份字段 patch？或单独「identity-correction」更新索引（违背不可变）？或接受身份不可纠正（误归属只能 append 新记录 + tag 标记）？（prototype 未 demo，作 finding 记。）
2. **override vs SQL 聚合.** `stats` 的 `SUM(json_extract payload)` 用 immutable payload（S6: $0.1042+$0.07=$0.1742），**不**反映 S4 override（$0.05→corrected view 应 $0.12）。override 只在 read（get/query materialize）生效，SQL 聚合绕过。→ 决策：corrected totals 须从 materialized view 重聚合（O(n)）OR 接受 override 不入聚合 OR override 同时写「current view」投影列。
3. **userId 缺口.** `ToolExecution`/`SessionHeader` 无 userId（harness 无 per-user identity seam，仅 `anonymous-user-id`）。prototype stand-in；真实 = P9 login-state ctx（未建）+ P3 `resolve(ref,{userId})` 调用点带 userId。P8 须从该 ctx 读 userId（同 P3 读的）OR observe `credentials/updated` 的 `address.userId`。
4. **Credits nullable.** `total_credits?` 选（SDK 可省）→ null；可选 `getUsageInfo()`/`accountInfo()` fetch（P3 依赖）。reconciliation 对账 Qoder 侧 billing 须处理 null。
5. **sessionTelemetry 互补非重复.** 5 差异（sink local-SQLite vs remote-OTel / attribution per-user vs 匿名 / consumer 合规官 vs 分析 / durability ACID vs best-effort / consent 非共识 vs opt-in）。capture-point 重叠（都 observe `session/event`+`tools/*`）但廉价（两 sink 同源）；**勿**把 sessionTelemetry 改作合规审计（会倒其 anonymous/best-effort/opt-in 契约）。〔`../../research/p8-audit-scope.md` §2〕
6. **ctx.storage KV-only → own sqlite.** `storage-domain` README 明「No cross-table transactions, secondary indexes, or multi-segment keys」+ 经 routed kv backend 持久化。→ RBI 关系型 3 表+索引**不能**住 ctx.storage；P8 own sqlite + `ctx.audit` sibling seam（additive）。map ⑤d「ctx.storage」澄清（原则 SQLite+ctx seam 不变，具体 seam=`ctx.audit`）。

## Files

- `types.mjs` — zod `AuditRecord`（镜像 `rbi_core/models/audit.py`）+ `from_payload`/`to_payload` + `TAG`。
- `store.mjs` — `SQLiteAuditStore`（node:sqlite 镜像 `rbi_data/audit.py` `SqlAlchemyAuditStore` + `AuditEvent`/`AuditOverride`/`AuditTag` + AuditStore Protocol；WAL；所有权 guard；点路径 override）。
- `audit.mjs` — `ctx.audit` service stub + 3 面（`tools/post-execute` observe + `session/event` observe + `record_tier2_write` helper）+ G3 Credits 捕获。
- `harness-stub.mjs` — 假 Cordis ctx（tools/* pipeline + session events 模拟）。
- `run.mjs` — demo driver（6 场景 `--demo` + 交互菜单）。
- `../../research/p8-audit-scope.md` — scope 适合度 cited 笔记（推荐 (a) + 6 证据 + 3 翻盘条件）。
