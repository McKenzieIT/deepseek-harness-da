# G1b-retrieval — BM25 检索召回率修复

**Type**: task
**Phase**: misc
**Status**: resolved (2026-08-27)
**Assignee**: resolved

## Question

修复 BM25 检索对 eval case 集的召回率，使 NL2SQL engine 能找到正确的表并生成有效 SQL，从而让 execution_match 能被测量。

## Resolution

### 修复内容（commits 9f2f650b50, ab20048c81, 8a7789c749）

**7 个 infra bug 修复 + 1 个 SQL 质量改进**，将 execution_match 从 0% 提升到 7.5%（6/80）：

| # | Bug | 文件 | 效果 |
|---|-----|------|------|
| 1 | BM25 tokenizer 不拆分下划线标识符 | `bm25-linking.ts` | Recall@5 0%→86.7%（321表 corpus） |
| 2 | match_modes.ts 格式与 eval cases 不兼容 | `match_modes.ts` | 结果比较不再永远失败 |
| 3 | Engine `completed` vs `done` 状态不匹配 | `engine.ts` | SQL 执行成功不再被误判为 decline |
| 4 | 4682 条大 corpus 名称匹配失效 | `bm25-linking.ts` | 全 corpus 扫描 + 连续匹配 bonus |
| 5 | CtxQueryExecutor 同样的 `completed` vs `done` | `context.ts` | eval re-execution 不再失败 |
| 6 | Runner 自己的 checkResultMatch 忽略 match_mode | `runner.ts` | row_count_range 终于能 pass |
| 7 | Prompt 无 today 参数 + SQL GETDATE() 运行时函数 | `prompt.ts` + `engine.ts` | SQL 用字面日期，趋势查询能返回数据 |

### BM25 修复细节

1. **下划线拆分**：`dws_10000251_acc_summary_df` → sub-tokens `dws`, `10000251`, `acc`, `summary`, `df`
2. **Hybrid name-match bonus**：BM25 分数 + 表名覆盖率加分（NAME_MATCH_BONUS=15）
3. **2-char 前缀匹配**：查询 "ch" 匹配 "churn"，"re" 匹配 "relation"
4. **全 corpus 名称扫描**：独立于 BM25 top-50 的第二通道，确保高覆盖率表不被遗漏
5. **连续匹配 bonus**：`role_account` 在 `role_account_inner`（连续）得分高于在 `game_role_..._account_uv`（散落）

### SQL 后处理

`postProcessSql(sql, today)`:
- 剥离 inline reasoning 注释（`-- Wait, DATEDIFF returns...`）
- 替换 `GETDATE()` → 字面日期
- 替换 `DATEADD(GETDATE(), -N, 'dd')` → 计算后的字面日期

### 最终结果

**k11-v2 eval set（80 cases）× qwen3.7-max × today=20260729**:

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| delivery_match | 0% (全 decline) | **100%** (80/80) |
| execution_match | 0% | **7.5%** (6/80) |
| declined | 80/80 | **0** |
| pass_rate | 0% | **7.5%** |

通过的 cases：k11v2_033, k11v2_042, k11v2_048, k11v2_050, k11v2_073, k11v2_079（全部 `row_count_range` 类型）。

### 发现：eval case set 整理

| 路径 | 数量 | 状态 |
|------|------|------|
| `packages/eval/eval/cases/k11/` | 161 | 低质量（占位 expected, 不自然问题），建议归档 |
| `packages/eval/eval/cases/k11-v2/` | 80 | **标准 eval set**（自然中文问题，合理 expected） |
| `eval-results/g1b-30cases/` | 30 | k11 子集，无独立价值，建议删除 |

归档票：[G1b-eval-set-cleanup](./G1b-eval-set-cleanup.md)

### 剩余 execution_match 失败原因

74/80 cases 仍失败，分类：
- **scalar_exact 占位值**（37 cases）：expected 如 `{total_pay_amt: 1500000}` 为估计值，真实 ODPS 数据不匹配
- **日期范围无数据**（~20 cases）：`today=20260729` 附近部分表无数据产出
- **SQL 质量**（~15 cases）：错误表选择、错误聚合粒度、错误 JOIN

### 提升 pass_rate 的下一步

1. **pass_k=3** — 多次尝试，预期 ~15-20%
2. **Prompt 方言强化** — 更多 MaxCompute 日期/分区/函数示例
3. **回填 scalar_exact expected values** — 用真实 ODPS 查询结果替换占位符

## 相关文件

- BM25 Linker: `packages/data/nl2sql-engine/src/bm25-linking.ts`
- Engine: `packages/data/nl2sql-engine/src/engine.ts`
- Prompt: `packages/data/nl2sql-engine/src/prompt.ts`
- Match modes: `packages/eval/eval/src/match_modes.ts`
- Runner: `packages/eval/eval-runner/src/runner.ts`
- Eval CLI context: `packages/eval/eval-cli/src/context.ts`
- 结果: `eval-results/g1b/g1b-k11v2-postfix.json`
