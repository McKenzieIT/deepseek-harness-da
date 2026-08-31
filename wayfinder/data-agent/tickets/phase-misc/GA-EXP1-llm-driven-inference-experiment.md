# GA-EXP1 — LLM-driven 表推断 vs 启发式：实验设计

**Type**: experiment  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-GRILL3 grilling session](../../research/grill-3-schema.md)（2026-08-31/09-01 对抗式压力测试）
**Blocked by**: 无  ·  **关联**: GA-GT2（engine 抽象）、GA-GT3（enrichment 泛化）、GA-GRILL2（i18n）、GA-GRILL3（schema 去 K11 默认）

---

## 背景

GA-GRILL3 grilling 确认了一个架构方向转变：

> **sync-write 只写最小骨架（列名/类型/注释），所有智能推断交给 enrichment（LLM + tool + guard），启发式降为无 LLM 时的 fallback。**

当前系统有 5 个推断点全部用硬编码规则（`_id` 后缀→PK、`STRING` 类型→dimension、闭集 `dws`/`dim`→kind），深度绑定 MaxCompute 命名规范。裸 PG/Hive/Snowflake/ClickHouse metastore 导入时静默产出错误推断。

本实验验证 LLM-driven 推断是否优于硬编码启发式，以及 enrichment 与 ontology 结合的最优深度。

## Grilling 已确认决策（实验前置）

| ID | 决策 | 理由 |
|---|---|---|
| D1 | enrichment 解耦 kind——路由改用 `primary_key.length > 0`（不再 `kind === 'dim'`） | kind 身兼二职（分类+路由），解耦后 kind 退化为纯标签 |
| D2 | K11 是雪花模型——dim→dim 关系必须参与 enrichment | dim 表有 FK 指向其他 dim（charm→fragment），当前全部被跳过 |
| D3 | enrichment-ontology 结合深度由本实验决定 | A/B/C 三层级理论上都有价值，需数据说话 |
| D4 | 两层并行——kind 闭集 enum（校验+UI）+ toPromptContext 自动推断富文本摘要（LLM） | kind enum 不再承载"给 LLM 足够信息"的压力 |
| D5 | LLM-driven 推断为主、启发式为 fallback——本实验验证 | 与 G3 AI-native enrichment 路线一致，two-round 模式已在 dimension_refs + alt_labels 证明可行 |

## 假设（Hypotheses）

**H1（核心）**：LLM 看到列名+注释+表描述+类型后，对 PK/role/kind/label/freshness 的推断准确率显著高于硬编码启发式，尤其在非 MaxCompute 引擎上。

**H2（ontology 结合）**：enrichment 读图（已知 join 关系 + domain 亲近性）比不读图能发现更多正确的 dimension_refs。

**H3（传递性）**：图上迭代推断（发现 A→B 后用更新的图继续发现 A→B→C）在雪花模型场景下提升 recall。

## 实验设计

### Phase 1：Ground Truth 建立

**方法**：γ+α 混合

1. **人工标注**（精度校准）：从 K11 321 表中选 20 张（10 DWS + 10 DIM，覆盖高/低复杂度），人工标注完整 ground truth：
   - 正确的 primary_key（哪些列）
   - 正确的 role（每列）
   - 正确的 kind 分类
   - 正确的 label_columns
   - 正确的 dimension_refs（含 dim→dim）
   - 正确的 freshness

2. **LLM-as-judge**（自动精度估计）：独立 judge prompt 评估每条推断是否合理——给 judge 两张表的完整 schema + 注释，判断 join 关系/PK/role 是否正确。用人工标注子集校准 judge 准确度。

3. **NL2SQL eval pass rate**（端到端）：复用现有 168 case + sql-judge 基线（73.8%），测 enrichment 改进是否传导到查询质量。

### Phase 2：推断准确率实验（H1 验证）

**被试**：K11 321 表 + 合成 PG schema（10-20 表，模拟典型 OLTP 命名）

**实验组**：

| Arm | PK 推断 | role 推断 | kind 推断 | label 推断 | freshness 推断 |
|---|---|---|---|---|---|
| **Baseline** | `_id` 后缀 | 后缀+类型集合 | 默认 `dws` | `_name`+`STRING` | 写死 `静态参考`/空 |
| **A: 改进启发式** | canonicalize + `_id`/`_key`/`_pk`/`id` | canonicalize + 后缀 | connector hint / 名称模式 | canonicalize + 后缀 | 分区→T+1, 无分区→static |
| **B: LLM 推断** | LLM 看列名+注释+描述 | LLM 看列上下文 | LLM 看整表结构 | LLM 看注释 | LLM 看分区+描述 |
| **C: LLM + tool** | B + 可调 `sample_data` 验唯一性 | B | B | B | B + 可查分区列值 |

**测量指标**：
- per-field precision / recall（对比 ground truth）
- 每张表推断耗时（ms）
- LLM token 消耗

### Phase 3：Enrichment-ontology 结合实验（H2 + H3 验证）

**被试**：K11 321 表（含 dim→dim 雪花关系）

**实验组**：

| Arm | inventory 来源 | LLM prompt 上下文 | 传递性 |
|---|---|---|---|
| **Level A: 解耦 only** | `primary_key.length > 0`（全表） | 无图信息 | 无 |
| **Level B: 读图** | A + 从 RelationGraph 读已知 join 目标 | 注入 domain 亲近性（同 domain 候选排前） | 无 |
| **Level C: 图迭代** | B | B | Stage 1 发现写入图 → Stage 2 用更新图继续 |

**测量指标**：
- dimension_refs precision / recall（对比 ground truth + LLM-as-judge）
- 增量发现数（C 比 B 多发现了多少条？这些多出来的正确吗？）
- NL2SQL eval pass rate delta

### Phase 4：端到端联合验证

将 Phase 2 最优推断 arm + Phase 3 最优 ontology arm 联合跑：
- NL2SQL eval 全量（168 case + sql-judge）
- 对比 CL-15 基线（73.8%）
- 用 `compare.ts` 分析 category-level delta 和 case-level flips

## 合成 PG 测试数据

K11 全是 MaxCompute，无法测引擎泛化。需要合成 PG schema：
- 10-20 张表，模拟典型 OLTP（users, orders, products, payments, ...）
- PG 命名规范（`id` 非 `_id`，`text` 非 `STRING`，`integer` 非 `BIGINT`）
- 有 `information_schema.table_constraints` 提供真实 PK
- 部分表有 comment，部分无（测 LLM 无注释时的退化）

## Prompt 设计（Phase 2 B/C arm）

核心 prompt 结构（单表推断，一次 LLM call 推断全部字段）：

```
你是数据建模专家。分析以下表的 schema，推断其建模属性。

表名: {table_name}
表注释: {table_comment}
引擎: {engine}
列:
{columns_with_type_and_comment}
分区:
{partitions}

请推断：
1. primary_key: 哪些列能唯一标识每一行？（数组，可为空）
2. kind: 这张表的建模角色？（fact/dimension/staging/entity/flat/unknown）
3. label_columns: 哪些列是人可读标签？（数组，可为空）
4. freshness: 数据更新频率？（daily-incremental/daily-snapshot/static/realtime/unknown）
5. columns: 每列的 role（dimension/measure/attribute）

返回 JSON，格式：
{"primary_key":[],"kind":"","label_columns":[],"freshness":"","column_roles":{"col_name":"role"}}

规则：
- primary_key 列必须在列名列表中存在
- 不确定时标 unknown，不要猜
- 如果列注释包含"唯一""主键""PK"等信号，优先使用
```

## Guard 校验规则

LLM 输出经以下 guard 校验后才写入 YAML：

| 字段 | guard |
|---|---|
| primary_key | 每个值必须 ∈ columns[].name |
| kind | 值必须 ∈ allowed enum（或 'unknown'） |
| label_columns | 每个值必须 ∈ columns[].name |
| freshness | 值必须 ∈ allowed tokens（或 'unknown'） |
| column_roles | key 必须 ∈ columns[].name，value ∈ {dimension, measure, attribute} |

guard 失败 → 该字段回退到确定性轮结果（不是整体失败）。

## 成功标准

| 指标 | 目标 |
|---|---|
| PK precision（K11） | B/C arm ≥ 95%（baseline ~90% by _id heuristic on K11） |
| PK recall（合成 PG） | B/C arm ≥ 80%（baseline 预期 ~30%——PG 不遵循 _id 规范） |
| role accuracy（K11） | B/C arm ≥ 90%（baseline ~75%——inferRole 不看 comment） |
| role accuracy（合成 PG） | B/C arm ≥ 80%（baseline 预期 ~40%——类型集不匹配） |
| dimension_refs precision（Level A/B/C） | 所有 arm ≥ 90% |
| dimension_refs recall（Level B vs A） | B 比 A 多发现 ≥ 10% 正确关系 |
| NL2SQL pass rate | 联合最优 arm ≥ 75%（当前 73.8%） |
| 单表推断延迟 | B arm ≤ 5s，C arm ≤ 10s |

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| LLM 推断不稳定（不同 run 结果不同） | 每个 arm 跑 3 次取 majority vote |
| 合成 PG 数据不代表真实场景 | 如有可能，找一个真实 PG schema 测 |
| Ground truth 标注成本高 | 人工只标 20 表校准；大规模用 LLM-as-judge |
| Phase 3 图迭代引入中间态一致性问题 | Stage 1 完成后快照图，Stage 2 在快照上操作 |
| 实验范围膨胀 | Phase 2 先跑；Phase 3 仅在 Phase 2 确认 LLM 推断可行后展开 |

## 实施顺序

```
Phase 1: Ground truth 建立（人工标注 20 表 + LLM-as-judge prompt 设计+校准）
  ↓
Phase 2: 推断准确率实验（Baseline → A → B → C，K11 + 合成 PG）
  ↓  仅在 H1 确认后
Phase 3: Enrichment-ontology 结合（Level A → B → C，K11 雪花模型）
  ↓
Phase 4: 端到端联合验证（最优 arm 组合 → NL2SQL eval）
```

## 关键文件

- `packages/data/semantic-layer/src/types.ts` — TableDefinitionSchema, kind/engine/freshness defaults
- `packages/data/semantic-layer/src/io.ts` — inferRole, generateTableYaml, generateDimYaml, syncWriteDefinitions
- `packages/data/semantic-layer/src/enrichment.ts` — discoverRelationsDeterministic, buildDimInventory, enrichAllDwsTables
- `packages/data/semantic-layer/src/registry.ts` — DataSourceRegistry, RelationGraph
- `packages/data/semantic-layer/src/kinds/table-kind.ts` — toPromptContext
- `packages/data/nl2sql-engine/src/prompt.ts` — buildPrompt, buildEvalPrompt
- `packages/eval/eval-cli/` — eval runner, compare.ts
