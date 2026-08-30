# Session Prompt: CL-11 ~ CL-14 sql-judge 质量提升

## 上下文

CL-10 完成了 voice eval case 扩展（48 cases）并建立了 sql-judge 模式的基线：

```
sql-judge 基线（Run 9788424c，2026-08-30）：
  Original 80: 56 pass / 24 wrong = 70.0%
  Alias 40:    32 pass / 8 wrong  = 80.0%
  Voice EXEC:  22 pass / 12 wrong = 64.7%
  Voice DELIVERY: 1 pass / 13 wrong = 7.1%
  Total 168:   111 pass / 57 wrong = 66.1%
```

57 个 wrong 分为两大类：
- **44 个 SQL semantic judge 判负**（execution_match=false）：真实 SQL 语义问题
- **13 个 DELIVERY judge 判负**（delivery_match=false）：judge 校准问题，agent 回复质量实际很高

## 本 session 目标

推进 CL-11 ~ CL-14 四个 frontier tickets（无阻塞依赖，可并行），将 sql-judge 模式下的 pass_rate 从 66.1% 提升至 75%+。

## 推荐执行顺序

### 1. CL-14 数据源缺口盘点（最高 ROI，先做）

**为什么先做**：7 个 voice EXEC 失败（"Input is not SQL"）是 agent 找不到数据源。其中 5 个表实际存在（pvp_card_statistics_di, univ_role_gacha_result_statis_di, pve_progress_df 等），问题在于 alt_labels/description 不足以让 BM25 命中。补充 enrichment 是最快的 fix。

**具体步骤**：
1. 读 `eval-results/9788424c-*.json`，提取 voice_003, 005, 008, 030, 034 的 agent 诊断日志
2. 对每个 case 跑 search_data_sources 确认 topK 候选是否包含目标表
3. 如果目标表不在 topK → 查看该表的 alt_labels，补充缺失的别名
4. voice_017（缺情感字段）和 voice_020（缺版本号）→ 迁移为 DELIVERY case
5. 重跑 sql-judge eval 验证

**涉及文件**：
- `examples/k11-semantic-layer/tables/dws_10000251_pvp_card_statistics_di.yaml` — 补充 alt_labels
- `examples/k11-semantic-layer/tables/dws_10000251_univ_role_gacha_result_statis_di.yaml`
- `packages/eval/eval/cases/k11-v2/k11v2_voice_017.yaml` — 迁移为 DELIVERY
- `packages/eval/eval/cases/k11-v2/k11v2_voice_020.yaml` — 迁移为 DELIVERY

### 2. CL-11 DELIVERY judge 校准（解锁 13 个 case）

**为什么第二做**：一旦校准，13 个 DELIVERY cases 有望从 wrong→pass，pass_rate 直接 +7.7pp。

**具体步骤**：
1. 读 `packages/eval/eval/src/judge.ts` 和 `packages/eval/eval/src/delivery.ts`，理解当前 llm_judge 的 prompt 和评分逻辑
2. 方案 C 最轻量（改 case 的 expected.answer 写法为评估标准描述）— 先试
3. 如果 C 不够 → 方案 A（调整 judge prompt，明确 DELIVERY 评估维度）
4. 重跑 eval 验证 14 个 DELIVERY cases

### 3. CL-12 SQL judge 基线回归修复（最大批量提升）

**为什么第三做**：24 个 original + 8 个 alias 的 SQL 语义问题需要逐 case 分析，工作量最大但提升空间也最大。

**具体步骤**：
1. 从 `eval-results/9788424c-*.json` 提取 32 个失败 case 的 `sql_judge.rationale` 和 `sql_judge.dimensions`
2. 按失败模式聚类
3. 识别 top 失败模式，评估修复路径（引擎 prompt / 定义描述 / case 修正）
4. 实施 top-1 修复，重跑 eval 验证

### 4. CL-13 Compound query join 完整性（可选，依赖 CL-12 分析）

**具体步骤**：
1. 对 voice_029, 030, 032 重现检索 + SQL 生成过程
2. 确认是检索问题还是 LLM prompt 问题
3. 根据 CL-12 的根因分析选择修复路径

## 重要文件位置

- eval 结果: `eval-results/9788424c-a167-4a19-9c72-e27ae7455f58.json`
- eval-cli: `packages/eval/eval-cli/src/main.ts`
- eval case schema: `packages/eval/eval/src/eval_case.ts`
- judge: `packages/eval/eval/src/judge.ts`
- delivery match: `packages/eval/eval/src/delivery.ts`
- match modes: `packages/eval/eval/src/match_modes.ts`
- 语义层定义: `examples/k11-semantic-layer/tables/`
- voice cases: `packages/eval/eval/cases/k11-v2/k11v2_voice_*.yaml`
- NL2SQL 引擎: `packages/data/nl2sql-engine/`
- wayfinder map: `wayfinder/semantic-layer/map.md`
- 实验日志: `wayfinder/semantic-layer/research/experiment-audit-log.md`

## 运行 eval 命令

```bash
# sql-judge 模式（标准）
DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}') \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 --pass-k 1 --concurrency 4 --skip-health-gate

# smoke test（仅语法检查）
# 同上但加 --no-sql-judge
```

## 质量目标

| 指标 | CL-10 基线 | 本 session 目标 |
|------|-----------|----------------|
| Overall | 66.1% | **75%+** |
| Original | 70.0% | **80%+** |
| Voice EXEC | 64.7% | **75%+** |
| Voice DELIVERY | 7.1% | **70%+** |
