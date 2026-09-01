# GA-I18N-R1 — trend 检测 recall 提升（突破 85% 天花板）

**Type**: research/implementation  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GRILL2 D3](GA-GRILL2-i18n-architecture.md)
**Depends on**: [GA-I18N-3](GA-I18N-3-trend-pattern-bilingual.md)（先上双语正则基线）
**Size**: M  ·  **Risk**: Medium（可能涉及管道改造）

## 问题

K11-v2 实测，当前 `TREND_PATTERN` 正则对中文 trend 查询 recall 仅 85%（17/20），天花板来自隐式趋势表达：

| 漏掉的 query | 为什么漏 |
|--------------|----------|
| "最近三个月的MAU分别是多少" | "分别"暗示逐期拆分=趋势，无显式关键词 |
| "上周DAU掉了没" | "掉了"（下降的口语说法）不在词表 |
| "新区开服第几天留存掉得最快" | "掉得最快"同理 |

正则方法的根本限制：无法覆盖隐式/口语化趋势表达。加词表只能渐进改善，不能根治。

## 候选方案（待实验验证）

### U — UNDERSTANDING 阶段结构化 intent 输出

模型在 UNDERSTANDING 阶段输出结构化 intent 标签（`{ trend: boolean }`），下游直接读字段。

- **优点**：LLM 天然理解语义 intent，语言无关，recall 理论上接近 100%
- **缺点**：需要穿透 phase-gate state → engine.generate 管道（4 层），为一个布尔值过度
- **前提**：UNDERSTANDING 输出需要支持结构化字段提取

### T — 独立 LLM intent 分类（lightweight call）

单独调一次 LLM 判断 trend intent（类似 expand-query 的 soft-probe 模式）。

- **优点**：不需要改 phase-gate 管道
- **缺点**：额外延迟 + 成本；非确定性

### S+ — 扩词表 + 启发式增强

扩展正则词表（加"掉"/"降"/"分别"/"对比"等），同时加时序结构启发式（"每天/每周/每月 + 量词"→ trend）。

- **优点**：确定性，零额外成本
- **缺点**：仍有天花板（更高但仍非 100%）；维护负担线性增长

## 建议

先上 GA-I18N-3（双语正则基线），再用 K11-v2 + 新增英文 eval case 建立端到端 eval pipeline，以 recall/precision/F1 + 最终 SQL 正确率为指标对比 S+/T/U 的实际效果。

## 实验设计（草案）

1. **S+ 基线**：扩词表至覆盖 K11-v2 全部 20 个 trend case，测 non-trend precision 是否劣化
2. **T 实验**：用 qwen-flash（同 expand-query）做 intent 分类，比较 latency / recall / 最终 SQL 正确率
3. **U 评估**：评估 phase-gate 管道改造的工程成本 vs recall 收益

**度量**：`_di` 表出现在最终 SQL 的 FROM 中的比率（trend case only）——这是 trend 检测影响最终答案质量的直接指标。
