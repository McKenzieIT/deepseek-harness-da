# CL-18 — ds 噪声关联修复 + 确定性匹配算法加固

**Type**: bugfix
**Status**: In Progress
**Blocked by**: —

## Question

`discoverRelationsDeterministic`（`enrichment.ts:42-58`）的列名精确匹配算法未排除分区列，导致 DWS 表与仅因 `ds`（业务日期分区）同名而匹配的 DIM 表之间产生无意义的 JOIN 关系。

## Root Cause

### 算法缺陷

```typescript
// enrichment.ts — discoverRelationsDeterministic
const colNames = new Set((targetDef.columns ?? []).map(c => c.name))
for (const dim of dimInventory) {
  const pks = (dim.primary_key ?? []).filter(pk => colNames.has(pk))
  if (pks.length === 0) continue
  refs.push(...)  // ← 只要任一 PK 列名命中，就建 JOIN
}
```

K11 中 18 个 DIM 表将 `ds` 列声明在 `primary_key` 中（`_arch` 归档快照表需 ds 保证唯一性）。几乎所有 DWS 表都有 `ds` 列 → 算法将这些 DIM 全部匹配上。

### 为什么只有 gacha_result_statis_di 暴露问题

T1 原始 enrichment 用 subagent workflow 直接产出 refs 并通过 tsx 脚本 `writeTable()` 写入，**绕过了 `discoverRelationsFor` 标准管线**——subagent 足够聪明，不产出 ds-only 噪声。

后续 session 对 `gacha_result_statis_di` 重新运行了标准 `discover_relations` 代码路径，确定性轮产出 18 个 ds-only 匹配 + LLM 轮补充了 5 个有效业务 refs → `mergeRefs` 保留两者 → 23 条 refs（18 噪声 + 5 有效）。

### 判定

**实现缺陷**，非原始票（G3）设计缺陷。G3 用 `foo_id ↔ foo_id` 示例暗示面向业务 ID，但未显式要求排除分区列——设计有盲区（fog），实现忠实复现了盲区。

## Resolution — Phase 1: 数据清理 ✅

清理 `dws_10000251_univ_role_gacha_result_statis_di.yaml`：

| 修复项 | 前 | 后 |
|--------|-----|-----|
| `dimension_refs` | 23 条（18 含 ds 噪声） | **5 条**（全部有效业务关联） |
| `alt_labels` | 36 条（7 条指令性文本污染） | **29 条**（纯搜索别名） |
| `description` | 550 字符（含注入的白名单/警告段落） | **166 字符**（干净业务描述） |
| Schema 验证 | — | **PASSED** |

### 另一 session 降级方案的问题

另一 session（llm-dashscope）因 `edit_definition` 不支持删除 `dimension_refs` 条目（`mergeByName` 按 `dim_table` 浅合并，只增改不删），采用了"语义降级"——将 derivation 改写为"噪声关联(勿用)"。该方案有三个严重问题：

1. **derivation 标注无实际约束力**：`RelationGraph`、P3 join constraint 注入、NL2SQL 引擎不解析 derivation 文本
2. **`alt_labels` 被严重污染**：将指令性文本（如 `"仅使用以下5个"`、`"card_pool_id AS STRING"`）塞入搜索别名，破坏 BM25 检索
3. **"唯一快照就是带噪声的状态"判断错误**：T1 原始种子是干净的，噪声是该 session 自己引入的

## Resolution — Phase 2: 算法加固（待实现）

### 推荐方案：`excludeColumns` 参数 + 调用层元数据驱动

**设计原则**：`discoverRelationsDeterministic` 是通用 substrate 函数，不应假设所有数据集都有 `role` 标注。过滤策略应由**调用层**根据可用元数据注入，substrate 只提供过滤接口。

**接口变更**：

```typescript
export function discoverRelationsDeterministic(
  targetDef: TableDefinition,
  dimInventory: readonly DimInventoryEntry[],
  excludeColumns?: ReadonlySet<string>,  // ← 新增：调用层计算的排除列集合
): DimensionRef[]
```

匹配逻辑改为：
```typescript
const pks = (dim.primary_key ?? []).filter(pk =>
  colNames.has(pk) && !(excludeColumns?.has(pk))
)
```

**调用层策略分层**（Service / enrichAllDwsTables）：

| 数据质量 | 策略 | 排除列来源 |
|----------|------|-----------|
| 有 `role` 标注 | **首选**：从 DWS 列中提取 `role: partition` 的列名 | `targetDef.columns.filter(c => c.role === 'partition').map(c => c.name)` |
| 无 `role` 标注 | **兜底**：最小 blocklist | `new Set(['ds', 'pt', 'dt'])` |

**K11 数据验证**：

| 数据点 | 值 |
|--------|-----|
| K11 表有 role 标注覆盖率 | 321/321（100%） |
| ds 标为 `role: partition` | 198/224 表（88.4%） |
| 18 个 ds-in-PK 的 DIM 中，ds 为 partition | 17/18 |
| 唯一例外 | `autobi_conf2_od`（PK=[ds], ds role=dimension）→ 交给 LLM 轮 |

**优势**：

- **substrate 通用性不受损**：`discoverRelationsDeterministic` 不依赖任何特定元数据格式
- 数据驱动（有 role 时），硬编码最小化（无 role 时仅 3 个分区列名）
- 不误杀高频有效 FK（`server_id` 26.8% 出现率但 role=dimension → 不在排除集中）
- 非 LLM 依赖，确定性 O(1)

### 代码变更（待实现）

**substrate 层**（`packages/data/semantic-layer/src/enrichment.ts`）：

1. `discoverRelationsDeterministic`：新增可选 `excludeColumns?: ReadonlySet<string>` 参数
2. `discoverEventRelationsDeterministic`：同上
3. `discoverRelationsFor` / `discoverEventRelationsFor`：透传 `excludeColumns`
4. `enrichAllDwsTables` / `enrichAllEvents`：新增可选 `excludeColumns` 参数或 `excludeColumnsFn`（per-table 计算排除集）

**调用层**（Service / bundle）：

5. `buildExcludeColumns(def: TableDefinition): Set<string>`：从列 `role: partition` 提取；无 role 时回退到 `DEFAULT_PARTITION_BLOCKLIST`
6. `enrichAllDwsTables` 调用时传入

**测试**：

7. ds-only 匹配 + excludeColumns 包含 ds → 跳过
8. 混合匹配（business_key + ds）+ excludeColumns 包含 ds → 保留 business_key
9. 无 excludeColumns（向后兼容）→ 行为不变
