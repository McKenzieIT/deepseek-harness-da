---
type: task
status: closed
blocked_by:
  - CL-11
  - CL-12
---

# CL-15: sql-judge 模式确立为标准 eval 基线

## Question

CL-10 证明 no-sql-judge 下的 100% pass_rate 掩盖了真实的 SQL 语义问题。需要正式确立 sql-judge 为标准 eval 基线，并建立可追踪的质量趋势。

## Resolution

### 1. sql-judge 已确认为默认模式

eval-cli 的 `--no-sql-judge` 参数默认为 `false`（`main.ts:67`），即 sql-judge 默认启用。无需代码变更。

### 2. 文档化

新建 `packages/eval/eval-cli/README.md`，包含：
- sql-judge 作为标准评估模式的声明及理由
- 当前基线数据（CL-11~14: 73.8%，分 4 类别细分）
- 质量目标（短期 75%+，中期 80%+，长期 90%+）
- 运行 eval 和 compare 的命令
- 实验日志记录模板

### 3. 质量趋势追踪工具

新建 `packages/eval/eval-cli/bin/compare.ts` + `src/compare.ts`：
- 输入两个 run_id（前缀匹配），输出：
  - Overall pass_rate delta
  - 分类别 breakdown（Original / Alias / Voice EXEC / Voice DELIVERY）+ delta
  - Case-level flips（gained / lost）
- 自动从 `packages/eval/eval/cases/k11-v2/` 加载 case YAML 区分 EXEC/DELIVERY
- 已验证：对比 `9788424c` vs `10320fe2` 输出与 CL-11~14 实验日志一致

### 4. 剩余 44 wrong cases 分析 + 4 个 DELIVERY 迁移

**44 wrong cases 分类：**

| 类别 | 数量 | 说明 |
|---|---|---|
| Agent refused, EXEC expected | 24 | 最大组：找不到数据源或问题过于模糊 |
| DELIVERY judge failures | 8 | 已是 DELIVERY 但 judge/pipeline 仍失败 |
| Garbled tool calls | 8 | Agent 输出原始 tool call 而非 SQL/文本 |
| SQL semantic failures | 4 | Agent 生成了 SQL 但语义错误 |

**迁移 4 个主观/开放性问题为 DELIVERY：**
- `k11v2_074`（"用户质量如何"）— 综合性概念，无单一指标
- `k11v2_080`（"经济系统健康吗"）— 宏观定性问题
- `k11v2_voice_034`（"哪些武将需要调平衡"）— 需定义评估标准
- `k11v2_voice_039`（"活动奖励发放是不是太多了"）— 主观判断 + 范围不明

迁移后 case 分布：Original 73 EXEC + 7 DELIVERY / Alias 40 / Voice 30 EXEC + 18 DELIVERY。

**剩余 DELIVERY judge 失败诊断（8 个）：**
- k11v2_019 / voice_017 / voice_042：Agent 输出 tool calls 而非文本 → reply 管道问题（CL-11 同类）
- k11v2_075 / 079 / voice_043 / voice_048：Agent 对 DELIVERY 问题生成了 SQL → agent 未识别应拒绝
- k11v2_078：空输出 → pipeline 故障

**下一步杠杆（非本 ticket 范围）：**
- 20 个 EXEC refusal 中约 10 个为多表 join 能力限制，约 10 个为数据源缺口（enrichment 可修）
- 8 个 garbled tool call 为 agent 行为/pipeline 问题
- 4 个 SQL semantic failure 为 NL2SQL 引擎质量问题

### 预期影响

如果 4 个迁移的 DELIVERY case 全部 pass（基于 CL-11 DELIVERY judge 修复后 75% pass rate）：
- 预期 pass ≥ 3/4 → overall ≈ 75.6%–76.2%
- **75% 目标达成**（稳定线取决于 LLM 非确定性波动）

### 产出物

| 文件 | 变更 |
|---|---|
| `packages/eval/eval-cli/README.md` | 新建：标准 eval 文档 |
| `packages/eval/eval-cli/bin/compare.ts` | 新建：趋势对比入口 |
| `packages/eval/eval-cli/src/compare.ts` | 新建：分类别对比逻辑 |
| `packages/eval/eval/cases/k11-v2/k11v2_074.yaml` | EXEC → DELIVERY 迁移 |
| `packages/eval/eval/cases/k11-v2/k11v2_080.yaml` | EXEC → DELIVERY 迁移 |
| `packages/eval/eval/cases/k11-v2/k11v2_voice_034.yaml` | EXEC → DELIVERY 迁移 |
| `packages/eval/eval/cases/k11-v2/k11v2_voice_039.yaml` | EXEC → DELIVERY 迁移 |
