# 下一 Session：4 张 Frontier 票并行推进

> 4 张票互相无阻塞，可通过 subagent 并行执行。
> 唯一协调点：CL-16 和 CL-17 都需要跑 eval，**共享同一基线 run `10320fe2`（73.8%，168 cases）**，各自产出独立 run_id。
> 建议执行顺序：4 张同时启动；CL-16 和 CL-17 **各自独立跑 eval**，最后主 session 跑一次联合 eval 确认总体 pass_rate。

---

## Subagent 1: CL-16 — Reply 管道二次修复

```
你正在处理 wayfinder semantic-layer map 的 ticket CL-16（Reply 管道二次修复）。

## 目标

修复 eval 管道中 DELIVERY case 的 reply 提取问题，提升 DELIVERY 通过率至 85%+。

## 背景

当前 eval 基线：run `10320fe2`，overall 73.8%（124/168 cases，sql-judge 模式）。
8 个 DELIVERY case 失败，分三类：
- 类型 1（3 个）：agent 输出 tool calls 被当作最终回复（k11v2_019, voice_017, voice_042）
- 类型 2（4 个）：agent 对 DELIVERY 问题错误生成了 SQL（k11v2_075, 079, voice_043, voice_048）
- 类型 3（1 个）：空输出（k11v2_078）

## 行动项

1. 诊断 `packages/eval/eval-cli/src/context.ts` 中的 reply 提取逻辑：
   - 确认为何 tool calls 被当作最终回复
   - 修复：确保取 agent 最后一条纯文本消息（非 tool call）
   - 验证类型 1 的 3 个 case

2. 评估类型 2 的 4 个 case：
   - 读取 `packages/eval/eval/cases/k11-v2/` 中这些 case 的 expected.answer
   - 如果 agent 生成 SQL 实际合理 → 迁移为 EXEC
   - 如果拒绝/引导更合适 → 调整 expected.answer 使 judge 更宽容匹配

3. 诊断 k11v2_078 空输出

4. 用 eval-cli 跑全量 eval：
   ```bash
   cd packages/eval/eval-cli && npx tsx bin/run.ts --sql-judge
   ```
   用 compare.ts 对比基线 `10320fe2`：
   ```bash
   npx tsx bin/compare.ts <baseline_run_id> <new_run_id>
   ```

5. 将实验结果记录到 `wayfinder/semantic-layer/research/experiment-audit-log.md`，
   使用标准模板：Setup → Data（含 compare.ts 输出）→ Verdict → Ticket Pointer

## 关键文件

- reply 提取：`packages/eval/eval-cli/src/context.ts`
- judge prompt：`packages/eval/eval-runner-service/src/index.ts`
- DELIVERY cases：`packages/eval/eval/cases/k11-v2/`
- compare 工具：`packages/eval/eval-cli/bin/compare.ts`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`

## 验收

- DELIVERY 通过率 85%+
- 类型 1 的 3 个 case 修复
- 全量 eval + compare.ts + 实验日志记录
- 更新 ticket `wayfinder/semantic-layer/tickets/CL16-reply-pipeline-delivery-fix.md` 状态为 closed + 写 Resolution
```

---

## Subagent 2: CL-17 — 数据源缺口 enrichment 第二轮

```
你正在处理 wayfinder semantic-layer map 的 ticket CL-17（数据源缺口 enrichment 第二轮）。

## 目标

通过补充 alt_labels / pref_label / concept 定义，修复 ~10 个因检索缺口导致 agent refusal 的 EXEC case。目标 overall pass_rate ≥ 78%。

## 背景

当前 eval 基线：run `10320fe2`，overall 73.8%（124/168 cases，sql-judge 模式）。
CL-15 诊断出 24 个 agent refusal，其中 ~12 个可通过 enrichment 修复。

## 行动项

### 第一步：数据源检索缺口（7 个 case）

逐一检查以下 case 的目标表是否在语义层中、alt_labels 是否足够让 BM25 命中：

| Case | 问题关键词 | 可能目标表 |
|---|---|---|
| k11v2_027 | "金币总消耗" | `item_circle_df` |
| k11v2_029 | "全服平均等级" | 角色等级相关表 |
| k11v2_037 | "iOS/安卓付费对比" | `com_pay_order_di`（platform 字段） |
| k11v2_018 | "通关最终关卡" | `pve_progress_df` |
| k11v2_071 | "小队用户留存" | 社交/小队相关表 |
| voice_005 | "卡池出金率" | `gacha_result_statis_di` |
| voice_007 | "免费玩家比例" | `acc_summary_df` |

操作：
1. 在 `examples/k11-semantic-layer/tables/` 中找到对应表的 YAML
2. 检查 alt_labels、pref_label 是否覆盖了查询关键词
3. 补充 enrichment（直接编辑 YAML 文件）

### 第二步：概念缺口（5 个 case）

| Case | 缺失概念 |
|---|---|
| voice_026, voice_028 | 「大R」= 高付费用户 |
| alias_016, alias_022, alias_038 | 「回归」「回流」= 流失后复归玩家 |

操作：
1. 考虑在 `examples/k11-semantic-layer/concepts/` 新增 concept YAML（如 `heavy-spender.yaml`、`returning-player.yaml`）
2. 或在相关表（如 `acc_summary_df`）补充 alt_labels
3. concept YAML 格式参考现有文件（name/description/pref_label/alt_labels）

### 第三步：验证

1. 跑全量 eval：
   ```bash
   cd packages/eval/eval-cli && npx tsx bin/run.ts --sql-judge
   ```
2. 用 compare.ts 对比基线 `10320fe2`
3. 记录到实验日志

## ⚠️ 注意事项

- **不要修改 packages/ 下的代码**——这个 ticket 只做 YAML 数据 enrichment
- enrichment 时注意避免 CL-9 教训：generic 词汇（如"数据"、"统计"）会导致检索噪声
- 如果某表确实不在语义层中（K11 数据集无此表），记录为"数据源不可用"而非强行添加

## 关键文件

- 语义层定义：`examples/k11-semantic-layer/tables/`（DWS/DIM YAML）
- concepts：`examples/k11-semantic-layer/concepts/`
- eval cases：`packages/eval/eval/cases/k11-v2/`
- compare 工具：`packages/eval/eval-cli/bin/compare.ts`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`

## 验收

- 数据源缺口 7 case 中 ≥4 翻转为 correct
- 概念缺口 5 case 中 ≥2 翻转为 correct
- overall pass_rate ≥ 78%
- 全量 eval + compare.ts + 实验日志
- 更新 ticket `wayfinder/semantic-layer/tickets/CL17-data-source-enrichment-round2.md` 状态为 closed + Resolution
```

---

## Subagent 3: CL-18 Phase 2 — 确定性匹配算法加固

```
你正在处理 wayfinder semantic-layer map 的 ticket CL-18 Phase 2（确定性匹配算法加固）。

## 目标

给 `discoverRelationsDeterministic` 新增 `excludeColumns` 参数，防止分区列（如 ds/pt/dt）产生噪声 JOIN 关系。

## 背景

Phase 1 数据清理已完成（gacha_result_statis_di 清除 18 条噪声 refs）。
Phase 2 需要从算法层面防止此类问题复发。

根因：`discoverRelationsDeterministic` 对 DWS 表的列名和 DIM 表的 PK 做精确匹配，但未排除分区列 `ds`。K11 中 18 个 DIM 表将 `ds` 列声明在 primary_key 中，几乎所有 DWS 表都有 `ds` 列 → 误匹配。

## 行动项

### 1. Substrate 层（`packages/data/semantic-layer/src/enrichment.ts`）

给以下函数新增可选 `excludeColumns?: ReadonlySet<string>` 参数：

- `discoverRelationsDeterministic`：匹配时过滤 excludeColumns
  ```typescript
  const pks = (dim.primary_key ?? []).filter(pk =>
    colNames.has(pk) && !(excludeColumns?.has(pk))
  )
  ```
- `discoverEventRelationsDeterministic`：同上
- `discoverRelationsFor` / `discoverEventRelationsFor`：透传 excludeColumns

### 2. 调用层（Service / enrichAllDwsTables）

新增辅助函数：
```typescript
function buildExcludeColumns(def: TableDefinition): Set<string> {
  const partitionCols = (def.columns ?? [])
    .filter(c => c.role === 'partition')
    .map(c => c.name)
  return partitionCols.length > 0
    ? new Set(partitionCols)
    : new Set(['ds', 'pt', 'dt'])  // fallback blocklist
}
```

在 `enrichAllDwsTables` / `enrichAllEvents` 调用 `discoverRelationsFor` 时传入：
```typescript
const excludeColumns = buildExcludeColumns(targetDef)
discoverRelationsFor(targetDef, dimInventory, excludeColumns)
```

### 3. 测试

在 `packages/data/semantic-layer/tests/` 新增测试（或扩展现有 enrichment 测试）：

- ds-only 匹配 + excludeColumns 包含 ds → 跳过（零 refs）
- 混合匹配（business_key + ds）+ excludeColumns 包含 ds → 保留 business_key
- 无 excludeColumns（向后兼容）→ 行为不变（回归测试）
- role=partition 驱动 vs fallback blocklist 两条路径

### 4. 验证

跑全量测试：
```bash
cd packages/data/semantic-layer && npx vitest run
```

确认现有测试不 break + 新测试全绿。

## 关键文件

- enrichment 算法：`packages/data/semantic-layer/src/enrichment.ts`
- 类型定义：`packages/data/semantic-layer/src/types.ts`
- 现有测试：`packages/data/semantic-layer/tests/`
- K11 表定义（验证用）：`examples/k11-semantic-layer/tables/`

## 验收

- `excludeColumns` 参数已实现并在调用层传入
- 新增 ≥3 个测试 case
- 现有 semantic-layer tests 全绿
- 更新 ticket `wayfinder/semantic-layer/tickets/CL18-ds-noise-join-fix.md` 状态为 closed + Resolution
```

---

## Subagent 4: V1 — 审计 structured delta

```
你正在处理 wayfinder semantic-layer map 的 ticket V1（审计 structured delta）。

## 目标

让 `edit_definition` 工具在每次写入时计算 before/after 的结构化差异（StructuredDelta），持久化到审计记录中。

## 背景

来自 G6 决策（eval-driven 版本治理）。管理 agent 的③自驱循环需要知道"上次改了什么"来决定下一步行动。当前审计日志只存 payload 的 SHA-256 hash（不存内容），definition_snapshot 存完整 YAML 快照。缺少的是：两者之间的结构化差异。

## 行动项

### 1. 实现 computeStructuredDelta 函数

新建或在现有模块中实现：

```typescript
interface StructuredDelta {
  added: Record<string, unknown>
  modified: Record<string, { from: unknown; to: unknown }>
  removed: string[]
}

function computeStructuredDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): StructuredDelta
```

注意嵌套结构的处理：
- `columns`：按 `name` 字段做 key，对比新增/删除/修改的列
- `dimension_refs`：按 `dim_table` 字段做 key
- `domains` / `alt_labels`：集合语义（Set diff：added = after - before, removed = before - after）
- 其他顶层字段：直接对比

### 2. 在 edit_definition 写入路径中调用

找到 `packages/data/tool-edit-definition/src/index.ts` 中的写入逻辑。
当前流程：read before → apply patch → write after → recordSnapshot(before) → recordTier2Write。

在 recordSnapshot 之后、recordTier2Write 之前（或之中），计算 delta 并存储。

### 3. 审计存储扩展

选择存储方式（按现有架构判断最合适的）：
- 方案 A：扩展 `recordTier2Write` 增加 `delta` 字段（推荐——与现有写入事件关联）
- 方案 B：新增 `recordDelta` 方法存到独立表

审计存储在 `packages/data/audit/src/`。检查 SQLite schema，选择最简方式扩展。

### 4. 查询接口

确保 delta 可被查询——后续 V2（eval changeset）需要读取 since-last-run 的所有 delta。

至少提供：
```typescript
store.listDeltasSince(timestamp: string): Array<{
  asset_name: string
  kind: string
  timestamp: string
  delta: StructuredDelta
}>
```

### 5. 测试

- 单字段修改 → delta.modified 正确
- 新增 alt_labels → delta.added 包含 alt_labels
- 删除 domain → delta.removed 包含 domain
- columns 新增一列 → delta.added.columns 包含新列
- 嵌套修改（columns 中某列的 description 变更）→ 正确反映
- 空变更（patch 无实际变化）→ delta 全空

## 关键文件

- edit_definition tool：`packages/data/tool-edit-definition/src/index.ts`
- audit store：`packages/data/audit/src/`（schema.ts / store.ts / index.ts）
- revert_edit tool（参考 snapshot 用法）：`packages/data/tool-revert-edit/src/index.ts`
- semantic-layer types：`packages/data/semantic-layer/src/types.ts`

## 验收

- edit_definition 每次写入后审计记录含 structured delta
- delta 准确（覆盖顶层字段 + columns/dimension_refs/domains/alt_labels 嵌套）
- 可通过 store 查询 since-timestamp 的 delta 列表
- 现有 audit tests + 新增 delta tests 全绿
- 更新 ticket `wayfinder/semantic-layer/tickets/V1-audit-structured-delta.md` 状态为 closed + Resolution
```

---

## 协调说明

| 项目 | 说明 |
|------|------|
| **Eval 基线** | CL-16 和 CL-17 共享基线 run `10320fe2`（73.8%）。各自独立跑 eval 产出新 run_id |
| **实验日志** | CL-16 和 CL-17 各自追加到 `experiment-audit-log.md`，注意避免写冲突（如果并行写同一文件，建议 CL-16 先完成记录） |
| **代码交集** | CL-17（YAML 数据）与 V1（edit_definition 代码）轻微交集——CL-17 只编辑 YAML 文件不改代码，V1 只改代码不动 YAML，无冲突 |
| **联合验证** | 4 个 subagent 完成后，主 session 跑一次联合全量 eval 确认总体 pass_rate |
