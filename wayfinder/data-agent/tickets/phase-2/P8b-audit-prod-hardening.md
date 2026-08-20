# P8b — audit 生产包硬化

**Type**: prototype
**Phase**: 2
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved (2026-08-20) — production package `packages/data/audit/` landed + wired; P3 additive costs-surface for Credits capture
**Depends on**: ~~P9~~ (resolved 2026-08-20, unblocked)
**前置**: P8 (resolved), P3 (resolved)

**Question**: P8 audit 生产包（`packages/data/audit` TS + 真实 Cordis `ctx.on`）的剩余决策 + 接线。

## Finding / Design (resolved 2026-08-20 — /prototype + grilling 2 surfaced tensions + 1 fact-finding tension)

### 2 surfaced tensions (grilled — decisions locked)

**① override-of-identity → (a) verdict-only patch**：`patch()` 拒身份字段（`user_id`/`scope_id`/`tenant_id`/`session_id`/`chat_session_id`/`log_id` 的首 dotted 段），throw（contract violation — fail-loud，区别于 not-found/ownership 的 IDOR-safe null 返回）；误归属经 `appendCorrection(originalLogId, correctIdentity, {by,reason}, caller)` append 新 `audit_event`（正确身份）+ tag=`attribution_correction` + `extra.corrects=原log_id`。新记录是真实新行→经 `user_id` 索引可查、guard 一致；原行不可变（ADR-0003）。贴合 RBI（override=verdict 字段非身份）+ 保不可变 + 保索引/guard 一致。

**② override-vs-聚合 → (c) 不入默认聚合 + 单独 correctedStats**：`stats` 保持 immutable original（SQL `SUM(json_extract payload)` on immutable payload 列，快、与 `rawPayload` 永一致）；另加 `correctedStats(f,caller)` O(n) 重聚合 materialized view（应用 override 后）供合规对账。两数答不同问题（「记录当时」vs「纠正后」），consumer 按需选；common case 不为罕见 reconciliation 付 O(n)。`by_tag` 计数两法相同（tags 不可 patch）。不取 (a)（stats 本身 O(n) 拖慢 common case + 静默改语义）也不取 (b)（投影列写放大 + 第二真相源）。

### Fact-finding tension (surfaced by real-API fact-gathering — grilled separately)

**N1 Credits 捕获需 additive P3 改动 → (a) 做**：args 假设 post-execute 能从 `SDKResultSuccess` 取 Credits。实证 P3 `consumeQoderQuery` 只留 `message.result`（文本）丢弃全部 cost 字段；`SubagentResult` 契约只有 `{output, structured?, stopReason}` 无 cost；且 `Query.close()` 在 post-execute 前（dispose 在 tool `execute()` 内 await）→ `getUsageInfo()`/`accountInfo()` fallback fetch 也不可行。**决策 (a)**：P8b 做 strictly-additive P3 改动——`SubagentResult` 加可选 `costs?: SubagentCosts`（`{total_cost_usd, total_credits?, usage?, modelUsage?}`，JsonValue 字段 + 前向兼容 `readonly [key:string]: JsonValue` index sig 以 assignable to JsonValue，过 `exactOptionalPropertyTypes`）+ `consumeQoderQuery` 在 close 前从 `SDKResultSuccess` 捕 cost（`total_cost_usd` 缺则 omit costs，保 `{output,stopReason}` 形状不变→现有 25 spec 仍绿）+ tool-subagent 前台 `ForegroundToolResult` 加 `costs?` + `output.schema` foreground variant 加 `costs: { type: 'json' }`（非 model-facing——`output.schema` 不进 `schemas()`；execution-local 不进 durable session log）。Credits 是 G3 驱动（per-user Qoder cost 审计= P8 per-user 维度的全部意义）；改动 strictly additive（可选字段、无行为变、P3 是 DA 包非 core、保升级路径）；P4b 先例（prod-hardening 触 sibling 包）。跨 3 个 P3 包（subagent/subagent-qoder/tool-subagent）。

### Real-API corrections (P8b fact-finding 浮出 — P8 prototype 假设与真实 Cordis 不符)

1. **`tools/post-execute` 签名**：prototype `(exec, decision, result)` 错。真实 `(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>`——**无 `decision` 参**；deny 体现为 `result.isError === true` + `result.error.message`。observe-only = `return next()`。〔`packages/core/tools/src/index.ts:175`〕
2. **`session/event` 签名**：prototype `(eventType, data)` 错。真实 `(this: Scoped<Session>, session: Session, event: SessionEvent): void`——读 `event.type`/`event.data`；emit（无 `next`，void）。〔`packages/core/session/src/index.ts:76`〕
3. **post-execute 对 denied 也触发**（实证）：pre-execute-deny + guard-deny 都产 `'post-result'`（非 `'final-result'`）→ post-execute 触发 + `tools/result` 也触发。故 audit 单 observe `tools/post-execute` 即捕 allowed+denied（P8 D5 设计成立）。测试证：`packages/core/tools/tests/tools.spec.ts:676`（pre-execute deny 仍 post-execute）+ `scoped.spec.ts:401`（guard-deny 仍 tools/result）。
4. **userId seam 今日不存在**（N2，P8 D6 T1 fallback 成立）：P9 未建（仅 prototype `prototypes/p9-admin-access-isolation/`）；harness 唯一身份= anon install id（`getOrCreateAnonymousUserId()` 库函数非 seam）；P3 `resolve(ref)` MVP 无 `{userId}` address。audit `resolveIdentity()` 返 `{}`（→ NULL 列，T1 fallback）；`session_id` 从 `exec.agent.session.id`（tool）/ `session.id`（session-event）取。P9 落地后 small additive wire 接 login-state ctx（同 P3 `resolve(ref,{userId})` 将读的 ctx）。
5. **guard_deny tagging（N3）**：真实 API 无 decision 参 → post-execute 不能自动区分 guard_deny vs tool-failure（都是 isError）。audit 把 isError 记为 `tool_call`(`is_error=true`) + `error.message`（含 deny reason）；distinct `guard_deny` tag 经 explicit `ctx.audit.record({auto_tags:[guard_deny],...})` 由 P10 intranet tool-gate 在 deny 时填（forward-compat hook）。sessionTelemetry 互补非重复（P8 §5）。
6. **ctx.storage KV-only → own sqlite（D2 澄清）**：`storage-domain` 印证「No cross-table transactions, secondary indexes, or multi-segment keys」→ RBI 关系型 3 表不能住 `ctx.storage`；audit own `node:sqlite` `DatabaseSync`（sibling `ctx.audit`，非经 `ctx.storageDomain`）。cordis.patch.yml 旧注释「ctx.storage (SQLite)」stale → P8b 改正为「ctx.audit (own node:sqlite)」。**无 storage-family insert**（audit own sqlite，非 ctx.storageDomain）。

### 接线（生产态，全落地）

- **真实 Cordis `ctx.on`**：`ctx.on('tools/post-execute', async (exec, result, next) => {…observe; return next()})` + `ctx.on('session/event', (session, event) => {…})`。observe-only（post-execute 必 `return next()`；session/event void）。替换 P8 prototype `harness-stub.mjs`——生产 `Audit` Service 在 **constructor** 注册 listeners（非 `[Service.init]`，避 init-timing window 使 listener 晚于首个 tool call 注册）+ eager sync open store（`openAuditDatabase` 用 `mkdirSync`/`openSync` 非 `node:fs/promises`，避 async-open getter 问题）。
- **#private-vs-Proxy**：cordis proxies Service；ES `#store` 经 Proxy 不可达（"Cannot read private member #store from an object whose class did not declare it"）。改用 regular `_store` field（Proxy-safe）。
- **hook 真实 subagent-qoder tool post-execute**：post-execute 读 `result.value.costs`（foreground subagent 结果的 `costs?`，P3 additive surface）；costs 存在 → tag=`qoder_call` + `extra.credits=costs`；缺 → `tool_call`。**P8 审 call outcome 非 internal tool/reasoning stream**（forensic 需 stream 才另开 core seam 票，map Not-yet-specified 保留）。
- **userId 从 P9 login-state ctx 取**：今日 null（T1 fallback，P9 未建）；`resolveIdentity()` 返 `{}` → NULL 列；P9 落地后 wire（small additive，同 P3 `resolve(ref,{userId})` 将读的 ctx）。
- **Credits `total_credits?` 缺则 omit**：P3 `qoderCosts` 在 `total_cost_usd` 缺时 omit costs（保 SubagentResult 形状）；`total_credits` 可选 → omit when absent。`getUsageInfo()`/`accountInfo()` fallback fetch **不接线**（Query.close 在 post-execute 前不可行——N1 决策 (a) 以 additive P3 surface 替代，不再需 fallback fetch）。
- **真实包落 `packages/data/audit/`**：data group wildcard（`tsconfig.base.json:229-231 ./packages/data/*/src` + `:104-106 ./packages/data/*/src/invariant.ts`）自动 map `@deepseek-ai/dsh-audit`→src；`pnpm-workspace.yaml packages/*/*` 自动 discover。`package.json`（mirror storage-sqlite/token-meter：name `@deepseek-ai/dsh-audit`，zod `^4.4.3` + schemastery + cordis/dsh-session/dsh-tools/dsh-invariants peer/dev）+ `tsconfig.json`（extends base，references vendor+core/session+core/tools+runtime-diagnostics/invariants）+ `src/invariant.ts`（package-owned invariant companion，mirror subagent-qoder/storage-sqlite）。
- **`cordis.patch.yml` `# ── audit (P8) ──` 行 uncomment**：`packages/bundle/data-agent/cordis.patch.yml` audit insert 行 uncomment（`id: audit`, `name: '@deepseek-ai/dsh-audit'`，fix stale `ctx.storage` 注释为 `ctx.audit own node:sqlite; P8b`）；data-agent bundle `package.json` 加 `dependencies: { "@deepseek-ai/dsh-audit": "workspace:^" }`（verify-cordis-config 包解析要求 mounted plugin 须在 bundle `dependencies` 声明）。无 storage-family insert。⚠️ **verify-cordis-config 有 pre-existing `@deepseek-ai/dsh-llm-dashscope` 失败**（web-app + data-agent bundle 未声明其 dep——committed 的 P2 llm-dashscope insert + agent-default-model 无 bundle dep；**非 P8b 引入**，audit 行通过 verify 不在 error 列表）。

### Validated

- **P3 additive costs-surface**：subagent-qoder 26/26（+ 新 costs-capture spec）+ tool-subagent 117/117（output.schema `costs` 不破坏现有 foreground variant）+ P3 包 typecheck-clean（`tsc -b` subagent/subagent-qoder/tool-subagent EXIT=0）。
- **audit 生产包**：typecheck-clean（`tsc -b packages/data/audit` EXIT=0）+ **11/11 spec**（schema round-trip + append+retrieve + ownership IDOR-safe null + cross-scope per-user user_id index + ①a patch verdict-only/identity-rejection/appendCorrection + ②c stats immutable vs correctedStats override-applied + tier-2 hash-not-body + service post-execute qoder_call+Credits via `ctx.waterfall` + service denied-call isError + service `recordTier2Write` hash-not-body）。
- **真实 ctx.on 签名**：post-execute `(exec,result,next)` + session/event `(session,event)`——经 `docs/subsystems/tools.md` cordis-surface + 多处 `ctx.on` 用例（`hooks-claude-code/src/index.ts:247` 等）+ 测试证。

### Deferred / surfaced

- **userId per-user 维度**：今日 null（T1 fallback）；P9 `@deepseek-ai/dsh-admin` 落地后 wire `resolveIdentity()`（small additive）。
- **guard_deny 自动 tag**：post-execute 无 decision 参 → 不能自动区分；P10 intranet tool-gate 经 explicit `ctx.audit.record({auto_tags:[guard_deny],...})` 填（forward-compat）。
- **Qoder internal tool/reasoning stream**：P8 审 call outcome（终态+Credits）非 stream；forensic 需 stream 才另开 core seam 票（map Not-yet-specified 保留）。
- **verify-cordis-config llm-dashscope**：pre-existing（committed P2 insert 无 bundle dep），非 P8b；web-app/data-agent bundle 须声明 `@deepseek-ai/dsh-llm-dashscope` dep（P2/T2 或后续票修）。
- **audit runtime path config**：bundle insert 仅 id+name（无 config）；deployment cordis.yml 须供 `path`（audit `Config.path` required，mirror storage-sqlite）。openAuditDatabase sync（`mkdirSync` 0o700 + `openSync` 0o600 + PRAGMA WAL/foreign_keys/busy_timeout=5000 + STRICT tables + user_version stamp）。
- **code review follow-up (post-commit, 2026-08-20)**：subagent code review found M1 (MEDIUM: `correctedStats` not correction-aware — after `appendCorrection`, original + correction both carry `qoder_call` + same cost → reconciliation view double-counts/mis-attributes) + 6 LOWs, no critical/high。**Fixed**：M1 (`correctedStats` cross-filter dedup via `extra.corrects` — skips superseded originals, sums the correction which carries corrected identity + same cost; +12th spec) + L1 (`ORDER BY patched_at, id` deterministic tiebreaker) + L4 (`ingested_at`=`nowIso()` independent of event ts) + L5 (`qoderCosts` `typeof==='number'` guard)。**Deferred (LOW, edge-case)**：L2 (identity `''` vs NULL inconsistency between `sameOwner` + `_where`)、L3 (`dumpAll` no ownership guard — not in production paths)、L6 (`patch` throws before ownership check — intentional fail-loud)。

## Assets

- `packages/data/audit/`：`src/schema.ts`（zod `AuditRecord` mirror RBI + `fromPayload`/`toPayload` round-trip + `TAG` + `IDENTITY_FIELDS`）+ `src/store.ts`（`SQLiteAuditStore` 3 表 `audit_event`/`audit_override`/`audit_tag` + WAL + STRICT + ownership guard NULL-safe IS + verdict-only patch + `appendCorrection` + `stats`/`correctedStats` + `hashBody`）+ `src/index.ts`（`ctx.audit` `Audit extends Service` + `ctx.on('tools/post-execute'|'session/event')` listeners + `recordTool`/`recordSessionEvent`/`recordTier2Write` + `extractCosts`/`summarizeSuccess` + `resolveIdentity` T1 fallback）+ `src/invariant.ts`（companion）+ `tests/audit.spec.ts`（11 spec）+ `package.json` + `tsconfig.json`。
- **P3 additive（跨 3 包）**：`packages/subagent/subagent/src/types.ts`（`SubagentCosts` + `SubagentResult.costs?` + JsonValue import + index sig）+ `src/index.ts`（export `SubagentCosts`）+ `packages/subagent/subagent-qoder/src/run.ts`（`qoderCosts` helper + `consumeQoderQuery` capture + JsonValue import）+ `packages/subagent/tool-subagent/src/index.ts`（`ForegroundToolResult.costs?` + `output.schema` foreground variant `costs: {type:'json'}` + `settleForegroundRun` propagate）+ `tests/subagent-qoder.spec.ts`（+ costs-capture spec）。
- `packages/bundle/data-agent/cordis.patch.yml`（audit insert uncomment + stale 注释 fix）+ `packages/bundle/data-agent/package.json`（+ `@deepseek-ai/dsh-audit` dep）。
- P8 prototype `wayfinder/data-agent/prototypes/p8-audit/`（throwaway，primary-source for the 2 tensions + 6 green scenarios）+ `research/p8-audit-scope.md`。
