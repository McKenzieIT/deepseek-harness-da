# G1b-infra — Eval 基础设施 Bug 修复 + execution_match 根因诊断

**Type**: task
**Phase**: misc
**Status**: resolved (2026-08-26)
**Assignee**: resolved

## Question

修复 G1b Config C 批量跑中发现的 3 个基础设施 bug，使 eval pipeline 能可靠完成全矩阵跑。

## Resolution

### 已修复的 Bug

1. **`checkResultMatch` value-only 匹配** (`packages/eval/eval-runner/src/runner.ts`)
   - 旧：精确 key-value 匹配，列别名不同即失败
   - 新：value-only 1:1 消耗匹配 + string↔number 类型转容
   - 测试：22/22 runner spec 通过

2. **思考模型 reasoning_content array** (`packages/llm/llm-dashscope/src/translate.ts` + `types.ts`)
   - 旧：`reasoning_content` 只处理 string
   - 新：同时支持 `string | WireContentPart[]`（与 content 对齐）

3. **思考模型 SQL 提取** (`packages/eval/eval-cli/src/context.ts`)
   - 旧：textContent 非空即返回（思考模型把 SQL 放 reasoning，text 放对话回复）
   - 新：`looksLikeSql()` 检测 text 是否为 SQL；非 SQL 时从 reasoning 提取 fenced SQL
   - 空响应不再 throw，改为 graceful degrade + console.warn

4. **进程退出挂起** (`packages/eval/eval-cli/bin/eval.ts`)
   - 旧：main().catch 无 exit → sidecar 子进程保持 event loop
   - 新：`setTimeout(() => process.exit(0), 100)` 确保退出

5. **缺失依赖** (`packages/eval/eval-cli/package.json`)
   - 添加 `@deepseek-ai/dsh-tool-search-data-sources: workspace:^`

### 关键发现：execution_match=0% 的真正根因

**不是 `checkResultMatch` 的问题**——SQL 根本没被生成。

诊断链：
1. sidecar 整次跑 0% CPU → 没有 ODPS 查询提交
2. [DIAG] 日志显示 `generated_sql` 是中文分析文本，不是 SQL
3. 思考模型把 SQL 放 reasoning、text 是对话回复 → 修复 #3 解决了提取问题
4. 但更深层：**BM25 检索找不到正确的表**
   - "查询acc summary的总量" → top-5 全是无关表（homeland_fish, starup...）
   - 目标表 `dws_10000251_acc_summary_df` 在 corpus（4682 条）中但 BM25 排名过低
   - 模型拿到错误 schema context → 无法生成有意义的 SQL → 输出分析/拒绝文本

### 结论

- Bug #2/#3/#4/#5 是真正的代码缺陷，已修复
- Bug #1 (checkResultMatch) 逻辑正确但触达不到——上游 BM25 检索质量是 execution_match=0% 的真正瓶颈
- execution_match 要 >0%，需要新 ticket 解决检索召回率

### 跑出的结果（修复后）

| Model | pass_rate | correct | wrong | execution_match T/F |
|-------|-----------|---------|-------|-------------------|
| qwen3.5-flash | 0% | 0/30 | 30 | 0/90 |
| qwen3.6-plus | 0% | 0/30 | 30 | 0/90 |
| qwen3.7-max | 0% | 0/30 | 30 | 0/90 |

结果在 `eval-results/g1b/g1b-configC-{model}.json`。
