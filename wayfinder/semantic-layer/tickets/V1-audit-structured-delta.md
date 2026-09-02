# V1 — 审计 structured delta

**Type**: task (AFK)
**Phase**: post-G6
**Status**: closed
**Assignee**: claude
**Blocked by**: 无
**Related**: G6（D4 决策）、W6e（edit_definition）、audit store

## Question

`edit_definition` 写入时计算 before/after 结构化差异（added/modified/removed），持久化到审计记录。

### 需求

1. 在 `edit_definition` 的写入路径中，利用已有的 before snapshot 和 after 状态，计算 structured delta：
   ```ts
   interface StructuredDelta {
     added: Record<string, unknown>      // 新增的顶层字段或嵌套项
     modified: Record<string, { from: unknown; to: unknown }>  // 变更的字段
     removed: string[]                   // 删除的字段
   }
   ```
2. 将 delta 存入审计记录（audit store 新增字段或扩展现有 `recordTier2Write`）
3. 覆盖所有 definition kind（table / event / metric / concept）
4. delta 计算须处理嵌套结构：`columns`（按 name key）、`dimension_refs`（按 dim_table key）、`domains`/`alt_labels`（集合语义）

### 验收标准

- edit_definition 每次写入后，审计记录中可查询到对应的 structured delta
- delta 准确反映实际变更（新增/修改/删除）
- 现有 audit 测试 + 新增 delta 测试全绿

## Resolution

### 存储方案：Option A（扩展现有 `recordTier2Write`）

选择 Option A：在 `recordTier2Write` 的 opts 上新增可选 `delta` / `asset_name` / `kind` 字段，与写入事件 co-located 在同一行 `audit_event` 记录中（存入 `extra` payload，随 payload JSON 持久化）。理由：

1. **零 schema 变更**：`audit_event.payload` 是 TEXT 列，`extra` 是其 JSON 体内的 catch-all，新增字段无需 ALTER TABLE 或迁移版本（`AUDIT_SCHEMA_VERSION` 保持 2）。Option B（新表 + `recordDelta` 方法）会引入第二个 SQLite 表 + 外键 + 迁移路径，对一个结构化 diff 字段而言过度。
2. **co-located with the write event**：delta 与 `tool_name='edit_definition'` 写入事件在同一行，`listDeltasSince` 一条 SQL 即可查出（`json_extract(payload, '$.delta')`），无需 JOIN。
3. **payload body 仍然 hash 不存明文**：`payload_hash` 不变；delta 是结构化差异（field-level from/to），不是 full payload body，与 intranet-security-first 一致。

### 实现文件

| 文件 | 变更 |
|------|------|
| `packages/data/audit/src/delta.ts` | **新建**：`StructuredDelta` 接口 + `computeStructuredDelta(before, after)` 纯函数 + `DeltaEntry` 查询返回类型 |
| `packages/data/audit/src/index.ts` | 导出 delta 模块；`Tier2WriteOpts` 新增 `delta`/`asset_name`/`kind` 可选字段；`recordTier2Write` 将它们写入 `extra` |
| `packages/data/audit/src/store.ts` | `SQLiteAuditStore.listDeltasSince(timestamp)` — 查询 `tool_write` tag + `tool_name='edit_definition'` + `delta IS NOT NULL` + `ts >= timestamp`，oldest-first |
| `packages/data/tool-edit-definition/src/index.ts` | 导入 `computeStructuredDelta`；写入成功后对所有 kind（table/event/concept）计算 delta（剥离 `confirmation` 噪声）并调用 `recordTier2Write` 持久化 |
| `packages/data/audit/tests/delta.spec.ts` | **新建**：20 个测试覆盖全部 6 个 ticket 场景 + `listDeltasSince` 集成 + `recordTier2Write` 端到端 |

### delta 计算语义

- **`columns`**：按 `name` key；`added.columns` = `{ [name]: fullRecord }`；`modified.columns` = `{ from: { [name]: old }, to: { [name]: new } }`；`removed` 收 `"columns.<name>"`。
- **`dimension_refs`**：按 `dim_table` key，同 columns 语义。
- **`domains` / `alt_labels`**：集合语义；`added[key]` = 新增成员数组；`removed` 收 `"key.member"` 点路径；不变则完全省略。
- **其他顶层字段**：直接 `{ from, to }`。
- **空 patch** → 三个集合全空。
- **`confirmation` 字段剥离**：edit_definition 对 table/event 自动翻转 confirmation.status 为 'unreviewed'（G4 Q5），这是噪声而非语义变更，计算 delta 前从 before/after 中剔除。

### 写入路径

edit_definition 的 execute 函数在写入成功后：
1. 从 `before` 和 `merged` 中解构掉 `confirmation`
2. 调用 `computeStructuredDelta(beforeForDelta, afterForDelta)`
3. 调用 `audit.recordTier2Write('edit_definition', { asset_name, patch }, { delta, asset_name, kind })`

对 table kind，这会在同一写入产生两条 tier-2 记录：substrate 级的 `update_table_meta`（hash，D5 不可关）+ tool 级的 `edit_definition`（携带 delta）。`listDeltasSince` 按 `tool_name='edit_definition'` + `delta IS NOT NULL` 过滤，不会误读 substrate 行。

### 测试结果

| 测试套件 | 通过/总数 |
|----------|-----------|
| `packages/data/audit/tests/delta.spec.ts`（新增） | 20/20 |
| `packages/data/audit/tests/audit.spec.ts`（现有） | 18/18 |
| `packages/data/tool-edit-definition/tests/*.spec.ts`（现有） | 33/33 |
| `packages/data/semantic-layer/tests/`（现有，Tier2Recorder 兼容性） | 240/240 |
| `packages/data/tool-revert-edit/tests/`（现有） | 6/6 |

全部绿色。无 eval 运行（V1 不触发 eval），无需 `experiment-audit-log.md` 条目。
