# GA-I18N-3 — TREND_PATTERN 中英双语

**Type**: implementation  ·  **Phase**: misc  ·  **Status**: Resolved
**Parent**: [GA-GRILL2 D3](GA-GRILL2-i18n-architecture.md)
**Size**: S  ·  **Risk**: Low（additive 正则分支，soft prefer 影响）

## 问题

`granularity.ts:13` `TREND_PATTERN` 纯中文正则——英文趋势查询（"What's the DAU trend?"）不触发 `_di` 表加权和 rule 9 注入。

## 实测基线（K11-v2 金标集）

| 指标 | 当前值 | 备注 |
|------|--------|------|
| Trend case 数 | 20/168 | query_intent=trend |
| 中文 Recall | 17/20 = 85.0% | 漏：隐式趋势表达（"分别是多少"/"掉了没"/"掉得最快"） |
| 中文 Precision | 140/148 = 94.6% | 误判：时间范围词在非趋势语境（"近7天…是多少"） |
| 英文 Recall | 0% | 无英文关键词 |

## 方案

扩展为多语言正则数组：

```ts
const TREND_PATTERNS: RegExp[] = [
  /趋势|变化|逐日|每天|近\d+天|日均|环比|同比|每周|每月|增长|下降|走势/,
  /trend|change|daily|weekly|monthly|growth|decline|over\s+time|week[\s-]over[\s-]week|month[\s-]over[\s-]month/i,
]

export function detectTrendIntent(question: string): boolean {
  return TREND_PATTERNS.some(p => p.test(question))
}
```

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/data/nl2sql-engine/src/granularity.ts` | `TREND_PATTERN` → `TREND_PATTERNS` 数组，`detectTrendIntent` 改为 `.some()` |
| `packages/data/nl2sql-engine/tests/ontology-enrichment.spec.ts` | 新增英文 trend 查询测试用例 + 英文 non-trend 负例 |

## 验收标准

1. 现有 14 个中文正例全部通过（无回归）
2. 现有 3 个中文负例全部通过（无回归）
3. 新增英文正例通过：`"DAU trend over the past week"` → true，`"monthly revenue growth"` → true，`"week-over-week change"` → true
4. 新增英文负例通过：`"What is yesterday's DAU?"` → false，`"How many VIP users?"` → false
5. 现有测试全部通过

## Resolution

- `TREND_PATTERN` (single regex) renamed to `TREND_PATTERNS` (array of two RegExp).
- Chinese regex preserved as-is (first element); English regex added as second element with `/i` flag.
- `detectTrendIntent` updated to `TREND_PATTERNS.some(p => p.test(question))`.
- `TREND_PATTERN` was module-private (not exported), so no import sites needed updating.
- 11 new English test cases added (8 positive, 3 negative); all 40 tests pass, zero regressions.

## 不做

- 中文 recall 提升（85%→更高）——见 [GA-I18N-R1](GA-I18N-R1-trend-recall-improvement.md)
- 英文 precision 调优——先上线再观测，soft prefer 影响低
