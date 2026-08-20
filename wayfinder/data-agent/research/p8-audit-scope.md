# P8 AUDIT SCOPE — which machinery suits dsh-data-agent?

> Background research note for `tickets/phase-2/P8-audit.md`. Cited to primary sources (file:line where the locator is stable; otherwise file + symbol/section). Read tools in this env do not always return line numbers, so symbol/section locators are used where line numbers were not obtainable via grep. Inferences labeled INFERENCE.

## The question

P8's ticket is brief — it inherits the map's ⑤d decision verbatim:

> `wayfinder/data-agent/map.md:38` — **rbi-mcp audit (⑤d)**: 进程内——audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）。

> `wayfinder/data-agent/tickets/phase-2/P8-audit.md:7` — **Question**: audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）。

> `wayfinder/data-agent/tickets/phase-2/P8-audit.md:9` — **From G3（per-user Qoder 审计，2026-08-19）**: per-user Qoder subagent 调用全审计（谁/何时/哪个 PAT-scope/Credits）——作 tool-audit（subagent-qoder 工具调用）+ session-event，带 caller 登录身份。

Three candidate scopes have been framed for the audit machinery. This note investigates which suits dsh-data-agent (a fork of `deepseek-ai/deepseek-harness` being turned into a per-game-scope, intranet-exposed NL→SQL / data-fetching agent for game data).

## The three candidates

- **(a) RBI-faithful lean** — persist ALL tool calls (tagged: `qoder_call` / `tool_write` / `guard_deny` / `session_event` / …) + session events + guard decisions + tier-2 writes; immutable `audit_event` + append-only `audit_override` + query/stats; **NO** RBI ADR-0005 root-cause classification / calibration / flywheel (map Out-of-scope rules flywheels out).
- **(b) G3-focused lean** — persist ONLY compliance-relevant: Qoder subagent calls + tier-2 writes + guard denials + session envelope; append + query; **NO** override table.
- **(c) Full-RBI** — (a) + ADR-0005 root-cause classification + calibration + analyst diagnosis loop.

## Evidence thread 1 — dsh-data-agent's tool surface + session/turn characteristics

**Data agent purpose + per-game-scope + intranet context.** The destination statement (`wayfinder/data-agent/map.md:7`) defines dsh-data-agent as a fork of `deepseek-ai/deepseek-harness` turned into a "data agent" that migrates reverse-bi's core data capabilities (four-phase pipeline + retrieval + query + guard + eval + semantic layer) onto the harness, additive-only; production additions are "DashScope + Qoder LLM 接入 + 内网穿透 + per-game 访问隔离". The access-isolation decision (map, "访问隔离" row) is per-game `scope_id` (reusing RBI's `scope_id`) with admin as the harness app — so audit is per-scope.

**Tools the data-agent persona will run.** `packages/bundle/data-agent/cordis.patch.yml` is currently a patch-only layer that disables the code-agent surface (`tool-str-replace-editor`, `tool-ralph`, `tools.mode: native`) and reserves a commented insert block of placeholders for the data capability plugins. The commented rows name every plugin this profile will mount once their packages ship (`packages/bundle/data-agent/cordis.patch.yml:60-72`): `query-engine` (P4, `ctx.query`), `embedder` (P5, `ctx.embedder`), `retrieval` (P5, `ctx.retrieval`), `semantic-layer` (P6, in-process), `audit` (P8, `guard/session-event + tool-audit + ctx.storage (SQLite)`), `admin` (P9), `llm-dashscope` (P2, direct LLM), `subagent-qoder` (P3, `query()` delegation). `tool-bash` and `code-runtime` stay enabled for the agent's own execution use (map Q9) and are gated from business users at the P10 intranet tool-gate. `tool-web` / `tool-fs` / `tool-jobs` / `workflow` exposure is owned by P7 preset / P10 (P1 ticket §"patch 内容").

**Tool call volume per turn.** The data agent inherits RBI's four-phase pipeline shape (UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION). RBI's `PipelineConfig` budgets (`wayfinder/data-agent/research/rbi-purpose-arch.md:165`): `max_executions_per_turn`=8, `max_llm_calls_per_turn`=60, `max_state_turns`=20. A representative single turn in EXECUTION walks roughly: `search_data_sources` + `load_table_definition`/`load_event_definition`/`load_table_dimensions` (UNDERSTANDING) + `critique_sql_tool` + `evaluate_sql_quality` (GENERATION) + `query_data` (EXECUTION) + `present_decomposition` + `present_table` + `compute` + `suggest_followups` + `log_audit` (INTERPRETATION). [INFERENCE] A typical successful single-turn data question is ~8-15 tool calls; a multi-clarification or retry-heavy turn can reach 20-30; multi-turn sessions compound.

**Qoder subagent calls are OCCASIONAL DELEGATION, not the main LLM path.** The map's LLM decision (`wayfinder/data-agent/map.md:33`) is explicit: `llm-dashscope` (DashScope, da's direct LLM) **+** `subagent-qoder` (Qoder as a harness subagent plugin, `query()` delegation, `SDKMessage`→harness streaming adapter preserving tool/reasoning, PAT auth, `resolveModel`/BYOK to control which model Qoder uses); "用 Qoder 内置模型当主 LLM" has no clean path. The qoder-sdk-ts research confirms why: Qoder's API is an *agent harness* API (`wayfinder/data-agent/research/qoder-sdk-ts.md:34` "是 Agent Harness，不是 OpenAI 兼容 LLM API"; `:48` "它对外只有 Agent 级 API，没有 LLM 级 API"). P3's question (`wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md:8`) frames it as "`query()` 委派" — delegation. [INFERENCE] Qoder calls per session are low (0-2 for delegation cases; 0 in sessions that don't delegate).

**Operational vs compliance-relevant split.** Most tool calls (query / retrieval / semantic reads / presentation / `tool-bash` / `code-runtime`) are operational traffic for the running agent. The compliance-relevant subset is narrow: (i) `subagent-qoder` calls — per-user PAT + Credits attribution (G3 driver); (ii) tier-2 semantic-layer writes (`update_table_meta` direct write + sha256 留痕, `wayfinder/data-agent/tickets/phase-2/P6-semantic-layer.md:15`, `:22`) — intranet-security-first HARDENING §1 (business users must not pollute the source of truth); (iii) guard denials (intranet tool-gate, P10); (iv) session envelope (who/when/which scope). The Qoder feed is the *explicit* compliance driver, but tier-2 writes + guard denials are also compliance-relevant for an intranet-exposed per-game-scope system.

## Evidence thread 2 — sessionTelemetry overlap

**What sessionTelemetry ALREADY ships.** The seam (`packages/session/session-telemetry/`) + its OTel backend (`packages/session/session-telemetry-otel/`) capture every session event and hand redacted copies to a reporting SDK:

- **Tool args + results are captured.** `packages/session/session-telemetry-otel/README.md:38` — "records carry the complete `event.data` as the seam's `sessionTelemetry/record` waterfall returns it — user and assistant message content, **tool arguments and results** (command output, file contents), the full system prompt and tool schemas (`request/header`), todo text, compaction summaries, hook `stderrSummary`, feedback text, and the session `cwd`."
- **To OTel collector (remote).** `packages/session/session-telemetry-otel/README.md:5` — OTel JS SDK (`LoggerProvider` → `BatchLogRecordProcessor` → OTLP/HTTP log exporter), modes FULL / FEEDBACK_ONLY / DISABLED.
- **Anonymous user.id.** `packages/session/session-telemetry-otel/README.md:5` — "this package's anonymous `user.id` (`$DSH_HOME/.anonymous-user-id`, a random UUID created on first use and reset by deleting the file), carried once per export batch rather than per record." NOT per-business-user identity.
- **Best-effort at-most-once.** `packages/session/session-telemetry/README.md:27` — "the accepted cost, consistent with **at-most-once delivery**: a resume does not backfill records a previous process failed to deliver — a deployment with a backfill requirement needs the deferred outbox, not replay." `packages/session/session-telemetry/README.md:47` — "**Best-effort delivery** — the cursor marks handed-off, not delivered; a session torn down inside a reload window cannot be re-adopted; whatever sits in a backend queue at crash time is lost. A durable outbox (spool, per-sink cursors, at-least-once) is deferred until a deployment states a crash-loss requirement."
- **User opt-in disclosure.** `packages/session/session-telemetry/README.md` "The sharing disclosure" — `full` | `feedback-only` | `disabled`, surfaced to the `/feedback` acknowledgement; the user can opt out.
- **Capture point.** `packages/session/session-telemetry/src/coordinator.ts` — `captureEvent` deep-clones `event.data` into `body` and runs it through the `sessionTelemetry/record` waterfall; `:287` handles `tool/result` severity mapping. The capture subscribes the session firehose (`session/created`, `session/event`, `session/flush`, `session/disposed`, `agent/error`).

**Would P8-broad be TRUE DUPLICATION or COMPLEMENTARY?** Five differentiators separate P8 (local SQLite, broad tool-call audit) from sessionTelemetry (remote OTel):

| Dimension | sessionTelemetry (OTel backend) | P8 audit (local SQLite, candidate a/b) |
|---|---|---|
| **Sink** | Remote OTLP/HTTP collector (`:5`) | Local SQLite (WAL, ACID) — `ctx.storage` |
| **Attribution** | Anonymous random UUID `user.id` (`:5`) | Per-business-user identity (G3: caller 登录身份; map `:51` per-user PAT) |
| **Consumer** | Analytics / SRE dashboards (severity alerting, crash detection by shutdown-marker absence) | Compliance officer + P9 admin (per-user Qoder usage audit; access-link lifecycle) |
| **Delivery semantics** | Best-effort at-most-once; cursor in `WeakMap<Session, seq>` dies with session (`session-telemetry/README.md:27`, `:47`) | Durable append-only `audit_event` + `audit_override` (ADR-0009 §4); ACID single-writer |
| **Disclosure / consent** | User opt-in via `sharing` status (`full`/`feedback-only`/`disabled`) | Non-consensual compliance audit (the business needs to audit Qoder calls regardless of user opt-in) |

**Verdict: COMPLEMENTARY, not duplicate.** The capture *point* overlaps (both observe `session/event` for tool args/results), but the sink, attribution, consumer, durability, and consent model all diverge. P8 is a separate store for a separate purpose. The overlap is not problematic — it is the expected shape when one capability (session event observation) serves two consumers (analytics vs compliance) with incompatible requirements (anonymous vs identified; best-effort vs durable; opt-in vs non-consensual). sessionTelemetry cannot serve P8's compliance consumer without acquiring all five missing properties, which would invert its design contract.

## Evidence thread 3 — G3 feed specifics

**How often is Qoder invoked per session?** See thread 1: Qoder is `query()` delegation, occasional, not main LLM. [INFERENCE] 0-2 calls per session for delegation cases; 0 in non-delegating sessions. The compliance driver is per-user *usage* accounting, not high-volume traffic.

**Why per-user attribution is necessary.** `wayfinder/data-agent/tickets/phase-1/G3-per-user-qoder-pat.md:17` — "**审计**: per-user Qoder subagent 调用全审计（谁/何时/哪个 PAT-scope/Credits）→ **P8**（session-event + tool-audit + `ctx.storage`）。" The map decision (`wayfinder/data-agent/map.md:51`) confirms: "Qoder 侧强制权限+Credits; 身份=web UI per-user 登录（复用 RBI `Tenant`）+P10 mTLS; … per-user Qoder 用量进 P8 审计。" P3 (`wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md:12`) — "前提：账号有 Credits（`query()` 跑 agent 消耗额度）". The rationale is three-fold: (i) Credits are billed per Qoder account → per-user PAT → per-user; (ii) PAT is per-individual-business-user (G3 `:17` "per-individual-user，非 per-scope"), stored in per-user keychain (P12); (iii) compliance — the business needs to attribute Qoder usage to the human who initiated it.

**Are Credits reportable by the Qoder SDK?** YES. `wayfinder/data-agent/research/qoder-sdk-dts.md:21` — `SDKResultSuccess = { type:'result'; subtype:'success'; is_error:boolean; result:string; stop_reason:string|null; total_cost_usd:number; **total_credits?:number**; usage; modelUsage; permission_denials; num_turns; duration_ms; duration_api_ms; error_code?:number; terminal_reason?:string|null; fast_mode_state?; uuid; session_id }`. `total_cost_usd` is required; `total_credits` is optional (`?`) but present in the shape; `usage` and `modelUsage` are also carried. The Query method also exposes `accountInfo()` and `getUsageInfo()` (`qoder-sdk-dts.md:55`, per the dts excerpt). So G3's "Credits" audit field is backable by the SDK response (optional — handle absence gracefully).

## Evidence thread 4 — RBI's reasoning for logging-only tool calls

**RBI's deliberate non-persistence of per-tool-call traffic to the audit store.** `reverse-bi/libs/rbi-mcp/src/rbi_mcp/middleware/audit.py:6` (module docstring):

> "Deliberately does NOT write to `rbi_data.audit`'s business-audit-trail schema (`AuditEvent` / `SqlAlchemyAuditStore`) — that is an explicit, LLM-triggered mechanism (the `log_audit` tool) for a different purpose. Building an automatic per-call version of it would be new scope, not a refactor. If a persisted per-call audit trail is wanted later, that is a separate decision."

RBI's `ToolCallAuditMiddleware` logs only `tool_name + scope_id + tenant_id + duration + outcome` via Python `logging` (INFO/WARNING). The audit store (`rbi_data.audit`) is for LLM-triggered audit events emitted by the `log_audit` MCP tool at the end of a query round — capturing query-round *outcomes* (identity/retrieval/confirmation/plan/execution/delivery/escalation_context), not per-tool-call traffic.

**RBI ADR-0009 — the audit store's design contract.** `reverse-bi/docs/adr/0009-audit-store-swappable-seam.md:54`:

> "The `audit_event` table is append-only (an autoincrement `id` is the monotonic append log). Analyst patches (`analyst_verdict`, `remediation`, corrected `preliminary_root_cause`, …) are written as rows in a separate `audit_override` table keyed by `log_id`, with `patched_by` / `patched_at` / `reason`. Reads apply the latest override per field to present the *current* view; `get_with_history` exposes the override chain. This preserves ADR-0003 trust: the original record is never mutated, and the analyst's edit history is itself auditable."

The in-place UPDATE alternative was explicitly rejected (`:71`): "In-place UPDATE on `audit_event` (no override table) — simpler, but overwrites the original record and erases analyst edit history, weakening the audit trail ADR-0003 relies on. Rejected in favor of the append-only override table."

**Why RBI did NOT persist per-tool-call traffic.** Two reasons, both visible in the docstring + ADR: (i) **different purpose** — business-audit-trail is for query-round outcomes (analyst verdicts, root-cause, remediation) consumed by the analyst diagnosis loop; per-tool-call traffic is operational telemetry for SRE / debugging, served by structured logging; (ii) **different trigger** — `log_audit` is explicit, LLM-triggered, one-per-turn; per-tool-call traffic is automatic, high-frequency, every tool invocation. RBI chose to keep them separate because conflating them would change the audit store's contract (volume, consumer, lifecycle).

**Does dsh-data-agent's rationale DIFFER?** YES. RBI lacked a per-user compliance driver — its `ToolCallAuditMiddleware` carries `tenant_id` + `scope_id` but no per-business-user identity, no Credits, no PAT attribution. da has G3 (`wayfinder/data-agent/tickets/phase-1/G3-per-user-qoder-pat.md:17`): per-individual-business-user PAT + Credits + per-user Qoder usage audit. This is exactly the "separate decision" RBI's docstring deferred — da has a *compliance* rationale to persist (at least) Qoder tool calls that RBI lacked. The question is whether to extend that to all tool calls (a) or keep it narrow (b).

## Evidence thread 5 — Compliance consumer

**Who queries P8's audit + for what?** The consumers are inferable from the map + P9 + G3:

1. **P9 admin harness app** (`wayfinder/data-agent/tickets/phase-2/P9-admin-access-isolation.md` + map "访问隔离" + `:51`): per-game scope/credential/access-link 颁发/吊销 + token→scope 绑定 + 系统配置. The admin queries audit for: who accessed which scope, when access links were issued/revoked, credential rotation events, scope access patterns. P9 also owns per-user PAT self-service UI (user pastes their own Qoder PAT into their per-user keychain slot — "admin 不经手 PAT").
2. **Compliance officer (G3 driver, `:17` + `:23`)**: per-user Qoder usage — "谁/何时/哪个 PAT-scope/Credits" — answering queries like "all Qoder calls by user X in scope Y last week" and credit consumption reconciliation against Qoder-side billing.

**Does the consumer need BROAD capture + tag-filter or NARROW?** The G3 query shape ("all Qoder calls by user X in scope Y last week") is *natively* a tag-filter query over a broad capture: filter by (tool_tag=`qoder_call`, user_id=X, scope_id=Y, ts range). (a) supports this natively (broad capture + tags). (b) supports only the Qoder slice (it persists the Qoder feed only, so the same query works for Qoder calls but not for "all tool calls by user X"). [INFERENCE] If a future compliance need arises (e.g., "all SQL queries by user X for data-leak prevention" or "all tier-2 semantic-layer writes by user Y"), (b) cannot answer it without schema growth; (a) answers it via a new tag.

**Does the consumer need the override/patch machinery?** Likely YES, *independent of flywheels*. ADR-0009's rationale for `audit_override` (`:54`, `:71`) is audit-trail integrity: the original record is never mutated, and the analyst's edit history is itself auditable. This is a compliance-correction trail — fix a mis-attributed record (wrong user due to session re-binding, wrong scope due to `X-RBI-Scope` override, missing Credits field due to SDK response absence) without destroying the original. (a) preserves this; (b) loses it (append-only, no override → corrections require either overwriting, which violates ADR-0003 trust, or appending a "corrected" duplicate, which complicates queries). The override table's value is not coupled to ADR-0005's flywheel — ADR-0009 lists it as decision §4, independent of §1-§3. (c) couples it to the flywheel via `record_override` → `update_ema` (calibration loop), which is the flywheel coupling da should avoid.

## Evidence thread 6 — Volume + retention implications

**Broad-all-tool-calls (a).** Per thread 1: ~8-15 tool calls per single-turn data question; 20-30 for retry/clarification turns; multi-turn sessions compound. [INFERENCE] Rough estimate: avg 20-50 tool-call records per session × 50 sessions/day/scope × N scopes. At 5 active scopes × 30 days = ~7.5K-15K records/day across all scopes, ~225K-450K records/month. SQLite WAL with the indexes RBI already defines (`reverse-bi/libs/rbi-data/src/rbi_data/audit.py` AuditEvent `__table_args__` — `ix_audit_tenant_scope_ts`, `ix_audit_scope_ts`, `ix_audit_ts`, `ix_audit_chat_session`, `ix_audit_session`, `ix_audit_root_cause`) handles this easily; RBI's legacy `query_log.jsonl` was 597KB and growing (`reverse-bi/docs/adr/0009-audit-store-swappable-seam.md` Context) — same volume class, and SQLite was chosen precisely to fix the JSONL pathologies. Retention policy (e.g., 90-day hot + cold backup) keeps per-scope DB bounded.

**Compliance-only (b).** Qoder calls per session = 0-2 (occasional delegation, thread 1); tier-2 writes per session = a few (suggest→pending→approve is rare, P6 `:15`); guard denials per session = a few. [INFERENCE] ~0-5 records per session × 50 sessions/day/scope × 5 scopes = ~0-1250 records/day across all scopes — an order of magnitude lower than (a).

**Does broad create a retention/bloat problem narrow avoids?** Not a blocking one. SQLite + WAL + indexes handle (a)'s volume (proven by RBI's same volume class). The real differentiator is *queryability*: (a)'s broad capture enables tag-filter queries that (b) cannot answer; (b)'s narrow capture is smaller but loses query flexibility. Per-scope isolation (map's access-isolation decision + RBI's `RBI_AUDIT_DB_PATH` per-scope convention) bounds the volume either way — each scope's DB is independent, so a noisy scope cannot starve others, and a per-scope retention policy (e.g., 90-day hot + cold backup) is trivial to enforce. [INFERENCE] The volume argument does not flip the recommendation toward (b); the queryability argument flips it toward (a).

## Tradeoff table

| Dimension | (a) RBI-faithful lean | (b) G3-focused lean | (c) Full-RBI |
|---|---|---|---|
| **RBI-fidelity** | High — `audit_event` + `audit_override` + query/stats mirror ADR-0009 §1/§2/§4 exactly; drops only ADR-0005 (which is the flywheel, out per map `:76`) | Low — drops `audit_override` (ADR-0009 §4) and the swappable-seam Protocol shape | Highest — adds ADR-0005 classification + calibration + diagnosis loop |
| **Volume** | Moderate (~20-50/session × sessions × scopes; SQLite handles; per-scope isolation bounds) | Lowest (~0-5/session; an order of magnitude below a) | Same as (a) (same capture) + calibration YAML + EMA write-back |
| **sessionTelemetry-overlap** | Capture point overlaps (both observe `session/event`); 5 differentiators (sink / attribution / consumer / durability / consent) justify separate store → COMPLEMENTARY | Same capture-point overlap; same 5 differentiators → COMPLEMENTARY | Same as (a) |
| **Compliance-fit** | Natively supports G3's "all Qoder calls by user X in scope Y last week" (broad + tag-filter); supports future "all SQL by user X" / "all tier-2 writes by user Y" without schema growth | Supports Qoder feed queries only; future compliance queries require schema growth | Same as (a) for compliance; the flywheel's root-cause classification (semantic_layer / llm_inference / data_quality) is for query-round trust, not per-user compliance — wrong fit |
| **Machinery-cost** | Highest of the lean options: `audit_event` + `audit_override` + query/stats + tag indexing + capture at `tool/call` & `tool/result` | Lowest: append + query (no override, no tag table) | Highest: (a) + `classify_root_cause` + `Calibration` YAML + `update_ema` + `record_override` loop + `audit_calibration.yaml` version-controlled alongside semantic definitions (ADR-0005 consequences) |
| **Additive-future-proofing** | Strong — `audit_override` (compliance correction trail) is independent of flywheels; broad capture + tags enable future compliance queries without schema growth; Protocol shape (ADR-0009 §1) makes a second adapter (multi-instance) an addition not a refactor | Weak — no override table means corrections require overwrite (violates ADR-0003 trust) or append-duplicate; narrow scope means new compliance needs require schema growth | Same as (a) for future-proofing, but the flywheel is coupled (calibration EMA depends on override signal) — adopting (c) implicitly commits to the flywheel path the map rules out |

## Recommendation: **(a) RBI-faithful lean**

**Why.** Six pieces of evidence converge:

1. **Map ⑤d is literal-broad** (`map.md:38`): "audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）" — *three* surfaces (guard + session-event + tool-audit). The `tool-audit` surface is broad tool-call capture, not "Qoder-call-only". (a) honors this; (b) narrows it to the Qoder feed only.
2. **G3 driver fits (a) natively** (`tickets/phase-1/G3-per-user-qoder-pat.md:17`): per-user Qoder call audit is a tag-filter query over broad capture ("all Qoder calls by user X in scope Y last week"). (a)'s `qoder_call` tag + per-user identity column answers this; (b) answers it for Qoder only and cannot extend to future "all tool calls by user X" queries.
3. **`audit_override` is valuable independent of flywheels** (ADR-0009 §4, `:54`, `:71`): its rationale is audit-trail integrity (original record never mutated, edit history itself auditable), NOT the ADR-0005 flywheel. (a) preserves this compliance-correction trail; (b) loses it. (c) couples it to the flywheel via `record_override` → `update_ema` — the coupling da should avoid.
4. **(c) is OUT per map Out-of-scope** (`map.md:76`): "reverse-bi 两个 evolution flywheel（Prompt Evolution + Golden-Case Corpus Evolution）、query-acceleration、9 前端页面、prompts/format-templates/flows/context 版本化超结构——成熟期/UX，可后期回挂，当前不迁（Q3 裁剪）" + `map.md:27` "裁 flywheels/accel/frontend/超结构；查数优先". ADR-0005's root-cause classification (semantic_layer / llm_inference / data_quality / uncertain) is for RBI's quasi-official-data-outlet query-round trust concern, not da's per-user compliance concern — wrong consumer.
5. **sessionTelemetry overlap is COMPLEMENTARY** (thread 2): 5 differentiators (sink / attribution / consumer / durability / consent) justify a separate local SQLite store. The capture-point overlap is fine — same capability (session event observation) serving two consumers with incompatible requirements.
6. **RBI's "separate decision" reservation is exactly what da is making** (`audit.py:6`): "If a persisted per-call audit trail is wanted later, that is a separate decision." da's G3 compliance driver (per-user Qoder Credits + PAT attribution) is the new rationale RBI lacked. (a) is that separate decision, scoped lean (no flywheel).

**What evidence would flip it.**

- **Flip toward (b)**: if the data agent's per-session tool-call count turns out much higher than RBI's baseline (e.g., 100+ per session due to multi-turn + retrieval fan-out + NL→SQL retry loops), broad's bloat could shift the cost/benefit. [INFERENCE] Current estimate (~20-50/session) does not cross this threshold, but P13 NL→SQL engine (currently Blocked by P4/P5/P6, `tickets/phase-3/P13-nl2sql-engine.md`) with execution-feedback self-correction could push retry loops higher — re-evaluate after P13 lands.
- **Flip toward (b)**: if the compliance consumer turns out to ONLY need the Qoder feed (P9 admin confirms no other tool-call attribution queries are needed), (b) suffices. Testable by asking P9's admin query surface.
- **Flip toward (b) or "rely on sessionTelemetry"**: if sessionTelemetry evolves to support per-business-user identity (a `sessionTelemetry/record` rule that injects caller `userId`) AND a durable local spool (at-least-once outbox), then (a)'s local SQLite becomes partially duplicative. Unlikely — it would invert sessionTelemetry's anonymous + best-effort + opt-in design contract, but worth flagging if that contract ever changes.
- **Flip toward (c)**: only if da later adopts a query-round root-cause classification concern (e.g., for an honest-rejection / self-healing trust model like RBI's ADR-0003). Currently out per map `:76`; would require re-opening the map's Q3 裁剪 decision.

## Open sub-questions for grilling

1. **Override table's compliance-correction value independent of flywheels?** Thread 5 + 6 argue YES (ADR-0009 §4 is integrity, not flywheel). Grill: does the compliance officer actually need to *correct* mis-attributed records, or only *append* new ones? If correction is in-scope, (a) wins; if append-only suffices, (b)'s lower machinery cost competes. — Testable by walking the P9 admin UI's "I mis-attributed a Qoder call to the wrong user" flow.
2. **Per-session tool-call count — is broad bloat a real risk?** Thread 1 + 6 estimate ~20-50/session. Grill: walk a real RBI four-phase turn (rbi-purpose-arch.md §5) and count tool calls for (i) a simple single-metric question, (ii) a compound question with 2 sub-questions, (iii) a clarification round + retry. If (ii)/(iii) push >100, re-evaluate (b).
3. **Per-scope SQLite file vs single file with `scope_id` index?** RBI's `RBI_AUDIT_DB_PATH` is per-game (per-scope); ADR-0009 Context says single-instance short-term. da's access-isolation is per-game `scope_id` (map "访问隔离"). Per-scope DB bounds volume + matches access-isolation; single DB enables cross-scope admin queries (P9). Grill: does P9 admin need cross-scope queries, or is per-scope sufficient with a federation layer?
4. **`caller userId` as first-class column vs payload-only?** RBI's `AuditEvent` has `tenant_id` + `scope_id` as first-class columns + `audit_tag` tag table (audit.py AuditEvent / AuditTag). For G3's "all Qoder calls by user X" query to be indexable, `user_id` should be first-class (not buried in `payload`). Grill: confirm the schema includes `user_id` as a first-class indexed column, mirroring RBI's `tenant_id` / `scope_id` treatment.
5. **Capture at `tool/call` (pre-execution, args) or `tool/result` (post-execution, outcome) or both?** RBI's `ToolCallAuditMiddleware` captures post-execution (duration + outcome). sessionTelemetry captures both events (tool/call and tool/result are distinct session events). Grill: does P8 need the args even for failed/denied calls (guard denials never produce a tool/result)? If yes, capture at `tool/call` with an update at `tool/result`; if no, single append at `tool/result` is simpler.
6. **Tag set design.** Thread 1 + 5 imply at least: `qoder_call`, `tool_write` (tier-2 semantic-layer writes), `guard_deny`, `session_event`, plus operational tags. Grill: should guard *denials* be a separate row (with the denied tool name + caller) or a tag on a would-be `tool/call` row that never produced a `tool/result`? RBI's middleware logs failures at WARNING; the audit store's `AuditTag` table tags events — align the two.
7. **sessionTelemetry disclosure interplay.** If a user opts out of telemetry (`sharing: disabled`), does P8 still audit their Qoder calls? Thread 2 says YES (P8 is non-consensual compliance). Grill: confirm the user-facing disclosure surface (/feedback) distinguishes "telemetry opt-out" from "compliance audit (always on)" so users are not misled.
8. **Qoder `total_credits` absence handling.** `qoder-sdk-dts.md:21` shows `total_credits?` is optional. Grill: when the SDK omits it, does P8 record `credits: null` (and a separate `accountInfo()`/`getUsageInfo()` call to fetch) or accept the absence? This affects credit reconciliation against Qoder-side billing.

## Citation index (absolute paths)

**da codebase** (`/Users/mckenzie/workspace/deepseek-harness-da/`):
- `wayfinder/data-agent/map.md` — destination `:7`; Q3 裁剪 `:27`; LLM 接入 `:33`; ⑤d `:38`; G3 decision `:51`; Out-of-scope flywheels `:76`
- `wayfinder/data-agent/tickets/phase-2/P8-audit.md` — Question `:7`; From G3 `:9`
- `wayfinder/data-agent/tickets/phase-1/G3-per-user-qoder-pat.md` — audit pointer `:17`; 实现分布 `:23`
- `wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md` — Question `:8`; Risks `:10`; PAT/Credits `:12`
- `wayfinder/data-agent/tickets/phase-2/P6-semantic-layer.md` — Tier-2 write-tiers `:15`, `:22`
- `wayfinder/data-agent/tickets/phase-2/P9-admin-access-isolation.md` — full file (access-isolation + per-user login + PAT self-service)
- `wayfinder/data-agent/tickets/phase-3/P13-nl2sql-engine.md` — full file (NL→SQL engine, Blocked by P4/P5/P6)
- `wayfinder/data-agent/research/qoder-sdk-ts.md` — agent harness API `:34`, `:48`; path B delegation `:77`
- `wayfinder/data-agent/research/qoder-sdk-dts.md` — SDKResultSuccess shape with `total_credits?` `:21`
- `wayfinder/data-agent/research/harness-agent-loop.md` — agent-loop event seam + per-phase gating
- `wayfinder/data-agent/research/rbi-purpose-arch.md` — PipelineConfig budgets `:165`; §5 end-to-end lifecycle
- `packages/bundle/data-agent/cordis.patch.yml` — disable code-agent + reserved data-plugin block `:60-72`
- `packages/session/session-telemetry/README.md` — at-most-once `:27`; best-effort `:47`
- `packages/session/session-telemetry-otel/README.md` — anonymous user.id `:5`; tool args + results `:38`
- `packages/session/session-telemetry/src/coordinator.ts` — `tool/result` severity `:287`; capture mechanism (whole file)

**reverse-bi codebase** (`/Users/mckenzie/workspace/reverse-bi/`, read-only reference):
- `libs/rbi-mcp/src/rbi_mcp/middleware/audit.py` — docstring `:6`; `ToolCallAuditMiddleware` class (whole file)
- `libs/rbi-data/src/rbi_data/audit.py` — `SqlAlchemyAuditStore`, `AuditEvent`/`AuditOverride`/`AuditTag` ORM, `query`/`stats`/`patch`/`record_override`/`classify_root_cause`/`update_ema` (whole file)
- `docs/adr/0009-audit-store-swappable-seam.md` — `audit_override` `:54`; in-place UPDATE rejected `:71`; full ADR (swappable-seam rationale)
- `docs/adr/0005-structured-audit-with-self-calibrating-classification.md` — cold start `:9`, `:20`; full ADR (root-cause classification + calibration flywheel rationale)
