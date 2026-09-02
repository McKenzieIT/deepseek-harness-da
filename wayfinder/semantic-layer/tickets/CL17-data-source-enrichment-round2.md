---
type: task
status: closed
blocked_by: []
---

# CL-17: 数据源缺口 enrichment 第二轮

## Question

CL-15 分析的 44 wrong cases 中有 ~10 个 EXEC refusal 是因为 agent 找不到正确数据源。需要逐一分析缺口并通过 enrichment 修复。

## 背景

CL-14 做了第一轮数据源缺口修复（4 表 alt_labels 扩充），翻转了 voice_003/008/030。CL-15 诊断的 24 个 agent refusal 中，以下为 enrichment 可修复的候选：

### 数据源检索缺口（enrichment 可修复）

| Case | 问题 | 缺口分析 |
|---|---|---|
| k11v2_027 | "昨天金币的总消耗量" | 需要 `item_circle_df`，agent 找到了 dim 表而非事实表。BM25 排序信号不够强 |
| k11v2_029 | "全服平均等级" | 需要角色等级表，可能需要检查 `role_tag_basic_df` 或其他表的字段 |
| k11v2_037 | "iOS和安卓平台的付费人数对比" | 需要渠道/平台维度，检查 `com_pay_order_di` 是否有 platform 字段 |
| k11v2_018 | "通关最终关卡的角色有多少" | 需要 PVE 进度表，`pve_progress_df` 已有 enrichment 但 agent 仍找不到 |
| k11v2_071 | "加入小队的用户和未加入的用户留存率对比" | 需要小队/社交相关表 |
| k11v2_voice_005 | "这把卡池出金率多少" | 需要抽卡结果表 `gacha_result_statis_di` |
| k11v2_voice_007 | "免费玩家占多大比例" | 需要付费状态标记，检查 `acc_summary_df` |

### 概念缺口（需要 concept 或 alt_labels 扩充）

| Case | 问题 | 缺口分析 |
|---|---|---|
| k11v2_voice_026 | "各服大R占比和活跃人数有没有关联" | 「大R」无定义 → 需要 concept 或付费分层 alt_label |
| k11v2_voice_028 | "流失用户里面大R有多少" | 同上，「大R」概念缺失 |
| k11v2_alias_016 | "回归玩家中重新付费的转化率" | 「回归」「回流」定义缺失 |
| k11v2_alias_022 | "回归玩家各渠道来源的分布" | 同上 |
| k11v2_alias_038 | "零氪用户和氪金用户的回归率差异" | 「回归」+ 付费分层 |

### 多表 join 限制（非 enrichment 可修复，记录但不处理）

| Case | 问题 | 说明 |
|---|---|---|
| k11v2_058 | "高付费用户和普通用户的平均在线时长对比" | 需要付费表 + 在线时长表 join |
| k11v2_062 | "付费前后用户在线时长的变化对比" | 需要时序 join |
| k11v2_064 | "通关第10章的角色与未通关角色的付费差异" | 需要 PVE + 付费 join |
| k11v2_066 | "最近一周新注册用户中，有多少进入了PVP" | 需要注册 + PVP join |
| k11v2_067 | "VIP用户和非VIP用户的古战场通关率对比" | 需要 VIP 标记 + 古战场 join |
| k11v2_070 | "拥有5张以上满级卡牌的角色的PVP胜率" | 需要卡牌 + PVP join |

## 行动项

1. **逐表检查数据源检索缺口**（7 个 case）：
   - 确认目标表是否在语义层中
   - 检查 alt_labels / pref_label 是否足够让 BM25 检索命中
   - 补充 enrichment（alt_labels / dimension_refs / pref_label）

2. **概念缺口处理**（5 个 case）：
   - 评估是否需要新增 concept YAML（如「大R」「回归玩家」）
   - 或在相关表上补充 alt_labels（如 `acc_summary_df` 加 "大R"/"高付费" alias）

3. **跑全量 eval 验证**，用 `compare.ts` 对比 CL-15 基线

4. **记录实验结果到 experiment-audit-log.md**

## 验收标准

- 数据源检索缺口 7 个 case 中至少 4 个翻转为 correct
- 概念缺口 5 个 case 中至少 2 个翻转为 correct
- 全量 eval run 记录到实验日志
- overall pass_rate ≥ 78%

## 关键文件

- 语义层定义：`examples/k11-semantic-layer/tables/`
- concepts：`examples/k11-semantic-layer/concepts/`
- enrichment 工具：`packages/data/tool-discover-alt-labels/`
- eval cases：`packages/eval/eval/cases/k11-v2/`
- compare 工具：`packages/eval/eval-cli/bin/compare.ts`
- 实验日志：`wayfinder/semantic-layer/research/experiment-audit-log.md`

---

## Partial Resolution (2026-09-02) — enrichment 已尽，78% 需 trim/概念formula/迁移

**Enrichment 杠杆已尽**：08-31 已 enrich（`付费经济` concept 大R/高付费/零氪/免费玩家；`用户生命周期` 回归/回流；`univ_role_tag_df` 等 6 表）。本 run `32dd9532`（dup 清理后）overall 70.8% < 78%；Alias 62.5%（-15pp，归因 LLM 非确定性 + dup 清理 BM25 非中性待查）。

**ticket 前提（"add more alt_labels"）经 live eval 证伪**——labels 已在，概念 case（`voice_026`/`028`/`alias_022`/`038` 大R/回归）仍拒。真正剩余杠杆（皆非 enrichment）：
1. **trim over-enriched 表**：`univ_role_tag_df` 12 alt_labels（应 ≤6 targeted；ARPU/ARPPU/流失/LTV/首充/首次充值 generic 稀释 BM25——CL-9 教训）。08-31 日志称 "trimmed to 6" 但文件实有 12-14 → 未完全落地。
2. **概念 formula/定义**：大R 阈值（`pay_amt_std >= X`）/回归 标识字段（`is_return`/`react`）——agent 不知用 `pay_amt_std` 定义大R（live: `voice_026`/`028` 有时发明 `pay_amt_std>=1000`/`100000` 阈值，非确定性）。
3. **迁移真不可答 EXEC-refusal→DELIVERY**：`018`（PVE 最终关卡）/`071`（小队）/`058`/`064`/`066`/`070`（多表/缺字段）——拒绝质量高，DELIVERY judge 可打高分（CL-12/14/15 先例）。

**已做**：dup 清理（`univ_role_tag_df` 去重 回归/回流，正确 hygiene；BM25 效应单 run 无法区分于非确定性，flag 待查）。

**未做（超出 CL-17 enrichment 范围）**：上述 3 杠杆 = trim/概念formula/迁移，属不同 ticket scope（case-curation 像 CL-12/14/15；概念 schema 像 CL-2；agent 行为另开）。

**状态**：**关闭-部分**（2026-09-02 用户决策）。enrichment done；78% deferred——trim/概念formula/迁移→CL-21。

**实验记录**：[experiment-audit-log.md](../research/experiment-audit-log.md)（2026-09-02 联合全量 eval）。
