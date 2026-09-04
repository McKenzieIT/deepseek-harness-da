# GA-GT3 — enrichment 泛化（去 DWS/DIM 星型强绑）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) · [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) — H4 / arch G4 · **high**

**Problem**: enrichment 强绑 DWS/DIM 星型：`buildDimInventory` 只扫 `kind='dim'`；`discoverRelationsDeterministic` 只做 PK 列名精确相等（无 FK 命名启发式）；LLM prompt 写死 "DWS fact table"；非星型 scope（flat wide / event-sourced / denormalized OLTP）在 replace 模式写 `dimension_refs:[]` **抹掉人工 curated join 且无信号**。

**Scope**:
- inventory 泛化为任意有非空 `primary_key` 的表（不只 `kind='dim'`）
- `buildLlmPrompt`/`buildEventLlmPrompt` 改 schema-model-agnostic
- 加 FK 命名启发式（列名 ends `_id`/`_key` 且等于 dim PK）
- `kind` enum 加 `ods`/`entity`/`flat`（或开放字符串），未标记导入默认 `ods`（依赖 GA-GRILL3）
- **默认 `mergeExisting=true`**（防抹 curated join）——可先做这一行
- 空 inventory 时 short-circuit + 明确消息

**Blocked by**: GA-EXP1（**仍 Open**——LLM-driven 推断实验，决定 enrichment 推断模式 + ontology 结合深度 + kind 路由解耦验证；原阻塞者 GA-GRILL3 已 grilled，产出 5 项决策 + GA-EXP1 实验票）  ·  **关联**: GA-GT2、CL5（确定性前缀→结构化 source 字段）、GA-GRILL3（已 grilled，D1-D5）
**Key files**: packages/data/semantic-layer/src/{enrichment.ts:71,144,151,226,316,348,types.ts:278}; packages/data/tool-discover-relations/src/index.ts:184,221

---

## 证据收集（2026-09-03，未解票）

**完整 brief**: [gt3-grilling-brief.md](../../research/gt3-grilling-brief.md)（373 行，每条论断带 file:line）

本票是 `grilling` 类型 = HITL，**不由 agent 代为决策**。本轮只做 AFK 的证据收集。以下为需人工判断的结论。

### 阻塞状态更正

**GA-EXP1 仍是 `Status: Open`**，只完成 Phase 1 的一半（20 表 ground truth + 启发式基线 43.75% + 失败模式 F1-F7；**LLM-as-judge 校准从未执行**，报告 §2.5 明写 "pre-run estimates"；Phase 2/3/4 未开始）。易与已 resolved 的 **GA-GRILL3** 混淆——GRILL3 是**原**阻塞者且已解，解完之后新阻塞者才是 EXP1。

### 六项 scope 的 gating 分类

| # | scope 项 | 分类 |
|---|---|---|
| 1 | inventory 泛化为任意非空 `primary_key` | **partially gated** |
| 2 | FK 命名启发式 | **EXP1-gated**——它**就是** EXP1 Phase 2 Arm A 本身 |
| 3 | `buildLlmPrompt` schema-model-agnostic | **partially gated** |
| 4 | `kind` enum 加 `ods`/`entity`/`flat` | **EXP1-gated**（且双重 gated，见下） |
| 5 | **默认 `mergeExisting=true`** | **independent** ✅ |
| 6 | 空 inventory short-circuit | **independent** ✅ |

**两个安全项（5、6）未被阻塞** → 票头的 `Blocked by: GA-EXP1` 粒度过粗。

### 对票面的三处更正

**(a) 「可先做这一行」是错的。** 只翻 `enrichment.ts:330` 的默认值对 agent tool **毫无作用**——`semantic-layer/src/index.ts:628` 硬编码传 `false`。链路：`tool-discover-relations/src/index.ts:166` → `index.ts:628`（显式 `false`）→ `enrichment.ts:330`（默认 `false`）→ `:348`。events 路径（`index.ts:649`、`scripts/seed-event-external-refs.ts:19`）连参数都不传，**没有 merge-mode 入口**。

**(b) item 1 按现有 scope 写不满足 GRILL3 D2。** 有**两处** `kind` gate：inventory 侧 `:256` 与 target 侧 `:345`。D2 要求的 dim→dim 需要拆掉 **`:345`**，而 scope 文本从未提它。

**(c) item 4 双重 gated。** GRILL3 D4 固定了「kind enum + 富文本双层」的**形态**但未定**取值**；且本票写 `ods/entity/flat`，而 EXP1 自己的 prompt 要求 `fact/dimension/staging/entity/flat/unknown`——**两处取值集不一致**，需先统一。

### item 5 数据丢失：确认为真 bug，`origin` 未兜住

GA-I18N-1 的 `origin` 优先级逻辑在 `mergeRefs` **内部**，而 `mergeRefs` **只在 `mergeExisting === true` 分支被调用**。replace 分支（`enrichment.ts:348` `refs = discovered`）**根本不调 `existingRefs()`**，`manual`/`undefined` 的 ref 被整体丢弃，随后 `:350` 无条件写盘。

**但存在真实张力，不能简单翻默认值**：`mergeRefs` 是**并集语义、从不删除**，所以 replace 模式是唯一能清掉过期 ref 的路径——CL-18 Phase 1 那次 23→5 的噪声清理在纯 merge 下**将无法进行**。且 auto=merge / explicit=replace 的现状是一次 code-review 的**刻意决定**（`.agents/notes/implemented/feature/2026-08-22-…:29`）。

### ⬅ 下一个 frontier 动作：item 5 三选一（需人工 grilling）

| 方案 | 内容 | 代价 |
|---|---|---|
| (a) | 默认翻 `mergeExisting=true` | 保住 curated ref，但**失去清理过期 ref 的能力** |
| **(b)** | **origin-aware replace**——只替换 `deterministic`/`llm`，保留 `manual` | brief 推荐的调和方案；需同时改 `index.ts:628` 与 events 路径 |
| (c) | 显式 opt-in replace flag | 调用方全部要改；语义最清楚 |

注意任一方案都须同时处理 `index.ts:628` 的硬编码 `false` 和 events 路径缺失的 merge-mode 入口，否则改动无效（见更正 (a)）。

### blast radius 实测（item 4 的迁移成本输入）

`examples/` 下 **321 个 table YAML**（全 K11；x63 为零）：`kind: dim` **159**、`kind: dws` **3**、**无 `kind:` 键 159**——后者在默认值翻成 `ods` 后**静默改变语义**。届时三处独立硬编码 `'dws'` 默认值将与 schema 不一致（`basic-index.ts:115`、`graph-animations.ts:418`、`types.ts:279`）。

**最高风险的静默回归**：`tool-search-data-sources/src/index.ts:107` 的 `if (k === 'dws' || k === 'dim') return 'table'`——新 kind 会落到 `'source'`。（brief 记的 `:98` 已漂移，本条行号经复核更正。）编译期即报错的闭合联合（较安全）：`schema-gateway/src/types.ts:79`、`ui-context-layer/.../types.ts:22`、`graph-styles.ts:14`。

两个意外发现：**`packages/data/phase-gate` 一次都没读 `TableDefinition.kind`**（全部命中是 `last_failure_kind`）；`ui-semantic-layer/.../types.ts:8-13` **已经**是开放字符串且已列 `ods`。

### 测试现状

- `enrichment.spec.ts:222`（`'skips DIM tables'`）是**唯一**编码星型假设的测试，D1+D2 下会因自连接而失败；改写它的过程正是自连接护栏决策被迫落地的地方
- **没有任何测试断言 replace 模式** → 翻默认值挡不住任何测试（既是低摩擦，也是无护栏）
- item 3 的 `"DWS fact table"` 字面量**无任何测试断言**
- item 4 **零测试覆盖** → 159 个文件的重分类会无声通过

### 工作树注意

报告涉及的 `enrichment.ts`、`index.ts`、`enrichment.spec.ts`、`tool-search-data-sources`、`io.ts`、`tool-load-table-definition` 在工作树中均为 modified，差异经核对均为装饰性且与结论不重叠（brief §8）。ticket 原列行号除 `enrichment.ts:348`（巧合精确）外**全部已漂移**，漂移对照表见 brief §10。
