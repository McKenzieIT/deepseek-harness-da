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
| 5 | **默认 `mergeExisting=true`** → 实采 **(b) origin-aware replace** | **independent** ✅ → **resolved 2026-09-07** |
| 6 | 空 inventory short-circuit | **independent** ✅ → **resolved 2026-09-07** |

**两个安全项（5、6）未被阻塞** → 票头的 `Blocked by: GA-EXP1` 粒度过粗。

### 对票面的三处更正

**(a) 「可先做这一行」是错的。** 只翻 `enrichment.ts:330` 的默认值对 agent tool **毫无作用**——`semantic-layer/src/index.ts:628` 硬编码传 `false`。链路：`tool-discover-relations/src/index.ts:166` → `index.ts:628`（显式 `false`）→ `enrichment.ts:330`（默认 `false`）→ `:348`。events 路径（`index.ts:649`、`scripts/seed-event-external-refs.ts:19`）连参数都不传，**没有 merge-mode 入口**。

**(b) item 1 按现有 scope 写不满足 GRILL3 D2。** 有**两处** `kind` gate：inventory 侧 `:256` 与 target 侧 `:345`。D2 要求的 dim→dim 需要拆掉 **`:345`**，而 scope 文本从未提它。

**(c) item 4 双重 gated。** GRILL3 D4 固定了「kind enum + 富文本双层」的**形态**但未定**取值**；且本票写 `ods/entity/flat`，而 EXP1 自己的 prompt 要求 `fact/dimension/staging/entity/flat/unknown`——**两处取值集不一致**，需先统一。

### item 5 数据丢失：确认为真 bug，`origin` 未兜住

GA-I18N-1 的 `origin` 优先级逻辑在 `mergeRefs` **内部**，而 `mergeRefs` **只在 `mergeExisting === true` 分支被调用**。replace 分支（`enrichment.ts:348` `refs = discovered`）**根本不调 `existingRefs()`**，`manual`/`undefined` 的 ref 被整体丢弃，随后 `:350` 无条件写盘。

**但存在真实张力，不能简单翻默认值**：`mergeRefs` 是**并集语义、从不删除**，所以 replace 模式是唯一能清掉过期 ref 的路径——CL-18 Phase 1 那次 23→5 的噪声清理在纯 merge 下**将无法进行**。且 auto=merge / explicit=replace 的现状是一次 code-review 的**刻意决定**（`.agents/notes/implemented/feature/2026-08-22-…:29`）。

### ⬅ 下一个 frontier 动作：item 5 三选一（需人工 grilling）→ **resolved 2026-09-07，选 (b)**

| 方案 | 内容 | 代价 |
|---|---|---|
| (a) | 默认翻 `mergeExisting=true` | 保住 curated ref，但**失去清理过期 ref 的能力** |
| **(b) ✅ 选用** | **origin-aware replace**——只替换 `deterministic`/`llm`，保留 `manual`/`undefined` | brief 推荐的调和方案 |
| (c) | 显式 opt-in replace flag | 调用方全部要改；语义最清楚 |

**决策（2026-09-07 grilling，HITL）**：选 **(b)**。子决策 `undefined` ≡ `manual`（保留）——`examples/` 4344 条现存 ref `origin` 字段命中 0 次（全 undefined），且 GA-I18N-1 已 shipped `undefined`→priority 2=manual；否则 = bug 复活。实现精炼：只改 `enrichment.ts` 的 replace 分支（tables+events 共用 `originAwareReplaceRefs` helper，复用 `mergeRefs`），**不动 `index.ts`**——`:629` 硬编码 `false` 现在正好选中 origin-aware 分支。events 路径同构，一并修。on-write hook（`true`/全量 merge）原样不动（已安全）。逃逸阀（Q4）不开。详见下方 Resolution。

> **历史更正**：三方案择一阶段的「任一方案都须同时处理 `index.ts:628` 的硬编码 `false` 和 events 路径缺失的 merge-mode 入口」是针对 **(a)**（翻默认值）的顾虑——(a) 翻默认值会被 `index.ts:629` 的显式 `false` 盖掉。(b) 改的是 false 分支**行为**而非默认值，故该顾虑**不适用**；`index.ts:629` 的 `false` 反而是我们要的（选中 origin-aware 分支）。

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

---

## Resolution — items 5+6（2026-09-07）

**只解 item 5 + item 6（independent，未被 GA-EXP1 阻塞）。票仍 Open——item 1/3 partially gated、item 2/4 EXP1-gated，待 GA-EXP1。**

### 决策（grilling，HITL）

- **item 5**：方案 **(b) origin-aware replace**——re-discovery 丢 `deterministic`/`llm` ref，保留 `manual`/`undefined`。唯一同时保住 curated-ref 安全 + 过期机器 ref 可清理性。(a) 牺牲清理能力，(c) 在 flag 触发时重开 manual 丢失路径。
- **子决策 `undefined`**：≡ `manual`（保留）。事实锁死——`examples/` 4344 条现存 ref `origin` 字段命中 0 次（全 undefined，GA-I18N-1 选 lazy migration）；GA-I18N-1 已 shipped `undefined`→priority 2=manual。否则 = bug 复活。
- **逃逸阀（Q4）**：不开（工具删不掉 `manual`/`undefined` ref，手改 YAML，同 merge 模式现状）。CL-18 具体案例不回归（Phase 1 已清 `gacha_result_statis_di` 23→5 + Phase 2 `excludeColumns` 防复发）。

### 实现（TDD，仅 `enrichment.ts`）

| 改动 | 内容 |
|---|---|
| `originAwareReplaceRefs(existing, discovered)` helper | `mergeRefs(existing.filter(r => r.origin === 'manual' \|\| r.origin == null), discovered)`——复用 `mergeRefs` + 已有 `originPriority`，零新优先级逻辑 |
| `enrichAllDwsTables` replace 分支 | `discovered` → `originAwareReplaceRefs(existingRefs(t.raw), discovered)` |
| `enrichAllEvents` replace 分支 | 同构：`discovered` → `originAwareReplaceRefs(existingEventRefs(e.raw), discovered)` |
| item 6 short-circuit | 两函数 `buildDimInventory` 返回 `[]` 时提前 `return {enriched:0,written:0,errors:[]}` + `console.warn` |
| docstring | `mergeExisting=false` 语义从「全量替换」更新为「origin-aware 替换」 |

**不动**：`index.ts`（`:629`/`:650` 硬编码/省略 `false` 现在正好选中 origin-aware 分支）、schema（`origin` 字段 GA-I18N-1 已加，tables+events 共用 `DimensionRefSchema`）、call-site、`scripts/seed-event-external-refs.ts`、on-write hook（`true`/全量 merge，原样安全）、events on-write hook（deferred，超 item 5）、events `excludeColumns`（events 无分区列）。

### 测试（5 新增，全绿）

- `enrichment.spec.ts`：① tables replace 保 manual+undefined、刷 deterministic；② events 同构；③ item 6 tables 空 inventory short-circuit（written:0）；④ item 6 events 同构。
- `discover-relations.spec.ts`：⑤ Service 端 `ctx.schema.discoverRelations()` 保 pre-existing curated ref（闭合 agent 工具路径）。
- **264/264 pass**（semantic-layer 20 文件 + tool-discover-relations）；既有 `enrichment.spec.ts:222`（'skips DIM tables'，item 1 才动）未碰。
- `enrichment.spec.ts` 现 32 tests（+4 新）；`discover-relations.spec.ts` 11（+1 新）。

### 剩余 gating（票仍 Open）

| # | scope 项 | 状态 |
|---|---|---|
| 1 | inventory 泛化为非空 `primary_key` | **partially gated**（EXP1 Phase 3 Level A 验证充分性；D2 还需拆 target-side `:345`） |
| 2 | FK 命名启发式 | **EXP1-gated**（= EXP1 Phase 2 Arm A 本身） |
| 3 | `buildLlmPrompt` schema-model-agnostic | **partially gated**（删 "DWS fact table" 字面量零测试护栏可独立做；prompt 结构重写待 EXP1） |
| 4 | `kind` enum 加 `ods`/`entity`/`flat` | **EXP1-gated**（且 GT3 与 EXP1 取值集不一致，需先统一；159 YAML 静默改义） |
| ~~5~~ | ~~origin-aware replace~~ | **✅ resolved 2026-09-07** |
| ~~6~~ | ~~空 inventory short-circuit~~ | **✅ resolved 2026-09-07** |

**下一步 frontier**：GA-EXP1（仍 Open，Phase 1 只做一半，judge 校准从未执行）解阻塞后，item 1/3 的 independent 部分可先落地，item 2/4 随实验结论。
