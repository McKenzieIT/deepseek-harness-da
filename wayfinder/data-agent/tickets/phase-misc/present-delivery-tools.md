# present_* — INTERPRETATION delivery tools (form-defining)

> Child of [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate. Surfaced 2026-08-21 by the load_* ship session: `query_data` + `load_*` landed; `present_*` (the INTERPRETATION-phase delivery tools) had no ticket — this one defines its form before any package ships.

**Type**: grilling (HITL) — the delivery form is the key question; may graduate a prototype.
**Phase**: misc
**Assignee**: (unclaimed)
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
