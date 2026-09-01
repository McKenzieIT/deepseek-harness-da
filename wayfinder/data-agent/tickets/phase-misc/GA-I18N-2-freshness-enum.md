# GA-I18N-2 — freshness enum locale-neutral 迁移

**Type**: implementation  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GRILL2 D2](GA-GRILL2-i18n-architecture.md)
**Cross-ref**: [GA-GRILL3 D5](GA-GRILL3-tabledef-schema.md)（freshness 推断归 LLM enrichment，token 命名归本票）
**Size**: XS  ·  **Risk**: Low（preprocess 兼容旧值，零 big-bang）

## 问题

`types.ts:283` `freshness: z.enum(['静态参考', 'T+1', '']).default('')` — zod schema 的合法值包含中文字符串 `'静态参考'`。非中文环境无法写入/读取该值。

## 方案

Q+P 混合：

```ts
freshness: z.preprocess(
  (v) => v === '静态参考' ? 'static_reference' : v,
  z.enum(['static_reference', 'T+1', '']).default('')
)
```

- 新 enum 值：`'static_reference'` | `'T+1'` | `''`
- `.preprocess()` 把旧值 `'静态参考'` 映射为 `'static_reference'`（运行时永远只看到英文值）
- 下次 `writeTable` 写回时自动持久化为英文值（自然收敛）
- test fixture `dim_charm_info.yaml` 直接 sed 改为 `static_reference`

## 实测影响面

| 维度 | 数量 |
|------|------|
| 仓库内含 `静态参考` 的 YAML | 1 个（`tests/fixtures/dim_charm_info.yaml`） |
| 运行时读 `.freshness` 的代码 | 2 行（`tool-load-table-definition/src/index.ts:138,255`）——纯透传，无逻辑分支 |
| 基于 freshness 值做 if/switch 的代码 | 0 行 |

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/data/semantic-layer/src/types.ts:283` | freshness enum + preprocess |
| `packages/data/semantic-layer/tests/fixtures/dim_charm_info.yaml` | `freshness: 静态参考` → `freshness: static_reference` |
| `packages/data/semantic-layer/tests/` | 补充 preprocess 兼容性测试（旧值 `'静态参考'` parse 后得到 `'static_reference'`） |

## 验收标准

1. `TableDefinitionSchema.safeParse({ ..., freshness: '静态参考' })` → 成功，`result.data.freshness === 'static_reference'`
2. `TableDefinitionSchema.safeParse({ ..., freshness: 'static_reference' })` → 成功
3. `TableDefinitionSchema.safeParse({ ..., freshness: 'T+1' })` → 成功
4. `TableDefinitionSchema.safeParse({ ..., freshness: '' })` → 成功（default）
5. grep 确认仓库内无 `'静态参考'` 残留（除 preprocess 映射代码和本票/研究文档）
6. 现有测试全部通过
