---
type: task
status: open
blocked_by: []
---

# CL-14: 数据源缺口盘点与 enrichment

## Question

CL-10 中 7 个 voice EXECUTION cases 失败因为 agent 找不到合适的数据源，退化为拒绝文本（SQL judge 报 "Input is not SQL"）。需要逐 case 盘点：哪些是语义层缺定义（可补充），哪些是业务数据本身不存在（case 需修正）。

## 具体内容

### 失败 cases（7 个 "Input is not SQL"）

| case_id | question | agent 拒绝理由 | 数据存在？ |
|---------|----------|---------------|-----------|
| voice_003 | pvp胜率top10的武将 | 缺 PVP 单局战斗明细表，现有表仅有角色粒度 | ⚠️ 有 pvp_card_statistics_di 但 agent 没用 |
| voice_005 | 这把卡池出金率多少 | 缺抽卡流水明细表 | ⚠️ 有 univ_role_gacha_result_statis_di |
| voice_008 | 新服前三天充值流水多少 | agent 调用了 search 但没生成 SQL | ⚠️ 可用 com_pay_order_df + server_info |
| voice_017 | 玩家反馈怎么样 | 缺情感分类字段 | △ public_sentiment_df 有互动数据但无情感标签 |
| voice_020 | 新版本上线后玩家接受度怎么样 | 缺版本号字段 | △ 确实缺版本信息 |
| voice_030 | 副本通关率和玩家等级有没有关系 | agent 用了 tool 调用而非 SQL | ⚠️ 有 pve_progress_df |
| voice_034 | 哪些武将需要调平衡 | 缺战斗结算事实表 | ⚠️ 有 pvp_card_statistics_di |

### 分类

- **⚠️ 数据存在但 agent 未命中**（5 个）：voice_003, 005, 008, 030, 034 — 检索/enrichment 问题
- **△ 数据确实部分缺失**（2 个）：voice_017（缺情感字段）, voice_020（缺版本字段）

### 行动项

1. **对 5 个 ⚠️ cases**：检查这些表的 alt_labels 和 description 是否足以让 BM25 命中。若不足 → 补充 enrichment
2. **对 2 个 △ cases**：修正 case expected — 改为 DELIVERY（llm_judge）路径，期望 agent 合理拒绝
3. 补充 enrichment 后重跑 eval 验证

### 验收标准

- 5 个 ⚠️ cases 中至少 4 个修复为 pass（通过 enrichment 使 agent 找到正确表）
- 2 个 △ cases 迁移为 DELIVERY cases 并通过 llm_judge 校准后的标准
