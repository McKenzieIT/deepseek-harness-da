# V2 — eval run changeset 标注

**Type**: task (AFK)
**Phase**: post-G6
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [V1](V1-audit-structured-delta.md)
**Related**: G6（D2 γ 决策）、W3（eval evidence engine）、W6a（goal-eval-policy）

## Question

eval run 记录携带 since-last-run changeset 元数据，建立变更→eval 的因果链。

### 需求

1. eval run 触发时（W3 `runBatch` 或 W6a 周期触发），查询审计记录获取 since-last-run 的所有定义变更
2. 将 changeset 作为元数据写入 eval run 的 JSONL 记录：
   ```ts
   interface EvalRunChangeset {
     since_run_id: string | null          // 上次 eval run id（首次为 null）
     changes: Array<{
       asset_name: string
       kind: string
       snapshot_version: number
       delta: StructuredDelta              // 来自 V1
       timestamp: string
     }>
   }
   ```
3. `computeDelta`（W4 beforeAfterDelta）结果与 changeset 可关联查看——"这些变更导致了这些 case 翻转"
4. evidence-query 层暴露 changeset 查询能力（通过 EvalResultStore）

### 验收标准

- eval run JSONL 记录中包含 changeset 元数据
- changeset 准确反映 since-last-run 的所有定义变更
- evidence-query 可查询某次 run 的 changeset
- 现有 eval tests + 新增 changeset tests 全绿
