# CL-4 — 补充 alias-dependent eval case

**Type**: task (HITL)
**Phase**: context-layer-alignment
**Status**: closed
**Assignee**: claude
**Blocked by**: 无
**Blocks**: [CL-5](CL5-retrieval-gradient-experiment.md)
**Related**: [CL-3](CL3-retrieval-strategy-experiment.md)（D6 毕业）、[W2](W2-case-set-port.md)（现有 80 k11-v2 case）

## Question

为检索策略覆盖率梯度实验补充 alias-dependent eval case——表名关键词无法直接 BM25 命中、必须通过别名/概念桥接才能检索到正确数据源的场景。

### 要求

1. **自然语言真实性**：必须是现实场景中用户真实会问的问题，不能是为实验硬造的非自然语言问题
2. **来源**：LLM 模拟 K11 业务角色（产品经理/运营/策划）生成候选 + 人工筛选
3. **标注完整性**：每个 case 必须标注 `covered_assets`（检索 ground truth）、`sql_complexity`、`query_intent`
4. **alias 依赖性**：case 的核心查询词在目标表的 table_name 中不出现，只能通过 alt_labels / concept 桥接

### 输出

- 补充的 case YAML 文件（格式与 k11-v2 一致）
- case 总数目标：待定（建议至少 30-50 个，覆盖主要业务域）

## Resolution

**40 个 alias-dependent eval case 已生成**，输出到 `packages/eval/eval/cases/k11-v2/k11v2_alias_001.yaml` 至 `k11v2_alias_040.yaml`。

### 方法论

1. **数据审计**：读取 321 tables + 10 concepts 的完整定义，分析 table_name、description、pref_label、alt_labels 字段
2. **别名可达性验证**：对 19 个候选 alias term 逐一检查是否出现在目标表的 corpus-indexed 字段中（description + table_comment + pref_label）
3. **分级标注**：
   - ★ **纯 alias-dependent**（9 terms）：term 在任何表的 description 中均不出现（氪金、白嫖、免费玩家、零氪、MAU、月活、回归、新注册、新增用户）
   - ◇ **表级 alias-dependent**（8 terms）：term 出现在部分表 description 中，但 NOT in 目标表的 corpus（充值→role_act_di、留存→role_act_di、ARPU/ARPPU→role_tag_df、回流/首充/首次充值→role_tag_df、日活→acc_act_di）
   - ⚠️ **已排除**：流失（出现在 role_tag_df description 中 "用户分层与流失预警"）、LTV（出现在 role_tag_df description 中 "付费 LTV 评估"）

### 覆盖统计

| 维度 | 分布 |
|------|------|
| 唯一 alias terms | 17 个（9 纯 + 8 表级） |
| 目标表 | 4 个（univ_role_act_di×23, univ_role_tag_df×16, com_pay_order_di×3, univ_acc_act_di×1） |
| SQL 复杂度 | L1:1, L2:25, L3:14 |
| 查询意图 | metric_lookup:12, comparison:11, trend:7, ranking:4, distribution:4, proportion:2 |
| 业务域 | 付费经济、用户生命周期、角色成长 |

### Case 分组

| Group | Alias term(s) | Cases | 类型 |
|-------|--------------|-------|------|
| 1 | 氪金 | 001–005 | ★ 纯 |
| 2 | 白嫖/免费玩家/零氪 | 006–011 | ★ 纯 |
| 3 | MAU/月活 | 012–015 | ★ 纯 |
| 4 | 回归 | 016–017 | ★ 纯 |
| 5 | 新注册/新增用户 | 018–021 | ★ 纯 |
| 6 | 回归/ARPPU/首充 | 022–024 | ◇ 表级（替换原流失 case） |
| 7 | ARPU/ARPPU | 025–027 | ◇ 表级 |
| 8 | 首充/首次充值 | 028–030 | ◇ 表级 |
| 9 | 回流 | 031–032 | ◇ 表级 |
| 10 | 留存 | 033–034 | ◇ 表级 |
| 11 | 充值 | 035 | ◇ 表级 |
| 12 | 日活 | 036 | ◇ 表级（仅 acc_act_di） |
| 13 | 交叉别名 | 037–040 | ★+◇ 组合（038/039 已修正排除流失/LTV） |

### 验证结果

- ✅ 40/40 case 的查询关键词不在目标表 corpus text 中（code review 后修正 5 case：022-024 替换流失→回归/ARPPU/首充，036 缩减为仅 acc_act_di，038/039 替换流失/LTV→回归/回流）
- ✅ 40/40 case schema 完整（case_id/input/expected/dimensions 全字段）
- ✅ 格式与现有 k11v2_001–080 一致
- ⚠️ 域覆盖限于付费经济/用户生命周期/角色成长（因仅 4 个 DWS 表有 alt_labels，均属这些域）
- ⚠️ concept bridging case 未单独生成（当前 10 concept 的 alt_labels 均为空，概念桥接通过 domain→related_to 走图扩展，需 CL-5 实验中作为 Level 3 策略独立验证）
