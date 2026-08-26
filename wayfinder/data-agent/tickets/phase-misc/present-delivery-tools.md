# present_* — INTERPRETATION delivery tools (form-defining)

> Child of [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate. Surfaced 2026-08-21 by the load_* ship session: `query_data` + `load_*` landed; `present_*` (the INTERPRETATION-phase delivery tools) had no ticket — this one defines its form before any package ships.

**Type**: grilling (HITL) — the delivery form is the key question; may graduate a prototype.
**Phase**: misc
**Assignee**: mckenzie
**Blocked by**: none (independent — no hard dependency; ships after its form is decided)
**From**: [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate (load_* ship session 2026-08-21) + [G1c](G1c-variant-presets-tool-roster.md) (present_* = INTERPRETATION delivery, deferred) + P7b (phase-gate INTERPRETATION)

## Question

What is the form of the data-agent's INTERPRETATION-phase delivery tools (`present_*`) — the report / Excel / text presentation the agent produces to deliver a query's answer to a business user? reverse-bi ships delivery tools (report generation, Excel export, text tables); this ticket decides which to port, in what shape, and how they surface to the model (a `present_*` tool per delivery mode, or one parameterized tool?) before any package ships.

## Scope (to grill / prototype)

- **Delivery modes**: report (prose + tables), Excel (via pandas / `code-runtime`), text tables (markdown / ASCII). Which does the data-agent ship first? RBI parity vs. minimal.
- **Tool shape**: one `present_result` tool parameterized by `mode`, or `present_report` / `present_table` / `present_excel` separate tools (mirroring the preset's commented `present-decomposition` / `present-table` placeholder rows)?
- **Substrate**: delivery likely routes through `code-runtime` (pandas) for Excel/report generation — the bundle keeps `code-runtime` host-mounted for the agent's own transforms, and the preset's `tool-bash` / `tool-fs` rows stay commented until the transform stage lands. Is `present_*` a thin tool over `code-runtime`, or its own package / a `ctx.delivery` seam?
- **Model-facing contract**: does `present_*` WRITE a file (Excel/report artifact → spill/attachment?) or RETURN structured text? Token + KV-cache implications (mirror the `load_*` Model Experience convention: the tool schema rides the system prompt; the render text is the per-call charge).
- **Dependency**: no hard dependency (ships independently per the aggregate). The four-phase pipeline's INTERPRETATION delivery is the last link; until `present_*` ships, the agent can run SQL + load schema but cannot deliver a formatted answer — the G1b execution-match DELIVERY scoring needs it.

## Not yet specified

- Whether `present_*` reuses `code-runtime` (pandas) or is its own delivery substrate (a `ctx.delivery` seam?).
- Excel/report artifact storage (spill? attachment? — the bundle mounts `dsh-spill-local`).
- Whether the preset's `present-decomposition` / `present-table` placeholder ids are the final roster (RBI parity check needed) or a single `present_result` supersedes them.

## 关联

[data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) (parent aggregate) + [G1c](G1c-variant-presets-tool-roster.md) (INTERPRETATION delivery deferred) + P7b (phase-gate INTERPRETATION) + reverse-bi delivery tools (read-only source).

---

**Note (2026-08-21, ticket C assessment — NOT resolved)** — assessed during the load_*/data-agent-tool session (tickets A + B landed: `c45845b215` harvest fix, `433a9440d3` ctx.schema bundle mount). This ticket is **HITL grilling** (Type: grilling) — the delivery-form decision requires a human `/grilling` + `/domain-modeling` session; the agent must not stand in for the human's side of it (wayfinder HITL rule), and no interactive human is present in an autonomous session to grill. So the form is **not decided** here and `present_*` is **not shipped** (the ticket scopes itself: "decides… before any package ships"). Still unclaimed + open.

**Suggested next step** (for a HITL session): (1) optionally fire a `/research` subagent to survey reverse-bi's delivery tools (report / Excel / text — what RBI ships, their shapes, how they surface to the model) to surface the facts the grilling waits on; (2) a `/grilling` + `/domain-modeling` session decides the form (delivery modes, one-parameterized-tool vs per-mode tools, `code-runtime` reuse vs a `ctx.delivery` seam, write-file vs return-text); (3) only then ship `present_*` packages (mirror `tool-search-data-sources` / `tool-load-*` three-piece shape). G1b DELIVERY scoring stays blocked on this until then.

---

## Resolution (2026-08-26, HITL grilling session)

### Decisions

1. **独立工具包（非参数化）** — 四个独立 repository package，各镜像 `tool-present-clarification` 三件套形态（`packages/data/tool-<name>/`：`src/index.ts` + `tests/` + `package.json` + `tsconfig.json`）：
   - `@deepseek-ai/dsh-tool-present-decomposition`
   - `@deepseek-ai/dsh-tool-present-table`
   - `@deepseek-ai/dsh-tool-compute`（blocked on 安全计算环境 ticket）
   - `@deepseek-ai/dsh-tool-suggest-followups`

2. **硬编码白名单演进模型** — 新增工具需三处各一行改动：`phase-gate/src/types.ts` INTERPRETATION_TOOLS 加名字 + preset `agent.cordis.yml` 加行 + 新 tool 包。不做自声明发现（intranet-security-first：白名单是安全边界，变更需 code review 可见）。拆分/合并/跨阶段迁移均为白名单数组一行增删。

3. **substrate 分层**：
   - `present_decomposition` / `present_table` / `suggest_followups`：`inject: ['tools']` only — 纯 intent 记录，零外部 service 依赖，v1 可直接 ship
   - `compute`：形态是 "LLM 生成代码 + 安全沙箱执行 against 数据"（非硬编码 operation 模板），需要安全计算环境 infra — **blocked on [`result-cache-service`](result-cache-service.md) + [`code-runtime-data-python`](code-runtime-data-python.md)**（research resolved 2026-08-26，见 [`data-agent-safe-compute-environment`](data-agent-safe-compute-environment.md)）

4. **`present_table` model-facing contract** — 镜像 RBI ADR-0029 D6 "intent not data"：
   - 参数：`result_id`(required) + `title`(required) + `columns` + `column_types` + `sort_column`(-1=no sort) + `kpi_columns`([{column, aggregation, label, format}]) + `chart`({type, x_column, y_columns})
   - canonical value：echo intent fields + `presented: true`
   - `result_id` 统一 namespace：未来可指向 query_data 原始结果或 compute 衍生结果（infra 层负责）

5. **`present_decomposition` forced-first 机制** — v1 仅 prompt-level ordering（INTERPRETATION phase prompt 已声明 strict order），不加 gate-level reject。如后续 eval 发现模型违反顺序频率高，再升级为 gate 硬拒绝。

6. **安全计算环境 = 独立 infra 问题** — 涵盖：(a) 安全沙箱设计（code-runtime 复用 vs 特化）(b) result 存储层（resultCache seam）(c) 计算结果展示（compute 产出 → 新 result_id → present_table 可引用）。新开 research ticket。

7. **ship 计划**：`present_decomposition` + `present_table` + `suggest_followups` 一次性 ship（一个 PR）；preset 解注释对应行；`compute` 行保持注释直到安全计算环境 resolve。

### Spawned tickets

- [`data-agent-safe-compute-environment`](data-agent-safe-compute-environment.md) — research：data-agent 安全计算环境设计（blocks `compute` ship）
- [`compute-tool`](compute-tool.md) — task AFK：`@deepseek-ai/dsh-tool-compute` 落地（**resolved 2026-08-26**，安全计算环境全链解封后 ship）
