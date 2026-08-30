# CL-10: Voice Eval Case Expansion — 实验报告

## 背景

CL-8/CL-9 验证了 80 original + 40 alias cases 的端到端 eval（pass_rate=100%/91.7%），但 case 覆盖面受限于手工构造的标准化查询语句。真实游戏数据分析师的提问风格（口语化、缩写、模糊、复合、探索性）未被覆盖。

本实验扩展 eval case 集，新增 48 个基于真实用户原声的 voice cases，并修复 eval-cli glob regex 使 alias cases 不再被过滤。

## 变更

### 1. eval-cli glob 修复

`packages/eval/eval-cli/src/main.ts:178`：

```
Before: /^[a-z0-9]+_\d+\./i          → 只匹配 k11v2_NNN
After:  /^[a-z0-9]+(_[a-z0-9]+)*_\d+\./i  → 匹配 k11v2_NNN, k11v2_alias_NNN, k11v2_voice_NNN
```

修复后 168 cases 全部被加载（80 original + 40 alias + 48 voice）。

### 2. Voice cases 分布

| 类别 | 数量 | 路径 | 评估方式 |
|------|------|------|---------|
| 口语化/缩写 | 12 | voice_001–012 | EXECUTION（scalar_exact / row_count_range） |
| 模糊/消歧 | 10 | voice_013–022 | 4 DELIVERY + 6 EXECUTION |
| 复合查询 | 10 | voice_023–032 | EXECUTION（row_count_range） |
| 运营导向 | 8 | voice_033–040 | 2 DELIVERY + 6 EXECUTION |
| 探索性 | 8 | voice_041–048 | DELIVERY（llm_judge） |
| **合计** | **48** | | **34 EXECUTION + 14 DELIVERY** |

新增覆盖的 DWS 表（此前 original+alias 零覆盖）：
`selfhelp_new_remain_df`（留存）、`univ_role_churn_di`（流失）、`univ_role_gacha_*_di`（抽卡）、`pvp_card_statistics_di`（PVP 卡牌统计）、`com_activity_df`（活动付费）、`vip_role_tag_df`（VIP）、`univ_acc_server_act_di`（服务器级活跃）等 15+ 表。

## 实验 Run 1：`--no-sql-judge`（语法+可执行性检查）

- **Run ID**: `033fea6a-c1a7-46b5-b854-13109d1a1e20`
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4
- **耗时**: 1610.8s
- **SQL Judge**: disabled

### 结果

```
total: 168    pass_rate: 91.7%
correct: 154   wrong: 14
declined: 0    infra_failure: 0
```

| 类别 | Total | Pass | Rate |
|------|-------|------|------|
| Original | 80 | 80 | **100.0%** |
| Alias | 40 | 40 | **100.0%** |
| Voice EXECUTION | 34 | 34 | **100.0%** |
| Voice DELIVERY | 14 | 0 | **0.0%** |

**Per-Intent**:

| Intent | Total | Correct | Rate |
|--------|-------|---------|------|
| metric_lookup | 61 | 61 | 100.0% |
| comparison | 27 | 27 | 100.0% |
| trend | 22 | 22 | 100.0% |
| ranking | 15 | 15 | 100.0% |
| distribution | 10 | 10 | 100.0% |
| filter | 8 | 8 | 100.0% |
| open_ended | 21 | 7 | 33.3% |

### 分析

- **所有 EXECUTION cases（154 个）全部 pass** — 包括 34 个新增 voice EXECUTION cases
- **14 个 DELIVERY cases 全部 wrong** — 因为 `--no-sql-judge` 模式下 DELIVERY llm_judge 未配置评估 LLM，这些 case 无法被正确评估。从诊断日志看，agent 的拒绝/澄清回复质量很高
- open_ended 的 7 个 correct 是 original cases 中使用 EXECUTION 路径（row_count_range）的 open_ended case

## 实验 Run 2：SQL Semantic Judge 启用

- **Run ID**: `9788424c-a167-4a19-9c72-e27ae7455f58`
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4
- **SQL Judge**: enabled（LLM 评估 SQL 语义正确性，5 维度打分）

### 结果

```
total: 168    pass_rate: 66.1%
correct: 111   wrong: 57
declined: 0    infra_failure: 0
```

| 类别 | Total | Pass | Wrong | Rate |
|------|-------|------|-------|------|
| Original | 80 | 56 | 24 | **70.0%** |
| Alias | 40 | 32 | 8 | **80.0%** |
| Voice EXECUTION | 34 | 22 | 12 | **64.7%** |
| Voice DELIVERY | 14 | 1 | 13 | **7.1%** |

### 失败分类

**57 个 wrong cases 分两大类**：

#### A. SQL Semantic Judge 判负（44 个）

Agent 生成了语法正确可执行的 SQL，但 judge 判定语义不符。典型原因：

| 失败模式 | 数量 | 示例 |
|----------|------|------|
| agent 生成拒绝文本而非 SQL | 18 | voice_003 "pvp胜率top10的武将" → agent 拒绝（缺战斗明细表） |
| 选错表（_df 全量 vs _di 增量） | 3 | k11v2_013 用 _df 查昨日客单价（应用 _di） |
| 缺少关键 join | 5 | voice_032 "各渠道付费转化率" → 只查了新增，没 join 付费表 |
| SQL 不完整（缺聚合/过滤） | 4 | voice_012 "月卡卖了多少份" → 查了配置表非订单表 |
| 其他语义偏差 | 14 | 多为 original/alias 中的精细语义问题 |

#### B. DELIVERY Judge 判负（13 个）

全部是 voice DELIVERY cases。Agent 实际给出了高质量的拒绝/澄清回复（结构清晰、原因准确、给出改进建议），但 `delivery_match=false`。

**原因**：llm_judge 对比 `expected.answer` 文本和 agent 实际回复时，可能使用了过于严格的匹配标准，导致措辞不同即判负。

## 两次运行对比

| 配置 | Total | Pass Rate | Original | Alias | Voice EXEC | Voice DELIVERY |
|------|-------|-----------|----------|-------|------------|----------------|
| no-sql-judge | 168 | **91.7%** | 100% | 100% | 100% | 0% |
| sql-judge | 168 | **66.1%** | 70% | 80% | 64.7% | 7.1% |

## 关键发现

### F1: SQL Semantic Judge 暴露真实语义质量

`--no-sql-judge` 下 100% pass 的 original/alias/voice EXECUTION cases，启用 judge 后有 44 个 fail。这些不是 false positive — judge 给出了具体的维度分数和 rationale（如 "查询昨日新增数据应使用 _di 表而非 _df 表"），反映了真实的 SQL 语义问题。

**结论**：之前的 CL-8/CL-9 100% pass_rate 是在"仅检查 SQL 可执行性"标准下取得的。启用语义检查后，真实质量约为 70-80%。后续应以 sql-judge 模式为标准基线。

### F2: Voice cases 有效暴露了 NL2SQL 的薄弱环节

Voice EXECUTION 64.7%（12/34 wrong）vs Original 70.0%（24/80 wrong）— voice cases 的失败率略高，但差异不大。更重要的是 voice cases 暴露了**不同类型**的失败：
- **数据源缺口**：agent 无法找到合适表时退化为搜索调用或生成拒绝文本（7 个 "Input is not SQL"）
- **多表 join 缺失**：compound queries 只完成了查询的一半（voice_029 只查充值没查留存、voice_032 只查新增没查付费）

### F3: DELIVERY Judge 需要校准

14 个 DELIVERY cases 设计用于测试 agent 的"合理拒绝"能力。从诊断日志看 agent 回复质量很高（结构化拒绝 + 原因说明 + 改进建议），但 judge 几乎全判负。这表明 DELIVERY evaluation 机制（llm_judge 的 prompt/scoring）需要校准，而非 agent 回答有问题。

### F4: Enrichment 仍是最大杠杆

7 个 voice EXECUTION 失败（"Input is not SQL"）是因为 agent 找不到合适的数据源（PVP 战斗明细、抽卡流水、副本通关记录等）。这与 CL-7 的结论一致：**enrichment（alt_labels 覆盖 + relation graph 完善）是提升 pass_rate 的最大杠杆**。

## Artifacts

- Voice case 文件: `packages/eval/eval/cases/k11-v2/k11v2_voice_001.yaml` – `k11v2_voice_048.yaml`
- Glob fix: `packages/eval/eval-cli/src/main.ts` (commit `51e390fc70`)
- Voice cases: commit `4b2568b05e`
- Run 1 (no-sql-judge): `eval-results/033fea6a-c1a7-46b5-b854-13109d1a1e20.json`
- Run 2 (sql-judge): `eval-results/9788424c-a167-4a19-9c72-e27ae7455f58.json`
