# GA-GT3 — enrichment 泛化（去 DWS/DIM 星型强绑）

**Type**: architecture (design-decision + impl)  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) · [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) — H4 / arch G4 · **high**

**Problem**: enrichment 强绑 DWS/DIM 星型：`buildDimInventory` 只扫 `kind='dim'`；`discoverRelationsDeterministic` 只做 PK 列名精确相等（无 FK 命名启发式）；LLM prompt 写死 "DWS fact table"；非星型 scope（flat wide / event-sourced / denormalized OLTP）在 replace 模式写 `dimension_refs:[]` **抹掉人工 curated join 且无信号**。

**Scope**:
- inventory 泛化为任意有非空 `primary_key` 的表（不只 `kind='dim'`）
- `buildLlmPrompt`/`buildEventLlmPrompt` 改 schema-model-agnostic
- 加 FK 命名启发式（列名 ends `_id`/`_key` 且等于 dim PK）
- `kind` enum 加 `ods`/`entity`/`flat`（或开放字符串），未标记导入默认 `ods`（依赖 GA-GRILL3）
- **默认 `mergeExisting=true`**（防抹 curated join）——可先做这一行
- 空 inventory 时 short-circuit + 明确消息

**Blocked by**: GA-GRILL3（kind enum 决策）  ·  **关联**: GA-GT2、CL5（确定性前缀→结构化 source 字段）
**Key files**: packages/data/semantic-layer/src/{enrichment.ts:71,144,151,226,316,348,types.ts:278}; packages/data/tool-discover-relations/src/index.ts:184,221
