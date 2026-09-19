# Phase 1 — K11 完整迁移 + AI-Native Enrichment 实现

## 背景

semantic-layer map 的 Phase 0 已完成（G3 决策锁定）。现在执行 Phase 1。

**关键决策参考**：`wayfinder/semantic-layer/tickets/G3-ai-native-enrichment-design.md`

## 执行计划

### Step A：RBI K11 完整迁移

从 `/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer/10000251/` 完整迁移到 `examples/k11-semantic-layer/`。

**具体操作：**
1. 复制 `tables/` 目录全部 321 个 YAML（覆盖现有 10 个）
2. 复制 `events/` 目录全部 453 个事件 YAML（覆盖现有 12 个）
3. 复制 `domains.yaml`、`terminology.yaml`、`config.yaml`（覆盖）
4. 如有 `field_samples.yaml`，一并复制
5. 验证：运行 `k11-seed.spec.ts` 确认 smoke tests 仍通过（数量从 10t+12e 变为 321t+453e，测试可能需要更新断言数字）

**注意：** RBI 格式与 dsh-data-agent 的 `TableDefinitionSchema`/`EventDefinitionSchema` 兼容（已验证），直接复制即可。

### Step B：AI-Native Enrichment 实现

基于 G3 决策实现关系发现能力。

#### B1：Service 方法 — `discoverRelationsFor`

在 `packages/data/semantic-layer/src/` 中新增 `enrichment.ts`：

```typescript
// 核心函数签名
export async function discoverRelationsFor(
  targetDef: TableDefinition,
  dimInventory: Array<{ table_name: string; primary_key: string[]; description: string; columns: Column[] }>,
  llmCall: (prompt: string) => Promise<string>,
): Promise<DimensionRef[]>
```

**两轮策略：**
1. **确定性轮**：遍历 dimInventory 中有非空 primary_key 的 DIM 表，检查 targetDef.columns 是否包含与 PK 同名的列。匹配则直接产出 `DimensionRef`。
2. **LLM 轮**：将 targetDef（列清单 + description）+ 全部 DIM 清单（表名 + PK + description）组装为 prompt，让 LLM 输出 JSON 格式的 `DimensionRef[]`。

**输出格式（对齐现有 types.ts）：**
```typescript
interface DimensionRef {
  dim_table: string
  join_keys: Array<{ dws_column: string; dim_column: string }>
  derivation: string  // LLM 推理依据
}
```

#### B2：批量执行函数

```typescript
export async function enrichAllDwsTables(
  semanticLayer: string,
  llmCall: (prompt: string) => Promise<string>,
): Promise<{ enriched: number; errors: string[] }>
```

- 加载所有 DWS 表（`kind !== 'dim'`）
- 构建 DIM inventory（所有 `kind === 'dim'` 的表）
- 对每个 DWS 调用 `discoverRelationsFor`
- 将结果写入对应 YAML 的 `dimension_refs` 字段（使用现有 `writeTable`）

#### B3：On-write Hook 集成

在 `io.ts` 的 `writeTable` 流程后，或在 registry 层面，增加 enrichment 触发：
- 当一个新的 table definition 被写入时，如果它是 DWS（`kind !== 'dim'`），自动调用 `discoverRelationsFor`
- 如果它是 DIM 且有 primary_key，对所有可能匹配的 DWS 表重跑发现（确定性轮即可）

**注意：** on-write hook 需要 `llmCall` 依赖注入。设计为可选 — 没有挂载 LLM 时跳过 LLM 轮，只跑确定性匹配。

#### B4：Agent Tool

新增 tool（在 `packages/data/` 下合适位置）：
- Tool name: `discover_relations` 或 `enrich_semantic_layer`
- 输入：`{ scope?: string[], tables?: string[] }` — 可选范围限定
- 输出：enrichment 结果摘要
- LLM agent 可在 loop 中自主调用

#### B5：Metrics 机械提取

新增 `extractMetricsFromTables(semanticLayer: string): MetricDefinition[]`：
- 遍历所有表的 `metrics:` 块
- 每个 entry 生成独立 metric 实体：`{ name, expression, description, source_table, domains }`
- 写入 `metrics/` 目录（需要在 semantic-layer 目录结构中新增）
- 自动建立 `derived_from` 关系（metric → source_table）

#### B6：对 K11 跑一轮

1. 先跑 metrics 提取（确定性，秒级完成）
2. 再跑 162 DWS→DIM 关系发现（需要 LLM，每表一次调用）
3. 验证：检查生成的 dimension_refs 是否合理（抽样几个表人工确认）
4. 运行 RelationGraph 测试确认图构建正常

### 验收标准

- [ ] `examples/k11-semantic-layer/` 包含 321 tables + 453 events
- [ ] `k11-seed.spec.ts` 通过（更新断言数字）
- [ ] `enrichment.ts` 实现 `discoverRelationsFor` + `enrichAllDwsTables`
- [ ] metrics 提取生成 ~1000+ metric YAML 文件
- [ ] 162 DWS 表有 `dimension_refs` 声明（由 enrichment 填充）
- [ ] RelationGraph 能正确构建包含 join/derived_from 关系的图
- [ ] Agent tool `discover_relations` 可被 LLM 调用
- [ ] on-write hook 存在（新表写入后自动触发发现）
