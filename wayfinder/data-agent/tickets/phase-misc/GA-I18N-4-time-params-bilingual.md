# GA-I18N-4 — extractTimeParams 中英双语

**Type**: implementation  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GRILL2 D4](GA-GRILL2-i18n-architecture.md)
**Size**: S  ·  **Risk**: Low（additive 关键词分支，hint-quality 影响）

## 问题

`metric-engine.ts:97` `extractTimeParams` 只识别中文日期词（昨天/今天/前天/上周/本月）——英文 "yesterday"、"last week" 等不被识别，导致 Level 2 metric context 的 WHERE hint 缺失。

## 方案

重构为 keyword→handler 映射数组，中英双语：

```ts
const TIME_RULES: Array<{ pattern: RegExp; extract: (base: Date) => TimeParams }> = [
  { pattern: /昨天|昨日|yesterday/i,              extract: b => ({ date: shift(b, -1) }) },
  { pattern: /前天|day before yesterday/i,         extract: b => ({ date: shift(b, -2) }) },
  { pattern: /今天|今日|today/i,                   extract: b => ({ date: fmt(b) }) },
  { pattern: /上周|上一周|last week/i,             extract: b => lastWeekRange(b) },
  { pattern: /本月|当月|this month/i,              extract: b => thisMonthRange(b) },
]

export function extractTimeParams(question: string, today: string): TimeParams {
  // ... date parsing ...
  for (const rule of TIME_RULES) {
    if (rule.pattern.test(question)) return rule.extract(base)
  }
  // explicit date patterns (YYYY-MM-DD / YYYYMMDD) — language-neutral, 不变
  // ...
  return {}
}
```

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/data/nl2sql-engine/src/metric-engine.ts` | `extractTimeParams` 重构为 `TIME_RULES` 映射数组 |
| `packages/data/nl2sql-engine/tests/` | 新增英文日期词测试用例 |

## 验收标准

1. 现有中文测试用例全部通过（昨天/前天/今天/上周/本月 + 显式日期）
2. 新增英文用例通过：`"yesterday's DAU"` → shift(-1)，`"last week revenue"` → 上周一至周日，`"this month"` → 本月1日至今天
3. 语言无关的显式日期格式（YYYY-MM-DD / YYYYMMDD）不受影响
4. 无匹配时返回 `{}` 不变
5. 现有测试全部通过
