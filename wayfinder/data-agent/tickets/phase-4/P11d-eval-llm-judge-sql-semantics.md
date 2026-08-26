# P11d — Eval: 引入 LLM Judge 验证 SQL 语义正确性

**Type**: prototype
**Phase**: 4
**Status**: open
**Blocked by**: P11c（resolved 2026-08-25）

## 背景

当前 eval runner 在无 executor 时采用 SQL-only 模式——只要 agent 生成了 SQL 即判 pass。
这导致 pass rate 虚高（99.4%），无法检测"生成了 SQL 但语义错误"的情况，例如：
- 选错表（BM25 召回了错误的候选表）
- WHERE 条件不匹配时间范围（"昨天"→ ds 条件错误）
- 聚合方式错误（"有多少"应该是 COUNT 但生成了 SUM）
- JOIN 关系错误（多表关联时 key 不对）

## 目标

在不依赖 MaxCompute 真实执行的前提下，验证生成 SQL 的语义正确性。

## 方案

引入 LLM-as-Judge，给 Judge LLM 提供：
1. 用户问题（自然语言）
2. 候选表 schema（含字段语义描述）
3. 生成的 SQL

Judge 从以下维度打分（每项 0/1，总分 0-1）：
- **表选择**：是否选择了正确的表？
- **字段选择**：SELECT 的字段是否匹配用户意图？
- **过滤条件**：WHERE/HAVING 是否正确表达了用户的约束（时间、维度等）？
- **聚合逻辑**：GROUP BY / 聚合函数是否匹配"总量/趋势/分布"等意图？
- **整体语义**：SQL 执行结果能否回答用户的问题？

## 实现路径

1. 在 `packages/eval/eval-runner/src/types.ts` 扩展 `JudgeExecutor` 或新增 `SqlSemanticJudge` 接口
2. 在 `runner.ts` 的 `executeAttempt` 中：当无 executor 但有 generated_sql 时，调用 judge 而非直接 pass
3. Judge prompt 设计（需要 few-shot calibration）
4. 新增 CLI flag `--judge-mode sql-semantic`（区别于现有的 delivery judge）

## 验收标准

- 161 case 中能识别出 SQL 语义错误的 case（预期 pass rate 从 99.4% 下降到 60-80%）
- Judge 判定与人工抽检一致率 >85%
- 不依赖外部基础设施（纯 LLM 调用）

## 备选/远期

- Golden SQL 对比（每 case 附标准 SQL，AST diff 或 LLM 等价判定）
- 真实执行验证（接入 MaxCompute，需解决空表 + expected values 校准）
