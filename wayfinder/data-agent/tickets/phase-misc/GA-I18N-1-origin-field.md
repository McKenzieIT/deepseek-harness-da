# GA-I18N-1 — DimensionRef `origin` 字段（derivation 覆盖逻辑去中文前缀）

**Type**: implementation  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GRILL2 D1](GA-GRILL2-i18n-architecture.md)
**Size**: S  ·  **Risk**: Low（additive optional field，零迁移）

## 问题

`enrichment.ts:118` `mergeRefs` 用 `ex.derivation.startsWith('确定性')` 判断一条 DimensionRef 是否可被 LLM derivation 覆盖。中文前缀承载逻辑——改 derivation 文案静默破坏覆盖行为。

## 方案

在 `DimensionRefSchema`（types.ts）加结构化字段：

```ts
origin: z.enum(['deterministic', 'llm', 'manual']).optional()
```

- `'deterministic'`：`discoverRelationsDeterministic` / `discoverEventRelationsDeterministic` 生成
- `'llm'`：LLM round（`parseLlmRefs`）生成
- `'manual'`：人工 curated
- `undefined`（legacy YAML 缺字段）→ 当 `'manual'` 处理（安全默认，不被自动覆盖）

`mergeRefs` 覆盖优先级改为基于 `origin`：
- `origin === 'deterministic'` → 可被 `'llm'` / `'manual'` 覆盖
- `origin === 'llm'` → 可被 `'manual'` 覆盖
- `undefined` / `'manual'` → 不被覆盖

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/data/semantic-layer/src/types.ts` | `DimensionRefSchema` 加 `origin` 字段 |
| `packages/data/semantic-layer/src/enrichment.ts` | `mergeRefs` 覆盖逻辑改为基于 `origin`；`discoverRelationsDeterministic` / `discoverEventRelationsDeterministic` 写入 `origin: 'deterministic'`；`parseLlmRefs` 结果标记 `origin: 'llm'` |
| `packages/data/semantic-layer/tests/` | 现有 mergeRefs 测试更新 + 新增 origin 字段测试 |

## 验收标准

1. `DimensionRefSchema.safeParse` 接受含 `origin` 字段的 ref（三个枚举值均 pass）
2. `DimensionRefSchema.safeParse` 接受不含 `origin` 字段的 ref（backward compat）
3. `mergeRefs` 在 `origin='deterministic'` 时 LLM derivation 覆盖成功
4. `mergeRefs` 在 `origin=undefined`（legacy）时 LLM derivation 不覆盖
5. 删除 `startsWith('确定性')` 判断，grep 确认无残留
6. 现有测试全部通过

## 不做

- 批量迁移现存 YAML 文件加 `origin` 字段（lazy migration，自然写回时带上）
- alt_labels 的 origin 追踪（同模式，但 alt_labels 目前无覆盖逻辑，不急）
