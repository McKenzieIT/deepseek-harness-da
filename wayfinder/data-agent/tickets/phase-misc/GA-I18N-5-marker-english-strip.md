# GA-I18N-5 — 内部控制标记英文化 + 呈现层 strip

**Type**: implementation  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GRILL2 D5](GA-GRILL2-i18n-architecture.md)
**Size**: S  ·  **Risk**: Medium（prompt + gate + eval 三处同步改）

## 问题

`domain.ts:47` 内部控制标记 `DECOMPOSITION_MARKER='【拆解】'`、`INCOMPLETE_MARKER='【未完成】'` 使用中文内容。`ROUTE_MARKER_REGEX` 已是英文内容（proceed/clarify/decline）。不一致，且中文内容容易被误认为"需要本地化"的文案。目前无呈现层 strip 逻辑——如果标记意外泄漏到用户界面，用户会看到原始中文 token。

## 方案

### Part A：标记英文化

```ts
export const DECOMPOSITION_MARKER = '【decompose】'
export const INCOMPLETE_MARKER = '【incomplete】'
// ROUTE_MARKER_REGEX 不变（已是英文）
```

同步更新 `phase-gate.ts` 中引用这些标记的 prompt 文本（UNDERSTANDING / INTERPRETATION phase instructions）。

### Part B：呈现层 strip

在 phase-gate 的 turn output 传递给 presentation 层之前，strip 所有内部控制 token：

```ts
const INTERNAL_MARKER_RE = /【(?:decompose|incomplete|route:[a-z]+)】/g
function stripInternalMarkers(text: string): string {
  return text.replace(INTERNAL_MARKER_RE, '').trim()
}
```

注意：**不 strip 用户可见的 delivery 标记**（【发现】/【注意】）——这些归 Kind 1（项目级 i18n）处理，跟随整体语言切换。

## 改动文件

| 文件 | 改动 |
|------|------|
| `packages/data/phase-gate/src/domain.ts` | `DECOMPOSITION_MARKER` / `INCOMPLETE_MARKER` 值改为英文 |
| `packages/data/phase-gate/src/phase-gate.ts` | prompt 文本中引用标记的地方同步更新；`interpretGate` / `routeGate` 不需改（它们引用 domain.ts 常量，常量变了自动跟）；加 `stripInternalMarkers` 在 output 传递给 presentation 之前 |
| `packages/eval/eval-cli/src/harness-responder.ts` | 行 59 的 `INCOMPLETE_MARKER` 硬编码值 `'【未完成】'` → 改为从 phase-gate 导入，或同步更新为 `'【incomplete】'` |
| `packages/data/phase-gate/tests/` | 更新现有 marker 相关测试用例 |

## 验收标准

1. `extractRoute('...【route:proceed】...')` → `'proceed'`（不变）
2. `interpretGate` 检测 `'【incomplete】'` → `GateResult.fail`
3. UNDERSTANDING prompt 包含 `【decompose】` 而非 `【拆解】`
4. `stripInternalMarkers` 清除所有内部标记，保留 delivery 标记
5. `harness-responder.ts` 的 decline 检测正常工作
6. grep 确认 `'【拆解】'` 和 `'【未完成】'` 无功能性残留（研究文档/注释除外）
7. 现有测试全部通过

## 不做

- 用户可见的 delivery 标记（【发现】/【注意】）的语言切换——归 Kind 1（prompt 模板化 + 项目级 i18n）
- strip 逻辑的可配置化——当前硬编码白名单足够
